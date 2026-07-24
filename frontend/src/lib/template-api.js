import { apiJson, apiOk } from './api-client.js';

export async function loadWorkspaceTemplates({ api = apiJson } = {}) {
  const data = await api('/api/templates');
  return data.templates || [];
}

export async function createWorkspaceTemplate({ name, layout }, { api = apiOk } = {}) {
  await api('/api/templates', {
    method: 'POST',
    body: { name, layout },
  });
}

export async function deleteWorkspaceTemplate(id, { api = apiOk } = {}) {
  await api(`/api/templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
