import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, hashPasswordSync, verifyPassword } from '../src/lib/auth-utils.js';

test('hashPasswordSync creates scrypt hashes that verify only the right password', async () => {
  const hash = hashPasswordSync('correct horse battery staple');
  assert.match(hash, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(await verifyPassword('correct horse battery staple', hash), true);
  assert.equal(await verifyPassword('wrong password', hash), false);
});

test('verifyPassword rejects malformed hashes without throwing', async () => {
  assert.equal(await verifyPassword('password', ''), false);
  assert.equal(await verifyPassword('password', 'bcrypt$salt$hash'), false);
  assert.equal(await verifyPassword('password', 'scrypt$salt$not-hex'), false);
  assert.equal(await verifyPassword('password', 'scrypt$salt$'), false);
});

test('escapeHtml escapes auth page user-controlled values', () => {
  assert.equal(
    escapeHtml(`<script>"x"&'y'</script>`),
    '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;',
  );
});
