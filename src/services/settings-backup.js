import { appSettingValidators } from '../lib/app-setting-validation.js';
import {
  normalizeImportedManagedHost,
  normalizeImportedSessionType,
  normalizeImportedWorkspaceTemplate,
  validateColor,
  validateLabel,
} from '../lib/settings-import-utils.js';
import { findGatewayCycle } from '../lib/managed-host-store.js';
import { redactPath } from '../lib/path-redaction.js';

export const SETTINGS_EXPORT_VERSION = 1;
export const MAX_IMPORT_APP_SETTINGS = 50;
export const MAX_IMPORT_MANAGED_HOSTS = 500;
export const MAX_IMPORT_SESSION_TYPES = 200;
export const MAX_IMPORT_WORKSPACE_TEMPLATES = 100;

export { validateColor, validateLabel };

export function exportManagedHosts(db, options = {}) {
  const includeSensitivePaths = options.includeSensitivePaths === true;
  return db.prepare(`
    SELECT h.name, h.hostname, h.user, h.port, h.identity_file, h.auth_method,
           h.group_name, h.is_local, h.connection_type, h.docker_container,
           h.enabled, h.sort_order, g.name as gateway_host_name
    FROM managed_hosts h
    LEFT JOIN managed_hosts g ON g.id = h.gateway_host_id
    ORDER BY h.sort_order, h.name
  `).all().map(host => ({
    name: host.name,
    hostname: host.hostname,
    user: host.user,
    port: host.port,
    identity_file: includeSensitivePaths ? host.identity_file : null,
    identity_file_hint: host.identity_file ? redactPath(host.identity_file) : null,
    auth_method: host.auth_method,
    group_name: host.group_name,
    is_local: !!host.is_local,
    connection_type: host.connection_type,
    docker_container: host.docker_container,
    gateway_host_name: host.gateway_host_name,
    enabled: !!host.enabled,
    sort_order: host.sort_order,
  }));
}

export function exportSshKeyMetadata(listSshKeys, options = {}) {
  const includeSensitivePaths = options.includeSensitivePaths === true;
  return listSshKeys().map(key => ({
    name: key.name,
    path: includeSensitivePaths ? key.path : null,
    displayPath: redactPath(key.path),
    managed: !!key.managed,
    privateKeyIncluded: false,
  }));
}

