import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import activityRoutes from '../src/routes/activity.js';
import statusRoutes from '../src/routes/status.js';

test('/api/status response is not cached', async () => {
  const app = Fastify({ logger: false });
  await app.register(statusRoutes);

  try {
    const response = await app.inject('/api/status');

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers.pragma, 'no-cache');
    assert.deepEqual(response.json(), { panes: [] });
  } finally {
    await app.close();
  }
});

test('/api/activity errors use stable non-cacheable payloads', async () => {
  const app = Fastify({ logger: false });
  app.decorate('db', {
    prepare() {
      throw Object.assign(new Error('database unavailable'), {
        code: 'SQLITE_IOERR',
        path: '/data/session-deck.db',
      });
    },
  });
  await app.register(activityRoutes);

  try {
    const response = await app.inject('/api/activity');

    assert.equal(response.statusCode, 500);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers.pragma, 'no-cache');
    assert.deepEqual(response.json(), {
      error: 'database unavailable',
      message: 'database unavailable',
      statusCode: 500,
      code: 'SQLITE_IOERR',
      path: '/.../session-deck.db',
    });
  } finally {
    await app.close();
  }
});
