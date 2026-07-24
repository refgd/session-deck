import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  MAX_LOGIN_FAILURES,
  createLoginAttemptTracker,
  registerAuth,
  resolveSessionSecret,
  safeReturnTo,
  sessionCookieOptions,
} from '../src/lib/auth.js';
import { hashPasswordSync } from '../src/lib/auth-utils.js';
import config from '../src/lib/config.js';
import diagnosticsRoutes from '../src/routes/diagnostics.js';
import healthRoutes from '../src/routes/health.js';
import { createMemoryDb } from '../test-support/db.js';

async function buildAuthServer() {
  config.auth.sessionSecret = 'test-session-secret-at-least-32-characters';
  const app = Fastify({ logger: false, trustProxy: true });
  const db = createMemoryDb();
  app.decorate('db', db);
  app.addHook('onClose', () => db.close());
  await registerAuth(app);
  app.get('/api/protected', async () => ({ ok: true }));
  return app;
}

function cookieHeader(response) {
  const value = response.headers['set-cookie'];
  return Array.isArray(value) ? value.join('; ') : String(value || '');
}

function assertNoStoreAuthResponse(response) {
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers.pragma, 'no-cache');
}

test('auth hook returns stable setup-required API payload when no user exists', async () => {
  const app = await buildAuthServer();
  try {
    const res = await app.inject('/api/protected');

    assert.equal(res.statusCode, 428);
    assert.deepEqual(res.json(), {
      error: 'Setup required',
      message: 'Setup required',
      statusCode: 428,
      setupRequired: true,
    });
  } finally {
    await app.close();
  }
});

test('auth hook returns stable authentication-required API payload when user exists', async () => {
  const app = await buildAuthServer();
  try {
    app.db.prepare(
      "INSERT INTO app_users (username, password_hash) VALUES ('admin', 'scrypt$salt$hash')"
    ).run();

    const res = await app.inject('/api/protected');

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.json(), {
      error: 'Authentication required',
      message: 'Authentication required',
      statusCode: 401,
      setupRequired: false,
    });
  } finally {
    await app.close();
  }
});

test('diagnostics API is protected by account setup and login', async () => {
  const app = await buildAuthServer();
  try {
    await app.register(diagnosticsRoutes);

    const setupRes = await app.inject('/api/diagnostics');
    assert.equal(setupRes.statusCode, 428);
    assert.equal(setupRes.json().setupRequired, true);

    app.db.prepare(
      "INSERT INTO app_users (username, password_hash) VALUES ('admin', 'scrypt$salt$hash')"
    ).run();

    const authRes = await app.inject('/api/diagnostics');
    assert.equal(authRes.statusCode, 401);
    assert.deepEqual(authRes.json(), {
      error: 'Authentication required',
      message: 'Authentication required',
      statusCode: 401,
      setupRequired: false,
    });
  } finally {
    await app.close();
  }
});

test('health routes are public before account setup', async () => {
  const app = await buildAuthServer();
  try {
    await app.register(healthRoutes);

    for (const url of ['/api/health', '/health']) {
      const res = await app.inject(url);
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, 'ok');
    }
  } finally {
    await app.close();
  }
});

test('setup session cookie uses hardened defaults on HTTP', async () => {
  const previousHttps = process.env.SESSION_DECK_HTTPS;
  delete process.env.SESSION_DECK_HTTPS;
  const app = await buildAuthServer();

  try {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: {
        username: 'admin',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });
    const cookie = cookieHeader(res);

    assert.equal(res.statusCode, 302);
    assertNoStoreAuthResponse(res);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.doesNotMatch(cookie, /;\s*Secure/i);
  } finally {
    if (previousHttps === undefined) delete process.env.SESSION_DECK_HTTPS;
    else process.env.SESSION_DECK_HTTPS = previousHttps;
    await app.close();
  }
});

test('session cookie options use proxy-compatible secure mode by default and when HTTPS is enabled', () => {
  assert.deepEqual(sessionCookieOptions({}), {
    secure: 'auto',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 86400 * 1000,
  });
  assert.deepEqual(sessionCookieOptions({ SESSION_DECK_HTTPS: 'true' }), {
    secure: 'auto',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 86400 * 1000,
  });
});

test('session cookie options can disable secure auto mode for explicit HTTP deployments', () => {
  assert.deepEqual(sessionCookieOptions({ SESSION_DECK_HTTPS: 'false' }), {
    secure: false,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 86400 * 1000,
  });
});

