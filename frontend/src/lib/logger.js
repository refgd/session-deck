function shouldLog(enabled) {
  if (enabled !== undefined) return Boolean(enabled);
  return Boolean(import.meta.env?.DEV);
}

export function logError(message, error, options = {}) {
  if (!shouldLog(options.enabled)) return;
  console.error(redactLogText(message), sanitizeLogError(error));
}

export function sanitizeLogError(error) {
  if (!error || typeof error !== 'object') return redactLogText(error);

  const out = {
    name: error.name,
    message: redactLogText(error.message),
  };

  for (const key of ['status', 'statusCode', 'code', 'syscall', 'errno', 'exitCode']) {
    if (error[key] !== undefined) out[key] = error[key];
  }
  for (const key of ['path', 'command', 'cmd', 'stderr', 'stdout']) {
    if (error[key] !== undefined) out[key] = redactLogText(error[key]);
  }
  if (error.payload && typeof error.payload === 'object') {
    out.payload = sanitizeLogObject(error.payload);
  }
  return out;
}

export function redactLogText(value) {
  return String(value ?? '').replace(/(^|[\s([{"'=])((?:~\/|\/)[^\s'"`<>|,;]+)/g, (match, prefix, path) => {
    return `${prefix}${redactPathHint(path)}`;
  });
}

function sanitizeLogObject(value) {
  if (Array.isArray(value)) return value.map(sanitizeLogObject);
  if (!value || typeof value !== 'object') return typeof value === 'string' ? redactLogText(value) : value;

  const out = {};
  for (const [key, detail] of Object.entries(value)) {
    out[key] = sanitizeLogObject(detail);
  }
  return out;
}

function redactPathHint(path) {
  const clean = String(path || '').replace(/[)\]}]+$/, '');
  const suffix = String(path || '').slice(clean.length);
  const trimmed = clean.replace(/\/+$/, '');
  const parts = trimmed.split('/').filter(Boolean);
  const base = parts.at(-1) || '';

  if (trimmed.startsWith('~/')) return `~/.../${base}${suffix}`;
  if (trimmed.startsWith('/')) return `/.../${base}${suffix}`;
  return base ? `.../${base}${suffix}` : `...${suffix}`;
}
