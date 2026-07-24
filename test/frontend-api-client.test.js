import test from 'node:test';
import assert from 'node:assert/strict';
import { apiJson, apiOk } from '../frontend/src/lib/api-client.js';

test('apiJson sends JSON bodies and returns parsed response data', async () => {
  let captured;
  global.fetch = async (path, init) => {
    captured = { path, init };
    return response({ ok: true, status: 200, body: { saved: true } });
  };

  const data = await apiJson('/api/example', {
    method: 'POST',
    body: { name: 'main' },
  });

  assert.deepEqual(data, { saved: true });
  assert.equal(captured.path, '/api/example');
  assert.equal(captured.init.headers.get('Content-Type'), 'application/json');
  assert.equal(captured.init.body, '{"name":"main"}');
});

test('apiJson preserves existing string bodies and content type headers', async () => {
  let captured;
  global.fetch = async (_path, init) => {
    captured = init;
    return response({ ok: true, status: 204, body: {} });
  };

  await apiOk('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'raw',
  });

  assert.equal(captured.headers.get('Content-Type'), 'text/plain');
  assert.equal(captured.body, 'raw');
});

test('apiJson preserves case-insensitive and Headers content type values', async () => {
  const captured = [];
  global.fetch = async (_path, init) => {
    captured.push(init);
    return response({ ok: true, status: 200, body: {} });
  };

  await apiJson('/api/lowercase', {
    method: 'POST',
    headers: { 'content-type': 'application/x-ndjson' },
    body: { ok: true },
  });
  await apiJson('/api/headers', {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/custom' }),
    body: { ok: true },
  });

  assert.equal(captured[0].headers.get('Content-Type'), 'application/x-ndjson');
  assert.equal(captured[1].headers.get('Content-Type'), 'application/custom');
});

test('apiJson throws server error payloads with status and details', async () => {
  global.fetch = async () => response({
    ok: false,
    status: 409,
    statusText: 'Conflict',
    body: { error: 'key is in use', usedByHosts: [{ name: 'prod' }] },
  });

  await assert.rejects(
    apiJson('/api/ssh-keys/id_rsa', { method: 'DELETE' }),
    (err) => {
      assert.equal(err.message, 'key is in use');
      assert.equal(err.status, 409);
      assert.deepEqual(err.payload.usedByHosts, [{ name: 'prod' }]);
      return true;
    },
  );
});

test('apiJson falls back to HTTP status when error response is not JSON', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 502,
    statusText: 'Bad Gateway',
    headers: new Headers(),
    json: async () => { throw new Error('invalid json'); },
  });

  await assert.rejects(apiJson('/api/broken'), /HTTP 502 Bad Gateway/);
});

test('apiJson treats 204 responses as empty without parsing JSON', async () => {
  let jsonCalled = false;
  global.fetch = async () => ({
    ok: true,
    status: 204,
    statusText: 'No Content',
    headers: new Headers(),
    json: async () => {
      jsonCalled = true;
      throw new Error('should not parse');
    },
  });

  assert.deepEqual(await apiJson('/api/empty'), {});
  assert.equal(jsonCalled, false);
});

test('apiJson wraps network failures with stable status and payload', async () => {
  global.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };

  await assert.rejects(
    apiJson('/api/offline'),
    (err) => {
      assert.equal(err.message, 'Network request failed: Failed to fetch');
      assert.equal(err.status, 0);
      assert.deepEqual(err.payload, {
        error: 'Network request failed: Failed to fetch',
        message: 'Network request failed: Failed to fetch',
        statusCode: 0,
      });
      return true;
    },
  );
});

function response({ ok, status, statusText = '', body, headers = {} }) {
  return {
    ok,
    status,
    statusText,
    headers: new Headers(headers),
    json: async () => body,
  };
}
