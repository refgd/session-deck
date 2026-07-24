import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('frontend index avoids CSP-blocked external styles and inline scripts', () => {
  const html = readFileSync(join(root, 'frontend/index.html'), 'utf8');

  assert.doesNotMatch(html, /fonts\.googleapis\.com/);
  assert.doesNotMatch(html, /fonts\.gstatic\.com/);
  assert.equal([...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>/gi)].length, 0);
});
