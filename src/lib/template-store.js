import { assertLayoutBounds, countLayoutPanes, parseLayoutJson, stripLayoutSessions } from './layout-utils.js';

export function listTemplateRows(db) {
  return db.prepare('SELECT * FROM workspace_templates ORDER BY sort_order, id').all();
}

export function getTemplateRow(db, id) {
  return db.prepare('SELECT * FROM workspace_templates WHERE id = ?').get(id);
}

export function serializeTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    layout: parseLayoutJson(row.layout_json),
    paneCount: row.pane_count,
    createdAt: row.created_at,
  };
}

export function createTemplateRow(db, { name, description = '', layout }) {
  assertLayoutBounds(layout);
  const templateLayout = stripLayoutSessions(layout);
  assertLayoutBounds(templateLayout);
  const paneCount = countLayoutPanes(templateLayout);
  const result = db.prepare(
    'INSERT INTO workspace_templates (name, description, layout_json, pane_count) VALUES (?, ?, ?, ?)'
  ).run(name, description, JSON.stringify(templateLayout), paneCount);

  return {
    row: getTemplateRow(db, result.lastInsertRowid),
    layout: templateLayout,
    paneCount,
  };
}

export function updateTemplateRow(db, id, updates = {}) {
  const entries = [];
  const params = [];
  if (updates.name) {
    entries.push('name = ?');
    params.push(updates.name);
  }
  if (updates.description !== undefined) {
    entries.push('description = ?');
    params.push(updates.description);
  }
  if (!entries.length) return false;
  params.push(id);
  db.prepare(`UPDATE workspace_templates SET ${entries.join(', ')} WHERE id = ?`).run(...params);
  return true;
}

export function deleteTemplateRow(db, id) {
  const row = getTemplateRow(db, id);
  if (!row) return null;
  db.prepare('DELETE FROM workspace_templates WHERE id = ?').run(row.id);
  return row;
}
