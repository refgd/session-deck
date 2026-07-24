import { randomBytes } from 'node:crypto';
import { validateRequestOrigin } from './http-security.js';
import { normalizeTerminalSize } from './terminal-utils.js';

export const MAX_TERMINAL_WS_MESSAGE_BYTES = 64 * 1024;
export const MAX_TERMINAL_SCROLL_LINES = 200;
export const TERMINAL_SCROLL_FLUSH_MS = 40;
export const WS_POLICY_CLOSE_CODE = 1008;
export const WS_TOKEN_PROTOCOL_PREFIX = 'sessiondeck.ws-token.';

export function createWsTokenStore(options = {}) {
  const ttlMs = options.ttlMs ?? 30000;
  const maxTokens = options.maxTokens ?? 1000;
  const now = options.now || (() => Date.now());
  const randomToken = options.randomToken || (() => randomBytes(24).toString('hex'));
  const tokens = new Map();

  return {
    generate(sessionId) {
      const token = randomToken();
      tokens.set(token, { sessionId, created: now() });
      pruneExpired(tokens, now(), ttlMs);
      pruneOldest(tokens, maxTokens);
      return token;
    },
    validate(token, expectedSessionId) {
      const entry = tokens.get(token);
      if (!entry) return false;
      tokens.delete(token);
      if (now() - entry.created >= ttlMs) return false;
      if (expectedSessionId !== undefined && entry.sessionId !== expectedSessionId) return false;
      return true;
    },
    size() {
      pruneExpired(tokens, now(), ttlMs);
      return tokens.size;
    },
  };
}

export function authorizeWebSocketRequest(request, options = {}) {
  const {
    db = null,
    hasUsers = () => false,
    tokenStore = null,
    allowToken = false,
  } = options;

  const origin = validateRequestOrigin(request);
  if (!origin.ok) {
    return {
      ok: false,
      code: WS_POLICY_CLOSE_CODE,
      reason: 'Cross-origin WebSocket blocked',
      logType: 'origin',
      origin: origin.origin,
      expectedOrigin: origin.expectedOrigin,
    };
  }

  if (!hasUsers(db)) {
    return {
      ok: false,
      code: WS_POLICY_CLOSE_CODE,
      reason: 'Setup required',
      logType: 'setup',
    };
  }

  const isAuthenticated = Boolean(request?.session?.authenticated);
  const token = extractWebSocketToken(request);
  const tokenValid = Boolean(allowToken && token && tokenStore?.validate(token, request?.session?.sessionId));

  if (!isAuthenticated && !tokenValid) {
    return {
      ok: false,
      code: WS_POLICY_CLOSE_CODE,
      reason: 'Authentication required',
      logType: 'auth',
      isAuthenticated,
      tokenValid,
    };
  }

  return { ok: true, isAuthenticated, tokenValid };
}

export function extractWebSocketToken(request) {
  const protocolToken = tokenFromProtocolHeader(request?.headers?.['sec-websocket-protocol']);
  if (protocolToken) return protocolToken;
  return request?.query?.token || null;
}

