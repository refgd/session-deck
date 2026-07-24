import test from 'node:test';
import assert from 'node:assert/strict';
import { appBasePath, appPath, websocketPath } from '../frontend/src/lib/base-path.js';

test('appBasePath derives reverse proxy subdirectory from current pathname', () => {
  assert.equal(appBasePath({ pathname: '/' }), '');
  assert.equal(appBasePath({ pathname: '/deck/' }), '/deck');
  assert.equal(appBasePath({ pathname: '/deck/index.html' }), '/deck');
});

test('appPath prefixes HTTP paths with the configured base path', () => {
  globalThis.__SESSION_DECK_BASE_PATH__ = '/deck/';
  try {
    assert.equal(appPath('/api/workspaces'), '/deck/api/workspaces');
    assert.equal(appPath('icon.svg'), '/deck/icon.svg');
    assert.equal(appPath(''), '/deck');
  } finally {
    delete globalThis.__SESSION_DECK_BASE_PATH__;
  }
});

test('websocketPath prefixes WS paths with the configured base path', () => {
  const previousLocation = globalThis.location;
  globalThis.__SESSION_DECK_BASE_PATH__ = '/deck';
  globalThis.location = { protocol: 'https:', host: 'example.test' };
  try {
    assert.equal(websocketPath('/ws/status'), 'wss://example.test/deck/ws/status');
  } finally {
    delete globalThis.__SESSION_DECK_BASE_PATH__;
    if (previousLocation === undefined) {
      delete globalThis.location;
    } else {
      globalThis.location = previousLocation;
    }
  }
});
