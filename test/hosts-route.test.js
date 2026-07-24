import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import hostsRoutes from '../src/routes/hosts.js';
import { createMemoryDb } from '../test-support/db.js';

test('session host discovery response is not cached', async () => {
  const app = Fastify({ logger: false });
  const db = createMemoryDb();
  app.decorate('db', db);
  app.addHook('onClose', () => db.close());
  await app.register(hostsRoutes);

  try {
    const response = await app.inject('/api/hosts');

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers.pragma, 'no-cache');
    assert.equal(Array.isArray(response.json().hosts), true);
  } finally {
    await app.close();
  }
});
