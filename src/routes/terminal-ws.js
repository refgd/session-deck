// src/routes/terminal-ws.js — WebSocket route for terminal I/O

import { spawnTerminal, resizeTerminal, killTerminal } from '../services/terminal.js';
import { findHost } from '../services/hosts.js';
import { scrollSession } from '../services/tmux.js';
import statusEngine from '../services/status-engine.js';
import { hasUsers } from '../lib/auth.js';
import { DEFAULT_HOST } from '../lib/constants.js';
import { noStoreResponse } from '../lib/response-headers.js';
import { assertTerminalSessionName, normalizeTerminalSize } from '../lib/terminal-utils.js';
import { authorizeWebSocketRequest, createTerminalScrollScheduler, createWsTokenStore, isTerminalWsMessageTooLarge, logRejectedWebSocket, parseTerminalWsMessage, terminalExitReason, wsCloseReason } from '../lib/ws-utils.js';

const wsTokenStore = createWsTokenStore();
export const WS_TOKEN_RATE_LIMIT_MAX = 120;
export const WS_TOKEN_RATE_LIMIT_WINDOW = '1 minute';

export default async function terminalWsRoutes(fastify) {
  // Token endpoint — authenticated users get a short-lived WS token
  fastify.get('/api/ws-token', {
    config: {
      rateLimit: {
        max: WS_TOKEN_RATE_LIMIT_MAX,
        timeWindow: WS_TOKEN_RATE_LIMIT_WINDOW,
      },
    },
  }, async (req, reply) => {
    // This endpoint goes through normal auth middleware (cookie-based)
    noStoreResponse(reply);
    const token = wsTokenStore.generate(req.session?.sessionId || 'anon');
    return { token };
  });

  fastify.get('/ws/terminal', { websocket: true }, (socket, req) => {
    const authorization = authorizeWebSocketRequest(req, {
      db: fastify.db,
      hasUsers,
      tokenStore: wsTokenStore,
      allowToken: true,
    });
    if (!authorization.ok) {
      logRejectedWebSocket(fastify, req, authorization, 'Terminal');
      socket.close(authorization.code, authorization.reason);
      return;
    }

    const session = req.query.session;
    const host = req.query.host || DEFAULT_HOST;

    if (!session) {
      fastify.log.warn('WebSocket connect without session param');
      socket.close(1008, 'Missing session parameter');
      return;
    }
    try {
      assertTerminalSessionName(session);
    } catch (err) {
      fastify.log.warn({ session, err: err.message }, 'WebSocket connect with invalid session param');
      socket.close(1008, wsCloseReason(err.message));
      return;
    }

    const { cols, rows } = normalizeTerminalSize(req.query);

    fastify.log.info({ session, host, cols, rows }, 'Terminal WebSocket connecting');

    let terminal;
    try {
      terminal = spawnTerminal(session, host, { cols, rows, db: fastify.db });
    } catch (err) {
      fastify.log.error({ err, session, host }, 'Failed to spawn terminal');
      socket.close(1011, wsCloseReason(`Failed to spawn: ${err.message}`));
      return;
    }

    const { pty: term, id } = terminal;
    const startedAt = Date.now();
    let recentOutput = '';
    let targetHost;
    const scrollScheduler = createTerminalScrollScheduler(async (lines) => {
      targetHost ??= findHost(fastify.db, host) || { name: host, isLocal: true, connectionType: 'ssh' };
      await scrollSession(targetHost, session, lines);
    });

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
      if (isTerminalWsMessageTooLarge(rawMsg)) {
        fastify.log.warn({ id, session, host }, 'Terminal WebSocket input exceeded message size limit');
        socket.close(1009, 'Terminal input message is too large');
        return;
      }

      const msg = parseTerminalWsMessage(rawMsg);
      if (msg.type === 'resize') {
        const size = normalizeTerminalSize(msg);
        resizeTerminal(id, size.cols, size.rows);
        return;
      }
      if (msg.type === 'scroll') {
        scrollScheduler.push(msg.lines);
        scrollScheduler.flushNow().catch((err) => {
          fastify.log.warn({ err, session, host }, 'Failed to scroll terminal session');
        });
        return;
      }
      if (msg.type === 'noop') {
        return;
      }

      // Raw terminal input
      try {
        term.write(msg.data);
      } catch {
        // PTY may have closed
      }
    });

    // WebSocket close → kill PTY + remove from status engine
    socket.on('close', () => {
      fastify.log.info({ id, session }, 'Terminal WebSocket closed');
      scrollScheduler.stop();
      statusEngine.remove(id);
      killTerminal(id);
    });

    socket.on('error', (err) => {
      fastify.log.error({ id, session, err: err.message }, 'Terminal WebSocket error');
      scrollScheduler.stop();
      statusEngine.remove(id);
      killTerminal(id);
    });
  });
}