test('resolveSessionSecret generates and stores a constrained local secret', () => withTempAuthConfig((dir) => {
  const logger = { log: [], warn(entry) { this.log.push(entry); } };
  const secret = resolveSessionSecret({ log: logger });
  const path = join(config.dbPath, '..', 'session-secret');

  assert.equal(secret.length >= 32, true);
  assert.equal(readFileSync(path, 'utf8').trim(), secret);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(statSync(join(config.dbPath, '..')).mode & 0o777, 0o700);
  assert.equal(logger.log.length, 1);
  assert.equal(logger.log[0].path, '/.../session-secret');
  assert.equal(logger.log[0].path.includes(dir), false);
}));

test('resolveSessionSecret reuses existing regular secret files', () => withTempAuthConfig(() => {
  const path = join(config.dbPath, '..', 'session-secret');
  const existing = 'existing-session-secret-at-least-32-characters';
  writeFileSync(path, `${existing}\n`, { mode: 0o644 });

  const secret = resolveSessionSecret({ log: { warn() {} } });

  assert.equal(secret, existing);
  assert.equal(statSync(path).mode & 0o777, 0o600);
}));

test('resolveSessionSecret rejects symlinked secret paths', () => withTempAuthConfig((dir) => {
  const target = join(dir, 'external-secret');
  writeFileSync(target, 'external-session-secret-at-least-32-characters\n');
  symlinkSync(target, join(dir, 'session-secret'));

  assert.throws(
    () => resolveSessionSecret({ log: { warn() {} } }),
    Object.assign(/Session secret path is not a regular file/, { statusCode: 500 }),
  );
}));

test('safeReturnTo allows only same-origin app paths', () => {
  assert.equal(safeReturnTo('/workspaces/1?pane=main'), '/workspaces/1?pane=main');
  assert.equal(safeReturnTo('https://evil.example/'), '/');
  assert.equal(safeReturnTo('//evil.example/'), '/');
  assert.equal(safeReturnTo('/auth/logout'), '/');
  assert.equal(safeReturnTo('/bad\nLocation: https://evil.example'), '/');
});

test('login redirects only to sanitized returnTo paths', async () => {
  const app = await buildAuthServer();
  try {
    app.db.prepare(
      'INSERT INTO app_users (username, password_hash) VALUES (?, ?)'
    ).run('admin', hashPasswordSync('password123'));

    const loginPage = await app.inject('/dashboard');
    const cookie = cookieHeader(loginPage);
    assert.equal(loginPage.statusCode, 302);
    assert.equal(loginPage.headers.location, '/auth/login');

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { cookie },
      payload: {
        username: 'admin',
        password: 'password123',
      },
    });

    assert.equal(login.statusCode, 302);
    assert.equal(login.headers.location, '/dashboard');
  } finally {
    await app.close();
  }
});

test('auth pages and session status are not cached', async () => {
  const app = await buildAuthServer();
  try {
    const setupPage = await app.inject('/auth/setup');
    assert.equal(setupPage.statusCode, 200);
    assertNoStoreAuthResponse(setupPage);

    app.db.prepare(
      'INSERT INTO app_users (username, password_hash) VALUES (?, ?)'
    ).run('admin', hashPasswordSync('password123'));

    const loginPage = await app.inject('/auth/login');
    assert.equal(loginPage.statusCode, 200);
    assertNoStoreAuthResponse(loginPage);

    const failedLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        username: 'admin',
        password: 'wrong-password',
      },
    });
    assert.equal(failedLogin.statusCode, 200);
    assertNoStoreAuthResponse(failedLogin);

    const me = await app.inject('/auth/me');
    assert.equal(me.statusCode, 200);
    assertNoStoreAuthResponse(me);

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
    });
    assert.equal(logout.statusCode, 302);
    assertNoStoreAuthResponse(logout);
  } finally {
    await app.close();
  }
});

test('login attempt tracker locks after repeated failures and resets on success', () => {
  let timestamp = 1000;
  const tracker = createLoginAttemptTracker({
    maxFailures: 3,
    lockMs: 10_000,
    now: () => timestamp,
  });

  assert.deepEqual(tracker.check('127.0.0.1:admin'), { locked: false, retryAfterSeconds: 0 });
  tracker.recordFailure('127.0.0.1:admin');
  tracker.recordFailure('127.0.0.1:admin');
  assert.deepEqual(tracker.check('127.0.0.1:admin'), { locked: false, retryAfterSeconds: 0 });

  tracker.recordFailure('127.0.0.1:admin');
  assert.deepEqual(tracker.check('127.0.0.1:admin'), { locked: true, retryAfterSeconds: 10 });

  tracker.recordSuccess('127.0.0.1:admin');
  assert.deepEqual(tracker.check('127.0.0.1:admin'), { locked: false, retryAfterSeconds: 0 });

  tracker.recordFailure('127.0.0.1:admin');
  tracker.recordFailure('127.0.0.1:admin');
  tracker.recordFailure('127.0.0.1:admin');
  timestamp += 10_001;
  assert.deepEqual(tracker.check('127.0.0.1:admin'), { locked: false, retryAfterSeconds: 0 });
});

