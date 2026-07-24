import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSessionType,
  deleteSessionType,
  getSessionType,
  insertDiscoveredSessionTypes,
  listAppSettings,
  listSessionTypes,
  PROCESS_NAME_RE,
  sessionTypeExists,
  updateSessionType,
  upsertAppSetting,
} from '../src/lib/settings-store.js';
import { createMemoryDb } from '../test-support/db.js';

test('settings store lists and upserts app settings', () => {
  const db = createMemoryDb();
  try {
    assert.deepEqual(listAppSettings(db), {});
    assert.deepEqual(upsertAppSetting(db, 'accent_color', '#123456'), {
      key: 'accent_color',
      value: '#123456',
    });
    upsertAppSetting(db, 'accent_color', '#abcdef');
    assert.deepEqual(listAppSettings(db), { accent_color: '#abcdef' });
  } finally {
    db.close();
  }
});

test('settings store creates, updates, lists, and deletes session types', () => {
  const db = createMemoryDb();
  try {
    const created = createSessionType(db, {
      processName: 'nvim',
      displayName: 'Neovim',
      color: '#98c379',
    });

    assert.equal(created.sort_order, 100);
    assert.equal(sessionTypeExists(db, 'nvim'), true);
    assert.deepEqual(listSessionTypes(db).map(type => type.process_name), ['nvim']);

    const updated = updateSessionType(db, created.id, {
      displayName: 'NVIM',
      color: '#111111',
    });
    assert.equal(updated.display_name, 'NVIM');
    assert.equal(updated.color, '#111111');

    assert.equal(deleteSessionType(db, created.id).process_name, 'nvim');
    assert.equal(getSessionType(db, created.id), undefined);
    assert.equal(deleteSessionType(db, created.id), null);
  } finally {
    db.close();
  }
});

test('settings store inserts discovered session types with validation and dedupe', () => {
  const db = createMemoryDb();
  try {
    createSessionType(db, {
      processName: 'bash',
      displayName: 'Bash',
      color: '#6b7688',
    });

    const result = insertDiscoveredSessionTypes(db, ['bash', 'node', 'bad/name', 'node', 'python3']);

    assert.deepEqual(result, { added: 2, total: 3 });
    assert.deepEqual(listSessionTypes(db).map(type => type.process_name), ['bash', 'node', 'python3']);
  } finally {
    db.close();
  }
});

test('PROCESS_NAME_RE documents allowed process name characters', () => {
  assert.equal(PROCESS_NAME_RE.test('node:worker-1.ok'), true);
  assert.equal(PROCESS_NAME_RE.test('bad/name'), false);
  assert.equal(PROCESS_NAME_RE.test(''), false);
  assert.equal(PROCESS_NAME_RE.test('x'.repeat(65)), false);
});
