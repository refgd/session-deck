import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import fastifyWebSocket from '@fastify/websocket';
import terminalWsRoutes from '../src/routes/terminal-ws.js';

test('/api/ws-token returns a non-cacheable short-lived token response', async () => {
  const app = Fastify({ logger: false });
  try {
    await app.register(fastifyWebSocket);
    await app.register(terminalWsRoutes);

    const response = await app.inject('/api/ws-token');

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers.pragma, 'no-cache');
    assert.match(response.json().token, /^[a-f0-9]{48}$/);
  } finally {
    await app.close();
  }
});
