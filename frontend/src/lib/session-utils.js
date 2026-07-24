import { DEFAULT_HOST } from './constants.js';

export function formatSessionHostError(hostName, data = {}, res = null) {
  const parts = [];
  const primary = data.message && data.message !== data.error ? data.message : data.error;
  if (primary && primary !== 'Internal Server Error') parts.push(primary);
  if (data.status && data.status !== 'online') parts.push(`status: ${data.status}`);
  if (data.code) parts.push(`code: ${data.code}`);
  if (data.exitCode !== undefined) parts.push(`exit: ${data.exitCode}`);
  if (data.signal) parts.push(`signal: ${data.signal}`);
  if (data.syscall) parts.push(`syscall: ${data.syscall}`);
  if (data.path) parts.push(`path: ${data.path}`);
  if (data.stderr) parts.push(`stderr: ${singleLine(data.stderr)}`);
  if (data.command) parts.push(`command: ${singleLine(data.command)}`);
  if (data.host && data.host !== hostName) parts.push(`host: ${data.host}`);
  if (res && !res.ok) parts.push(`HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`);
  if (parts.length === 0 && primary) parts.push(primary);
  return parts.length > 0 ? parts.join(' | ') : 'Connection failed';
}

function singleLine(value, maxLength = 300) {
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

export function groupManagedHosts(hosts = []) {
  const grouped = {};
  for (const host of hosts) {
    const groupName = host.group_name || 'Other';
    if (!grouped[groupName]) grouped[groupName] = [];
    grouped[groupName].push(host);
  }
  return Object.entries(grouped).sort(([a], [b]) => {
    if (a === 'Local') return -1;
    if (b === 'Local') return 1;
    return a.localeCompare(b);
  });
}

export function sessionCapableHosts(hosts = []) {
  return hosts.filter(host => host.enabled && host.group_name !== 'Network' && host.group_name !== 'Client');
}

export function findManagedHostForSessionHost(hostName, hosts = [], defaultHost = DEFAULT_HOST) {
  const name = String(hostName || '').trim();
  if (!name) return null;
  const exact = hosts.find(host => host.name === name);
  if (exact) return exact;
  if (name === defaultHost) {
    return hosts.find(host => host.is_local || host.isLocal) || null;
  }
  return null;
}

export function groupSessionsByHost({
  sessions = [],
  errors = {},
  hostFilter = null,
  defaultHost = DEFAULT_HOST,
} = {}) {
  const filtered = hostFilter
    ? sessions.filter(session => (session.host || defaultHost) === hostFilter)
    : sessions;
  const grouped = {};
  for (const session of filtered) {
    const hostName = session.host || defaultHost;
    if (!grouped[hostName]) grouped[hostName] = [];
    grouped[hostName].push(session);
  }
  for (const hostName of Object.keys(errors)) {
    if (hostFilter && hostFilter !== hostName) continue;
    if (!grouped[hostName]) grouped[hostName] = [];
  }
  return Object.entries(grouped).sort(([a], [b]) => {
    if (a === defaultHost) return -1;
    if (b === defaultHost) return 1;
    return a.localeCompare(b);
  }).map(([hostName, hostSessions]) => ({
    hostName,
    hostSessions,
    error: errors[hostName],
  }));
}

export function connectionErrorMessage(error, fallback = 'Connection failed') {
  return error?.message || fallback;
}

export function setHostError(errors = {}, hostName, error) {
  return {
    ...errors,
    [hostName]: connectionErrorMessage(error),
  };
}

export function clearHostError(errors = {}, hostName) {
  const { [hostName]: _removed, ...rest } = errors;
  return rest;
}

export function hostLoadingState(loading = {}, hostName, value) {
  return { ...loading, [hostName]: !!value };
}

export function removeHostSessions(sessions = [], hostName, defaultHost = DEFAULT_HOST) {
  return sessions.filter(session => (session.host || defaultHost) !== hostName);
}

export function replaceHostSessions(sessions = [], hostName, nextSessions = [], defaultHost = DEFAULT_HOST) {
  return [
    ...removeHostSessions(sessions, hostName, defaultHost),
    ...nextSessions,
  ];
}

export function hasVisibleHostErrors(errors = {}, hostFilter = null) {
  return Object.keys(errors)
    .some(hostName => !hostFilter || hostFilter === hostName);
}

export function sessionCreateDraft({ name = '', host = DEFAULT_HOST, startDir = '' } = {}) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) return null;
  return {
    name: trimmedName,
    host: host || DEFAULT_HOST,
    startDir: String(startDir || '').trim(),
  };
}

export function sessionRenameDraft(renameSession = null, nextName = '') {
  const trimmedName = String(nextName || '').trim();
  if (!renameSession || !trimmedName) return null;
  return {
    host: renameSession.host || DEFAULT_HOST,
    oldName: renameSession.name,
    newName: trimmedName,
  };
}

export function createdSessionMessage({ name, host }, opened = false) {
  return opened
    ? `Created and opened session "${name}" on ${host}`
    : `Created session "${name}" on ${host}`;
}

export function renamedSessionMessage({ oldName, newName, host }) {
  return `Renamed "${oldName}" to "${newName}" on ${host}`;
}

export function deletedSessionMessage({ name, host }) {
  return `Deleted session "${name}" on ${host}`;
}
