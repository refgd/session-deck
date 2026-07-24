import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDb } from '../test-support/db.js';
import {
  deleteSessionHistory,
  getSessionHistoryPage,
  newLinesAfterOverlap,
  renameSessionHistory,
  syncSessionHistory,
} from '../src/services/session-history-cache.js';

const host = { name: 'local' };

test('newLinesAfterOverlap appends only captured lines after cached tail', () => {
  assert.deepEqual(
    newLinesAfterOverlap(['b', 'c'], ['a', 'b', 'c', 'd', 'e']),
    ['d', 'e'],
  );
  assert.deepEqual(newLinesAfterOverlap([], ['a', 'b']), ['a', 'b']);
});

test('session history cache syncs incrementally and pages older lines', async () => {
  const db = createMemoryDb();
  const captures = ['a\nb\nc\nd', 'a\nb\nc\nd\ne\nf'];
  try {
    await syncSessionHistory(db, host, 'main', {
      capture: async () => captures.shift(),
    });
    await syncSessionHistory(db, host, 'main', {
      capture: async () => captures.shift(),
    });

    const latest = getSessionHistoryPage(db, 'local', 'main', { limit: 3 });
    assert.equal(latest.text, 'd\ne\nf');
    assert.equal(latest.hasMore, true);

    const older = getSessionHistoryPage(db, 'local', 'main', { before: latest.nextBefore, limit: 3 });
    assert.equal(older.text, 'a\nb\nc');
    assert.equal(older.hasMore, false);
    assert.equal(older.cachedLines, 6);
  } finally {
    db.close();
  }
});

test('session history cache renames and deletes session rows', async () => {
  const db = createMemoryDb();
  try {
    await syncSessionHistory(db, host, 'main', { capture: async () => 'one\ntwo' });
    renameSessionHistory(db, 'local', 'main', 'next');
    assert.equal(getSessionHistoryPage(db, 'local', 'next').text, 'one\ntwo');

    deleteSessionHistory(db, 'local', 'next');
    assert.equal(getSessionHistoryPage(db, 'local', 'next').text, '');
  } finally {
    db.close();
  }
});
