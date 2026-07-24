import test from 'node:test';
import assert from 'node:assert/strict';
import { attachGateway, findHost, getManagedHosts, mapManagedHost } from '../src/services/hosts.js';
import { createMemoryDb } from '../test-support/db.js';

test('mapManagedHost normalizes managed host rows for connection helpers', () => {
  assert.deepEqual(mapManagedHost({
    id: 7,
    name: 'app',
    hostname: 'app.internal',
    user: 'root',
    port: 2222,
    identity_file: '/keys/app',
    auth_method: 'key',
    group_name: 'VPS',
    is_local: 0,
    connection_type: 'ssh',
    docker_container: null,
    gateway_host_id: 3,
    enabled: 1,
  }), {
    id: 7,
    name: 'app',
    hostname: 'app.internal',
    user: 'root',
    port: 2222,
    identityFile: '/keys/app',
    authMethod: 'key',
    group: 'VPS',
    isLocal: false,
    connectionType: 'ssh',
    dockerContainer: null,
    gatewayHostId: 3,
    enabled: true,
  });
});

test('getManagedHosts attaches configured gateway hosts', () => {
  const db = createMemoryDb();
  try {
    const gateway = db.prepare(`
      INSERT INTO managed_hosts (name, hostname, user, port, identity_file, connection_type, enabled)
      VALUES ('jump', 'jump.internal', 'ops', 2222, '/keys/jump', 'ssh', 1)
    `).run();
    db.prepare(`
      INSERT INTO managed_hosts (name, hostname, user, gateway_host_id, connection_type, enabled)
      VALUES ('app', 'app.internal', 'root', ?, 'ssh', 1)
    `).run(gateway.lastInsertRowid);

    const app = getManagedHosts(db).find(host => host.name === 'app');

    assert.equal(app.gatewayHost.name, 'jump');
    assert.equal(app.gatewayHost.hostname, 'jump.internal');
    assert.equal(app.gatewayHost.identityFile, '/keys/jump');
  } finally {
    db.close();
  }
});

test('attachGateway attaches a gateway to normalized hosts', () => {
  const db = createMemoryDb();
  try {
    const gateway = db.prepare(`
      INSERT INTO managed_hosts (name, hostname, user, port, identity_file, connection_type, enabled)
      VALUES ('jump', 'jump.internal', 'ops', 2222, '/keys/jump', 'ssh', 1)
    `).run();
    const host = {
      id: 99,
      name: 'app',
      hostname: 'app.internal',
      connectionType: 'ssh',
      gatewayHostId: gateway.lastInsertRowid,
    };

    const attached = attachGateway(db, host);

    assert.equal(attached.gatewayHost.name, 'jump');
    assert.equal(attached.gatewayHost.identityFile, '/keys/jump');
  } finally {
    db.close();
  }
});

test('findHost attaches configured gateway hosts to matched managed hosts', () => {
  const db = createMemoryDb();
  try {
    const gateway = db.prepare(`
      INSERT INTO managed_hosts (name, hostname, connection_type, docker_container, enabled)
      VALUES ('docker-gateway', 'gateway-container', 'docker', 'gateway-container', 1)
    `).run();
    db.prepare(`
      INSERT INTO managed_hosts (name, hostname, user, gateway_host_id, connection_type, enabled)
      VALUES ('app', 'app.internal', 'root', ?, 'ssh', 1)
    `).run(gateway.lastInsertRowid);

    const app = findHost(db, 'app');

    assert.equal(app.gatewayHost.name, 'docker-gateway');
    assert.equal(app.gatewayHost.connectionType, 'docker');
    assert.equal(app.gatewayHost.dockerContainer, 'gateway-container');
  } finally {
    db.close();
  }
});

test('findHost keeps disabled gateways available for session transport', () => {
  const db = createMemoryDb();
  try {
    const gateway = db.prepare(`
      INSERT INTO managed_hosts (name, hostname, user, connection_type, enabled)
      VALUES ('jump', 'jump.internal', 'ops', 'ssh', 0)
    `).run();
    db.prepare(`
      INSERT INTO managed_hosts (name, hostname, gateway_host_id, connection_type, docker_container, enabled)
      VALUES ('container', 'app-container', ?, 'docker', 'app-container', 1)
    `).run(gateway.lastInsertRowid);

    const host = findHost(db, 'container');

    assert.equal(host.connectionType, 'docker');
    assert.equal(host.gatewayHost.name, 'jump');
    assert.equal(host.gatewayHost.enabled, false);
  } finally {
    db.close();
  }
});
