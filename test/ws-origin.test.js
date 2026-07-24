import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('WebSocket routes enforce same-origin checks before authentication', () => {
  for (const path of ['../src/routes/terminal-ws.js', '../src/routes/status-ws.js']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /authorizeWebSocketRequest\(req/);
    assert.match(source, /logRejectedWebSocket\(fastify, req, authorization/);
  }

  const utils = readFileSync(new URL('../src/lib/ws-utils.js', import.meta.url), 'utf8');
  assert.match(utils, /validateRequestOrigin\(request\)/);
  assert.match(utils, /Cross-origin WebSocket blocked/);
});

test('terminal WebSocket route rejects oversized client messages', () => {
  const source = readFileSync(new URL('../src/routes/terminal-ws.js', import.meta.url), 'utf8');

  assert.match(source, /isTerminalWsMessageTooLarge\(rawMsg\)/);
  assert.match(source, /socket\.close\(1009, 'Terminal input message is too large'\)/);
});

test('terminal WebSocket tokens are bound to the current session id', () => {
  const source = readFileSync(new URL('../src/lib/ws-utils.js', import.meta.url), 'utf8');

  assert.match(source, /tokenStore\?\.validate\(token, request\?\.session\?\.sessionId\)/);
});

test('terminal frontend sends websocket tokens outside the URL', () => {
  const source = readFileSync(new URL('../frontend/src/lib/Terminal.svelte', import.meta.url), 'utf8');

  assert.match(source, /new WebSocket\(wsUrl, \[`.*WS_TOKEN_PROTOCOL_PREFIX.*\$\{token\}`\]\)/s);
  assert.doesNotMatch(source, /token=\$\{encodeURIComponent\(token\)\}/);
});

test('websocket token endpoint has an explicit route rate limit', () => {
  const source = readFileSync(new URL('../src/routes/terminal-ws.js', import.meta.url), 'utf8');

  assert.match(source, /WS_TOKEN_RATE_LIMIT_MAX\s*=\s*120/);
  assert.match(source, /WS_TOKEN_RATE_LIMIT_WINDOW\s*=\s*'1 minute'/);
  assert.match(source, /rateLimit:\s*\{\s*max:\s*WS_TOKEN_RATE_LIMIT_MAX,\s*timeWindow:\s*WS_TOKEN_RATE_LIMIT_WINDOW/s);
});
