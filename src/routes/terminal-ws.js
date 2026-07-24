// src/routes/terminal-ws.js — WebSocket route for terminal I/O

import { spawnTerminal, resizeTerminal, killTerminal } from '../services/terminal.js';
import { findHost } from '../services/hosts.js';
import { scrollSession } from '../services/tmux.js';
import statusEngine from '../services/status-engine.js';
import { hasUsers } from '../lib/auth.js';
import { randomBytes } from 'node:crypto';

// Short-lived WS auth tokens — valid for 30 seconds
const wsTokens = new Map();

function generateWsToken(sessionId) {
  const token = randomBytes(24).toString('hex');
  wsTokens.set(token, { sessionId, created: Date.now() });
  // Clean up expired tokens
  for (const [t, v] of wsTokens) {
    if (Date.now() - v.created > 30000) wsTokens.delete(t);
  }
  return token;
}

function validateWsToken(token) {
  const entry = wsTokens.get(token);
  if (!entry) return false;
  wsTokens.delete(token); // One-time use
  return Date.now() - entry.created < 30000;
}

export default async function terminalWsRoutes(fastify) {
  // Token endpoint — authenticated users get a short-lived WS token
  fastify.get('/api/ws-token', async (req, reply) => {
    // This endpoint goes through normal auth middleware (cookie-based)
    const token = generateWsToken(req.session?.sessionId || 'anon');
    return { token };
  });

  fastify.get('/ws/terminal', { websocket: true }, (socket, req) => {
    // Auth check: accept session cookie or valid one-time WS token.
    if (!hasUsers(fastify.db)) {
      socket.close(1008, 'Setup required');
      return;
    }
    const isAuthenticated = req.session?.authenticated;
    const tokenValid = req.query.token ? validateWsToken(req.query.token) : false;
    if (!isAuthenticated && !tokenValid) {
      fastify.log.warn({ ip: req.ip, isAuthenticated, tokenValid }, 'WebSocket auth rejected');
      socket.close(1008, 'Authentication required');
      return;
    }

    const session = req.query.session;
    const host = req.query.host || 'reliant';

    if (!session) {
      fastify.log.warn('WebSocket connect without session param');
      socket.close(1008, 'Missing session parameter');
      return;
    }

    const cols = parseInt(req.query.cols) || 80;
    const rows = parseInt(req.query.rows) || 24;

    fastify.log.info({ session, host, cols, rows }, 'Terminal WebSocket connecting');

    let terminal;
    try {
      terminal = spawnTerminal(session, host, { cols, rows, db: fastify.db });
    } catch (err) {
      fastify.log.error({ err, session, host }, 'Failed to spawn terminal');
      socket.close(1011, `Failed to spawn: ${err.message}`);
      return;
    }

    const { pty: term, id } = terminal;
    const startedAt = Date.now();
    let recentOutput = '';

    fastify.log.info({ id, session, host }, 'Terminal PTY spawned');

    // Register PTY with status engine for activity classification
    statusEngine.register(id, host, session);

    // PTY output → WebSocket + status engine
    term.onData((data) => {
      recentOutput = (recentOutput + data).slice(-1000);
      try {
        if (socket.readyState === 1) { // OPEN
          socket.send(data);
        }
      } catch {
        // Socket may have closed
      }
      // Feed output to status engine (fire-and-forget, non-blocking)
      statusEngine.feed(id, data);
    });

    // PTY exit → close WebSocket + remove from status engine
    term.onExit(({ exitCode, signal }) => {
      fastify.log.info({ id, session, exitCode, signal }, 'Terminal PTY exited');
      statusEngine.remove(id);
      try {
        const reason = terminalExitReason({ exitCode, signal, recentOutput, ageMs: Date.now() - startedAt });
        socket.close(reason.code, reason.message);
      } catch {
        // Already closed
      }
      killTerminal(id);
    });

    // WebSocket messages → PTY input or control
    socket.on('message', (rawMsg) => {
      const str = rawMsg.toString();

      // Try parsing as JSON control message
      if (str.startsWith('{')) {
        try {
          const msg = JSON.parse(str);
          if (msg.type === 'resize' && msg.cols && msg.rows) {
            resizeTerminal(id, msg.cols, msg.rows);
            return;
          }
          if (msg.type === 'scroll' && Number.isFinite(msg.lines) && msg.lines !== 0) {
            const targetHost = findHost(fastify.db, host) || { name: host, isLocal: true, connectionType: 'ssh' };
            scrollSession(targetHost, session, msg.lines).catch((err) => {
              fastify.log.warn({ err, session, host }, 'Failed to scroll terminal session');
            });
            return;
          }
        } catch {
          // Not valid JSON, fall through to terminal input
        }
      }

      // Raw terminal input
      try {
        term.write(str);
      } catch {
        // PTY may have closed
      }
    });

    // WebSocket close → kill PTY + remove from status engine
    socket.on('close', () => {
      fastify.log.info({ id, session }, 'Terminal WebSocket closed');
      statusEngine.remove(id);
      killTerminal(id);
    });

    socket.on('error', (err) => {
      fastify.log.error({ id, session, err: err.message }, 'Terminal WebSocket error');
      statusEngine.remove(id);
      killTerminal(id);
    });
  });
}

function terminalExitReason({ exitCode, signal, recentOutput, ageMs }) {
  const output = cleanTerminalOutput(recentOutput);
  let message = output || `Terminal exited${typeof exitCode === 'number' ? ` with code ${exitCode}` : ''}${signal ? ` (${signal})` : ''}`;

  if (output.includes("can't find session") || output.includes('no such session')) {
    message = output;
  } else if (output.includes('no sessions')) {
    message = 'tmux session does not exist or was deleted';
  } else if (output.includes('error connecting to /tmp/tmux-') || output.includes('no server running')) {
    message = 'tmux is not running or the session no longer exists';
  } else if (output.includes('command not found') || output.includes('not found')) {
    message = output;
  } else if (!output && ageMs < 2000) {
    message = 'Terminal exited immediately';
  }

  return {
    code: exitCode === 0 && ageMs >= 2000 ? 1000 : 1011,
    message: truncateCloseReason(message),
  };
}

function cleanTerminalOutput(value) {
  return String(value || '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join(' | ')
    .trim();
}

function truncateCloseReason(value) {
  const text = String(value || 'Terminal exited');
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}