export function exportAppSettings(db) {
  const rows = db.prepare('SELECT key, value FROM app_settings ORDER BY key').all();
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

export function createSettingsExport(db, options = {}) {
  const listSshKeys = options.listSshKeys || (() => []);
  const includeSensitivePaths = options.includeSensitivePaths === true;
  return {
    version: SETTINGS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    sensitivePathsIncluded: includeSensitivePaths,
    appSettings: exportAppSettings(db),
    managedHosts: exportManagedHosts(db, { includeSensitivePaths }),
    sshKeys: exportSshKeyMetadata(listSshKeys, { includeSensitivePaths }),
    sessionTypes: db.prepare('SELECT process_name, display_name, color, sort_order FROM session_types ORDER BY sort_order, process_name').all(),
    workspaceTemplates: db.prepare('SELECT name, description, layout_json, pane_count, sort_order FROM workspace_templates ORDER BY sort_order, name').all(),
  };
}

function upsertManagedHosts(db, hosts) {
  if (!Array.isArray(hosts)) return 0;
  const names = new Set();
  const insert = db.prepare(`
    INSERT INTO managed_hosts (name, hostname, user, port, identity_file, auth_method, group_name, is_local, connection_type, docker_container, enabled, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      hostname = excluded.hostname,
      user = excluded.user,
      port = excluded.port,
      identity_file = excluded.identity_file,
      auth_method = excluded.auth_method,
      group_name = excluded.group_name,
      is_local = excluded.is_local,
      connection_type = excluded.connection_type,
      docker_container = excluded.docker_container,
      enabled = excluded.enabled,
      sort_order = excluded.sort_order,
      updated_at = datetime('now')
  `);
  for (const host of hosts) {
    const normalized = normalizeImportedManagedHost(host, names);
    if (!normalized) continue;
    insert.run(
      normalized.name,
      normalized.hostname,
      normalized.user,
      normalized.port,
      normalized.identity_file,
      normalized.auth_method,
      normalized.group_name,
      normalized.is_local,
      normalized.connection_type,
      normalized.docker_container,
      normalized.enabled,
      normalized.sort_order
    );
  }

  const updateGateway = db.prepare('UPDATE managed_hosts SET gateway_host_id = ?, updated_at = datetime(\'now\') WHERE name = ?');
  const findHostId = db.prepare('SELECT id FROM managed_hosts WHERE name = ?');
  for (const host of hosts) {
    const name = String(host?.name || '').trim();
    const gatewayName = String(host?.gateway_host_name || '').trim();
    if (!name || !gatewayName || name === gatewayName) continue;
    const gateway = findHostId.get(gatewayName);
    if (gateway) updateGateway.run(gateway.id, name);
  }
  const cycle = findGatewayCycle(db);
  if (cycle) {
    throw Object.assign(
      new Error(`Gateway chain cannot contain a cycle: ${cycle.join(' -> ')}`),
      { statusCode: 400 }
    );
  }
  return names.size;
}

function upsertSessionTypes(db, types) {
  if (!Array.isArray(types)) return 0;
  const upsert = db.prepare(`
    INSERT INTO session_types (process_name, display_name, color, sort_order)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(process_name) DO UPDATE SET
      display_name = excluded.display_name,
      color = excluded.color,
      sort_order = excluded.sort_order
  `);
  let count = 0;
  for (const type of types) {
    const normalized = normalizeImportedSessionType(type);
    if (!normalized) continue;
    upsert.run(
      normalized.process_name,
      normalized.display_name,
      normalized.color,
      normalized.sort_order
    );
    count++;
  }
  return count;
}

function upsertWorkspaceTemplates(db, templates) {
  if (!Array.isArray(templates)) return 0;
  const upsert = db.prepare(`
    INSERT INTO workspace_templates (name, description, layout_json, pane_count, sort_order)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      description = excluded.description,
      layout_json = excluded.layout_json,
      pane_count = excluded.pane_count,
      sort_order = excluded.sort_order
  `);
  let count = 0;
  for (const template of templates) {
    const normalized = normalizeImportedWorkspaceTemplate(template);
    if (!normalized) continue;
    upsert.run(
      normalized.name,
      normalized.description,
      normalized.layout_json,
      normalized.pane_count,
      normalized.sort_order
    );
    count++;
  }
  return count;
}

export function importSettingsExport(db, payload) {
  if (payload?.version !== SETTINGS_EXPORT_VERSION) {
    throw Object.assign(
      new Error(`Unsupported export version: ${payload?.version ?? 'missing'}`),
      { statusCode: 400 }
    );
  }
  assertImportBounds(payload);

  const imported = db.transaction(() => {
    let settings = 0;
    for (const [key, value] of Object.entries(payload.appSettings || {})) {
      const validate = appSettingValidators[key];
      if (!validate) continue;
      const nextValue = validate(value);
      db.prepare(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')"
      ).run(key, nextValue, nextValue);
      settings++;
    }

    return {
      settings,
      managedHosts: upsertManagedHosts(db, payload.managedHosts),
      sessionTypes: upsertSessionTypes(db, payload.sessionTypes),
      workspaceTemplates: upsertWorkspaceTemplates(db, payload.workspaceTemplates),
    };
  })();

  return {
    imported,
    sshKeysImported: 0,
    note: 'SSH private keys are not included in exports and must be managed separately.',
  };
}

function assertImportBounds(payload) {
  assertObjectEntryLimit(payload.appSettings, 'appSettings', MAX_IMPORT_APP_SETTINGS);
  assertArrayLimit(payload.managedHosts, 'managedHosts', MAX_IMPORT_MANAGED_HOSTS);
  assertArrayLimit(payload.sessionTypes, 'sessionTypes', MAX_IMPORT_SESSION_TYPES);
  assertArrayLimit(payload.workspaceTemplates, 'workspaceTemplates', MAX_IMPORT_WORKSPACE_TEMPLATES);
}

function assertArrayLimit(value, name, limit) {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    throw Object.assign(new Error(`${name} must be an array`), { statusCode: 400 });
  }
  if (value.length > limit) {
    throw Object.assign(new Error(`${name} must contain ${limit} items or fewer`), { statusCode: 400 });
  }
}

function assertObjectEntryLimit(value, name, limit) {
  if (value === undefined || value === null) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error(`${name} must be an object`), { statusCode: 400 });
  }
  if (Object.keys(value).length > limit) {
    throw Object.assign(new Error(`${name} must contain ${limit} entries or fewer`), { statusCode: 400 });
  }
}
