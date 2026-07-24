// src/lib/auth.js — Local account/password authentication

import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import config from './config.js';

const scryptAsync = promisify(scrypt);
const { auth } = config;

export async function registerAuth(fastify) {
  await fastify.register(cookie);

  const isHttps = process.env.SESSION_DECK_HTTPS === 'true';
  await fastify.register(session, {
    secret: resolveSessionSecret(fastify),
    cookie: {
      secure: isHttps,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: auth.sessionMaxAge * 1000,
    },
    saveUninitialized: false,
  });

  await bootstrapUserIfConfigured(fastify);
  await registerLocalAuthRoutes(fastify);

  fastify.addHook('onRequest', async (request, reply) => {
    if (request.url === '/api/health') return;
    if (request.url.startsWith('/auth/')) return;
    if (request.url === '/manifest.json' || request.url === '/sw.js' ||
        request.url.startsWith('/icon') || request.url === '/favicon.png') return;

    const needsSetup = !hasUsers(fastify.db);
    if (needsSetup) {
      if (request.url.startsWith('/api/') || request.url.startsWith('/ws/')) {
        return reply.code(428).send({ error: 'Setup required', setupRequired: true });
      }
      request.session.returnTo = request.url;
      return reply.redirect('/auth/setup');
    }

    if (request.session?.authenticated) return;

    if (request.url.startsWith('/api/') || request.url.startsWith('/ws/')) {
      return reply.code(401).send({ error: 'Authentication required', setupRequired: false });
    }

    request.session.returnTo = request.url;
    reply.redirect('/auth/login');
  });

  fastify.log.info('Password auth enabled');
}

function resolveSessionSecret(fastify) {
  if (auth.sessionSecret) return auth.sessionSecret;

  const dir = dirname(config.dbPath);
  const secretPath = join(dir, 'session-secret');
  mkdirSync(dir, { recursive: true });

  if (existsSync(secretPath)) {
    const existing = readFileSync(secretPath, 'utf8').trim();
    if (existing.length >= 32) return existing;
  }

  const generated = randomBytes(48).toString('base64url');
  writeFileSync(secretPath, `${generated}\n`, { mode: 0o600 });
  chmodSync(secretPath, 0o600);
  fastify.log.warn({ path: secretPath }, 'SESSION_DECK_SESSION_SECRET not set; generated a persistent local session secret');
  return generated;
}

async function bootstrapUserIfConfigured(fastify) {
  if (hasUsers(fastify.db)) return;
  if (!auth.bootstrapUser || !auth.bootstrapPass) return;
  createUser(fastify.db, auth.bootstrapUser, auth.bootstrapPass);
  fastify.log.info({ username: auth.bootstrapUser }, 'Bootstrap auth user created');
}

async function registerLocalAuthRoutes(fastify) {
  fastify.get('/auth/setup', async (request, reply) => {
    if (hasUsers(fastify.db)) return reply.redirect('/auth/login');
    reply.type('text/html').send(authPage({ mode: 'setup' }));
  });

  fastify.post('/auth/setup', {
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
  }, async (request, reply) => {
    if (hasUsers(fastify.db)) return reply.redirect('/auth/login');
    const { username, password, confirmPassword } = request.body || {};
    const validation = validateNewCredentials(username, password, confirmPassword);
    if (validation) {
      return reply.type('text/html').send(authPage({ mode: 'setup', error: validation, username }));
    }

    createUser(fastify.db, username.trim(), password);
    request.session.authenticated = true;
    request.session.user = { name: username.trim(), method: 'password' };
    reply.redirect('/');
  });

  fastify.get('/auth/login', async (request, reply) => {
    if (!hasUsers(fastify.db)) return reply.redirect('/auth/setup');
    if (request.session?.authenticated) return reply.redirect('/');
    reply.type('text/html').send(authPage({ mode: 'login' }));
  });

  fastify.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
  }, async (request, reply) => {
    if (!hasUsers(fastify.db)) return reply.redirect('/auth/setup');
    const { username, password } = request.body || {};
    const user = username ? findUser(fastify.db, username.trim()) : null;
    if (user && await verifyPassword(password || '', user.password_hash)) {
      request.session.authenticated = true;
      request.session.user = { name: user.username, method: 'password' };
      fastify.db.prepare("UPDATE app_users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
      const returnTo = request.session.returnTo || '/';
      delete request.session.returnTo;
      return reply.redirect(returnTo);
    }
    reply.type('text/html').send(authPage({ mode: 'login', error: 'Invalid username or password', username }));
  });

  fastify.get('/auth/logout', async (request, reply) => {
    request.session.destroy();
    reply.redirect('/auth/login');
  });

  fastify.get('/auth/me', async (request) => {
    return request.session?.user || null;
  });
}

export function hasUsers(db) {
  return db.prepare('SELECT COUNT(*) as c FROM app_users').get().c > 0;
}

function findUser(db, username) {
  return db.prepare('SELECT * FROM app_users WHERE username = ?').get(username);
}

function createUser(db, username, password) {
  const hash = hashPasswordSync(password);
  db.prepare('INSERT INTO app_users (username, password_hash) VALUES (?, ?)').run(username, hash);
}

function validateNewCredentials(username, password, confirmPassword) {
  if (!username?.trim()) return 'Username is required';
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password !== confirmPassword) return 'Passwords do not match';
  return null;
}

function hashPasswordSync(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, salt, hashHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function authPage({ mode, error = null, username = '' }) {
  const setup = mode === 'setup';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session Deck — ${setup ? 'Setup' : 'Login'}</title>
  <link rel="icon" type="image/png" href="/favicon.png">
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
      <img src="/icon.svg" width="32" height="32" alt="Session Deck">
      <span class="login-title">SESSION DECK</span>
    </div>
    <p class="login-subtitle">${setup ? 'Create the first administrator account.' : 'Sign in with your local account.'}</p>
    ${error ? `<div class="login-error">${escapeHtml(error)}</div>` : ''}
    <form class="login-form" method="POST" action="${setup ? '/auth/setup' : '/auth/login'}">
      <input class="login-field" type="text" name="username" placeholder="Username" value="${escapeHtml(username || '')}" required autofocus>
      <input class="login-field" type="password" name="password" placeholder="Password" required>
      ${setup ? '<input class="login-field" type="password" name="confirmPassword" placeholder="Confirm password" required>' : ''}
      <button class="login-btn" type="submit">${setup ? 'Create Account' : 'Sign In'}</button>
    </form>
  </div>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
