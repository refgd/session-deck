// src/routes/sessions.js - tmux sessions API

import { CAPTURE_TRUNCATION_NOTICE, DEFAULT_CAPTURE_PREVIEW_BYTES, listAllSessions, listSessions, createSession, renameSession, deleteSession, captureSession, sendLinesToSession } from '../services/tmux.js';
import { isValidSessionName } from '../lib/validate.js';
import { apiError } from '../lib/api-error.js';
import { recordAuditEvent } from '../lib/audit-log.js';
import { attachmentHeader } from '../lib/download-utils.js';
import { noStoreResponse } from '../lib/response-headers.js';
import { findHost, getSessionHosts } from '../services/hosts.js';
import { deleteSessionHistory, getSessionHistoryPage, renameSessionHistory, syncSessionHistory } from '../services/session-history-cache.js';

const INVALID_SESSION_NAME_MESSAGE = 'Invalid session name. Use only letters, digits, hyphens, underscores, and dots.';

export default async function sessionsRoutes(fastify) {
  const db = fastify.db;

  // Get sessions from all configured hosts
  fastify.get('/api/sessions', async (_request, reply) => {
    noStoreResponse(reply);
    try {
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
    } catch (err) {
      return apiError(reply, err, err.statusCode || 500);
    }
  });

  // Get sessions from a single host
  fastify.get('/api/sessions/:hostName', async (request, reply) => {
    noStoreResponse(reply);
    const { hostName } = request.params;
    try {
      const host = findHost(db, hostName);
      if (!host) return apiError(reply, `Host not found: ${hostName}`, 404, { host: hostName });
      return await listSessions(host, { timeout: 5000 });
    } catch (err) {
      return apiError(reply, err, 500, { host: hostName });
    }
  });

  // Create a session on a host
  fastify.post('/api/sessions/:hostName', async (request, reply) => {
    const { hostName } = request.params;
    const { name, startDir } = request.body || {};
    if (!isValidSessionName(name)) {
      return apiError(reply, INVALID_SESSION_NAME_MESSAGE, 400);
    }
    const host = findHost(db, hostName);
    if (!host) return apiError(reply, `Host not found: ${hostName}`, 404, { host: hostName });

    try {
      const result = await createSession(host, name, startDir);
      fastify.log.info({ host: hostName, session: name }, 'Session created');
      recordAuditEvent(db, {
        request,
        action: 'session.create',
        targetType: 'session',
        targetName: name,
        details: { host: hostName, startDir: startDir || null },
      });
      return reply.code(201).send(result);
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'session.create',
        targetType: 'session',
        targetName: name,
        status: 'error',
        details: { host: hostName },
        error: err.message,
      });
      return apiError(reply, err, err.statusCode, { host: hostName });
    }
  });

  // Rename a session on a host
  fastify.put('/api/sessions/:hostName/:sessionName', async (request, reply) => {
    const { hostName, sessionName } = request.params;
    const { newName } = request.body || {};
    if (!isValidSessionName(sessionName)) {
      return apiError(reply, INVALID_SESSION_NAME_MESSAGE, 400);
    }
    if (!isValidSessionName(newName)) {
      return apiError(reply, INVALID_SESSION_NAME_MESSAGE, 400);
    }
    const host = findHost(db, hostName);
    if (!host) return apiError(reply, `Host not found: ${hostName}`, 404, { host: hostName });

    try {
      const result = await renameSession(host, sessionName, newName);
      renameSessionHistory(db, hostName, sessionName, newName);
      fastify.log.info({ host: hostName, oldName: sessionName, newName }, 'Session renamed');
      recordAuditEvent(db, {
        request,
        action: 'session.rename',
        targetType: 'session',
        targetName: newName,
        details: { host: hostName, oldName: sessionName },
      });
      return result;
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'session.rename',
        targetType: 'session',
        targetName: sessionName,
        status: 'error',
        details: { host: hostName, newName },
        error: err.message,
      });
      return apiError(reply, err, err.statusCode, { host: hostName, session: sessionName });
    }
  });

  // Delete a session on a host
  fastify.delete('/api/sessions/:hostName/:sessionName', async (request, reply) => {
    const { hostName, sessionName } = request.params;
    if (!isValidSessionName(sessionName)) {
      return apiError(reply, INVALID_SESSION_NAME_MESSAGE, 400);
    }
    const host = findHost(db, hostName);
    if (!host) return apiError(reply, `Host not found: ${hostName}`, 404, { host: hostName });

    try {
      const result = await deleteSession(host, sessionName);
      deleteSessionHistory(db, hostName, sessionName);
      fastify.log.info({ host: hostName, session: sessionName }, 'Session deleted');
      recordAuditEvent(db, {
        request,
        action: 'session.delete',
        targetType: 'session',
        targetName: sessionName,
        details: { host: hostName },
      });
      return result;
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'session.delete',
        targetType: 'session',
        targetName: sessionName,
        status: 'error',
        details: { host: hostName },
        error: err.message,
      });
      return apiError(reply, err, err.statusCode, { host: hostName, session: sessionName });
    }
  });

  // Send a rendering test to a tmux session
  fastify.post('/api/sessions/:hostName/:sessionName/render-test', async (request, reply) => {
    const { hostName, sessionName } = request.params;
    if (!isValidSessionName(sessionName)) {
      return apiError(reply, INVALID_SESSION_NAME_MESSAGE, 400);
    }
    const host = findHost(db, hostName);
    if (!host) return apiError(reply, `Host not found: ${hostName}`, 404, { host: hostName });

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
      await sendLinesToSession(host, sessionName, lines, { timeout: 5000, delayMs: 50 });

      recordAuditEvent(db, {
        request,
        action: 'session.render_test',
        targetType: 'session',
        targetName: sessionName,
        details: { host: hostName, lines: lines.length },
      });
      return { success: true, host: hostName, session: sessionName, lines: lines.length };
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'session.render_test',
        targetType: 'session',
        targetName: sessionName,
        status: 'error',
        details: { host: hostName },
        error: err.message,
      });
      return apiError(reply, err, 500, { host: hostName, session: sessionName });
    }
  });

  // Capture full scrollback of a session (all panes)
  fastify.get('/api/sessions/:hostName/:sessionName/capture', async (request, reply) => {
    noStoreResponse(reply);
    const { hostName, sessionName } = request.params;
    const download = request.query.download === 'true';
    if (!isValidSessionName(sessionName)) {
      return apiError(reply, INVALID_SESSION_NAME_MESSAGE, 400);
    }
    const host = findHost(db, hostName);
    if (!host) return apiError(reply, `Host not found: ${hostName}`, 404, { host: hostName });

    try {
      const maxBytes = download ? undefined : (request.query.maxBytes || DEFAULT_CAPTURE_PREVIEW_BYTES);
      const text = await captureSession(host, sessionName, { maxBytes });

      if (download) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        reply
          .header('Content-Type', 'text/plain; charset=utf-8')
          .header('Content-Disposition', attachmentHeader([sessionName, hostName, timestamp], 'txt'))
          .send(text);
        return;
      }

      return {
        host: hostName,
        session: sessionName,
        text,
        truncated: text.includes(CAPTURE_TRUNCATION_NOTICE),
        bytes: Buffer.byteLength(text),
      };
    } catch (err) {
      return apiError(reply, err, err.statusCode, { host: hostName, session: sessionName });
    }
  });

  fastify.get('/api/sessions/:hostName/:sessionName/history', async (request, reply) => {
    noStoreResponse(reply);
    const { hostName, sessionName } = request.params;
    if (!isValidSessionName(sessionName)) {
      return apiError(reply, INVALID_SESSION_NAME_MESSAGE, 400);
    }
    const host = findHost(db, hostName);
    if (!host) return apiError(reply, `Host not found: ${hostName}`, 404, { host: hostName });

    try {
      if (request.query.sync !== 'false') {
        await syncSessionHistory(db, host, sessionName);
      }
      return getSessionHistoryPage(db, hostName, sessionName, {
        before: request.query.before,
        limit: request.query.limit,
      });
    } catch (err) {
      return apiError(reply, err, err.statusCode, { host: hostName, session: sessionName });
    }
  });

}
