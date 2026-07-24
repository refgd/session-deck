import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BODY_LIMIT, MAX_BODY_LIMIT, MIN_BODY_LIMIT, createConfig } from '../src/lib/config.js';

test('createConfig applies stable defaults', () => {
  const config = createConfig({});
  assert.equal(config.port, 7890);
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.logLevel, 'info');
  assert.equal(config.dbPath, './data/session-deck.db');
  assert.equal(config.bodyLimit, DEFAULT_BODY_LIMIT);
  assert.equal(config.trustProxy, false);
  assert.equal(config.https, 'auto');
  assert.deepEqual(config.corsOrigins, []);
  assert.deepEqual(config.auth, {
    bootstrapUser: '',
    bootstrapPass: '',
    sessionSecret: '',
    sessionMaxAge: 86400,
  });
});

test('createConfig parses explicit environment values', () => {
  const config = createConfig({
    SESSION_DECK_PORT: '3000',
    SESSION_DECK_HOST: '127.0.0.1',
    SESSION_DECK_LOG_LEVEL: 'debug',
    SESSION_DECK_DB_PATH: '/data/db.sqlite',
    SESSION_DECK_BODY_LIMIT: '2097152',
    SESSION_DECK_AUTH_USER: 'admin',
    SESSION_DECK_AUTH_PASS: 'password123',
    SESSION_DECK_SESSION_SECRET: 'x'.repeat(32),
    SESSION_DECK_SESSION_MAX_AGE: '3600',
    SESSION_DECK_CORS_ORIGINS: 'http://localhost:5173,https://deck.example.com',
    SESSION_DECK_TRUST_PROXY: 'true',
    SESSION_DECK_HTTPS: 'true',
  });

  assert.equal(config.port, 3000);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.logLevel, 'debug');
  assert.equal(config.dbPath, '/data/db.sqlite');
  assert.equal(config.bodyLimit, 2097152);
  assert.equal(config.auth.bootstrapUser, 'admin');
  assert.equal(config.auth.bootstrapPass, 'password123');
  assert.equal(config.auth.sessionSecret, 'x'.repeat(32));
  assert.equal(config.auth.sessionMaxAge, 3600);
  assert.deepEqual(config.corsOrigins, ['http://localhost:5173', 'https://deck.example.com']);
  assert.equal(config.trustProxy, true);
  assert.equal(config.https, true);
});

test('createConfig parses automatic and disabled HTTPS modes', () => {
  assert.equal(createConfig({ SESSION_DECK_HTTPS: 'auto' }).https, 'auto');
  assert.equal(createConfig({ SESSION_DECK_HTTPS: 'false' }).https, false);
  assert.equal(createConfig({ SESSION_DECK_HTTPS: '0' }).https, false);
});

test('createConfig rejects invalid environment combinations', () => {
  assert.throws(() => createConfig({ SESSION_DECK_PORT: '0' }), /Invalid port: 0/);
  assert.throws(() => createConfig({ SESSION_DECK_PORT: '3000abc' }), /Invalid port: 3000abc/);
  assert.throws(() => createConfig({ SESSION_DECK_LOG_LEVEL: 'verbose' }), /Invalid log level: verbose/);
  assert.throws(() => createConfig({ SESSION_DECK_BODY_LIMIT: String(MIN_BODY_LIMIT - 1) }), /SESSION_DECK_BODY_LIMIT must be between/);
  assert.throws(() => createConfig({ SESSION_DECK_BODY_LIMIT: String(MAX_BODY_LIMIT + 1) }), /SESSION_DECK_BODY_LIMIT must be between/);
  assert.throws(() => createConfig({ SESSION_DECK_BODY_LIMIT: '1mb' }), /SESSION_DECK_BODY_LIMIT must be between/);
  assert.throws(() => createConfig({ SESSION_DECK_AUTH_USER: 'admin' }), /must be set together/);
  assert.throws(() => createConfig({ SESSION_DECK_AUTH_PASS: 'password123' }), /must be set together/);
  assert.throws(() => createConfig({ SESSION_DECK_SESSION_SECRET: 'short' }), /must be at least 32 characters/);
  assert.throws(() => createConfig({ SESSION_DECK_SESSION_MAX_AGE: '0' }), /must be at least 60 seconds/);
  assert.throws(() => createConfig({ SESSION_DECK_SESSION_MAX_AGE: 'abc' }), /must be at least 60 seconds/);
  assert.throws(() => createConfig({ SESSION_DECK_SESSION_MAX_AGE: '3600s' }), /must be at least 60 seconds/);
  assert.throws(() => createConfig({ SESSION_DECK_CORS_ORIGINS: '*' }), /Invalid SESSION_DECK_CORS_ORIGINS origin/);
  assert.throws(() => createConfig({ SESSION_DECK_CORS_ORIGINS: 'https://deck.example.com/path' }), /Invalid SESSION_DECK_CORS_ORIGINS origin/);
  assert.throws(() => createConfig({ SESSION_DECK_CORS_ORIGINS: 'file:///tmp/deck' }), /Invalid SESSION_DECK_CORS_ORIGINS origin/);
  assert.throws(() => createConfig({ SESSION_DECK_TRUST_PROXY: 'maybe' }), /Invalid SESSION_DECK_TRUST_PROXY/);
  assert.throws(() => createConfig({ SESSION_DECK_HTTPS: 'maybe' }), /Invalid SESSION_DECK_HTTPS/);
});
