import { isValidSessionName } from '../lib/validate.js';

export const MAX_START_DIR_LENGTH = 1024;

export function classifyTmuxError(err) {
  const msg = errorText(err);
  if (msg.includes('ETIMEDOUT') || msg.includes('timed out') || msg.includes('Connection timed out')) {
    return 'unreachable';
  }
  if (msg.includes('Connection refused') || msg.includes('No route to host')) {
    return 'unreachable';
  }
  if (msg.includes('command not found') || msg.includes('spawn tmux ENOENT')) {
    return 'no-tmux';
  }
  if (msg.includes('Permission denied')) {
    return 'auth-failed';
  }
  return 'error';
}

export function isTmuxServerNotRunning(err) {
  const msg = errorText(err);
  return msg.includes('no server running') ||
    msg.includes('no current client') ||
    msg.includes('error connecting to /tmp/tmux-') ||
    msg.includes('failed to connect to server');
}

export function cleanTmuxError(err) {
  const msg = errorText(err);
  if (msg.includes('command not found') || msg.includes('spawn tmux ENOENT')) return 'tmux is not installed on this host';
  if (isTmuxServerNotRunning(err)) return 'tmux is not running on this host';
  if (msg.includes('ETIMEDOUT') || msg.includes('timed out') || msg.includes('Connection timed out')) return 'host is unreachable (connection timed out)';
  if (msg.includes('Connection refused')) return 'connection refused';
  if (msg.includes('No route to host')) return 'host is unreachable (no route)';
  if (msg.includes('Permission denied')) return 'SSH authentication failed';
  if (msg.includes('duplicate session')) return 'session already exists';
  if (msg.includes('no such session') || msg.includes("can't find session")) return 'session not found';
  const clean = (err?.stderr || stripCommandFailedPrefix(err?.message) || 'unknown error').trim();
  return clean || 'unknown error';
}

export function tmuxErrorDiagnostics(err) {
  const diagnostics = {};
  for (const key of ['code', 'path', 'syscall', 'errno', 'signal', 'killed']) {
    if (err?.[key] !== undefined) diagnostics[key] = err[key];
  }
  if (err?.exitCode !== undefined) diagnostics.exitCode = err.exitCode;
  if (err?.cmd !== undefined) diagnostics.command = truncateDiagnostic(err.cmd);
  if (err?.stderr !== undefined) diagnostics.stderr = truncateDiagnostic(err.stderr);
  if (err?.stdout !== undefined) diagnostics.stdout = truncateDiagnostic(err.stdout);
  return diagnostics;
}

export function assertValidSessionName(name) {
  if (!name || typeof name !== 'string') {
    throw Object.assign(new Error('Session name is required'), { statusCode: 400 });
  }
  if (!isValidSessionName(name)) {
    throw Object.assign(
      new Error(`Invalid session name: "${name}". Use only letters, numbers, dots, hyphens, underscores.`),
      { statusCode: 400 },
    );
  }
}

export function normalizeStartDir(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw Object.assign(new Error('Start directory must be a string'), { statusCode: 400 });
  }

  const startDir = value.trim();
  if (!startDir) return null;
  if (Buffer.byteLength(startDir) > MAX_START_DIR_LENGTH) {
    throw Object.assign(new Error(`Start directory must be ${MAX_START_DIR_LENGTH} bytes or fewer`), { statusCode: 400 });
  }
  if (/[\u0000-\u001f\u007f]/.test(startDir)) {
    throw Object.assign(new Error('Start directory cannot contain control characters'), { statusCode: 400 });
  }
  return startDir;
}

function errorText(err) {
  return (err?.message || '') + (err?.stderr || '');
}

function stripCommandFailedPrefix(message = '') {
  return String(message).replace(/^Command failed:[^\n]*(?:\n|$)?/, '');
}

function truncateDiagnostic(value, maxLength = 4000) {
  const text = String(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}... [truncated]`;
}
