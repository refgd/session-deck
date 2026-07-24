// src/routes/sessions.js — tmux sessions API

import { listAllSessions, listSessions, createSession, renameSession, deleteSession, captureSession } from '../services/tmux.js';
import { isValidSessionName } from '../lib/validate.js';
import { findHost, getSessionHosts } from '../services/hosts.js';
import { execDockerOnHost } from '../services/docker.js';
import { shellQuote, sshCommand } from '../services/connection.js';

export default async function sessionsRoutes(fastify) {
  const db = fastify.db;

  // Get sessions from all configured hosts
  fastify.get('/api/sessions', async () => {
    const hosts = getSessionHosts(db);

    // Filter to tmux-capable hosts (skip network gear, clients)
    const tmuxHosts = hosts.filter(h => {
      const skip = ['Network', 'Client'];
      return !skip.includes(h.group);
    });

    const results = await listAllSessions(tmuxHosts, { timeout: 5000 });

    const totalSessions = results.reduce((sum, r) => sum + r.sessionCount, 0);
    const onlineHosts = results.filter(r => r.status === 'online').length;

    fastify.log.info({
      totalSessions,
      hostsQueried: results.length,
      hostsOnline: onlineHosts,
    }, 'Session inventory complete');

    return {
      results,
      summary: {
        totalSessions,
        hostsQueried: results.length,
        hostsOnline: onlineHosts,
      },
    };
  });

  // Get sessions from a single host
  fastify.get('/api/sessions/:hostName', async (request, reply) => {
    const { hostName } = request.params;
    try {
      const host = findHost(db, hostName);
      if (!host) return reply.code(404).send({ error: `Host not found: ${hostName}`, host: hostName });
      return await listSessions(host, { timeout: 5000 });
    } catch (err) {
      return reply.code(500).send(sessionErrorPayload(hostName, err));
    }
  });

  // Create a session on a host
  fastify.post('/api/sessions/:hostName', async (request, reply) => {
    const { hostName } = request.params;
    const { name, startDir } = request.body || {};
    if (!isValidSessionName(name)) {
      return reply.code(400).send({ error: 'Invalid session name. Use only letters, digits, hyphens, underscores, and dots.' });
    }
    const host = findHost(db, hostName);
    if (!host) return reply.code(404).send({ error: `Host not found: ${hostName}` });

    try {
      const result = await createSession(host, name, startDir);
      fastify.log.info({ host: hostName, session: name }, 'Session created');
      return reply.code(201).send(result);
    } catch (err) {
      return reply.code(err.statusCode || 500).send({ error: err.message });
    }
  });

  // Rename a session on a host
  fastify.put('/api/sessions/:hostName/:sessionName', async (request, reply) => {
    const { hostName, sessionName } = request.params;
    const { newName } = request.body || {};
    if (!isValidSessionName(newName)) {
      return reply.code(400).send({ error: 'Invalid session name. Use only letters, digits, hyphens, underscores, and dots.' });
    }
    const host = findHost(db, hostName);
    if (!host) return reply.code(404).send({ error: `Host not found: ${hostName}` });

    try {
      const result = await renameSession(host, sessionName, newName);
      fastify.log.info({ host: hostName, oldName: sessionName, newName }, 'Session renamed');
      return result;
    } catch (err) {
      return reply.code(err.statusCode || 500).send({ error: err.message });
    }
  });

  // Delete a session on a host
  fastify.delete('/api/sessions/:hostName/:sessionName', async (request, reply) => {
    const { hostName, sessionName } = request.params;
    const host = findHost(db, hostName);
    if (!host) return reply.code(404).send({ error: `Host not found: ${hostName}` });

    try {
      const result = await deleteSession(host, sessionName);
      fastify.log.info({ host: hostName, session: sessionName }, 'Session deleted');
      return result;
    } catch (err) {
      return reply.code(err.statusCode || 500).send({ error: err.message });
    }
  });

  // Send a rendering test to a tmux session
  fastify.post('/api/sessions/:hostName/:sessionName/render-test', async (request, reply) => {
    const { hostName, sessionName } = request.params;
    const host = findHost(db, hostName);
    if (!host) return reply.code(404).send({ error: `Host not found: ${hostName}` });

    // The test string — covers ASCII, Unicode, box-drawing, emoji, math symbols
    const lines = [
      `echo ''`,
      `echo '╔══════════════════════════════════════╗'`,
      `echo '║   Session Deck — Rendering Test      ║'`,
      `echo '╚══════════════════════════════════════╝'`,
      `echo ''`,
      `echo 'ASCII:      Hello World [OK] {pass} (done)'`,
      `echo 'Arrows:     ← → ↑ ↓ ⇒ ⇐ ➜'`,
      `echo 'Box light:  ┌─┬─┐│ ││ │└─┴─┘'`,
      `echo 'Box heavy:  ┏━┳━┓┃ ┃┃ ┃┗━┻━┛'`,
      `echo 'Symbols:    ✓ ✗ ● ○ ◆ ◇ ★ ☆ ⚡ ⚙ ▶ ◀'`,
      `echo 'Emoji:      🔥 🚀 📦 ✅ ❌ 🎉 💾 🔧 🔔 📱'`,
      `echo 'Blocks:     ▓▒░ ████ ▀▄▐▌'`,
      `echo 'Math:       ≤ ≥ ≠ ± ∞ √ ∑ ∏ ∫ ∂'`,
      `echo 'Braille:    ⣿⡇⠿⠛⠉⠁'`,
      `echo 'Powerline:     '`,
      `echo ''`,
      `echo 'If all lines render correctly with no clipping,'`,
      `echo 'your terminal font supports the full glyph set.'`,
      `echo ''`,
    ];

    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);

      for (const line of lines) {
        if (host.connectionType === 'docker') {
          await execDockerOnHost(host, ['tmux', 'send-keys', '-t', sessionName, line, 'Enter'], 5000);
        } else if (host.isLocal) {
          await execFileAsync('tmux', ['send-keys', '-t', sessionName, line, 'Enter'], { timeout: 2000 });
        } else {
          const cmd = sshCommand(host, `tmux send-keys -t ${shellQuote(sessionName)} ${shellQuote(line)} Enter`, { timeoutMs: 3000 });
          await execFileAsync(cmd.command, cmd.args, { timeout: 5000 });
        }
        // Small delay between lines to avoid overwhelming the terminal
        await new Promise(r => setTimeout(r, 50));
      }

      return { success: true, host: hostName, session: sessionName, lines: lines.length };
    } catch (err) {
      return reply.code(500).send({ error: `Failed to send render test: ${err.message}` });
    }
  });

  // Capture full scrollback of a session (all panes)
  fastify.get('/api/sessions/:hostName/:sessionName/capture', async (request, reply) => {
    const { hostName, sessionName } = request.params;
    const download = request.query.download === 'true';
    const host = findHost(db, hostName);
    if (!host) return reply.code(404).send({ error: `Host not found: ${hostName}` });

    try {
      const text = await captureSession(host, sessionName);

      if (download) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `${sessionName}-${hostName}-${timestamp}.txt`;
        reply
          .header('Content-Type', 'text/plain; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .send(text);
        return;
      }

      return { host: hostName, session: sessionName, text };
    } catch (err) {
      return reply.code(err.statusCode || 500).send({ error: err.message });
    }
  });
}

function sessionErrorPayload(hostName, err) {
  return {
    error: err.message || 'Failed to load sessions',
    message: err.message || null,
    code: err.code || null,
    path: err.path || null,
    syscall: err.syscall || null,
    host: hostName,
  };
}
