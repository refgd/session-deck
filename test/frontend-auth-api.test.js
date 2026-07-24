import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCurrentUser } from '../frontend/src/lib/auth-api.js';

test('loadCurrentUser returns the authenticated user when /auth/me succeeds', async () => {
  const calls = [];
  const user = { name: 'admin', method: 'local' };
  const result = await loadCurrentUser({
    fetchRef: async (path) => {
      calls.push(path);
      return {
        ok: true,
        json: async () => user,
      };
    },
  });

  assert.equal(result, user);
  assert.deepEqual(calls, ['/auth/me']);
});

test('loadCurrentUser returns null when auth is unavailable or rejected', async () => {
  assert.equal(await loadCurrentUser({
    fetchRef: async () => ({ ok: false, json: async () => ({}) }),
  }), null);

  assert.equal(await loadCurrentUser({
    fetchRef: async () => {
      throw new Error('offline');
    },
  }), null);
});
