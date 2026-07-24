import test from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  countAuditEvents,
  listRecentAuditEvents,
  pruneAuditEvents,
  recordAuditEvent,
  sanitizeAuditError,
  sanitizeAuditDetails,
} from '../src/lib/audit-log.js';
import { createMemoryDb } from '../test-support/db.js';

test('audit log stores actor, target, and redacted details', () => {
  const db = createMemoryDb();
  const keyPath = join(homedir(), '.ssh', 'id_deploy');
  try {
    const id = recordAuditEvent(db, {
      request: { ip: '10.0.0.5', session: { user: { name: 'admin' } } },
      action: 'ssh_key.create',
      targetType: 'ssh_key',
      targetName: 'deploy',
      status: 'error',
      details: {
        privateKey: 'secret',
        path: keyPath,
        nested: { password: 'hidden', safe: 'value', identity_file: '/keys/prod.pem' },
      },
      error: `ENOENT: no such file or directory, open ${keyPath}`,
    });

    assert.equal(countAuditEvents(db), 1);
    assert.equal(typeof id, 'number');

    const [event] = listRecentAuditEvents(db);
    assert.equal(event.actor, 'admin');
    assert.equal(event.action, 'ssh_key.create');
    assert.equal(event.target_type, 'ssh_key');
    assert.equal(event.target_name, 'deploy');
    assert.equal(event.status, 'error');
    assert.equal(event.error, 'ENOENT: no such file or directory, open ~/.../id_deploy');
    assert.equal(event.ip, '10.0.0.5');
    assert.deepEqual(event.details, {
      privateKey: '[redacted]',
      path: '~/.../id_deploy',
      nested: { password: '[redacted]', safe: 'value', identity_file: '/.../prod.pem' },
    });
  } finally {
    db.close();
  }
});

test('audit error sanitizer redacts paths without changing URLs', () => {
  assert.equal(
    sanitizeAuditError('Command failed: ssh host cat /root/.ssh/config, see https://example.com/docs'),
    'Command failed: ssh host cat /.../config, see https://example.com/docs',
  );
  assert.equal(sanitizeAuditError(null), null);
});

test('audit detail sanitizer redacts sensitive values and local paths in arrays', () => {
  assert.deepEqual(sanitizeAuditDetails([{ publicKey: 'ssh-rsa value', name: 'key', identityFile: '/tmp/key.pem' }]), [
    { publicKey: '[redacted]', name: 'key', identityFile: '/.../key.pem' },
  ]);
});

test('audit log prunes older events after inserts', () => {
  const db = createMemoryDb();
  try {
    for (let index = 0; index < 5; index++) {
      recordAuditEvent(db, {
        action: `event.${index}`,
        maxEvents: 3,
      });
    }

    assert.equal(countAuditEvents(db), 3);
    assert.deepEqual(listRecentAuditEvents(db, 10).map(event => event.action), [
      'event.4',
      'event.3',
      'event.2',
    ]);

    pruneAuditEvents(db, 2);
    assert.deepEqual(listRecentAuditEvents(db, 10).map(event => event.action), [
      'event.4',
      'event.3',
    ]);
  } finally {
    db.close();
  }
});
