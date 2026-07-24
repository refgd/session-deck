// src/lib/config.js — Centralized configuration from environment variables

const config = {
  port: parseInt(process.env.SESSION_DECK_PORT || '7890', 10),
  host: process.env.SESSION_DECK_HOST || '0.0.0.0',
  logLevel: process.env.SESSION_DECK_LOG_LEVEL || 'info',
  dbPath: process.env.SESSION_DECK_DB_PATH || './data/session-deck.db',

  // Auth configuration
  auth: {
    // Optional one-time bootstrap account. If no DB user exists, these values
    // create the first admin automatically; otherwise first launch shows setup.
    bootstrapUser: process.env.SESSION_DECK_AUTH_USER || '',
    bootstrapPass: process.env.SESSION_DECK_AUTH_PASS || '',

    // Session. If omitted, auth.js generates a persistent random secret under
    // the data directory on first start.
    sessionSecret: process.env.SESSION_DECK_SESSION_SECRET || '',
    sessionMaxAge: parseInt(process.env.SESSION_DECK_SESSION_MAX_AGE || '86400', 10), // 24h default
  },
};

// Validate at import time — fail fast
if (isNaN(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error(`Invalid port: ${process.env.SESSION_DECK_PORT}`);
}

const validLogLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
if (!validLogLevels.includes(config.logLevel)) {
  throw new Error(`Invalid log level: ${config.logLevel}. Must be one of: ${validLogLevels.join(', ')}`);
}

if ((config.auth.bootstrapUser && !config.auth.bootstrapPass) || (!config.auth.bootstrapUser && config.auth.bootstrapPass)) {
  throw new Error('SESSION_DECK_AUTH_USER and SESSION_DECK_AUTH_PASS must be set together');
}

if (config.auth.sessionSecret && config.auth.sessionSecret.length < 32) {
  throw new Error('SESSION_DECK_SESSION_SECRET must be at least 32 characters');
}

export default config;
