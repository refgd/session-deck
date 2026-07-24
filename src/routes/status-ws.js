// src/routes/status-ws.js — WebSocket channel for real-time pane status transitions
//
// ws/status — pushes status change events to all connected clients.
// On connect: sends current snapshot of all pane states.
// On transition: pushes { type: 'status', ptyId, host, session, status, prevStatus, timestamp }.

import statusEngine from '../services/status-engine.js';
import { hasUsers } from '../lib/auth.js';
import { authorizeWebSocketRequest, logRejectedWebSocket } from '../lib/ws-utils.js';

export default async function statusWsRoutes(fastify) {
  fastify.get('/ws/status', { websocket: true }, (socket, req) => {
    const authorization = authorizeWebSocketRequest(req, { db: fastify.db, hasUsers });
    if (!authorization.ok) {
      logRejectedWebSocket(fastify, req, authorization, 'Status');
      socket.close(authorization.code, authorization.reason);
      return;
    }

    fastify.log.info({ ip: req.ip }, 'Status WebSocket connected');

    // Send current snapshot on connect
    try {
      socket.send(JSON.stringify({
        type: 'snapshot',
        panes: statusEngine.getAll(),
        timestamp: Date.now(),
      }));
    } catch {
      // Socket may have closed immediately
    }

    // Subscribe to status transitions and forward to this client
    const unsubscribe = statusEngine.subscribe((event) => {
      try {
        if (socket.readyState === 1) { // OPEN
          socket.send(JSON.stringify({ type: 'status', ...event }));
        }
      } catch {
        // Socket may have closed
      }
    });

    socket.on('close', () => {
      fastify.log.info({ ip: req.ip }, 'Status WebSocket closed');
      unsubscribe();
    });

    socket.on('error', (err) => {
      fastify.log.error({ ip: req.ip, err: err.message }, 'Status WebSocket error');
      unsubscribe();
    });
  });
}
