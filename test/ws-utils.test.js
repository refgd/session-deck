import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TERMINAL_WS_MESSAGE_BYTES,
  WS_POLICY_CLOSE_CODE,
  authorizeWebSocketRequest,
  cleanTerminalOutput,
  createWsTokenStore,
  extractWebSocketToken,
  isTerminalWsMessageTooLarge,
  logRejectedWebSocket,
  normalizeTerminalScrollLines,
  parseTerminalWsMessage,
  terminalExitReason,
  wsCloseReason,
  wsMessageByteLength,
} from '../src/lib/ws-utils.js';

const sameOriginRequest = {
  headers: {
    host: 'example.test',
    origin: 'http://example.test',
  },
  protocol: 'http',
  query: {},
  session: {},
};

test('createWsTokenStore creates one-time tokens', () => {
  let currentTime = 1000;
  let counter = 0;
  const store = createWsTokenStore({
    ttlMs: 30000,
    now: () => currentTime,
    randomToken: () => `token-${++counter}`,
  });

  const token = store.generate('session-1');

  assert.equal(token, 'token-1');
  assert.equal(store.validate(token, 'session-1'), true);
  assert.equal(store.validate(token), false);
});

test('createWsTokenStore binds tokens to the issuing session when requested', () => {
  let counter = 0;
  const store = createWsTokenStore({
    randomToken: () => `token-${++counter}`,
  });

  const token = store.generate('session-1');

  assert.equal(store.validate(token, 'session-2'), false);
  assert.equal(store.validate(token, 'session-1'), false);

  const unboundToken = store.generate('session-1');
  assert.equal(store.validate(unboundToken), true);
});

test('createWsTokenStore expires and prunes old tokens', () => {
  let currentTime = 1000;
  let counter = 0;
  const store = createWsTokenStore({
    ttlMs: 100,
    now: () => currentTime,
    randomToken: () => `token-${++counter}`,
  });

  const expired = store.generate('old');
  currentTime += 101;
  const fresh = store.generate('fresh');

  assert.equal(store.validate(expired), false);
  assert.equal(store.validate(fresh), true);
  assert.equal(store.size(), 0);
});

test('createWsTokenStore caps retained tokens and evicts oldest entries', () => {
  let currentTime = 1000;
  let counter = 0;
  const store = createWsTokenStore({
    ttlMs: 30000,
    maxTokens: 2,
    now: () => currentTime++,
    randomToken: () => `token-${++counter}`,
  });

  const first = store.generate('session-1');
  const second = store.generate('session-1');
  const third = store.generate('session-1');

  assert.equal(store.size(), 2);
  assert.equal(store.validate(first), false);
  assert.equal(store.validate(second), true);
  assert.equal(store.validate(third), true);
});

test('authorizeWebSocketRequest enforces origin before setup and auth checks', () => {
  const result = authorizeWebSocketRequest({
    ...sameOriginRequest,
    headers: {
      host: 'example.test',
      origin: 'http://evil.test',
    },
  }, {
    db: {},
    hasUsers: () => false,
  });

  assert.deepEqual(result, {
    ok: false,
    code: WS_POLICY_CLOSE_CODE,
    reason: 'Cross-origin WebSocket blocked',
    logType: 'origin',
    origin: 'http://evil.test',
    expectedOrigin: 'http://example.test',
  });
});

test('authorizeWebSocketRequest rejects setup-required and unauthenticated requests', () => {
  assert.deepEqual(authorizeWebSocketRequest(sameOriginRequest, {
    db: {},
    hasUsers: () => false,
  }), {
    ok: false,
    code: WS_POLICY_CLOSE_CODE,
    reason: 'Setup required',
    logType: 'setup',
  });

  assert.deepEqual(authorizeWebSocketRequest(sameOriginRequest, {
    db: {},
    hasUsers: () => true,
  }), {
    ok: false,
    code: WS_POLICY_CLOSE_CODE,
    reason: 'Authentication required',
    logType: 'auth',
    isAuthenticated: false,
    tokenValid: false,
  });
});

