import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countManagedHosts,
  gatewayExists,
  getManagedHostRow,
  groupManagedHostRows,
  hostNameExists,
  importSshConfigHosts,
  insertManagedHost,
  listEnabledManagedHostRows,
  listHostsUsingIdentityFile,
  listIdentityFileUsageRows,
  listManagedHostRows,
  updateManagedHost,
  updateManagedHostTestResult,
  wouldCreateGatewayCycle,
} from '../src/lib/managed-host-store.js';
import { createMemoryDb } from '../test-support/db.js';

test('managed host store lists rows in UI order and groups by group_name', () => {
  const db = createMemoryDb();
  try {
    insertRaw(db, { name: 'zeta', hostname: 'zeta.local', group_name: 'VPS', sort_order: 2 });
    insertRaw(db, { name: 'alpha', hostname: 'alpha.local', group_name: '', sort_order: 1 });

    const rows = listManagedHostRows(db);
    assert.deepEqual(rows.map(row => row.name), ['alpha', 'zeta']);
    assert.deepEqual(Object.keys(groupManagedHostRows(rows)).sort(), ['Other', 'VPS']);
  } finally {
    db.close();
  }
});

test('managed host store checks gateway and duplicate names', () => {
  const db = createMemoryDb();
  try {
    const first = insertRaw(db, { name: 'gateway', hostname: '10.0.0.1' });
    const second = insertRaw(db, { name: 'target', hostname: '10.0.0.2' });

    assert.equal(gatewayExists(db, first.lastInsertRowid), true);
    assert.equal(gatewayExists(db, 999), false);
    assert.equal(hostNameExists(db, 'target'), true);
    assert.equal(hostNameExists(db, 'target', second.lastInsertRowid), false);
    assert.equal(hostNameExists(db, 'target', first.lastInsertRowid), true);
  } finally {
    db.close();
  }
});

test('managed host store detects indirect gateway cycles before update', () => {
  const db = createMemoryDb();
  try {
    const first = insertRaw(db, { name: 'first', hostname: '10.0.0.1' });
    const second = insertRaw(db, {
      name: 'second',
      hostname: '10.0.0.2',
      gateway_host_id: first.lastInsertRowid,
    });
    const third = insertRaw(db, {
      name: 'third',
      hostname: '10.0.0.3',
      gateway_host_id: second.lastInsertRowid,
    });

    assert.equal(wouldCreateGatewayCycle(db, first.lastInsertRowid, third.lastInsertRowid), true);
    assert.equal(wouldCreateGatewayCycle(db, third.lastInsertRowid, first.lastInsertRowid), false);
  } finally {
    db.close();
  }
});

test('managed host store counts hosts and reports SSH key usage', () => {
  const db = createMemoryDb();
  try {
    insertRaw(db, { name: 'b-host', hostname: 'b.local', identity_file: '/keys/shared' });
    insertRaw(db, { name: 'a-host', hostname: 'a.local', identity_file: '/keys/shared' });
    insertRaw(db, { name: 'no-key', hostname: 'no-key.local', identity_file: null });

    assert.equal(countManagedHosts(db), 3);
    assert.deepEqual(listHostsUsingIdentityFile(db, '/keys/shared').map(host => host.name), ['a-host', 'b-host']);
    assert.deepEqual(listIdentityFileUsageRows(db).map(host => host.name), ['a-host', 'b-host']);
  } finally {
    db.close();
  }
});

test('managed host store inserts hosts with the next sort order and updates rows', () => {
  const db = createMemoryDb();
  try {
    insertRaw(db, { name: 'existing', hostname: 'existing.local', sort_order: 4 });

    const created = insertManagedHost(db, hostInput({ name: 'new-host', hostname: 'new.local' }));
    assert.equal(created.sort_order, 5);
    assert.equal(created.connection_type, 'ssh');

    const updated = updateManagedHost(db, created.id, hostInput({
      name: 'new-host',
      hostname: 'new.example',
      enabled: 0,
    }));

    assert.equal(updated.hostname, 'new.example');
    assert.equal(updated.enabled, 0);
    assert.ok(updated.updated_at);
  } finally {
    db.close();
  }
});

