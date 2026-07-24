// src/lib/auth.js — Local account/password authentication

import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import config from './config.js';
import { apiError } from './api-error.js';
import { escapeHtml, hashPasswordSync, verifyPassword } from './auth-utils.js';
import { validateNewCredentials } from './credentials.js';
import { redactPath } from './path-redaction.js';
import { noStoreResponse } from './response-headers.js';
import { externalPath } from './base-path.js';

const { auth } = config;
export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_LOCK_MS = 5 * 60 * 1000;
export const MAX_LOGIN_ATTEMPT_KEYS = 1000;

const loginAttempts = createLoginAttemptTracker({
  maxFailures: MAX_LOGIN_FAILURES,
  lockMs: LOGIN_LOCK_MS,
  maxKeys: MAX_LOGIN_ATTEMPT_KEYS,
});

export async function registerAuth(fastify) {
  await fastify.register(cookie);

  await fastify.register(session, {
    secret: resolveSessionSecret(fastify),
    cookie: sessionCookieOptions(),
    saveUninitialized: false,
  });

  await bootstrapUserIfConfigured(fastify);
  await registerLocalAuthRoutes(fastify);

  fastify.addHook('onRequest', async (request, reply) => {
    if (request.url === '/api/health' || request.url === '/health') return;
    if (request.url.startsWith('/auth/')) return;
    if (request.url === '/manifest.json' || request.url === '/sw.js' ||
        request.url.startsWith('/icon') || request.url === '/favicon.png') return;

    const needsSetup = !hasUsers(fastify.db);
    if (needsSetup) {
      if (request.url.startsWith('/api/') || request.url.startsWith('/ws/')) {
        return apiError(reply, 'Setup required', 428, { setupRequired: true });
      }
      request.session.returnTo = safeReturnTo(request.url);
      return reply.redirect(externalPath(request, '/auth/setup'));
    }

    if (request.session?.authenticated) return;

    if (request.url.startsWith('/api/') || request.url.startsWith('/ws/')) {
      return apiError(reply, 'Authentication required', 401, { setupRequired: false });
    }

    request.session.returnTo = safeReturnTo(request.url);
    reply.redirect(externalPath(request, '/auth/login'));
  });

  fastify.log.info('Password auth enabled');
}

export function sessionCookieOptions(env = process.env) {
  const httpsMode = String(env.SESSION_DECK_HTTPS || 'auto').trim().toLowerCase();
  const autoSecure = httpsMode === 'auto' || ['1', 'true', 'yes', 'on'].includes(httpsMode);
  return {
    secure: autoSecure ? 'auto' : false,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: auth.sessionMaxAge * 1000,
  };
}

export function noStoreAuthResponse(reply) {
  return noStoreResponse(reply);
}

export function resolveSessionSecret(fastify) {
  if (auth.sessionSecret) return auth.sessionSecret;

  const dir = dirname(config.dbPath);
  const secretPath = join(dir, 'session-secret');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);

  const existing = readSessionSecret(secretPath);
  if (existing) return existing;

  const generated = randomBytes(48).toString('base64url');
  try {
    writeFileSync(secretPath, `${generated}\n`, { mode: 0o600, flag: existsSync(secretPath) ? 'w' : 'wx' });
    chmodSync(secretPath, 0o600);
  } catch (err) {
    if (err?.code === 'EEXIST') {
      const raced = readSessionSecret(secretPath);
      if (raced) return raced;
    }
    throw err;
  }

  fastify.log.warn({ path: redactPath(secretPath) }, 'SESSION_DECK_SESSION_SECRET not set; generated a persistent local session secret');
  return generated;
}

function readSessionSecret(secretPath) {
  if (!existsSync(secretPath)) return null;
  const stat = lstatSync(secretPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw Object.assign(new Error('Session secret path is not a regular file'), { statusCode: 500 });
  }
  chmodSync(secretPath, 0o600);
  const existing = readFileSync(secretPath, 'utf8').trim();
  return existing.length >= 32 ? existing : null;
}

async function bootstrapUserIfConfigured(fastify) {
  if (hasUsers(fastify.db)) return;
  if (!auth.bootstrapUser || !auth.bootstrapPass) return;
  const validation = validateNewCredentials(auth.bootstrapUser, auth.bootstrapPass);
  if (validation) throw new Error(`Invalid bootstrap credentials: ${validation}`);
  createUser(fastify.db, auth.bootstrapUser, auth.bootstrapPass);
  fastify.log.info({ username: auth.bootstrapUser }, 'Bootstrap auth user created');
}

