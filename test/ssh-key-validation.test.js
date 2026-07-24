import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPrivateKey,
  normalizePrivateKey,
  normalizePublicKey,
  validateSshKeyName,
} from '../src/lib/ssh-key-validation.js';

const PRIVATE_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
validation-test
-----END OPENSSH PRIVATE KEY-----`;
const PUBLIC_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEvalidationfake comment';

test('validateSshKeyName trims and accepts safe managed key names', () => {
  assert.equal(validateSshKeyName(' id_ed25519.prod-1 '), 'id_ed25519.prod-1');
});

test('validateSshKeyName rejects missing, reserved, and traversal-like names', () => {
  for (const name of ['', '../id_ed25519', 'id..ed25519', 'id_ed25519.pub', 'config', 'known_hosts', 'authorized_keys']) {
    assert.throws(() => validateSshKeyName(name), Object.assign(/Key name/, { statusCode: 400 }));
  }
});

test('normalizePrivateKey returns one trailing newline and rejects bad input', () => {
  assert.equal(normalizePrivateKey(`${PRIVATE_KEY}\n\n`), `${PRIVATE_KEY}\n`);
  assert.equal(isPrivateKey(PRIVATE_KEY), true);
  assert.equal(isPrivateKey('not a key'), false);
  assert.throws(() => normalizePrivateKey('not a key'), Object.assign(/Invalid private key format/, { statusCode: 400 }));
  assert.throws(() => normalizePrivateKey(`${PRIVATE_KEY}\n${'x'.repeat(128 * 1024)}`), Object.assign(/Private key is too large/, { statusCode: 400 }));
});

test('normalizePublicKey trims optional public keys and rejects bad input', () => {
  assert.equal(normalizePublicKey(` ${PUBLIC_KEY}\n`), PUBLIC_KEY);
  assert.equal(normalizePublicKey(''), '');
  assert.throws(() => normalizePublicKey('not a public key'), Object.assign(/Invalid public key format/, { statusCode: 400 }));
  assert.throws(() => normalizePublicKey(`ssh-ed25519 ${'A'.repeat(16 * 1024)}`), Object.assign(/Public key is too large/, { statusCode: 400 }));
});
