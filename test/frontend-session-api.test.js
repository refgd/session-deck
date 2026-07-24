import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTmuxSession,
  deleteTmuxSession,
  loadHostSessions,
  loadSessionHosts,
  renameTmuxSession,
  runSessionRenderTest,
  sessionCaptureDownloadPath,
} from '../frontend/src/lib/session-api.js';

function response({ ok = true, status = 200, statusText = 'OK', body = {} } = {}) {
  return {
    ok,
    status,
    statusText,
    json: async () => body,
  };
}

test('loadHostSessions encodes host names and attaches host to sessions', async () => {
  const calls = [];
  const sessions = await loadHostSessions('jump/box', {
    fetchRef: async (path) => {
      calls.push(path);
      return response({ body: { sessions: [{ name: 'main' }] } });
    },
  });

  assert.deepEqual(calls, ['/api/sessions/jump%2Fbox']);
  assert.deepEqual(sessions, [{ name: 'main', host: 'jump/box' }]);
});

test('loadHostSessions throws detailed host errors for offline payloads', async () => {
  await assert.rejects(
    () => loadHostSessions('box', {
      fetchRef: async () => response({
        body: {
          status: 'error',
          error: 'tmux is not running',
          detail: 'no server running',
        },
      }),
    }),
    /tmux is not running \| status: error/,
  );
});

test('session API mutation helpers encode host and session names', async () => {
  const calls = [];
  const api = async (path, options) => calls.push({ path, options });

  await createTmuxSession('jump/box', { name: 'main session', startDir: '' }, { api });
  await renameTmuxSession('jump/box', 'main/session', 'next session', { api });
  await deleteTmuxSession('jump/box', 'main/session', { api });
  await runSessionRenderTest('jump/box', 'main/session', { api });

  assert.deepEqual(calls, [
    {
      path: '/api/sessions/jump%2Fbox',
      options: { method: 'POST', body: { name: 'main session', startDir: undefined } },
    },
    {
      path: '/api/sessions/jump%2Fbox/main%2Fsession',
      options: { method: 'PUT', body: { newName: 'next session' } },
    },
    {
      path: '/api/sessions/jump%2Fbox/main%2Fsession',
      options: { method: 'DELETE' },
    },
    {
      path: '/api/sessions/jump%2Fbox/main%2Fsession/render-test',
      options: { method: 'POST' },
    },
  ]);
});

test('loadSessionHosts returns stable array defaults', async () => {
  assert.deepEqual(await loadSessionHosts({ api: async () => ({ hosts: [{ name: 'box' }] }) }), [{ name: 'box' }]);
  assert.deepEqual(await loadSessionHosts({ api: async () => ({}) }), []);
});

test('sessionCaptureDownloadPath encodes host and session components', () => {
  assert.equal(
    sessionCaptureDownloadPath('jump/box', 'main/session'),
    '/api/sessions/jump%2Fbox/main%2Fsession/capture?download=true',
  );
});
