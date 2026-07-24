export const DIAGNOSTIC_STEP_LABELS = {
  gateway: 'Gateway',
  docker: 'Docker container',
  local: 'Local host',
  ssh: 'SSH connection',
  tmux: 'tmux',
  os: 'OS detection',
};

export function parseOsRelease(value, fallback = null) {
  const fields = parseKeyValueLines(value);
  const osId = normalizeOsId(fields.ID);
  const prettyName = stripShellQuotes(fields.PRETTY_NAME);
  return {
    osId,
    os: prettyName || osId || fallback,
  };
}

export function getInstallCommand(osId, options = {}) {
  const id = normalizeOsId(osId);
  const sudo = options.sudo === false ? '' : 'sudo ';
  const commands = {
    ubuntu: `${sudo}apt-get update && ${sudo}DEBIAN_FRONTEND=noninteractive apt-get install -y tmux`,
    debian: `${sudo}apt-get update && ${sudo}DEBIAN_FRONTEND=noninteractive apt-get install -y tmux`,
    fedora: `${sudo}dnf install -y tmux`,
    centos: `${sudo}yum install -y tmux`,
    rhel: `${sudo}yum install -y tmux`,
    arch: `${sudo}pacman -Sy --noconfirm tmux`,
    alpine: `${sudo}apk add --no-cache tmux`,
    opensuse: `${sudo}zypper install -y tmux`,
    'opensuse-leap': `${sudo}zypper install -y tmux`,
    freebsd: `${sudo}pkg install -y tmux`,
    darwin: 'brew install tmux',
  };
  return commands[id] || `# Install tmux for ${id || 'unknown'}`;
}

export function cleanHostError(err) {
  const msg = err?.stderr || err?.message || 'Connection failed';
  if (msg.includes('Connection timed out') || msg.includes('ETIMEDOUT')) return 'Connection timed out';
  if (msg.includes('Connection refused')) return 'Connection refused';
  if (msg.includes('No route to host')) return 'No route to host';
  if (msg.includes('Permission denied')) return 'Permission denied (auth failed)';
  if (msg.includes('Host key verification')) return 'Host key verification failed';
  if (msg.includes('Could not resolve hostname')) return 'Could not resolve hostname';
  return stripCommandPrefix(msg).split('\n')[0].slice(0, 120);
}

export function diagnosticStep(name, status, options = {}) {
  return {
    name,
    label: DIAGNOSTIC_STEP_LABELS[name] || name,
    status,
    ...(Number.isFinite(options.durationMs) ? { durationMs: options.durationMs } : {}),
    ...(options.error ? { error: options.error } : {}),
    ...(options.detail ? { detail: options.detail } : {}),
  };
}

export function addDiagnosticStep(result, name, status, options = {}) {
  if (!Array.isArray(result.steps)) result.steps = [];
  result.steps.push(diagnosticStep(name, status, options));
  return result.steps.at(-1);
}

function parseKeyValueLines(value) {
  const fields = {};
  for (const line of String(value || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const raw = trimmed.slice(index + 1).trim();
    fields[key] = stripShellQuotes(raw);
  }
  return fields;
}

function normalizeOsId(value) {
  return stripShellQuotes(value).trim().toLowerCase() || null;
}

function stripShellQuotes(value) {
  const text = String(value || '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function stripCommandPrefix(value) {
  return String(value || '').replace(/^Command failed:[^\n]*\n?/, '').trim();
}