test('login attempt tracker caps retained keys and keeps recently updated entries', () => {
  const tracker = createLoginAttemptTracker({
    maxFailures: 5,
    lockMs: 10_000,
    maxKeys: 3,
  });

  tracker.recordFailure('first');
  tracker.recordFailure('second');
  tracker.recordFailure('third');
  tracker.recordFailure('first');
  tracker.recordFailure('fourth');

  assert.equal(tracker.size(), 3);
  assert.deepEqual(tracker.check('second'), { locked: false, retryAfterSeconds: 0 });
  tracker.recordFailure('first');
  tracker.recordFailure('first');
  tracker.recordFailure('first');
  assert.equal(tracker.check('first').locked, true);

  tracker.recordFailure('second');
  tracker.recordFailure('second');
  tracker.recordFailure('second');
  tracker.recordFailure('second');
  tracker.recordFailure('second');
  assert.equal(tracker.check('second').locked, true);
});

test('login route returns a clear lockout error after repeated failures', async () => {
  const app = await buildAuthServer();
  try {
    app.db.prepare(
      'INSERT INTO app_users (username, password_hash) VALUES (?, ?)'
    ).run('lockuser', hashPasswordSync('password123'));

    let response;
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) {
      response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          username: 'lockuser',
          password: 'wrong-password',
        },
      });
      assert.equal(response.statusCode, 200);
      assert.match(response.body, /Invalid username or password/);
    }

    const locked = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        username: 'lockuser',
        password: 'password123',
      },
    });

    assert.equal(locked.statusCode, 429);
    assert.match(locked.body, /Too many failed login attempts/);
  } finally {
    await app.close();
  }
});

test('logout requires POST and clears the authenticated session', async () => {
  const app = await buildAuthServer();
  try {
    app.db.prepare(
      'INSERT INTO app_users (username, password_hash) VALUES (?, ?)'
    ).run('admin', hashPasswordSync('password123'));

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        username: 'admin',
        password: 'password123',
      },
    });
    const loginCookie = cookieHeader(login);

    const protectedBefore = await app.inject({
      url: '/api/protected',
      headers: { cookie: loginCookie },
    });
    const getLogout = await app.inject({
      method: 'GET',
      url: '/auth/logout',
      headers: { cookie: loginCookie },
    });
    const postLogout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: loginCookie },
    });
    const logoutCookie = cookieHeader(postLogout);
    const protectedAfter = await app.inject({
      url: '/api/protected',
      headers: { cookie: logoutCookie || loginCookie },
    });

    assert.equal(protectedBefore.statusCode, 200);
    assert.equal(getLogout.statusCode, 404);
    assert.equal(postLogout.statusCode, 302);
    assert.equal(postLogout.headers.location, '/auth/login');
    assert.equal(protectedAfter.statusCode, 401);
  } finally {
    await app.close();
  }
});

test('bootstrap auth user uses the same credential policy as setup', async () => {
  const previousUser = config.auth.bootstrapUser;
  const previousPass = config.auth.bootstrapPass;
  const app = Fastify({ logger: false });
  const db = createMemoryDb();
  app.decorate('db', db);
  app.addHook('onClose', () => db.close());

  config.auth.sessionSecret = 'test-session-secret-at-least-32-characters';
  config.auth.bootstrapUser = 'admin';
  config.auth.bootstrapPass = 'short';

  try {
    await assert.rejects(
      registerAuth(app),
      /Invalid bootstrap credentials: Password must be at least 8 characters/,
    );
  } finally {
    config.auth.bootstrapUser = previousUser;
    config.auth.bootstrapPass = previousPass;
    await app.close();
  }
});

function withTempAuthConfig(fn) {
  const previousDbPath = config.dbPath;
  const previousSecret = config.auth.sessionSecret;
  const dir = mkdtempSync(join(tmpdir(), 'session-deck-auth-'));
  config.dbPath = join(dir, 'session-deck.db');
  config.auth.sessionSecret = '';
  try {
    return fn(dir);
  } finally {
    config.dbPath = previousDbPath;
    config.auth.sessionSecret = previousSecret;
    rmSync(dir, { recursive: true, force: true });
  }
}