test('managed host store lists only enabled hosts and writes test results', () => {
  const db = createMemoryDb();
  try {
    const enabled = insertRaw(db, { name: 'enabled', hostname: 'enabled.local', enabled: 1 });
    insertRaw(db, { name: 'disabled', hostname: 'disabled.local', enabled: 0 });

    assert.deepEqual(listEnabledManagedHostRows(db).map(host => host.name), ['enabled']);

    updateManagedHostTestResult(db, enabled.lastInsertRowid, {
      status: 'ok',
      tmuxAvailable: true,
      tmuxVersion: 'tmux 3.4',
      os: 'Debian GNU/Linux',
      osId: 'debian',
      installCommand: null,
      durationMs: 42,
      steps: [
        { name: 'ssh', status: 'ok', detail: 'root@example', durationMs: 12 },
        { name: 'tmux', status: 'ok', detail: 'tmux 3.4', durationMs: 8 },
      ],
    });

    const row = getManagedHostRow(db, enabled.lastInsertRowid);
    assert.equal(row.last_test_status, 'ok');
    assert.equal(row.tmux_available, 1);
    assert.equal(row.last_test_tmux_version, 'tmux 3.4');
    assert.equal(row.last_test_os, 'Debian GNU/Linux');
    assert.equal(row.last_test_os_id, 'debian');
    assert.equal(row.last_test_duration_ms, 42);
    assert.deepEqual(JSON.parse(row.last_test_steps_json), [
      { name: 'ssh', status: 'ok', detail: 'root@example', durationMs: 12 },
      { name: 'tmux', status: 'ok', detail: 'tmux 3.4', durationMs: 8 },
    ]);
    assert.ok(row.last_test_at);
  } finally {
    db.close();
  }
});

test('managed host store imports SSH config hosts and skips duplicates', () => {
  const db = createMemoryDb();
  try {
    insertRaw(db, { name: 'existing', hostname: 'existing.local', sort_order: 7 });

    const result = importSshConfigHosts(db, [
      { name: 'existing', hostname: 'from-config.local', user: 'ops', group: 'VPS' },
      { name: 'new-one', hostname: 'new.local', user: 'root', identityFile: '/keys/new', group: 'NAS' },
      { name: 'implicit-hostname', isLocal: true },
    ]);

    assert.deepEqual(result, { imported: 2, skipped: 1, total: 3 });

    const rows = listManagedHostRows(db);
    assert.deepEqual(rows.map(row => row.name), ['existing', 'new-one', 'implicit-hostname']);
    assert.equal(rows[1].sort_order, 8);
    assert.equal(rows[1].identity_file, '/keys/new');
    assert.equal(rows[1].group_name, 'NAS');
    assert.equal(rows[2].hostname, 'implicit-hostname');
    assert.equal(rows[2].group_name, 'Other');
    assert.equal(rows[2].is_local, 1);
  } finally {
    db.close();
  }
});

test('managed host store treats duplicate names within the same SSH import as skipped', () => {
  const db = createMemoryDb();
  try {
    const result = importSshConfigHosts(db, [
      { name: 'dup', hostname: 'first.local' },
      { name: 'dup', hostname: 'second.local' },
      null,
    ]);

    assert.deepEqual(result, { imported: 1, skipped: 2, total: 1 });
    assert.equal(listManagedHostRows(db).length, 1);
    assert.equal(getManagedHostRow(db, 1).hostname, 'first.local');
  } finally {
    db.close();
  }
});

function hostInput(overrides = {}) {
  return {
    name: 'host',
    hostname: 'host.local',
    user: 'root',
    port: 22,
    identity_file: null,
    auth_method: 'key',
    group_name: 'Other',
    is_local: 0,
    connection_type: 'ssh',
    docker_container: null,
    gateway_host_id: null,
    enabled: 1,
    ...overrides,
  };
}

function insertRaw(db, overrides = {}) {
  const input = hostInput(overrides);
  return db.prepare(`
    INSERT INTO managed_hosts (name, hostname, user, port, identity_file, auth_method, group_name, is_local, connection_type, docker_container, gateway_host_id, enabled, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.name,
    input.hostname,
    input.user,
    input.port,
    input.identity_file,
    input.auth_method,
    input.group_name,
    input.is_local,
    input.connection_type,
    input.docker_container,
    input.gateway_host_id,
    input.enabled,
    input.sort_order ?? 0,
  );
}
