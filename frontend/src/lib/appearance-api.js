import { apiJson, apiOk } from './api-client.js';

export function sessionTypeMapFromList(types = []) {
  const map = {};
  for (const type of types || []) {
    map[type.process_name] = {
      display_name: type.display_name,
      color: type.color,
    };
  }
  return map;
}

export async function loadSessionTypes({ api = apiJson } = {}) {
  const data = await api('/api/session-types');
  const types = data.types || [];
  return {
    types,
    map: sessionTypeMapFromList(types),
  };
}

export async function loadAppSettings({ api = apiJson } = {}) {
  return api('/api/settings');
}

export async function saveAccentColorSetting(color, { api = apiOk } = {}) {
  await api('/api/settings/accent_color', {
    method: 'PUT',
    body: { value: color },
  });
}

export async function saveMobileReadOnlyDefaultSetting(enabled, { api = apiOk } = {}) {
  await api('/api/settings/mobile_read_only_default', {
    method: 'PUT',
    body: { value: enabled ? 'true' : 'false' },
  });
}

export async function scanSessionTypes({ api = apiJson } = {}) {
  return api('/api/session-types/scan', { method: 'POST' });
}

export async function updateSessionType(id, { displayName, color }, { api = apiOk } = {}) {
  await api(`/api/session-types/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: {
      display_name: displayName,
      color,
    },
  });
}
