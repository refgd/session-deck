import { apiJson, apiOk } from './api-client.js';

export async function loadManagedHosts({ api = apiJson } = {}) {
  const data = await api('/api/managed-hosts');
  return data.hosts || [];
}

export async function loadSshKeys({ api = apiJson } = {}) {
  const data = await api('/api/ssh-keys');
  return data.keys || [];
}

export async function saveSshKey(keyForm, { api = apiJson } = {}) {
  return api('/api/ssh-keys', {
    method: 'POST',
    body: keyForm,
  });
}

export async function deleteSshKey(name, { api = apiJson } = {}) {
  return api(`/api/ssh-keys/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

export async function managedHostCount({ api = apiJson } = {}) {
  const data = await api('/api/managed-hosts/count');
  return Number(data.count) || 0;
}

export async function importSshConfigHosts({ api = apiJson } = {}) {
  return api('/api/managed-hosts/import-ssh-config', { method: 'POST' });
}

export async function createManagedHost(hostForm, { api = apiOk } = {}) {
  await api('/api/managed-hosts', {
    method: 'POST',
    body: hostForm,
  });
}

export async function updateManagedHost(id, hostForm, { api = apiOk } = {}) {
  await api(`/api/managed-hosts/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: hostForm,
  });
}

export async function deleteManagedHost(id, { api = apiJson } = {}) {
  return api(`/api/managed-hosts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function dockerContainersPath(gatewayHostId = '') {
  return gatewayHostId
    ? `/api/docker/containers?gateway_host_id=${encodeURIComponent(gatewayHostId)}`
    : '/api/docker/containers';
}

export async function loadDockerContainers(gatewayHostId = '', { api = apiJson } = {}) {
  const data = await loadDockerContainersResult(gatewayHostId, { api });
  return data.containers;
}

export async function loadDockerContainersResult(gatewayHostId = '', { api = apiJson } = {}) {
  const data = await api(dockerContainersPath(gatewayHostId));
  return {
    containers: data.containers || [],
    context: data.context || null,
  };
}

export async function testManagedHost(id, { api = apiJson } = {}) {
  return api(`/api/managed-hosts/${encodeURIComponent(id)}/test`, { method: 'POST' });
}

export async function installTmuxOnManagedHost(id, { api = apiJson } = {}) {
  return api(`/api/managed-hosts/${encodeURIComponent(id)}/install-tmux`, { method: 'POST' });
}

export async function testAllManagedHosts({ api = apiJson } = {}) {
  return api('/api/managed-hosts/test-all', { method: 'POST' });
}