async function registerLocalAuthRoutes(fastify) {
  fastify.get('/auth/setup', async (request, reply) => {
    noStoreAuthResponse(reply);
    if (hasUsers(fastify.db)) return reply.redirect(externalPath(request, '/auth/login'));
    reply.type('text/html').send(authPage({ mode: 'setup', basePath: externalPath(request, '/') }));
  });

  fastify.post('/auth/setup', {
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
  }, async (request, reply) => {
    noStoreAuthResponse(reply);
    if (hasUsers(fastify.db)) return reply.redirect(externalPath(request, '/auth/login'));
    const { username, password, confirmPassword } = request.body || {};
    const validation = validateNewCredentials(username, password, confirmPassword);
    if (validation) {
      return reply.type('text/html').send(authPage({ mode: 'setup', error: validation, username, basePath: externalPath(request, '/') }));
    }

    createUser(fastify.db, username.trim(), password);
    request.session.authenticated = true;
    request.session.user = { name: username.trim(), method: 'password' };
    reply.redirect(externalPath(request, '/'));
  });

  fastify.get('/auth/login', async (request, reply) => {
    noStoreAuthResponse(reply);
    if (!hasUsers(fastify.db)) return reply.redirect(externalPath(request, '/auth/setup'));
    if (request.session?.authenticated) return reply.redirect(externalPath(request, '/'));
    reply.type('text/html').send(authPage({ mode: 'login', basePath: externalPath(request, '/') }));
  });

  fastify.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
  }, async (request, reply) => {
    noStoreAuthResponse(reply);
    if (!hasUsers(fastify.db)) return reply.redirect(externalPath(request, '/auth/setup'));
    const { username, password } = request.body || {};
    const attemptKey = loginAttemptKey(request, username);
    const locked = loginAttempts.check(attemptKey);
    if (locked.locked) {
      return reply
        .code(429)
        .type('text/html')
        .send(authPage({
          mode: 'login',
          error: `Too many failed login attempts. Try again in ${locked.retryAfterSeconds} seconds.`,
          username,
          basePath: externalPath(request, '/'),
        }));
    }

    const user = username ? findUser(fastify.db, username.trim()) : null;
    if (user && await verifyPassword(password || '', user.password_hash)) {
      loginAttempts.recordSuccess(attemptKey);
      request.session.authenticated = true;
      request.session.user = { name: user.username, method: 'password' };
      fastify.db.prepare("UPDATE app_users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
      const returnTo = safeReturnTo(request.session.returnTo);
      delete request.session.returnTo;
      return reply.redirect(externalPath(request, returnTo));
    }
    loginAttempts.recordFailure(attemptKey);
    reply.type('text/html').send(authPage({ mode: 'login', error: 'Invalid username or password', username, basePath: externalPath(request, '/') }));
  });

  fastify.post('/auth/logout', async (request, reply) => {
    noStoreAuthResponse(reply);
    request.session.destroy();
    reply.redirect(externalPath(request, '/auth/login'));
  });

  fastify.get('/auth/me', async (request, reply) => {
    noStoreAuthResponse(reply);
    return request.session?.user || null;
  });
}

export function hasUsers(db) {
  return db.prepare('SELECT COUNT(*) as c FROM app_users').get().c > 0;
}

export function safeReturnTo(value) {
  const path = String(value || '').trim();
  if (!path || !path.startsWith('/') || path.startsWith('//')) return '/';
  if (/[\u0000-\u001f\u007f]/.test(path)) return '/';
  if (path.startsWith('/auth/')) return '/';
  return path;
}

