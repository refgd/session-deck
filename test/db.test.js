import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { configureDatabase } from '../src/lib/db.js';

test('configureDatabase enables durable concurrent SQLite defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'session-deck-db-'));
  const db = new Database(join(dir, 'session-deck.db'));

  try {
    configureDatabase(db);

    assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
    assert.equal(db.pragma('synchronous', { simple: true }), 1);
    assert.equal(db.pragma('busy_timeout', { simple: true }), 5000);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
