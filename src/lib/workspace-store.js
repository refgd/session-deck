import { assertLayoutBounds, parseLayoutJson } from './layout-utils.js';

export function listWorkspaceRows(db) {
  return db.prepare('SELECT * FROM layout_presets ORDER BY sort_order, id').all();
}

export function getWorkspaceRow(db, id) {
  return db.prepare('SELECT * FROM layout_presets WHERE id = ?').get(id);
}

export function serializeWorkspace(row, options = {}) {
  const result = {
    id: row.id,
    name: row.name,
    description: row.description,
    layout: parseLayoutJson(row.layout_json),
    isDefault: !!row.is_default,
  };
  if (options.includeSortOrder) result.sortOrder = row.sort_order || 0;
  return result;
}

export function createWorkspaceRow(db, { name, description = '', layout }) {
  assertLayoutBounds(layout);
  const result = db.prepare(
    'INSERT INTO layout_presets (name, description, layout_json) VALUES (?, ?, ?)'
  ).run(name, description, JSON.stringify(layout));
  return getWorkspaceRow(db, result.lastInsertRowid);
}

export function updateWorkspaceRow(db, id, updates = {}) {
  const entries = [];
  const params = [];

  if (updates.layout) {
    assertLayoutBounds(updates.layout);
    entries.push('layout_json = ?');
    params.push(JSON.stringify(updates.layout));
  }
  if (updates.name) {
    entries.push('name = ?');
    params.push(updates.name);
  }
  if (updates.description !== undefined) {
    entries.push('description = ?');
    params.push(updates.description);
  }

  if (!entries.length) return false;

  entries.push("updated_at = datetime('now')");
  params.push(id);
  db.prepare(`UPDATE layout_presets SET ${entries.join(', ')} WHERE id = ?`).run(...params);
  return true;
}

export function deleteWorkspaceRow(db, id) {
  const existing = getWorkspaceRow(db, id);
  if (!existing) return null;
  db.prepare('DELETE FROM layout_presets WHERE id = ?').run(existing.id);
  return existing;
}

export function removeLegacyDefaultLayoutPresets(db) {
  db.prepare(`
    DELETE FROM layout_presets
    WHERE is_default = 1
      AND name IN ('claude-focus', 'quad', 'deck')
  `).run();
}

export const removeLegacyDefaultWorkspaces = removeLegacyDefaultLayoutPresets;
