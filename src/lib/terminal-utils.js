export const DEFAULT_TERMINAL_COLS = 80;
export const DEFAULT_TERMINAL_ROWS = 24;
export const MIN_TERMINAL_COLS = 20;
export const MIN_TERMINAL_ROWS = 5;
export const MAX_TERMINAL_COLS = 300;
export const MAX_TERMINAL_ROWS = 120;
const SESSION_NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

export function normalizeTerminalSize(input = {}) {
  return {
    cols: normalizeDimension(input.cols, DEFAULT_TERMINAL_COLS, MIN_TERMINAL_COLS, MAX_TERMINAL_COLS),
    rows: normalizeDimension(input.rows, DEFAULT_TERMINAL_ROWS, MIN_TERMINAL_ROWS, MAX_TERMINAL_ROWS),
  };
}

export function terminalId(hostName, sessionName, timestamp = Date.now()) {
  return `${hostName}:${sessionName}:${timestamp}`;
}

export function terminalSpawnCommand(host, sessionName, commands) {
  assertTerminalSessionName(sessionName);

  if (host?.connectionType === 'docker') {
    return commands.dockerExecCommand(host, [
      'tmux',
      '-u',
      'attach-session',
      '-t',
      sessionName,
    ], {
      interactive: true,
      execOptions: ['-e', 'TERM=xterm-256color', '-e', 'LANG=C.UTF-8', '-e', 'LC_ALL=C.UTF-8'],
    });
  }

  if (!host || host.isLocal) {
    return { command: 'tmux', args: ['-u', 'attach-session', '-t', sessionName] };
  }

  return commands.terminalAttachCommand(host, sessionName);
}

export function assertTerminalSessionName(sessionName) {
  if (typeof sessionName !== 'string' || !SESSION_NAME_RE.test(sessionName)) {
    throw Object.assign(
      new Error('Invalid session name. Use only letters, digits, hyphens, underscores, and dots.'),
      { statusCode: 400 }
    );
  }
}

export function resolveTerminalHost(hostName, options = {}) {
  const {
    defaultHost,
    db = null,
    findHost = () => null,
    parseSSHConfig = () => [],
    hostname = '',
  } = options;

  if (!hostName || hostName === 'localhost') {
    return { isLocal: true };
  }

  if (db) {
    const managed = findHost(db, hostName);
    if (managed) return managed;
  }

  const hosts = parseSSHConfig();
  const found = hosts.find(h => h.name === hostName || h.aliases?.includes(hostName));
  if (found) return found;

  if (hostName === defaultHost && hostname.includes(defaultHost)) {
    return { isLocal: true };
  }

  return null;
}

function normalizeDimension(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
