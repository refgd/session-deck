import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LANGUAGE_STORAGE_KEY,
  applyDocumentLanguage,
  readPreferredLanguage,
  savePreferredLanguage,
} from '../frontend/src/lib/language-preference.js';

test('readPreferredLanguage prefers stored language and normalizes locales', () => {
  const storage = {
    getItem(key) {
      assert.equal(key, LANGUAGE_STORAGE_KEY);
      return 'zh-Hans';
    },
  };

  assert.equal(readPreferredLanguage({ storage, navigatorLanguage: 'en-US' }), 'zh-CN');
});

test('readPreferredLanguage falls back when storage is unavailable', () => {
  const storage = {
    getItem() {
      throw new Error('storage disabled');
    },
  };

  assert.equal(readPreferredLanguage({ storage, navigatorLanguage: 'zh-TW' }), 'zh-CN');
});

test('savePreferredLanguage normalizes and ignores storage failures', () => {
  const storage = {
    setItem() {
      throw new Error('quota exceeded');
    },
  };

  assert.equal(savePreferredLanguage('zh-Hant', { storage }), 'zh-CN');
});

test('applyDocumentLanguage updates document lang when available', () => {
  const documentElement = { lang: 'en' };

  assert.equal(applyDocumentLanguage('zh-CN', { documentElement }), 'zh-CN');
  assert.equal(documentElement.lang, 'zh-CN');
});
