import { apiError } from './api-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const HSTS_HEADER_VALUE = 'max-age=15552000';

export function helmetOptions(config = {}) {
  return {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        upgradeInsecureRequests: config.https === true ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: config.https === true
      ? { maxAge: 15552000, includeSubDomains: false }
      : false,
  };
}

export function applyHttpsSecurityHeaders(request, reply, config = {}) {
  if (!shouldUseHttpsSecurity(request, config)) return;
  reply.header('strict-transport-security', HSTS_HEADER_VALUE);
  appendContentSecurityPolicyDirective(reply, 'upgrade-insecure-requests');
}

export function shouldUseHttpsSecurity(request, config = {}) {
  if (config.https === true) return true;
  if (config.https === false) return false;
  return request?.protocol === 'https';
}

export function corsOptionsFromConfig(config) {
  const origins = Array.isArray(config?.corsOrigins) ? config.corsOrigins : [];
  return {
    origin: origins.length > 0 ? origins : false,
  };
}

export function sameOriginWriteGuard() {
  return async function guardSameOriginWrites(request, reply) {
    const result = validateWriteOrigin(request);
    if (result.ok) return;
    request.log?.warn?.({
      origin: result.origin,
      expectedOrigin: result.expectedOrigin,
      refererOrigin: result.refererOrigin,
      secFetchSite: result.secFetchSite,
    }, 'Cross-origin write request blocked');
    return apiError(reply, 'Cross-origin write request blocked', 403);
  };
}

export function validateWriteOrigin(request) {
  const method = String(request?.method || 'GET').toUpperCase();
  if (SAFE_METHODS.has(method)) return { ok: true };

  return validateRequestOrigin(request);
}

export function validateRequestOrigin(request) {
  const origin = String(request?.headers?.origin || '').trim();
  if (!origin) return { ok: true };

  const expectedOrigin = requestExpectedOrigin(request);
  if (!expectedOrigin) return { ok: false, origin, expectedOrigin: null };
  if (origin === 'null') {
    const refererOrigin = normalizeOrigin(request?.headers?.referer || request?.headers?.referrer || '');
    const secFetchSite = String(request?.headers?.['sec-fetch-site'] || '').trim().toLowerCase();
    return {
      ok: refererOrigin === expectedOrigin ||
        isTrustedFetchSite(secFetchSite) ||
        isTrustedNullOriginAuthForm(request),
      origin,
      expectedOrigin,
      refererOrigin,
      secFetchSite: secFetchSite || null,
      path: requestPathname(request),
    };
  }

  return {
    ok: normalizeOrigin(origin) === expectedOrigin,
    origin,
    expectedOrigin,
  };
}

function requestExpectedOrigin(request) {
  const host = String(request?.headers?.host || '').trim();
  if (!host) return null;
  const protocol = request?.protocol || 'http';
  return normalizeOrigin(`${protocol}://${host}`);
}

function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isTrustedFetchSite(value) {
  return value === 'same-origin' || value === 'same-site' || value === 'none';
}

function isTrustedNullOriginAuthForm(request) {
  if (String(request?.method || '').toUpperCase() !== 'POST') return false;
  const path = requestPathname(request);
  if (path !== '/auth/login' && path !== '/auth/setup') return false;
  const contentType = String(request?.headers?.['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/x-www-form-urlencoded')) return false;
  return /(?:^|;\s*)sessionId=/.test(String(request?.headers?.cookie || ''));
}

function requestPathname(request) {
  const url = String(request?.url || '');
  try {
    return new URL(url, 'http://sessiondeck.local').pathname;
  } catch {
    return url.split('?')[0] || '';
  }
}

function appendContentSecurityPolicyDirective(reply, directive) {
  const current = reply.getHeader('content-security-policy');
  if (!current) return;
  const value = Array.isArray(current) ? current.join('; ') : String(current);
  if (value.includes(directive)) return;
  reply.header('content-security-policy', `${value}; ${directive}`);
}
