export function appBasePath(locationRef = globalThis.location) {
  const configured = globalThis.__SESSION_DECK_BASE_PATH__;
  if (typeof configured === 'string') return normalizeBasePath(configured);

  const pathname = String(locationRef?.pathname || '/');
  const withoutIndex = pathname.replace(/\/index\.html$/i, '/');
  if (withoutIndex === '/' || withoutIndex === '') return '';
  return normalizeBasePath(withoutIndex.replace(/\/$/, ''));
}

export function appPath(path = '') {
  const base = appBasePath();
  const suffix = String(path || '');
  if (!suffix) return base || '/';
  if (!suffix.startsWith('/')) return `${base}/${suffix}`;
  return `${base}${suffix}`;
}

export function websocketPath(path = '') {
  const proto = globalThis.location?.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = globalThis.location?.host || '';
  return `${proto}//${host}${appPath(path)}`;
}

function normalizeBasePath(value) {
  const text = String(value || '').trim();
  if (!text || text === '/') return '';
  return `/${text.replace(/^\/+|\/+$/g, '')}`;
}