test('authorizeWebSocketRequest accepts authenticated sessions or bound websocket tokens', () => {
  const authenticated = authorizeWebSocketRequest({
    ...sameOriginRequest,
    session: { authenticated: true, sessionId: 'sid-1' },
  }, {
    db: {},
    hasUsers: () => true,
  });
  assert.deepEqual(authenticated, { ok: true, isAuthenticated: true, tokenValid: false });

  const tokenStore = createWsTokenStore({ randomToken: () => 'token-1' });
  const token = tokenStore.generate('sid-2');
  const tokenResult = authorizeWebSocketRequest({
    ...sameOriginRequest,
    query: { token },
    session: { sessionId: 'sid-2' },
  }, {
    db: {},
    hasUsers: () => true,
    tokenStore,
    allowToken: true,
  });
  assert.deepEqual(tokenResult, { ok: true, isAuthenticated: false, tokenValid: true });
  assert.equal(tokenStore.validate(token, 'sid-2'), false);
});

test('authorizeWebSocketRequest accepts websocket tokens from subprotocol headers', () => {
  const tokenStore = createWsTokenStore({ randomToken: () => 'token-1' });
  const token = tokenStore.generate('sid-2');

  const result = authorizeWebSocketRequest({
    ...sameOriginRequest,
    headers: {
      ...sameOriginRequest.headers,
      'sec-websocket-protocol': `terminal, sessiondeck.ws-token.${token}`,
    },
    query: {},
    session: { sessionId: 'sid-2' },
  }, {
    db: {},
    hasUsers: () => true,
    tokenStore,
    allowToken: true,
  });

  assert.deepEqual(result, { ok: true, isAuthenticated: false, tokenValid: true });
  assert.equal(tokenStore.validate(token, 'sid-2'), false);
});

test('extractWebSocketToken prefers subprotocol headers over legacy query tokens', () => {
  assert.equal(extractWebSocketToken({
    headers: { 'sec-websocket-protocol': 'sessiondeck.ws-token.protocol-token' },
    query: { token: 'query-token' },
  }), 'protocol-token');

  assert.equal(extractWebSocketToken({
    headers: { 'sec-websocket-protocol': 'terminal' },
    query: { token: 'query-token' },
  }), 'query-token');
});

test('authorizeWebSocketRequest rejects tokens bound to a different session id', () => {
  const tokenStore = createWsTokenStore({ randomToken: () => 'token-1' });
  const token = tokenStore.generate('sid-1');

  assert.deepEqual(authorizeWebSocketRequest({
    ...sameOriginRequest,
    query: { token },
    session: { sessionId: 'sid-2' },
  }, {
    db: {},
    hasUsers: () => true,
    tokenStore,
    allowToken: true,
  }), {
    ok: false,
    code: WS_POLICY_CLOSE_CODE,
    reason: 'Authentication required',
    logType: 'auth',
    isAuthenticated: false,
    tokenValid: false,
  });
});

test('logRejectedWebSocket records stable rejection context', () => {
  const calls = [];
  const fastify = {
    log: {
      warn(context, message) {
        calls.push({ context, message });
      },
    },
  };
  const req = { ip: '10.0.0.5' };

  logRejectedWebSocket(fastify, req, {
    logType: 'origin',
    origin: 'https://evil.test',
    expectedOrigin: 'https://deck.test',
  }, 'Status');
  logRejectedWebSocket(fastify, req, {
    logType: 'auth',
    isAuthenticated: false,
    tokenValid: false,
  }, 'Terminal');
  logRejectedWebSocket(fastify, req, { logType: 'setup' }, 'Status');

  assert.deepEqual(calls, [
    {
      context: {
        ip: '10.0.0.5',
        origin: 'https://evil.test',
        expectedOrigin: 'https://deck.test',
      },
      message: 'Status WebSocket origin rejected',
    },
    {
      context: {
        ip: '10.0.0.5',
        isAuthenticated: false,
        tokenValid: false,
      },
      message: 'Terminal WebSocket auth rejected',
    },
    {
      context: { ip: '10.0.0.5' },
      message: 'Status WebSocket setup required',
    },
  ]);
});

test('cleanTerminalOutput strips ANSI codes and keeps recent non-empty lines', () => {
  assert.equal(
    cleanTerminalOutput('\x1b[31mone\x1b[0m\r\n\n two \nthree\nfour\n'),
    'two | three | four',
  );
});

test('terminalExitReason maps common tmux failures to useful close messages', () => {
  assert.deepEqual(
    terminalExitReason({ exitCode: 0, signal: null, recentOutput: '', ageMs: 3000 }),
    { code: 1000, message: 'Terminal exited with code 0' },
  );
  assert.deepEqual(
    terminalExitReason({ exitCode: 1, signal: null, recentOutput: 'no sessions\n', ageMs: 100 }),
    { code: 1011, message: 'tmux session does not exist or was deleted' },
  );
  assert.deepEqual(
    terminalExitReason({ exitCode: 1, signal: null, recentOutput: 'error connecting to /tmp/tmux-0/default\n', ageMs: 100 }),
    { code: 1011, message: 'tmux is not running or the session no longer exists' },
  );
  assert.deepEqual(
    terminalExitReason({ exitCode: 1, signal: 'SIGHUP', recentOutput: '', ageMs: 100 }),
    { code: 1011, message: 'Terminal exited immediately' },
  );
});

