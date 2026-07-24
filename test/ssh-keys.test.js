import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import config from '../src/lib/config.js';
import { deleteSshKey, listSshKeys, saveSshKey } from '../src/services/ssh-keys.js';

const PRIVATE_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
not-a-real-key-but-valid-for-format-checks
-----END OPENSSH PRIVATE KEY-----`;
const PUBLIC_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEfakekeydata test@example';

function withTempKeyStore(fn) {
  const previousDbPath = config.dbPath;
  const dir = mkdtempSync(join(tmpdir(), 'session-deck-keys-'));
  config.dbPath = join(dir, 'session-deck.db');
  try {
    return fn(dir);
  } finally {
    config.dbPath = previousDbPath;
    rmSync(dir, { recursive: true, force: true });
  }
}

test('saveSshKey stores private and public keys with constrained permissions', () => withTempKeyStore(() => {
  const saved = saveSshKey({ name: 'id_ed25519_prod', privateKey: PRIVATE_KEY, publicKey: PUBLIC_KEY });

  assert.equal(saved.name, 'id_ed25519_prod');
  assert.equal(saved.managed, true);
  assert.equal(statSync(dirname(saved.path)).mode & 0o777, 0o700);
  assert.equal(statSync(saved.path).mode & 0o777, 0o600);
  assert.equal(statSync(`${saved.path}.pub`).mode & 0o777, 0o644);
  assert.equal(readFileSync(saved.path, 'utf8'), `${PRIVATE_KEY}\n`);
  assert.equal(readFileSync(`${saved.path}.pub`, 'utf8'), `${PUBLIC_KEY}\n`);
}));

test('saveSshKey rejects unsafe key names instead of rewriting them', () => withTempKeyStore(() => {
  assert.throws(
    () => saveSshKey({ name: '../id_ed25519', privateKey: PRIVATE_KEY }),
    Object.assign(/Key name must be 1-80 characters/, { statusCode: 400 }),
  );
  assert.throws(
    () => saveSshKey({ name: 'known_hosts', privateKey: PRIVATE_KEY }),
    Object.assign(/Key name must be 1-80 characters/, { statusCode: 400 }),
  );
  assert.throws(
    () => saveSshKey({ name: 'id_ed25519.pub', privateKey: PRIVATE_KEY }),
    Object.assign(/Key name must be 1-80 characters/, { statusCode: 400 }),
  );
}));

test('saveSshKey rejects invalid or oversized key material', () => withTempKeyStore(() => {
  assert.throws(
    () => saveSshKey({ name: 'invalid_private', privateKey: 'not a key' }),
    Object.assign(/Invalid private key format/, { statusCode: 400 }),
  );
  assert.throws(
    () => saveSshKey({ name: 'invalid_public', privateKey: PRIVATE_KEY, publicKey: 'not a public key' }),
    Object.assign(/Invalid public key format/, { statusCode: 400 }),
  );
  assert.throws(
    () => saveSshKey({ name: 'large_private', privateKey: `${PRIVATE_KEY}\n${'x'.repeat(128 * 1024)}` }),
    Object.assign(/Private key is too large/, { statusCode: 400 }),
  );
  assert.throws(
    () => saveSshKey({ name: 'large_public', privateKey: PRIVATE_KEY, publicKey: `ssh-ed25519 ${'A'.repeat(16 * 1024)}` }),
    Object.assign(/Public key is too large/, { statusCode: 400 }),
  );
}));

test('listSshKeys ignores managed symlinks and unsafe managed filenames', () => withTempKeyStore(() => {
  const saved = saveSshKey({ name: 'id_real', privateKey: PRIVATE_KEY });
  const dir = dirname(saved.path);

  symlinkSync(saved.path, join(dir, 'id_link'));
  writeFileSync(join(dir, 'id..unsafe'), `${PRIVATE_KEY}\n`);

  const managedNames = listSshKeys()
    .filter(key => key.managed)
    .map(key => key.name);

  assert.deepEqual(managedNames, ['id_real']);
}));

test('saveSshKey refuses orphaned public key collisions without writing a private key', () => withTempKeyStore(() => {
  const existing = saveSshKey({ name: 'id_existing', privateKey: PRIVATE_KEY });
  const dir = dirname(existing.path);
  const nextPath = join(dir, 'id_pub_collision');

  writeFileSync(`${nextPath}.pub`, `${PUBLIC_KEY}\n`);

  assert.throws(
    () => saveSshKey({ name: 'id_pub_collision', privateKey: PRIVATE_KEY, publicKey: PUBLIC_KEY }),
    Object.assign(/public key .* already exists/i, { statusCode: 409 }),
  );
  assert.equal(existsSync(nextPath), false);
}));

test('deleteSshKey removes only validated managed key names', () => withTempKeyStore(() => {
  const saved = saveSshKey({ name: 'id_delete_me', privateKey: PRIVATE_KEY });

  assert.deepEqual(listSshKeys().filter(key => key.path === saved.path), [saved]);
  assert.throws(
    () => deleteSshKey('../id_delete_me'),
    Object.assign(/Key name must be 1-80 characters/, { statusCode: 400 }),
  );
  assert.deepEqual(deleteSshKey('id_delete_me'), { deleted: true, name: 'id_delete_me', path: saved.path });
  assert.throws(() => deleteSshKey('id_delete_me'), Object.assign(/Managed SSH key not found/, { statusCode: 404 }));
}));
