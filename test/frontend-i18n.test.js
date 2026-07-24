import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { messages, translate } from '../frontend/src/lib/i18n.js';

const FRONTEND_SRC = fileURLToPath(new URL('../frontend/src', import.meta.url));
const I18N_SOURCE = fileURLToPath(new URL('../frontend/src/lib/i18n.js', import.meta.url));

function placeholders(value) {
  return [...String(value).matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
}

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry !== 'dist') files.push(...sourceFiles(path));
      continue;
    }
    if (['.js', '.svelte'].includes(extname(path))) files.push(path);
  }
  return files;
}

function staticTranslationKeys() {
  const keys = new Set();
  const patterns = [
    /\bt\(\s*['"`]([A-Za-z0-9_]+)['"`]/g,
    /\btranslate\(\s*[^,\n]+,\s*['"`]([A-Za-z0-9_]+)['"`]/g,
  ];

  for (const file of sourceFiles(FRONTEND_SRC)) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) keys.add(match[1]);
    }
  }

  return [...keys].sort();
}

function messageBlock(name) {
  const source = readFileSync(I18N_SOURCE, 'utf8');
  const start = source.indexOf(`const ${name} = {`);
  const end = source.indexOf('\n};', start);
  assert.notEqual(start, -1, `missing ${name} message block`);
  assert.notEqual(end, -1, `unterminated ${name} message block`);
  return source.slice(start, end);
}

function duplicateMessageKeys(name) {
  const seen = new Set();
  const duplicates = new Set();
  for (const match of messageBlock(name).matchAll(/^\s*([A-Za-z0-9_]+):/gm)) {
    if (seen.has(match[1])) duplicates.add(match[1]);
    seen.add(match[1]);
  }
  return [...duplicates].sort();
}

test('i18n language packs expose the same keys', () => {
  const englishKeys = Object.keys(messages.en).sort();
  const chineseKeys = Object.keys(messages['zh-CN']).sort();

  assert.deepEqual(chineseKeys, englishKeys);
});

test('i18n message source does not define duplicate keys', () => {
  assert.deepEqual(duplicateMessageKeys('en'), []);
  assert.deepEqual(duplicateMessageKeys('zhCN'), []);
});

test('i18n translations keep placeholder names in sync', () => {
  for (const key of Object.keys(messages.en)) {
    assert.deepEqual(
      placeholders(messages['zh-CN'][key]),
      placeholders(messages.en[key]),
      `placeholder mismatch for ${key}`,
    );
  }
});

test('static frontend translation calls reference existing keys', () => {
  const missing = staticTranslationKeys().filter(key => !(key in messages.en));
  assert.deepEqual(missing, []);
});

test('i18n includes diagnostics data directory labels in English and Chinese', () => {
  assert.equal(messages.en.dataDirectory, 'Data directory');
  assert.equal(messages['zh-CN'].dataDirectory, '数据目录');
  assert.equal(messages.en.auditLog, 'Audit log');
  assert.equal(messages['zh-CN'].auditLog, '审计日志');
  assert.equal(messages.en.auditLogMenuHint, 'Administrative actions');
  assert.equal(messages['zh-CN'].auditLogMenuHint, '管理操作记录');
});

test('translate normalizes Chinese locales and replaces parameters', () => {
  assert.equal(translate('zh-Hans', 'usedByHosts', { names: 'app, jump' }), '使用中：app, jump');
  assert.equal(translate('missing', 'usedByHosts', { names: 'app' }), 'Used by: app');
});
