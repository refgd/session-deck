import { apiJson, apiOk } from './api-client.js';
import { downloadJson } from './browser-download-utils.js';

export function settingsExportFilename(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `session-deck-config-${stamp}.json`;
}

export async function exportSettingsSnapshot({
  api = apiJson,
  download = downloadJson,
  date = new Date(),
  includeSensitivePaths = false,
} = {}) {
  const path = includeSensitivePaths
    ? '/api/settings/export?include_sensitive_paths=true'
    : '/api/settings/export';
  const data = await api(path);
  download(data, settingsExportFilename(date));

  return data;
}

export async function importSettingsSnapshot(file, { api = apiOk } = {}) {
  const payload = JSON.parse(await file.text());
  await api('/api/settings/import', {
    method: 'POST',
    body: payload,
  });
  return payload;
}

export async function loadDiagnosticsReport({ api = apiJson } = {}) {
  return api('/api/diagnostics');
}

export async function loadAuditEvents({ api = apiJson, limit = 50 } = {}) {
  const size = Math.max(1, Math.min(100, Number(limit) || 50));
  const data = await api(`/api/audit-events?limit=${encodeURIComponent(size)}`);
  return data.events || [];
}