function tokenFromProtocolHeader(value) {
  const protocols = String(value || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  const protocol = protocols.find(item => item.startsWith(WS_TOKEN_PROTOCOL_PREFIX));
  return protocol ? protocol.slice(WS_TOKEN_PROTOCOL_PREFIX.length) : null;
}

export function logRejectedWebSocket(fastify, req, authorization, label = 'WebSocket') {
  if (authorization.logType === 'origin') {
    fastify.log.warn({
      ip: req.ip,
      origin: authorization.origin,
      expectedOrigin: authorization.expectedOrigin,
    }, `${label} WebSocket origin rejected`);
    return;
  }
  if (authorization.logType === 'auth') {
    fastify.log.warn({
      ip: req.ip,
      isAuthenticated: authorization.isAuthenticated,
      tokenValid: authorization.tokenValid,
    }, `${label} WebSocket auth rejected`);
    return;
  }
  if (authorization.logType === 'setup') {
    fastify.log.warn({ ip: req.ip }, `${label} WebSocket setup required`);
  }
}

export function terminalExitReason({ exitCode, signal, recentOutput, ageMs }) {
  const output = cleanTerminalOutput(recentOutput);
  let message = output || `Terminal exited${typeof exitCode === 'number' ? ` with code ${exitCode}` : ''}${signal ? ` (${signal})` : ''}`;

  if (output.includes("can't find session") || output.includes('no such session')) {
    message = output;
  } else if (output.includes('no sessions')) {
    message = 'tmux session does not exist or was deleted';
  } else if (output.includes('error connecting to /tmp/tmux-') || output.includes('no server running')) {
    message = 'tmux is not running or the session no longer exists';
  } else if (output.includes('command not found') || output.includes('not found')) {
    message = output;
  } else if (!output && ageMs < 2000) {
    message = 'Terminal exited immediately';
  }

  return {
    code: exitCode === 0 && ageMs >= 2000 ? 1000 : 1011,
    message: truncateCloseReason(message),
  };
}

export function cleanTerminalOutput(value) {
  return String(value || '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join(' | ')
    .trim();
}

function pruneExpired(tokens, timestamp, ttlMs) {
  for (const [token, entry] of tokens) {
    if (timestamp - entry.created > ttlMs) tokens.delete(token);
  }
}

function pruneOldest(tokens, maxTokens) {
  if (!Number.isFinite(maxTokens) || maxTokens < 1) return;
  while (tokens.size > maxTokens) {
    const oldest = tokens.keys().next().value;
    if (!oldest) return;
    tokens.delete(oldest);
  }
}

function truncateCloseReason(value) {
  const text = String(value || 'Terminal exited');
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

export function wsCloseReason(value) {
  return truncateCloseReason(value);
}

export function wsMessageByteLength(value) {
  if (typeof value === 'string') return Buffer.byteLength(value);
  if (Buffer.isBuffer(value)) return value.length;
  if (Array.isArray(value)) return value.reduce((total, part) => total + wsMessageByteLength(part), 0);
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return Buffer.byteLength(String(value || ''));
}

export function isTerminalWsMessageTooLarge(value, maxBytes = MAX_TERMINAL_WS_MESSAGE_BYTES) {
  return wsMessageByteLength(value) > maxBytes;
}

export function parseTerminalWsMessage(rawMsg) {
  const text = rawMsg?.toString?.() ?? String(rawMsg ?? '');
  if (!text.startsWith('{')) return { type: 'input', data: text };

  try {
    const msg = JSON.parse(text);
    if (msg?.type === 'resize') {
      return { type: 'resize', ...normalizeControlSize(msg) };
    }
    if (msg?.type === 'scroll') {
      const lines = normalizeTerminalScrollLines(msg.lines);
      return lines === 0 ? { type: 'noop' } : { type: 'scroll', lines };
    }
  } catch {
    // Malformed JSON beginning with "{" is still valid terminal input.
  }

  return { type: 'input', data: text };
}

export function normalizeTerminalScrollLines(value, maxLines = MAX_TERMINAL_SCROLL_LINES) {
  const lines = Number(value);
  if (!Number.isFinite(lines) || lines === 0) return 0;
  const limit = Number.isFinite(maxLines) && maxLines > 0 ? Math.floor(maxLines) : MAX_TERMINAL_SCROLL_LINES;
  const magnitude = Math.min(limit, Math.max(1, Math.floor(Math.abs(lines))));
  return lines > 0 ? magnitude : -magnitude;
}

export function createTerminalScrollScheduler(scrollFn, options = {}) {
  const flushMs = Number.isFinite(options.flushMs) && options.flushMs >= 0
    ? options.flushMs
    : TERMINAL_SCROLL_FLUSH_MS;
  const maxLines = Number.isFinite(options.maxLines) && options.maxLines > 0
    ? Math.floor(options.maxLines)
    : MAX_TERMINAL_SCROLL_LINES;
  const setTimeoutRef = options.setTimeoutRef || setTimeout;
  const clearTimeoutRef = options.clearTimeoutRef || clearTimeout;

  let pendingLines = 0;
  let timer = null;
  let inFlight = false;
  let stopped = false;

  const clamp = (lines) => normalizeTerminalScrollLines(lines, maxLines);

  async function flush() {
    timer = null;
    if (stopped || inFlight) return;

    const lines = clamp(pendingLines);
    pendingLines = 0;
    if (!lines) return;

    inFlight = true;
    try {
      await scrollFn(lines);
    } finally {
      inFlight = false;
      if (!stopped && pendingLines) schedule();
    }
  }

  function schedule() {
    if (timer || inFlight || stopped) return;
    timer = setTimeoutRef(flush, flushMs);
  }

  return {
    push(lines) {
      if (stopped) return;
      pendingLines = clamp(pendingLines + Number(lines || 0));
      if (pendingLines) schedule();
    },
    flushNow() {
      if (timer) {
        clearTimeoutRef(timer);
        timer = null;
      }
      return flush();
    },
    stop() {
      stopped = true;
      pendingLines = 0;
      if (timer) clearTimeoutRef(timer);
      timer = null;
    },
  };
}

function normalizeControlSize(msg) {
  return normalizeTerminalSize(msg);
}
