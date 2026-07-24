import { captureSession } from './tmux.js';

export const HISTORY_PAGE_LIMIT_DEFAULT = 400;
export const HISTORY_PAGE_LIMIT_MAX = 2000;
export const HISTORY_SYNC_MAX_BYTES = 2 * 1024 * 1024;
const OVERLAP_SCAN_LINES = 300;
const MAX_CACHED_LINES_PER_SESSION = 200000;

export async function syncSessionHistory(db, host, sessionName, options = {}) {
  const capture = options.capture || captureSession;
  const maxBytes = options.maxBytes || HISTORY_SYNC_MAX_BYTES;
  const text = await capture(host, sessionName, { maxBytes });
  const lines = splitHistoryLines(text);
  if (lines.length === 0) {
    ensureMeta(db, host.name, sessionName);
    return historyStats(db, host.name, sessionName);
  }

  const hostName = host.name;
  const meta = ensureMeta(db, hostName, sessionName);
  const tail = cachedTailLines(db, hostName, sessionName, OVERLAP_SCAN_LINES);
  const appendLines = newLinesAfterOverlap(tail, lines);

  if (appendLines.length > 0) {
    const insert = db.prepare(`
      INSERT OR IGNORE INTO session_history_lines (host, session, line_no, text)
      VALUES (?, ?, ?, ?)
    `);
    const updateMeta = db.prepare(`
      INSERT INTO session_history_meta (host, session, next_line_no, last_synced_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(host, session) DO UPDATE SET
        next_line_no = excluded.next_line_no,
        last_synced_at = excluded.last_synced_at,
        updated_at = excluded.updated_at
    `);
    const start = meta.next_line_no;
    const write = db.transaction(() => {
      appendLines.forEach((line, index) => insert.run(hostName, sessionName, start + index, line));
      updateMeta.run(hostName, sessionName, start + appendLines.length);
      pruneSessionHistory(db, hostName, sessionName, MAX_CACHED_LINES_PER_SESSION);
    });
    write();
  } else {
    db.prepare(`
      UPDATE session_history_meta
      SET last_synced_at = datetime('now'), updated_at = datetime('now')
      WHERE host = ? AND session = ?
    `).run(hostName, sessionName);
  }

  return historyStats(db, hostName, sessionName);
}

export function getSessionHistoryPage(db, hostName, sessionName, options = {}) {
  const limit = normalizeHistoryLimit(options.limit);
  const before = normalizeBeforeCursor(options.before);
  const rows = before
    ? db.prepare(`
        SELECT line_no, text FROM session_history_lines
        WHERE host = ? AND session = ? AND line_no < ?
        ORDER BY line_no DESC
        LIMIT ?
      `).all(hostName, sessionName, before, limit)
    : db.prepare(`
        SELECT line_no, text FROM session_history_lines
        WHERE host = ? AND session = ?
        ORDER BY line_no DESC
        LIMIT ?
      `).all(hostName, sessionName, limit);

  const ordered = rows.reverse();
  const firstLineNo = ordered[0]?.line_no || null;
  const hasMore = firstLineNo
    ? !!db.prepare(`
        SELECT 1 FROM session_history_lines
        WHERE host = ? AND session = ? AND line_no < ?
        LIMIT 1
      `).get(hostName, sessionName, firstLineNo)
    : false;

  return {
    host: hostName,
    session: sessionName,
    lines: ordered,
    text: ordered.map(row => row.text).join('\n'),
    nextBefore: hasMore ? firstLineNo : null,
    hasMore,
    ...historyStats(db, hostName, sessionName),
  };
}

export function deleteSessionHistory(db, hostName, sessionName) {
  const remove = db.transaction(() => {
    db.prepare('DELETE FROM session_history_lines WHERE host = ? AND session = ?').run(hostName, sessionName);
    db.prepare('DELETE FROM session_history_meta WHERE host = ? AND session = ?').run(hostName, sessionName);
  });
  remove();
}

export function renameSessionHistory(db, hostName, oldName, newName) {
  const move = db.transaction(() => {
    db.prepare(`
      UPDATE OR IGNORE session_history_lines
      SET session = ?
      WHERE host = ? AND session = ?
    `).run(newName, hostName, oldName);
    db.prepare(`
      UPDATE OR IGNORE session_history_meta
      SET session = ?, updated_at = datetime('now')
      WHERE host = ? AND session = ?
    `).run(newName, hostName, oldName);
  });
  move();
}

export function splitHistoryLines(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

export function newLinesAfterOverlap(cachedTail, capturedLines) {
  if (!cachedTail.length) return capturedLines;
  const max = Math.min(cachedTail.length, capturedLines.length);
  for (let length = max; length >= 1; length--) {
    const tailSlice = cachedTail.slice(cachedTail.length - length);
    for (let start = 0; start <= capturedLines.length - length; start++) {
      if (sameLines(tailSlice, capturedLines.slice(start, start + length))) {
        return capturedLines.slice(start + length);
      }
    }
  }
  return ['', '[Session Deck: history sync boundary]', '', ...capturedLines];
}

export function normalizeHistoryLimit(value) {
  const limit = Number.parseInt(value, 10);
  if (!Number.isFinite(limit) || limit < 1) return HISTORY_PAGE_LIMIT_DEFAULT;
  return Math.min(HISTORY_PAGE_LIMIT_MAX, limit);
}

function normalizeBeforeCursor(value) {
  const cursor = Number.parseInt(value, 10);
  return Number.isFinite(cursor) && cursor > 0 ? cursor : null;
}

function ensureMeta(db, hostName, sessionName) {
  const existing = db.prepare('SELECT * FROM session_history_meta WHERE host = ? AND session = ?').get(hostName, sessionName);
  if (existing) return existing;
  db.prepare('INSERT INTO session_history_meta (host, session) VALUES (?, ?)').run(hostName, sessionName);
  return db.prepare('SELECT * FROM session_history_meta WHERE host = ? AND session = ?').get(hostName, sessionName);
}

function cachedTailLines(db, hostName, sessionName, limit) {
  return db.prepare(`
    SELECT text FROM session_history_lines
    WHERE host = ? AND session = ?
    ORDER BY line_no DESC
    LIMIT ?
  `).all(hostName, sessionName, limit).reverse().map(row => row.text);
}

function historyStats(db, hostName, sessionName) {
  const meta = db.prepare('SELECT last_synced_at FROM session_history_meta WHERE host = ? AND session = ?').get(hostName, sessionName);
  const count = db.prepare('SELECT COUNT(*) as count FROM session_history_lines WHERE host = ? AND session = ?').get(hostName, sessionName);
  return {
    cachedLines: count?.count || 0,
    lastSyncedAt: meta?.last_synced_at || null,
  };
}

function pruneSessionHistory(db, hostName, sessionName, maxLines) {
  db.prepare(`
    DELETE FROM session_history_lines
    WHERE host = ? AND session = ? AND line_no IN (
      SELECT line_no FROM session_history_lines
      WHERE host = ? AND session = ?
      ORDER BY line_no DESC
      LIMIT -1 OFFSET ?
    )
  `).run(hostName, sessionName, hostName, sessionName, maxLines);
}

function sameLines(left, right) {
  if (left.length !== right.length) return false;
  return left.every((line, index) => line === right[index]);
}
