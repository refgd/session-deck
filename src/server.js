// src/server.js — Fastify server factory

import Fastify from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import fastifyWebSocket from '@fastify/websocket';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './lib/config.js';
import { getDb, closeDb } from './lib/db.js';
import { registerAuth } from './lib/auth.js';
import { apiError } from './lib/api-error.js';
import { applyHttpsSecurityHeaders, corsOptionsFromConfig, helmetOptions, sameOriginWriteGuard } from './lib/http-security.js';
import { redactPath } from './lib/path-redaction.js';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import healthRoutes from './routes/health.js';
import diagnosticsRoutes from './routes/diagnostics.js';
import hostsRoutes from './routes/hosts.js';
import managedHostsRoutes from './routes/managed-hosts.js';
import sessionsRoutes from './routes/sessions.js';
import terminalWsRoutes from './routes/terminal-ws.js';
import workspaceRoutes from './routes/workspaces.js';
import settingsRoutes from './routes/settings.js';
import activityRoutes from './routes/activity.js';
import templateRoutes from './routes/templates.js';
import statusRoutes from './routes/status.js';
import statusWsRoutes from './routes/status-ws.js';
import { loadTypeMap } from './services/tmux.js';

export async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
    },
    bodyLimit: config.bodyLimit,
    trustProxy: config.trustProxy,
  });

  // CORS is same-origin by default. Set SESSION_DECK_CORS_ORIGINS to allow explicit origins.
  await fastify.register(cors, corsOptionsFromConfig(config));

  // Security headers
  await fastify.register(helmet, helmetOptions(config));

  // Rate limiting (protects login endpoint from brute force)
  await fastify.register(rateLimit, {
    global: false, // only apply where explicitly enabled
  });

  fastify.addHook('onRequest', sameOriginWriteGuard());
  fastify.setErrorHandler((err, request, reply) => {
    const statusCode = Number.isInteger(err?.statusCode) && err.statusCode >= 400 && err.statusCode < 600
      ? err.statusCode
      : 500;
    fastify.log[statusCode >= 500 ? 'error' : 'warn']({ err, path: request.url }, 'Request failed');
    return apiError(reply, err, statusCode);
  });

  // WebSocket support
  await fastify.register(fastifyWebSocket);

  // Initialize database
  const db = getDb();
  fastify.decorate('db', db);
  fastify.log.info({ dbPath: redactPath(config.dbPath) }, 'Database initialized');

  // Close DB on shutdown
  fastify.addHook('onClose', () => {
    closeDb();
    fastify.log.info('Database closed');
  });

  // Static files — serve Svelte build in production, playground always available
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const frontendDist = join(__dirname, '..', 'frontend', 'dist');
  const publicDir = join(__dirname, '..', 'public');

  // Serve frontend/dist/ as primary static root (Svelte app)
  await fastify.register(fastifyStatic, {
    root: frontendDist,
    prefix: '/',
    decorateReply: true,
  });

  // Also serve public/playground for playground mockups
  await fastify.register(fastifyStatic, {
    root: join(publicDir, 'playground'),
    prefix: '/playground/',
    decorateReply: false,
  });

  // SPA fallback — serve index.html for unmatched routes (not /api, not /playground, not /auth)
  fastify.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/playground/') || request.url.startsWith('/auth/')) {
      apiError(reply, 'Not found', 404);
    } else {
      reply.sendFile('index.html', frontendDist);
    }
  });

  // Prevent browser caching of sw.js and index.html
  fastify.addHook('onSend', (request, reply, payload, done) => {
    applyHttpsSecurityHeaders(request, reply, config);
    const url = request.url;
    if (url === '/sw.js' || url === '/' || url === '/index.html') {
      reply.header('cache-control', 'no-cache, no-store, must-revalidate');
    }
    done();
  });

  // Form body parsing (for login form POST)
  await fastify.register(formbody);

  // Authentication (must be before routes)
  await registerAuth(fastify);

  // Routes
  await fastify.register(healthRoutes);
  await fastify.register(diagnosticsRoutes);
  await fastify.register(hostsRoutes);
  await fastify.register(managedHostsRoutes);
  await fastify.register(sessionsRoutes);
  await fastify.register(terminalWsRoutes);
  await fastify.register(workspaceRoutes);
  await fastify.register(settingsRoutes);
  await fastify.register(activityRoutes);
  await fastify.register(templateRoutes);
  await fastify.register(statusRoutes);
  await fastify.register(statusWsRoutes);

  // Load dynamic session type map after DB is ready
  loadTypeMap(db);

  return fastify;
}
