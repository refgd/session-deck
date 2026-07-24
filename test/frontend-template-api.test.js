import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorkspaceTemplate,
  deleteWorkspaceTemplate,
  loadWorkspaceTemplates,
} from '../frontend/src/lib/template-api.js';

test('loadWorkspaceTemplates returns templates with a stable empty default', async () => {
  assert.deepEqual(
    await loadWorkspaceTemplates({ api: async () => ({ templates: [{ name: 'quad' }] }) }),
    [{ name: 'quad' }],
  );
  assert.deepEqual(await loadWorkspaceTemplates({ api: async () => ({}) }), []);
});

test('createWorkspaceTemplate posts name and layout payload', async () => {
  const calls = [];
  const layout = { session: 'main' };
  await createWorkspaceTemplate({
    name: 'single',
    layout,
  }, {
    api: async (path, options) => calls.push({ path, options }),
  });

  assert.deepEqual(calls, [{
    path: '/api/templates',
    options: {
      method: 'POST',
      body: { name: 'single', layout },
    },
  }]);
});

test('deleteWorkspaceTemplate encodes template ids', async () => {
  const calls = [];
  await deleteWorkspaceTemplate('template/id', {
    api: async (path, options) => calls.push({ path, options }),
  });

  assert.deepEqual(calls, [{
    path: '/api/templates/template%2Fid',
    options: { method: 'DELETE' },
  }]);
});
