import {
  MAX_HOST_GROUP_LENGTH,
  MAX_HOST_NAME_LENGTH,
  MAX_HOST_USER_LENGTH,
  MAX_HOSTNAME_LENGTH,
  MAX_IDENTITY_FILE_LENGTH,
  isTooLong,
} from './host-field-limits.js';

function trimValue(value) {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function connectionType(value, fallback = 'ssh') {
  if (value === undefined || value === null || value === '') return fallback === 'docker' ? 'docker' : 'ssh';
  return value === 'docker' ? 'docker' : 'ssh';
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : NaN;
}

function portValue(value, fallback = 22) {
  if (value === undefined || value === null || value === '') return fallback || 22;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 65535 ? number : NaN;
}

function authMethod(value, fallback = 'key') {
  const method = trimValue(value) ?? fallback ?? 'key';
  return ['key', 'password'].includes(method) ? method : null;
}

export function normalizeHostPayload(payload = {}, existing = null) {
  const type = connectionType(payload.connection_type, existing?.connection_type || 'ssh');
  const isDocker = type === 'docker';
  const name = trimValue(payload.name) ?? existing?.name ?? null;
  const containerName = isDocker
    ? (trimValue(payload.docker_container) ?? existing?.docker_container ?? null)
    : null;
  const hostname = isDocker
    ? containerName
    : (trimValue(payload.hostname) ?? existing?.hostname ?? null);

  if (!name || !hostname) {
    return { error: 'Name and hostname are required' };
  }
  if (isTooLong(name, MAX_HOST_NAME_LENGTH)) return { error: 'Host name is too long' };
  if (isTooLong(hostname, MAX_HOSTNAME_LENGTH)) return { error: 'Hostname is too long' };

  const gatewayFallback = existing ? (existing.gateway_host_id || null) : null;
  const gatewayHostId = Object.hasOwn(payload, 'gateway_host_id')
    ? numberOrNull(payload.gateway_host_id)
    : gatewayFallback;
  if (Number.isNaN(gatewayHostId)) return { error: 'Invalid gateway host' };

  const port = isDocker ? 0 : portValue(payload.port, existing?.port || 22);
  if (Number.isNaN(port)) return { error: 'Invalid port' };
  const method = isDocker ? 'docker' : authMethod(payload.auth_method, existing?.auth_method || 'key');
  if (!method) return { error: 'Invalid auth method' };

  const groupName = trimValue(payload.group_name) ?? existing?.group_name ?? (isDocker ? 'Docker' : 'Other');
  const user = isDocker ? null : (trimValue(payload.user) ?? existing?.user ?? null);
  const identityFile = isDocker ? null : (trimValue(payload.identity_file) ?? existing?.identity_file ?? null);
  if (isTooLong(user, MAX_HOST_USER_LENGTH)) return { error: 'Username is too long' };
  if (isTooLong(identityFile, MAX_IDENTITY_FILE_LENGTH)) return { error: 'Identity file path is too long' };
  if (isTooLong(groupName, MAX_HOST_GROUP_LENGTH)) return { error: 'Group name is too long' };

  return {
    value: {
      name,
      hostname,
      user,
      port,
      identity_file: identityFile,
      auth_method: method,
      group_name: groupName,
      is_local: isDocker ? 0 : (Object.hasOwn(payload, 'is_local') ? (payload.is_local ? 1 : 0) : (existing?.is_local ?? 0)),
      connection_type: type,
      docker_container: containerName,
      gateway_host_id: gatewayHostId,
      enabled: Object.hasOwn(payload, 'enabled') ? (payload.enabled ? 1 : 0) : (existing?.enabled ?? 1),
    },
  };
}
