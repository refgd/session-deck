import { parseSSHConfig } from './ssh-config.js';

export function mapManagedHost(h) {
  return {
    id: h.id,
    name: h.name,
    hostname: h.hostname,
    user: h.user,
    port: h.port,
    identityFile: h.identity_file,
    authMethod: h.auth_method,
    group: h.group_name,
    isLocal: !!h.is_local,
    connectionType: h.connection_type || (h.auth_method === 'docker' ? 'docker' : 'ssh'),
    dockerContainer: h.docker_container || null,
    gatewayHostId: h.gateway_host_id || null,
    enabled: h.enabled !== 0,
  };
}

export function attachGateway(db, host) {
  if (!host) return host;
  const normalized = host.connectionType ? host : mapManagedHost(host);
  if (!normalized.gatewayHostId) return normalized;
  const gateway = db.prepare('SELECT * FROM managed_hosts WHERE id = ?').get(normalized.gatewayHostId);
  if (!gateway || gateway.id === normalized.id) return normalized;
  return { ...normalized, gatewayHost: mapManagedHost(gateway) };
}

export function getManagedHosts(db, { enabledOnly = true } = {}) {
  const where = enabledOnly ? 'WHERE enabled = 1' : '';
  return db.prepare(
    `SELECT * FROM managed_hosts ${where} ORDER BY sort_order, name`
  ).all().map(h => attachGateway(db, mapManagedHost(h)));
}

export function findHost(db, hostName) {
  const managed = db.prepare(
    'SELECT * FROM managed_hosts WHERE enabled = 1 AND name = ?'
  ).get(hostName);
  if (managed) return attachGateway(db, mapManagedHost(managed));

  const hosts = parseSSHConfig();
  return hosts.find(h => h.name === hostName || h.aliases?.includes(hostName)) || null;
}

export function getSessionHosts(db) {
  const managed = getManagedHosts(db);
  if (managed.length > 0) return managed;
  return parseSSHConfig();
}
