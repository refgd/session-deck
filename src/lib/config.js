// src/lib/config.js — Centralized configuration from environment variables

const validLogLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
export const DEFAULT_BODY_LIMIT = 1024 * 1024;
export const MIN_BODY_LIMIT = 1024;
export const MAX_BODY_LIMIT = 10 * 1024 * 1024;

export function createConfig(env = process.env) {
  const config = {
    port: parseIntegerEnv(env.SESSION_DECK_PORT, 7890),
    host: env.SESSION_DECK_HOST || '0.0.0.0',
    logLevel: env.SESSION_DECK_LOG_LEVEL || 'info',
    dbPath: env.SESSION_DECK_DB_PATH || './data/session-deck.db',
    basePath: parseBasePath(env.SESSION_DECK_BASE_PATH || ''),
    bodyLimit: parseIntegerEnv(env.SESSION_DECK_BODY_LIMIT, DEFAULT_BODY_LIMIT),
    corsOrigins: parseCorsOrigins(env.SESSION_DECK_CORS_ORIGINS || ''),
    trustProxy: parseBooleanEnv(env.SESSION_DECK_TRUST_PROXY, false),
    https: parseHttpsMode(env.SESSION_DECK_HTTPS),

    // Auth configuration
    auth: {
      // Optional one-time bootstrap account. If no DB user exists, these values
      // create the first admin automatically; otherwise first launch shows setup.
      bootstrapUser: env.SESSION_DECK_AUTH_USER || '',
      bootstrapPass: env.SESSION_DECK_AUTH_PASS || '',

      // Session. If omitted, auth.js generates a persistent random secret under
      // the data directory on first start.
      sessionSecret: env.SESSION_DECK_SESSION_SECRET || '',
      sessionMaxAge: parseIntegerEnv(env.SESSION_DECK_SESSION_MAX_AGE, 86400), // 24h default
    },
  };

  validateConfig(config, env);
  return config;
}

function validateConfig(config, env = process.env) {
  if (Number.isNaN(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid port: ${env.SESSION_DECK_PORT}`);
  }

  if (!validLogLevels.includes(config.logLevel)) {
    throw new Error(`Invalid log level: ${config.logLevel}. Must be one of: ${validLogLevels.join(', ')}`);
  }

  if (Number.isNaN(config.bodyLimit) || config.bodyLimit < MIN_BODY_LIMIT || config.bodyLimit > MAX_BODY_LIMIT) {
    throw new Error(`SESSION_DECK_BODY_LIMIT must be between ${MIN_BODY_LIMIT} and ${MAX_BODY_LIMIT} bytes`);
  }

  if (Number.isNaN(config.trustProxy)) {
    throw new Error(`Invalid SESSION_DECK_TRUST_PROXY: ${env.SESSION_DECK_TRUST_PROXY}`);
  }

  if (!['auto', true, false].includes(config.https)) {
    throw new Error(`Invalid SESSION_DECK_HTTPS: ${env.SESSION_DECK_HTTPS}`);
  }

  if (config.basePath === null) {
    throw new Error(`Invalid SESSION_DECK_BASE_PATH: ${env.SESSION_DECK_BASE_PATH}`);
  }

  if ((config.auth.bootstrapUser && !config.auth.bootstrapPass) || (!config.auth.bootstrapUser && config.auth.bootstrapPass)) {
    throw new Error('SESSION_DECK_AUTH_USER and SESSION_DECK_AUTH_PASS must be set together');
  }

  if (config.auth.sessionSecret && config.auth.sessionSecret.length < 32) {
    throw new Error('SESSION_DECK_SESSION_SECRET must be at least 32 characters');
  }

  if (Number.isNaN(config.auth.sessionMaxAge) || config.auth.sessionMaxAge < 60) {
    throw new Error('SESSION_DECK_SESSION_MAX_AGE must be at least 60 seconds');
  }

  for (const origin of config.corsOrigins) {
    if (!isValidCorsOrigin(origin)) {
      throw new Error(`Invalid SESSION_DECK_CORS_ORIGINS origin: ${origin}`);
    }
  }
}

function parseBooleanEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return NaN;
}

function parseHttpsMode(value) {
  if (value === undefined || value === null || value === '') return 'auto';
  const text = String(value).trim().toLowerCase();
  if (text === 'auto') return 'auto';
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return null;
}

function parseBasePath(value) {
  const text = String(value || '').trim();
  if (!text || text === '/') return '';
  if (!/^\/[A-Za-z0-9._~/-]*$/.test(text)) return null;
  return `/${text.replace(/^\/+|\/+$/g, '')}`;
}

function parseCorsOrigins(value) {
  return String(value || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

function parseIntegerEnv(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return NaN;
  return Number(text);
}

function isValidCorsOrigin(origin) {
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol) &&
      url.origin === origin &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash;
  } catch {
    return false;
  }
}

const config = createConfig();

export default config;
