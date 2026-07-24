import test from 'node:test';
import assert from 'node:assert/strict';
import { attachGateway } from '../src/services/hosts.js';
import { createMemoryDb } from '../test-support/db.js';

test('attachGateway attaches enabled gateway host details', () => {
  const db = createMemoryDb();
  try {
    const gateway = db.prepare(`
      INSERT INTO managed_hosts (name, hostname, user, port, identity_file, connection_type, enabled)
      VALUES ('jump', '10.0.0.1', 'ops', 2222, '/keys/jump', 'ssh', 1)
    `).run();
    const target = db.prepare(`
      INSERT INTO managed_hosts (name, hostname, user, gateway_host_id, connection_type, enabled)
      VALUES ('target', '10.0.0.2', 'root', ?, 'ssh', 1)
    `).run(gateway.lastInsertRowid);

    const row = db.prepare('SELECT * FROM managed_hosts WHERE id = ?').get(target.lastInsertRowid);
    const attached = attachGateway(db, row);

    assert.equal(attached.gatewayHost.name, 'jump');
    assert.equal(attached.gatewayHost.hostname, '10.0.0.1');
    assert.equal(attached.gatewayHost.user, 'ops');
    assert.equal(attached.gatewayHost.port, 2222);
    assert.equal(attached.gatewayHost.identityFile, '/keys/jump');
    assert.equal(attached.gatewayHost.connectionType, 'ssh');
  } finally {
    db.close();
  }
});

test('attachGateway leaves hosts unchanged when gateway is disabled, missing, or self-referential', () => {
  const db = createMemoryDb();
  try {
    const disabled = db.prepare(`
      INSERT INTO managed_hosts (name, hostname, connection_type, enabled)
      VALUES ('disabled', '10.0.0.3', 'ssh', 0)
    `).run();
    const target = db.prepare(`
      INSERT INTO managed_hosts (name, hostname, gateway_host_id, connection_type, enabled)
      VALUES ('target', '10.0.0.4', ?, 'ssh', 1)
    `).run(disabled.lastInsertRowid);
    const missingGateway = {
      ...db.prepare('SELECT * FROM managed_hosts WHERE id = ?').get(target.lastInsertRowid),
      gateway_host_id: 999,
    };
    const self = db.prepare(`
      INSERT INTO managed_hosts (name, hostname, connection_type, enabled)
      VALUES ('self', '10.0.0.5', 'ssh', 1)
    `).run();
    db.prepare('UPDATE managed_hosts SET gateway_host_id = ? WHERE id = ?').run(self.lastInsertRowid, self.lastInsertRowid);

    const disabledGateway = db.prepare('SELECT * FROM managed_hosts WHERE id = ?').get(target.lastInsertRowid);
    const selfGateway = db.prepare('SELECT * FROM managed_hosts WHERE id = ?').get(self.lastInsertRowid);

    assert.equal(Object.hasOwn(attachGateway(db, disabledGateway), 'gatewayHost'), false);
    assert.equal(Object.hasOwn(attachGateway(db, missingGateway), 'gatewayHost'), false);
    assert.equal(Object.hasOwn(attachGateway(db, selfGateway), 'gatewayHost'), false);
    assert.equal(attachGateway(db, null), null);
  } finally {
    db.close();
  }
});
