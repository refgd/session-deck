import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

test('server applies the configured Fastify body limit', () => {
  assert.match(source, /bodyLimit:\s*config\.bodyLimit/);
});

test('server normalizes uncaught framework errors through apiError', () => {
  assert.match(source, /fastify\.setErrorHandler/);
  assert.match(source, /apiError\(reply, err, statusCode\)/);
});

test('server logs redacted filesystem paths for startup diagnostics', () => {
  assert.match(source, /redactPath\(config\.dbPath\)/);
  assert.doesNotMatch(source, /\{\s*dbPath:\s*config\.dbPath\s*\}/);
});
