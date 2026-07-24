import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySshKeyForm, validateSshKeyForm } from '../frontend/src/lib/ssh-key-utils.js';

const PRIVATE_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
frontend-format-check
-----END OPENSSH PRIVATE KEY-----`;
const PUBLIC_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEfrontendfake comment';

function t(key) {
  return `i18n:${key}`;
}

test('emptySshKeyForm gives the settings panel a stable blank form shape', () => {
  assert.deepEqual(emptySshKeyForm, { name: '', privateKey: '', publicKey: '' });
});

test('validateSshKeyForm accepts valid managed SSH key input', () => {
  assert.equal(validateSshKeyForm({
    name: 'id_ed25519_prod',
    privateKey: PRIVATE_KEY,
    publicKey: PUBLIC_KEY,
  }, t), null);
});

test('validateSshKeyForm rejects unsafe names and missing private keys', () => {
  assert.equal(validateSshKeyForm({ name: '', privateKey: PRIVATE_KEY }, t), 'i18n:sshKeyNameRequired');
  assert.equal(validateSshKeyForm({ name: '../id_ed25519', privateKey: PRIVATE_KEY }, t), 'i18n:sshKeyNameInvalid');
  assert.equal(validateSshKeyForm({ name: 'known_hosts', privateKey: PRIVATE_KEY }, t), 'i18n:sshKeyNameInvalid');
  assert.equal(validateSshKeyForm({ name: 'id_ed25519.pub', privateKey: PRIVATE_KEY }, t), 'i18n:sshKeyNameInvalid');
  assert.equal(validateSshKeyForm({ name: 'id_ed25519', privateKey: '' }, t), 'i18n:privateKeyRequired');
});

test('validateSshKeyForm rejects invalid or oversized key material', () => {
  assert.equal(validateSshKeyForm({ name: 'id_bad', privateKey: 'not a key' }, t), 'i18n:invalidPrivateKey');
  assert.equal(validateSshKeyForm({ name: 'id_bad_pub', privateKey: PRIVATE_KEY, publicKey: 'not a public key' }, t), 'i18n:invalidPublicKey');
  assert.equal(validateSshKeyForm({ name: 'id_large', privateKey: `${PRIVATE_KEY}\n${'x'.repeat(128 * 1024)}` }, t), 'i18n:privateKeyTooLarge');
  assert.equal(validateSshKeyForm({ name: 'id_large_pub', privateKey: PRIVATE_KEY, publicKey: `ssh-ed25519 ${'A'.repeat(16 * 1024)}` }, t), 'i18n:publicKeyTooLarge');
});
