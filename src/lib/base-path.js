export function configuredBasePath(env = process.env) {
  return normalizeBasePath(env.SESSION_DECK_BASE_PATH || '');
}

export function requestBasePath(request, env = process.env) {
  return normalizeBasePath(
    request?.headers?.['x-forwarded-prefix'] ||
    request?.headers?.['x-script-name'] ||
    env.SESSION_DECK_BASE_PATH ||
    ''
  );
}

export function externalPath(request, path, env = process.env) {
  const base = requestBasePath(request, env);
  const suffix = String(path || '/');
  return `${base}${suffix.startsWith('/') ? suffix : `/${suffix}`}` || '/';
}

function normalizeBasePath(value) {
  const text = String(value || '').trim();
  if (!text || text === '/') return '';
  return `/${text.replace(/^\/+|\/+$/g, '')}`;
}
