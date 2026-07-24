export function getManagedHostRow(db, id) {
  return db.prepare('SELECT * FROM managed_hosts WHERE id = ?').get(id);
}

export function getEnabledManagedHostRow(db, id) {
  return db.prepare('SELECT * FROM managed_hosts WHERE enabled = 1 AND id = ?').get(id);
}

export function listManagedHostRows(db) {
  return db.prepare('SELECT * FROM managed_hosts ORDER BY sort_order, name').all();
}

export function listEnabledManagedHostRows(db) {
  return db.prepare('SELECT * FROM managed_hosts WHERE enabled = 1').all();
}

export function listManagedHostNames(db) {
  return db.prepare('SELECT name FROM managed_hosts').all().map(host => host.name);
}

export function countManagedHosts(db) {
  const result = db.prepare('SELECT COUNT(*) as count FROM managed_hosts').get();
  return result.count;
}

export function listHostsUsingIdentityFile(db, path) {
  return db.prepare('SELECT id, name FROM managed_hosts WHERE identity_file = ? ORDER BY name').all(path);
}

export function listIdentityFileUsageRows(db) {
  return db.prepare('SELECT id, name, identity_file FROM managed_hosts WHERE identity_file IS NOT NULL ORDER BY name').all();
}

export function groupManagedHostRows(hosts) {
  const groups = {};
  for (const host of hosts) {
    const group = host.group_name || 'Other';
    if (!groups[group]) groups[group] = [];
    groups[group].push(host);
  }
  return groups;
}

export function gatewayExists(db, id) {
  return !!db.prepare('SELECT id FROM managed_hosts WHERE id = ?').get(id);
}

export function wouldCreateGatewayCycle(db, hostId, gatewayHostId) {
  const targetId = Number(hostId);
  let currentId = Number(gatewayHostId);
  if (!Number.isFinite(targetId) || !Number.isFinite(currentId) || !currentId) return false;

  const seen = new Set();
  const findGateway = db.prepare('SELECT id, gateway_host_id FROM managed_hosts WHERE id = ?');
  while (currentId) {
    if (currentId === targetId) return true;
    if (seen.has(currentId)) return true;
    seen.add(currentId);

    const row = findGateway.get(currentId);
    if (!row) return false;
    currentId = Number(row.gateway_host_id || 0);
  }
  return false;
}

export function findGatewayCycle(db) {
  const rows = db.prepare('SELECT id, name, gateway_host_id FROM managed_hosts').all();
  const byId = new Map(rows.map(row => [row.id, row]));

  for (const row of rows) {
    const path = [];
    const pathIndex = new Map();
    let current = row;

    while (current?.gateway_host_id) {
      if (pathIndex.has(current.id)) {
        const start = pathIndex.get(current.id);
        return path.slice(start).map(item => item.name);
      }
      pathIndex.set(current.id, path.length);
      path.push(current);
      current = byId.get(current.gateway_host_id);
    }
  }
  return null;
}

export function hostNameExists(db, name, exceptId = null) {
  const row = exceptId
    ? db.prepare('SELECT id FROM managed_hosts WHERE name = ? AND id != ?').get(name, exceptId)
    : db.prepare('SELECT id FROM managed_hosts WHERE name = ?').get(name);
  return !!row;
}

export function nextHostSortOrder(db) {
  const maxSort = db.prepare('SELECT MAX(sort_order) as value FROM managed_hosts').get();
  return (maxSort?.value ?? -1) + 1;
}

export function insertManagedHost(db, hostInput) {
  const result = db.prepare(`
    INSERT INTO managed_hosts (name, hostname, user, port, identity_file, auth_method, group_name, is_local, connection_type, docker_container, gateway_host_id, enabled, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    hostInput.name,
    hostInput.hostname,
    hostInput.user,
    hostInput.port,
    hostInput.identity_file,
    hostInput.auth_method,
    hostInput.group_name,
    hostInput.is_local,
    hostInput.connection_type,
    hostInput.docker_container,
    hostInput.gateway_host_id,
    hostInput.enabled,
    nextHostSortOrder(db),
  );
  return getManagedHostRow(db, result.lastInsertRowid);
}

export function updateManagedHost(db, id, hostInput) {
  db.prepare(`
    UPDATE managed_hosts SET
      name = ?, hostname = ?, user = ?, port = ?, identity_file = ?,
      auth_method = ?, group_name = ?, is_local = ?, connection_type = ?, docker_container = ?, gateway_host_id = ?, enabled = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    hostInput.name,
    hostInput.hostname,
    hostInput.user,
    hostInput.port,
    hostInput.identity_file,
    hostInput.auth_method,
    hostInput.group_name,
    hostInput.is_local,
    hostInput.connection_type,
    hostInput.docker_container,
    hostInput.gateway_host_id,
    hostInput.enabled,
    id,
  );
  return getManagedHostRow(db, id);
}

export function deleteManagedHost(db, id) {
  const existing = getManagedHostRow(db, id);
  if (!existing) return null;
  db.prepare('DELETE FROM managed_hosts WHERE id = ?').run(existing.id);
  return existing;
}

export function updateManagedHostTestResult(db, id, result) {
  const steps = Array.isArray(result.steps) ? JSON.stringify(result.steps) : null;
  db.prepare(`
    UPDATE managed_hosts SET
      last_test_status = ?, last_test_at = datetime('now'), tmux_available = ?,
      last_test_error = ?, last_test_steps_json = ?, last_test_os = ?,
      last_test_os_id = ?, last_test_tmux_version = ?, last_test_install_command = ?,
      last_test_duration_ms = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    result.status,
    result.tmuxAvailable ? 1 : 0,
    result.error || null,
    steps,
    result.os || null,
    result.osId || null,
    result.tmuxVersion || null,
    result.installCommand || null,
    Number.isFinite(result.durationMs) ? result.durationMs : null,
    id,
  );
}

export function importSshConfigHosts(db, sshHosts) {
  const existingNames = listManagedHostNames(db);
  const existingSet = new Set(existingNames);

  const insert = db.prepare(`
    INSERT INTO managed_hosts (name, hostname, user, identity_file, auth_method, group_name, is_local, enabled, sort_order)
    VALUES (?, ?, ?, ?, 'key', ?, ?, 1, ?)
  `);

  let imported = 0;
  let skipped = 0;
  const importTransaction = db.transaction(() => {
    let nextSort = nextHostSortOrder(db);

    for (const host of sshHosts || []) {
      if (!host?.name || existingSet.has(host.name)) {
        skipped++;
        continue;
      }
      insert.run(
        host.name,
        host.hostname || host.name,
        host.user || null,
        host.identityFile || null,
        host.group || 'Other',
        host.isLocal ? 1 : 0,
        nextSort++,
      );
      existingSet.add(host.name);
      imported++;
    }
  });

  importTransaction();

  return { imported, skipped, total: existingNames.length + imported };
}
