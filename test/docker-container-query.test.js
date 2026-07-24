import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOptionalGatewayId, resolveDockerListGateway } from '../src/lib/docker-container-query.js';
import { createMemoryDb } from '../test-support/db.js';

test('parseOptionalGatewayId accepts empty values and positive integers', () => {
  assert.equal(parseOptionalGatewayId(undefined), null);
  assert.equal(parseOptionalGatewayId(null), null);
  assert.equal(parseOptionalGatewayId(''), null);
  assert.equal(parseOptionalGatewayId('7'), 7);
  assert.equal(parseOptionalGatewayId(8), 8);
});

test('parseOptionalGatewayId rejects invalid gateway ids with a client error', () => {
  for (const value of ['abc', '1.5', 0, -1]) {
    assert.throws(
      () => parseOptionalGatewayId(value),
      err => err.message === 'Invalid gateway host' && err.statusCode === 400,
    );
  }
});

test('resolveDockerListGateway returns null when no gateway was requested', () => {
  const db = createMemoryDb();
  try {
    assert.equal(resolveDockerListGateway(db, {}), null);
    assert.equal(resolveDockerListGateway(db, { gateway_host_id: '' }), null);
  } finally {
    db.close();
  }
});

test('resolveDockerListGateway resolves enabled managed hosts for Docker listing', () => {
  const db = createMemoryDb();
  try {
    const result = db.prepare(`
      INSERT INTO managed_hosts (name, hostname, user, port, identity_file, connection_type, enabled)
      VALUES ('jump', '10.0.0.10', 'ops', 2222, '/keys/jump', 'ssh', 1)
    `).run();

    assert.deepEqual(resolveDockerListGateway(db, { gateway_host_id: String(result.lastInsertRowid) }), {
      id: result.lastInsertRowid,
      name: 'jump',
      hostname: '10.0.0.10',
      user: 'ops',
      port: 2222,
      identityFile: '/keys/jump',
      authMethod: 'key',
      group: 'Other',
      isLocal: false,
      connectionType: 'ssh',
      dockerContainer: null,
      gatewayHostId: null,
      enabled: true,
    });
  } finally {
    db.close();
  }
});

test('resolveDockerListGateway allows disabled hosts as Docker discovery gateways', () => {
  const db = createMemoryDb();
  try {
    const disabled = db.prepare(`
      INSERT INTO managed_hosts (name, hostname, connection_type, enabled)
      VALUES ('disabled', '10.0.0.20', 'ssh', 0)
    `).run();

    assert.equal(resolveDockerListGateway(db, { gateway_host_id: String(disabled.lastInsertRowid) }).name, 'disabled');
  } finally {
    db.close();
  }
});

test('resolveDockerListGateway rejects missing gateways', () => {
  const db = createMemoryDb();
  try {
    assert.throws(
      () => resolveDockerListGateway(db, { gateway_host_id: '999' }),
      err => err.message === 'Gateway host not found' && err.statusCode === 404,
    );
  } finally {
    db.close();
  }
});
