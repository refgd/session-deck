import test from 'node:test';
import assert from 'node:assert/strict';
import { logError, redactLogText, sanitizeLogError } from '../frontend/src/lib/logger.js';

test('logError is quiet unless logging is enabled', () => {
  const previousError = console.error;
  const calls = [];
  console.error = (...args) => calls.push(args);

  try {
    logError('quiet', new Error('hidden'), { enabled: false });
    assert.deepEqual(calls, []);
  } finally {
    console.error = previousError;
  }
});

test('logError writes through to console.error when enabled', () => {
  const previousError = console.error;
  const calls = [];
  const err = Object.assign(new Error('open /root/.ssh/config failed'), {
    code: 'ENOENT',
    path: '/root/.ssh/config',
    stderr: 'identity /root/.ssh/id_app rejected',
    payload: {
      command: 'ssh -i /root/.ssh/id_app host',
    },
  });
  console.error = (...args) => calls.push(args);

  try {
    logError('shown /root/.ssh/config', err, { enabled: true });
    assert.deepEqual(calls, [[
      'shown /.../config',
      {
        name: 'Error',
        message: 'open /.../config failed',
        code: 'ENOENT',
        path: '/.../config',
        stderr: 'identity /.../id_app rejected',
        payload: {
          command: 'ssh -i /.../id_app host',
        },
      },
    ]]);
  } finally {
    console.error = previousError;
  }
});

test('redactLogText keeps useful path hints without exposing full paths', () => {
  assert.equal(redactLogText('open /root/.ssh/config'), 'open /.../config');
  assert.equal(redactLogText("IdentityFile='/home/test/.ssh/id_app'"), "IdentityFile='/.../id_app'");
  assert.equal(redactLogText('docs https://example.com/a/b'), 'docs https://example.com/a/b');
});

test('sanitizeLogError handles non-error values and common diagnostic fields', () => {
  assert.equal(sanitizeLogError('failed at /tmp/app/key.pem'), 'failed at /.../key.pem');
  assert.deepEqual(sanitizeLogError({
    name: 'CustomError',
    message: 'bad /var/log/app.log',
    status: 500,
    stdout: 'read /tmp/out.txt',
  }), {
    name: 'CustomError',
    message: 'bad /.../app.log',
    status: 500,
    stdout: 'read /.../out.txt',
  });
});
