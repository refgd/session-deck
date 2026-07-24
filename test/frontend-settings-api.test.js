import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exportSettingsSnapshot,
  importSettingsSnapshot,
  loadAuditEvents,
  loadDiagnosticsReport,
  settingsExportFilename,
} from '../frontend/src/lib/settings-api.js';

test('settingsExportFilename creates stable timestamped filenames', () => {
  assert.equal(
    settingsExportFilename(new Date('2026-07-24T12:34:56.789Z')),
    'session-deck-config-2026-07-24T12-34-56.json',
  );
});

test('loadDiagnosticsReport delegates to diagnostics API', async () => {
  const report = { status: 'ok', checks: [] };
  const calls = [];
  const result = await loadDiagnosticsReport({
    api: async (path) => {
      calls.push(path);
      return report;
    },
  });

  assert.equal(result, report);
  assert.deepEqual(calls, ['/api/diagnostics']);
});

test('loadAuditEvents clamps limits and returns an events array', async () => {
  const calls = [];
  const events = [{ action: 'session.create' }];
  const result = await loadAuditEvents({
    limit: 1000,
    api: async (path) => {
      calls.push(path);
      return { events };
    },
  });

  assert.equal(result, events);
  assert.deepEqual(calls, ['/api/audit-events?limit=100']);
});

test('exportSettingsSnapshot downloads the exported settings JSON', async () => {
  const payload = { version: 1, workspaces: [] };
  const downloads = [];
  const result = await exportSettingsSnapshot({
    date: new Date('2026-07-24T12:34:56.789Z'),
    api: async (path) => {
      assert.equal(path, '/api/settings/export');
      return payload;
    },
    download: (data, filename) => {
      downloads.push({ data, filename });
    },
  });

  assert.equal(result, payload);
  assert.deepEqual(downloads, [{
    data: payload,
    filename: 'session-deck-config-2026-07-24T12-34-56.json',
  }]);
});

test('exportSettingsSnapshot can request sensitive local paths explicitly', async () => {
  const calls = [];
  await exportSettingsSnapshot({
    includeSensitivePaths: true,
    api: async (path) => {
      calls.push(path);
      return { version: 1, sensitivePathsIncluded: true };
    },
    download: () => {},
  });

  assert.deepEqual(calls, ['/api/settings/export?include_sensitive_paths=true']);
});

test('importSettingsSnapshot parses file JSON and posts it', async () => {
  const payload = { workspaces: [], managedHosts: [] };
  const calls = [];
  const result = await importSettingsSnapshot(
    { text: async () => JSON.stringify(payload) },
    {
      api: async (path, options) => {
        calls.push({ path, options });
      },
    },
  );

  assert.deepEqual(result, payload);
  assert.deepEqual(calls, [{
    path: '/api/settings/import',
    options: {
      method: 'POST',
      body: payload,
    },
  }]);
});
