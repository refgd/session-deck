import {
  MAX_HOST_GROUP_LENGTH,
  MAX_HOST_NAME_LENGTH,
  MAX_HOST_USER_LENGTH,
  MAX_HOSTNAME_LENGTH,
  MAX_IDENTITY_FILE_LENGTH,
  isTooLong,
} from './host-field-limits.js';
import { parseLayoutJson } from './layout-utils.js';
import { normalizeResourceDescription, normalizeResourceName } from './name-description-limits.js';
import { PROCESS_NAME_RE } from './settings-store.js';

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const SSH_AUTH_METHODS = new Set(['key', 'password']);

function normalizePort(value, fallback = 22) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 65535 ? number : null;
}

export function validateColor(color, fallback = '#6b7688') {
  if (color === undefined || color === null || color === '') return fallback;
  if (typeof color !== 'string' || !COLOR_RE.test(color)) {
    throw Object.assign(new Error('color must be a #RRGGBB color'), { statusCode: 400 });
  }
  return color;
}

export function validateLabel(value, fallback) {
  const label = String(value || fallback || '').trim();
  if (!label) throw Object.assign(new Error('display_name is required'), { statusCode: 400 });
  if (label.length > 64) throw Object.assign(new Error('display_name must be 64 characters or fewer'), { statusCode: 400 });
  return label;
}

export function safeJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

export function safeLayoutJson(value) {
  try {
    const parsed = typeof value === 'string'
      ? parseLayoutJson(value)
      : parseLayoutJson(JSON.stringify(value ?? null));
    return JSON.stringify(parsed);
  } catch (err) {
    if (err?.statusCode) throw err;
    throw Object.assign(new Error('layout_json must be a JSON object'), { statusCode: 400 });
  }
}

export function normalizeImportedManagedHost(host, seenNames = new Set()) {
  if (!host || typeof host !== 'object') return null;

  const name = String(host.name || '').trim();
  const connectionType = host.connection_type === 'docker' ? 'docker' : 'ssh';
  const dockerContainer = connectionType === 'docker'
    ? String(host.docker_container || host.hostname || '').trim()
    : null;
  const hostname = connectionType === 'docker'
    ? dockerContainer
    : String(host.hostname || '').trim();

  if (!name || !hostname || seenNames.has(name)) return null;
  if (isTooLong(name, MAX_HOST_NAME_LENGTH) || isTooLong(hostname, MAX_HOSTNAME_LENGTH)) return null;
  const authMethod = connectionType === 'docker'
    ? 'docker'
    : String(host.auth_method || 'key').trim();
  if (connectionType === 'ssh' && !SSH_AUTH_METHODS.has(authMethod)) return null;
  const port = connectionType === 'docker' ? 0 : normalizePort(host.port);
  if (port === null) return null;
  const user = connectionType === 'docker' ? null : (host.user ? String(host.user).trim() : null);
  const identityFile = connectionType === 'docker' ? null : (host.identity_file ? String(host.identity_file).trim() : null);
  const groupName = String(host.group_name || (connectionType === 'docker' ? 'Docker' : 'Other')).trim();
  const gatewayHostName = String(host.gateway_host_name || '').trim();
  if (
    isTooLong(user, MAX_HOST_USER_LENGTH) ||
    isTooLong(identityFile, MAX_IDENTITY_FILE_LENGTH) ||
    isTooLong(groupName, MAX_HOST_GROUP_LENGTH) ||
    isTooLong(gatewayHostName, MAX_HOST_NAME_LENGTH)
  ) return null;
  seenNames.add(name);

  return {
    name,
    hostname,
    user,
    port,
    identity_file: identityFile,
    auth_method: authMethod,
    group_name: groupName,
    is_local: connectionType === 'docker' ? 0 : (host.is_local ? 1 : 0),
    connection_type: connectionType,
    docker_container: dockerContainer,
    enabled: host.enabled === false ? 0 : 1,
    sort_order: Number.isFinite(Number(host.sort_order)) ? Number(host.sort_order) : 0,
    gateway_host_name: gatewayHostName,
  };
}

export function normalizeImportedSessionType(type) {
  const processName = String(type?.process_name || '').trim();
  if (!PROCESS_NAME_RE.test(processName)) return null;

  return {
    process_name: processName,
    display_name: validateLabel(type.display_name, processName),
    color: validateColor(type.color),
    sort_order: Number.isFinite(Number(type.sort_order)) ? Number(type.sort_order) : 100,
  };
}

export function normalizeImportedWorkspaceTemplate(template) {
  const normalizedName = normalizeResourceName(template?.name, { required: true });
  if (normalizedName.error) return null;
  const normalizedDescription = normalizeResourceDescription(template?.description, { defaultValue: null });
  if (normalizedDescription.error) return null;

  return {
    name: normalizedName.value,
    description: normalizedDescription.value,
    layout_json: safeLayoutJson(template.layout_json ?? template.layout),
    pane_count: Number.isFinite(Number(template.pane_count)) ? Number(template.pane_count) : 1,
    sort_order: Number.isFinite(Number(template.sort_order)) ? Number(template.sort_order) : 0,
  };
}
