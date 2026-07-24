import { apiJson, apiOk } from './api-client.js';
import { appPath } from './base-path.js';
import { formatSessionHostError } from './session-utils.js';

export async function loadHostSessions(hostName, { fetchRef = fetch } = {}) {
  const res = await fetchRef(appPath(`/api/sessions/${encodeURIComponent(hostName)}`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(formatSessionHostError(hostName, data, res));
  if (data.status && data.status !== 'online') {
    throw new Error(formatSessionHostError(hostName, data));
  }
  return (data.sessions || []).map(session => ({ ...session, host: hostName }));
}

export async function loadSessionHosts({ api = apiJson } = {}) {
  const data = await api('/api/hosts');
  return data.hosts || [];
}

export async function createTmuxSession(host, { name, startDir } = {}, { api = apiOk } = {}) {
  await api(`/api/sessions/${encodeURIComponent(host)}`, {
    method: 'POST',
    body: { name, startDir: startDir || undefined },
  });
}

export async function renameTmuxSession(host, name, newName, { api = apiOk } = {}) {
  await api(`/api/sessions/${encodeURIComponent(host)}/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: { newName },
  });
}

export async function deleteTmuxSession(host, name, { api = apiOk } = {}) {
  await api(`/api/sessions/${encodeURIComponent(host)}/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

export async function runSessionRenderTest(host, session, { api = apiOk } = {}) {
  await api(`/api/sessions/${encodeURIComponent(host)}/${encodeURIComponent(session)}/render-test`, { method: 'POST' });
}

export function sessionCaptureDownloadPath(host, session) {
  return appPath(`/api/sessions/${encodeURIComponent(host)}/${encodeURIComponent(session)}/capture?download=true`);
}
