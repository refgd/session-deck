export const PROCESS_NAME_RE = /^[a-zA-Z0-9_.:-]{1,64}$/;

export function listAppSettings(db) {
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

export function upsertAppSetting(db, key, value) {
  db.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')"
  ).run(key, value, value);
  return { key, value };
}

export function listSessionTypes(db) {
  return db.prepare('SELECT * FROM session_types ORDER BY sort_order, process_name').all();
}

export function getSessionType(db, id) {
  return db.prepare('SELECT * FROM session_types WHERE id = ?').get(id);
}

export function sessionTypeExists(db, processName) {
  return !!db.prepare('SELECT id FROM session_types WHERE process_name = ?').get(processName);
}

export function nextSessionTypeSortOrder(db) {
  const maxSort = db.prepare('SELECT MAX(sort_order) as value FROM session_types').get();
  return (maxSort?.value ?? 99) + 1;
}

export function createSessionType(db, { processName, displayName, color }) {
  const result = db.prepare(
    'INSERT INTO session_types (process_name, display_name, color, sort_order) VALUES (?, ?, ?, ?)'
  ).run(processName, displayName, color, nextSessionTypeSortOrder(db));
  return getSessionType(db, result.lastInsertRowid);
}

export function updateSessionType(db, id, { displayName, color }) {
  db.prepare(
    "UPDATE session_types SET display_name = ?, color = ?, created_at = COALESCE(created_at, datetime('now')) WHERE id = ?"
  ).run(displayName, color, id);
  return getSessionType(db, id);
}

export function deleteSessionType(db, id) {
  const existing = getSessionType(db, id);
  if (!existing) return null;
  db.prepare('DELETE FROM session_types WHERE id = ?').run(existing.id);
  return existing;
}

export function listSessionTypeNames(db) {
  return db.prepare('SELECT process_name FROM session_types').all().map(row => row.process_name);
}

export function insertDiscoveredSessionTypes(db, processNames, options = {}) {
  const color = options.color || '#6b7688';
  const existing = new Set(listSessionTypeNames(db));
  const insert = db.prepare(
    'INSERT INTO session_types (process_name, display_name, color, sort_order) VALUES (?, ?, ?, ?)'
  );
  let nextSort = nextSessionTypeSortOrder(db);
  let added = 0;

  for (const name of processNames || []) {
    if (!PROCESS_NAME_RE.test(name) || existing.has(name)) continue;
    insert.run(name, name, color, nextSort++);
    existing.add(name);
    added++;
  }

  return { added, total: existing.size };
}
