import test from 'node:test';
import assert from 'node:assert/strict';
import { attachmentHeader, safeFilenamePart } from '../src/lib/download-utils.js';

test('safeFilenamePart removes header-unsafe and path separator characters', () => {
  assert.equal(safeFilenamePart(' ../bad"name\\with/path?.txt '), 'bad-name-with-path-.txt');
});

test('safeFilenamePart normalizes whitespace and repeated separators', () => {
  assert.equal(safeFilenamePart('main   session:::prod'), 'main-session-prod');
});

test('safeFilenamePart keeps generated filenames ASCII-only', () => {
  assert.equal(safeFilenamePart('生产 会话 main'), 'main');
});

test('attachmentHeader builds a quoted safe ASCII filename', () => {
  assert.equal(
    attachmentHeader(['main/session', 'host"name', '2026-07-24T01-02-03'], 'txt'),
    'attachment; filename="main-session-host-name-2026-07-24T01-02-03.txt"',
  );
});

test('attachmentHeader falls back when every filename part is empty', () => {
  assert.equal(attachmentHeader(['', '///'], ''), 'attachment; filename="download.txt"');
});