export function createLoginAttemptTracker({
  maxFailures = MAX_LOGIN_FAILURES,
  lockMs = LOGIN_LOCK_MS,
  maxKeys = MAX_LOGIN_ATTEMPT_KEYS,
  now = () => Date.now(),
} = {}) {
  const attempts = new Map();

  function entryFor(key) {
    const current = now();
    const existing = attempts.get(key);
    if (existing && existing.lockedUntil > current) return existing;
    if (existing && existing.lockedUntil > 0 && existing.lockedUntil <= current) attempts.delete(key);
    return attempts.get(key) || { failures: 0, lockedUntil: 0 };
  }

  return {
    check(key) {
      const entry = entryFor(key);
      if (entry.lockedUntil <= now()) return { locked: false, retryAfterSeconds: 0 };
      return {
        locked: true,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.lockedUntil - now()) / 1000)),
      };
    },
    recordFailure(key) {
      const current = now();
      const entry = entryFor(key);
      const failures = entry.failures + 1;
      const lockedUntil = failures >= maxFailures ? current + lockMs : 0;
      attempts.delete(key);
      attempts.set(key, { failures, lockedUntil });
      pruneOldestAttempts(attempts, maxKeys);
      return { failures, lockedUntil };
    },
    recordSuccess(key) {
      attempts.delete(key);
    },
    size() {
      return attempts.size;
    },
  };
}

function pruneOldestAttempts(attempts, maxKeys) {
  while (attempts.size > maxKeys) {
    const oldest = attempts.keys().next().value;
    attempts.delete(oldest);
  }
}

function loginAttemptKey(request, username) {
  const ip = String(request.ip || request.socket?.remoteAddress || 'unknown').trim().toLowerCase();
  const user = String(username || '').trim().toLowerCase() || 'unknown';
  return `${ip}:${user}`;
}

function findUser(db, username) {
  return db.prepare('SELECT * FROM app_users WHERE username = ?').get(username);
}

function createUser(db, username, password) {
  const hash = hashPasswordSync(password);
  db.prepare('INSERT INTO app_users (username, password_hash) VALUES (?, ?)').run(username, hash);
}

function authPage({ mode, error = null, username = '', basePath = '/' }) {
  const setup = mode === 'setup';
  const base = String(basePath || '/').replace(/\/$/, '');
  const path = (suffix) => `${base}${suffix}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session Deck — ${setup ? 'Setup' : 'Login'}</title>
  <link rel="icon" type="image/png" href="${path('/favicon.png')}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0a0e14; color: #c5cdd9;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 16px;
    }
    .login-card {
      width: 380px; padding: 32px;
      background: #151b23; border: 1px solid #1e2530; border-radius: 12px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.5);
      display: flex; flex-direction: column; align-items: stretch; gap: 18px;
    }
    .login-logo { display: flex; align-items: center; justify-content: center; gap: 8px; }
    .login-title {
      font-size: 16px; font-weight: 700; color: #F97316;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 1px;
    }
    .login-subtitle { color: #6b7688; font-size: 13px; text-align: center; line-height: 1.45; }
    .login-error {
      padding: 8px 12px; border-radius: 6px;
      background: rgba(240,113,120,0.1); border: 1px solid rgba(240,113,120,0.3);
      color: #f07178; font-size: 12px; text-align: center;
    }
    .login-form { display: flex; flex-direction: column; gap: 12px; }
    .login-field {
      width: 100%; padding: 10px 14px; border-radius: 6px;
      border: 1px solid #1e2530; background: #0b0e14; color: #c5cdd9;
      font-size: 14px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; outline: none;
    }
    .login-field:focus { border-color: #F97316; }
    .login-btn {
      width: 100%; padding: 10px; border-radius: 6px; border: none;
      background: #F97316; color: #fff; font-size: 14px; font-weight: 600;
      cursor: pointer;
    }
    .login-btn:hover { background: #fb923c; }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="login-logo">
      <img src="${path('/icon.svg')}" width="32" height="32" alt="Session Deck">
      <span class="login-title">SESSION DECK</span>
    </div>
    <p class="login-subtitle">${setup ? 'Create the first administrator account.' : 'Sign in with your local account.'}</p>
    ${error ? `<div class="login-error">${escapeHtml(error)}</div>` : ''}
    <form class="login-form" method="POST" action="${setup ? path('/auth/setup') : path('/auth/login')}">
      <input class="login-field" type="text" name="username" placeholder="Username" value="${escapeHtml(username || '')}" required autofocus>
      <input class="login-field" type="password" name="password" placeholder="Password" required>
      ${setup ? '<input class="login-field" type="password" name="confirmPassword" placeholder="Confirm password" required>' : ''}
      <button class="login-btn" type="submit">${setup ? 'Create Account' : 'Sign In'}</button>
    </form>
  </div>
</body>
</html>`;
}
