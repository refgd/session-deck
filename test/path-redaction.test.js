import test from 'node:test';
import assert from 'node:assert/strict';
import { redactPath, redactPathsInText } from '../src/lib/path-redaction.js';

test('redactPath keeps only path hints', () => {
  assert.equal(redactPath('/home/test/.ssh/id_ed25519', '/home/test'), '~/.../id_ed25519');
  assert.equal(redactPath('/var/lib/session-deck/key.pem', '/home/test'), '/.../key.pem');
  assert.equal(redactPath('relative/key.pem', '/home/test'), '.../key.pem');
  assert.equal(redactPath('', '/home/test'), '');
});

test('redactPathsInText redacts local paths without changing URLs', () => {
  assert.equal(
    redactPathsInText('open /root/.ssh/config and /var/run/docker.sock, docs https://example.com/a/b'),
    'open /.../config and /.../docker.sock, docs https://example.com/a/b',
  );
  assert.equal(
    redactPathsInText("IdentityFile='/home/test/.ssh/id_app'", '/home/test'),
    "IdentityFile='~/.../id_app'",
  );
});
