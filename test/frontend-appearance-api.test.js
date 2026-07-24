import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadAppSettings,
  loadSessionTypes,
  saveAccentColorSetting,
  saveMobileReadOnlyDefaultSetting,
  scanSessionTypes,
  sessionTypeMapFromList,
  updateSessionType,
} from '../frontend/src/lib/appearance-api.js';

test('sessionTypeMapFromList builds the process lookup used by panes', () => {
  assert.deepEqual(sessionTypeMapFromList([
    { process_name: 'bash', display_name: 'Shell', color: '#123456' },
  ]), {
    bash: { display_name: 'Shell', color: '#123456' },
  });
  assert.deepEqual(sessionTypeMapFromList(null), {});
});

test('loadSessionTypes returns list and lookup with stable empty defaults', async () => {
  const result = await loadSessionTypes({
    api: async () => ({ types: [{ process_name: 'vim', display_name: 'Vim', color: '#00ff00' }] }),
  });

  assert.deepEqual(result.types, [{ process_name: 'vim', display_name: 'Vim', color: '#00ff00' }]);
  assert.deepEqual(result.map, { vim: { display_name: 'Vim', color: '#00ff00' } });
  assert.deepEqual(await loadSessionTypes({ api: async () => ({}) }), { types: [], map: {} });
});

test('appearance API wrappers use expected paths and payloads', async () => {
  const calls = [];
  const api = async (path, options) => {
    calls.push({ path, options });
    return { accent_color: '#abcdef' };
  };

  assert.deepEqual(await loadAppSettings({ api }), { accent_color: '#abcdef' });
  await saveAccentColorSetting('#123456', { api });
  await saveMobileReadOnlyDefaultSetting(true, { api });
  await saveMobileReadOnlyDefaultSetting(false, { api });
  await scanSessionTypes({ api });
  await updateSessionType('type/id', { displayName: 'Node', color: '#00ff00' }, { api });

  assert.deepEqual(calls, [
    { path: '/api/settings', options: undefined },
    {
      path: '/api/settings/accent_color',
      options: { method: 'PUT', body: { value: '#123456' } },
    },
    {
      path: '/api/settings/mobile_read_only_default',
      options: { method: 'PUT', body: { value: 'true' } },
    },
    {
      path: '/api/settings/mobile_read_only_default',
      options: { method: 'PUT', body: { value: 'false' } },
    },
    {
      path: '/api/session-types/scan',
      options: { method: 'POST' },
    },
    {
      path: '/api/session-types/type%2Fid',
      options: { method: 'PUT', body: { display_name: 'Node', color: '#00ff00' } },
    },
  ]);
});
