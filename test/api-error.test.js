import test from 'node:test';
import assert from 'node:assert/strict';
import { apiError, errorPayload } from '../src/lib/api-error.js';

test('errorPayload includes stable diagnostics but excludes stack', () => {
  const err = Object.assign(new Error('config missing'), {
    code: 'ENOENT',
    path: '/root/.ssh/config',
    syscall: 'open',
    errno: -2,
    exitCode: 1,
    signal: 'SIGTERM',
    cmd: 'ssh -i /root/.ssh/id_ed25519 reliant tmux list-sessions',
    stderr: 'open /root/.ssh/config failed',
    details: { host: 'reliant', identity_file: '/root/.ssh/id_ed25519' },
  });

  const payload = errorPayload(err, 500, { host: 'reliant' });

  assert.deepEqual(payload, {
    error: 'config missing',
    message: 'config missing',
    statusCode: 500,
    host: 'reliant',
    code: 'ENOENT',
    path: '/.../config',
    syscall: 'open',
    errno: -2,
    exitCode: 1,
    signal: 'SIGTERM',
    command: 'ssh -i /.../id_ed25519 reliant tmux list-sessions',
    stderr: 'open /.../config failed',
    details: { host: 'reliant', identity_file: '/.../id_ed25519' },
  });
  assert.equal('stack' in payload, false);
});

test('errorPayload redacts paths in message and extra fields', () => {
  const payload = errorPayload(new Error('open /root/.ssh/config failed'), 500, {
    path: '/root/.ssh/config',
    nested: {
      stderr: 'identity /root/.ssh/id_app rejected',
    },
  });

  assert.equal(payload.message, 'open /.../config failed');
  assert.equal(payload.path, '/.../config');
  assert.deepEqual(payload.nested, {
    stderr: 'identity /.../id_app rejected',
  });
});

test('apiError uses explicit status and sends payload through reply', () => {
  const calls = [];
  const reply = {
    code(status) {
      calls.push(['code', status]);
      return this;
    },
    send(payload) {
      calls.push(['send', payload]);
      return payload;
    },
  };

  const sent = apiError(reply, 'Unknown setting', 404, { key: 'bad_key' });

  assert.deepEqual(calls[0], ['code', 404]);
  assert.deepEqual(sent, {
    error: 'Unknown setting',
    message: 'Unknown setting',
    statusCode: 404,
    key: 'bad_key',
  });
});

test('apiError falls back to error statusCode when explicit status is omitted', () => {
  const reply = {
    status: null,
    body: null,
    code(status) {
      this.status = status;
      return this;
    },
    send(payload) {
      this.body = payload;
      return payload;
    },
  };
  const err = Object.assign(new Error('duplicate'), { statusCode: 409 });

  apiError(reply, err);

  assert.equal(reply.status, 409);
  assert.equal(reply.body.statusCode, 409);
  assert.equal(reply.body.error, 'duplicate');
});
