// src/routes/activity.js — Lightweight activity polling endpoint
// Returns session_activity timestamps only (no type/context detection).
// Designed for 10s polling to power workspace notification badges.

import { listAllActivity } from '../services/tmux.js';
import { getSessionHosts } from '../services/hosts.js';

export default async function activityRoutes(fastify) {
  const db = fastify.db;

  // GET /api/activity — returns { host, session, lastActivity } for all sessions
  fastify.get('/api/activity', async () => {
    const hosts = getSessionHosts(db);

    // Filter to tmux-capable hosts
    const tmuxHosts = hosts.filter(h => {
      const skip = ['Network', 'Client'];
      return !skip.includes(h.group);
    });

    const results = await listAllActivity(tmuxHosts, { timeout: 3000 });

    // Flatten into a simple array: { host, session, lastActivity }
    const activity = [];
    for (const hostResult of results) {
      for (const s of hostResult.sessions) {
        activity.push({
          host: hostResult.host,
          session: s.name,
          lastActivity: s.lastActivity,
        });
      }
    }

    return { activity };
  });
}
