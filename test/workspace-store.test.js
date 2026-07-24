import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorkspaceRow,
  deleteWorkspaceRow,
  getWorkspaceRow,
  listWorkspaceRows,
  removeLegacyDefaultLayoutPresets,
  removeLegacyDefaultWorkspaces,
  serializeWorkspace,
  updateWorkspaceRow,
} from '../src/lib/workspace-store.js';
import { createMemoryDb } from '../test-support/db.js';

test('workspace store creates, lists, and serializes workspace rows', () => {
  const db = createMemoryDb();
  try {
    const row = createWorkspaceRow(db, {
      name: 'main',
      description: 'Primary',
      layout: { session: 'main' },
    });

    assert.equal(row.name, 'main');
    assert.deepEqual(listWorkspaceRows(db).map(workspace => workspace.name), ['main']);
    assert.deepEqual(serializeWorkspace(row, { includeSortOrder: true }), {
      id: row.id,
      name: 'main',
      description: 'Primary',
      layout: { session: 'main' },
      isDefault: false,
      sortOrder: 0,
    });
  } finally {
    db.close();
  }
});

test('workspace store updates only provided fields and rejects empty updates', () => {
  const db = createMemoryDb();
  try {
    const row = createWorkspaceRow(db, {
      name: 'main',
      layout: { session: 'main' },
    });

    assert.equal(updateWorkspaceRow(db, row.id, {}), false);
    assert.equal(updateWorkspaceRow(db, row.id, {
      name: 'renamed',
      description: 'Updated',
      layout: { session: 'logs' },
    }), true);

    const updated = serializeWorkspace(getWorkspaceRow(db, row.id));
    assert.equal(updated.name, 'renamed');
    assert.equal(updated.description, 'Updated');
    assert.deepEqual(updated.layout, { session: 'logs' });
    assert.ok(getWorkspaceRow(db, row.id).updated_at);
  } finally {
    db.close();
  }
});

test('workspace store deletes rows and removes only legacy default layout presets', () => {
  const db = createMemoryDb();
  try {
    const keep = createWorkspaceRow(db, { name: 'custom', layout: { session: 'custom' } });
    insertWorkspace(db, { name: 'claude-focus', is_default: 1 });
    insertWorkspace(db, { name: 'quad', is_default: 1 });
    insertWorkspace(db, { name: 'deck', is_default: 0 });

    removeLegacyDefaultLayoutPresets(db);
    assert.deepEqual(listWorkspaceRows(db).map(row => row.name), ['custom', 'deck']);

    assert.equal(deleteWorkspaceRow(db, 999), null);
    assert.equal(deleteWorkspaceRow(db, keep.id).name, 'custom');
    assert.equal(getWorkspaceRow(db, keep.id), undefined);
  } finally {
    db.close();
  }
});

test('legacy default workspace cleanup alias points to the renamed layout preset cleanup', () => {
  assert.equal(removeLegacyDefaultWorkspaces, removeLegacyDefaultLayoutPresets);
});

function insertWorkspace(db, overrides = {}) {
  db.prepare(`
    INSERT INTO layout_presets (name, description, layout_json, is_default, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    overrides.name,
    overrides.description || '',
    JSON.stringify(overrides.layout || { session: overrides.name }),
    overrides.is_default || 0,
    overrides.sort_order || 0,
  );
}