test('terminalExitReason truncates websocket close reasons to protocol-safe length', () => {
  const reason = terminalExitReason({
    exitCode: 1,
    signal: null,
    recentOutput: 'x'.repeat(200),
    ageMs: 100,
  });

  assert.equal(reason.code, 1011);
  assert.equal(reason.message.length, 120);
  assert.match(reason.message, /\.\.\.$/);
});

test('wsCloseReason truncates arbitrary websocket close messages', () => {
  const reason = wsCloseReason(`Failed to spawn: ${'x'.repeat(200)}`);
  assert.equal(reason.length, 120);
  assert.match(reason, /\.\.\.$/);
});

test('terminal websocket message size checks common payload shapes', () => {
  assert.equal(wsMessageByteLength('hello'), 5);
  assert.equal(wsMessageByteLength('你好'), 6);
  assert.equal(wsMessageByteLength(Buffer.from('abc')), 3);
  assert.equal(wsMessageByteLength([Buffer.from('ab'), '你好']), 8);
  assert.equal(wsMessageByteLength(new Uint8Array([1, 2, 3])), 3);

  assert.equal(isTerminalWsMessageTooLarge('x'.repeat(MAX_TERMINAL_WS_MESSAGE_BYTES)), false);
  assert.equal(isTerminalWsMessageTooLarge(Buffer.alloc(MAX_TERMINAL_WS_MESSAGE_BYTES + 1)), true);
});

test('parseTerminalWsMessage separates control messages from raw terminal input', () => {
  assert.deepEqual(parseTerminalWsMessage('hello'), { type: 'input', data: 'hello' });
  assert.deepEqual(parseTerminalWsMessage('{not-json'), { type: 'input', data: '{not-json' });
  assert.deepEqual(parseTerminalWsMessage(JSON.stringify({ type: 'unknown', value: 1 })), {
    type: 'input',
    data: '{"type":"unknown","value":1}',
  });
  assert.deepEqual(parseTerminalWsMessage(JSON.stringify({ type: 'resize', cols: '120', rows: 40 })), {
    type: 'resize',
    cols: 120,
    rows: 40,
  });
  assert.deepEqual(parseTerminalWsMessage(JSON.stringify({ type: 'resize', cols: 9999, rows: -1 })), {
    type: 'resize',
    cols: 300,
    rows: 5,
  });
  assert.deepEqual(parseTerminalWsMessage(JSON.stringify({ type: 'resize', cols: 'bad', rows: null })), {
    type: 'resize',
    cols: 80,
    rows: 24,
  });
});

test('parseTerminalWsMessage normalizes scroll control messages', () => {
  assert.deepEqual(parseTerminalWsMessage(JSON.stringify({ type: 'scroll', lines: -20 })), {
    type: 'scroll',
    lines: -20,
  });
  assert.deepEqual(parseTerminalWsMessage(JSON.stringify({ type: 'scroll', lines: 9999 })), {
    type: 'scroll',
    lines: 200,
  });
  assert.deepEqual(parseTerminalWsMessage(JSON.stringify({ type: 'scroll', lines: '-12' })), {
    type: 'scroll',
    lines: -12,
  });
  assert.deepEqual(parseTerminalWsMessage(JSON.stringify({ type: 'scroll', lines: 0 })), { type: 'noop' });
  assert.deepEqual(parseTerminalWsMessage(JSON.stringify({ type: 'scroll', lines: 'bad' })), { type: 'noop' });
});

test('normalizeTerminalScrollLines clamps finite values while preserving direction', () => {
  assert.equal(normalizeTerminalScrollLines(-999), -200);
  assert.equal(normalizeTerminalScrollLines(999), 200);
  assert.equal(normalizeTerminalScrollLines(-1.8), -1);
  assert.equal(normalizeTerminalScrollLines(1.8), 1);
  assert.equal(normalizeTerminalScrollLines(0), 0);
  assert.equal(normalizeTerminalScrollLines(Number.POSITIVE_INFINITY), 0);
});
