import { accessSync, constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import config from '../lib/config.js';
import { countAuditEvents, listRecentAuditEvents } from '../lib/audit-log.js';
import { cleanHostError } from '../lib/host-diagnostics.js';
import { redactPath } from '../lib/path-redaction.js';
import { listSshKeys } from './ssh-keys.js';
import { loadPtyModule } from './terminal.js';

const execFileAsync = promisify(execFile);

export { redactPath };

function item(name, status, details = {}) {
  return { name, status, ...details };
}

function worstStatus(items) {
  if (items.some(entry => entry.status === 'error')) return 'error';
  if (items.some(entry => entry.status === 'warning')) return 'warning';
  return 'ok';
}

function checkReadableFile(path, deps) {
  try {
    deps.accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function checkAccessibleFile(path, deps, mode = constants.R_OK) {
  try {
    deps.accessSync(path, mode);
    return true;
  } catch {
    return false;
  }
}

function checkDatabase(db) {
  try {
    db.prepare('SELECT 1 as ok').get();
    const hosts = db.prepare('SELECT COUNT(*) as total, SUM(enabled) as enabled FROM managed_hosts').get();
    return item('database', 'ok', {
      message: 'Database is readable',
      hostCount: hosts?.total || 0,
      enabledHostCount: hosts?.enabled || 0,
    });
  } catch (err) {
    return item('database', 'error', {
      message: cleanHostError(err),
    });
  }
}

function checkDataDirectory(deps) {
  const dir = dirname(deps.dbPath || config.dbPath);
  try {
    deps.accessSync(dir, constants.R_OK | constants.W_OK);
    return item('dataDirectory', 'ok', {
      message: 'Data directory is readable and writable',
      path: redactPath(dir, deps.homedir()),
    });
  } catch (err) {
    return item('dataDirectory', 'error', {
      message: cleanHostError(err) || 'Data directory is not readable and writable',
      path: redactPath(dir, deps.homedir()),
    });
  }
}

function checkSshConfig(deps) {
  const path = deps.sshConfigPath || join(deps.homedir(), '.ssh', 'config');
  const readable = checkReadableFile(path, deps);
  return item('sshConfig', readable ? 'ok' : 'warning', {
    message: readable ? 'SSH config is readable' : 'SSH config file is missing or not readable',
    path: redactPath(path, deps.homedir()),
  });
}

function checkSshKeys(db, deps) {
  const keys = deps.listSshKeys();
  const referenced = db.prepare(`
    SELECT name, identity_file
    FROM managed_hosts
    WHERE identity_file IS NOT NULL AND TRIM(identity_file) != ''
    ORDER BY name
  `).all();
  const missing = referenced
    .filter(host => !checkReadableFile(host.identity_file, deps))
    .map(host => ({
      name: host.name,
      identity_file: redactPath(host.identity_file, deps.homedir()),
    }));

  return item('sshKeys', missing.length ? 'warning' : 'ok', {
    message: missing.length ? 'Some configured SSH keys are missing or unreadable' : 'SSH key references are readable',
    keyCount: keys.length,
    referencedKeyCount: referenced.length,
    missingKeys: missing,
  });
}

async function checkCommand(name, command, args, deps, options = {}) {
  try {
    const { stdout } = await deps.execFile(command, args, { timeout: options.timeout || 5000 });
    return item(name, 'ok', {
      message: options.okMessage || `${name} is available`,
      version: String(stdout || '').trim().split('\n')[0] || null,
    });
  } catch (err) {
    const message = options.missingMessage && String(err?.message || '').includes(`spawn ${command} ENOENT`)
      ? options.missingMessage
      : cleanHostError(err);
    return item(name, options.optional ? 'warning' : 'error', {
      message,
    });
  }
}

function checkNodePty(deps) {
  try {
    const pty = deps.loadPtyModule();
    return item('nodePty', 'ok', {
      message: 'node-pty native module is loadable',
      version: pty?.version || null,
    });
  } catch (err) {
    return item('nodePty', 'error', {
      message: `node-pty native module failed to load: ${cleanHostError(err)}`,
    });
  }
}

function checkSecurityConfig(deps) {
  const env = deps.env || {};
  const appConfig = deps.appConfig || config;
  const warnings = [];
  const host = appConfig.host || '0.0.0.0';
  const httpsMode = appConfig.https ?? parseHttpsMode(env.SESSION_DECK_HTTPS);
  const secureCookies = httpsMode !== false;
  const publicBind = !['127.0.0.1', '::1', 'localhost'].includes(host);

  if (publicBind && httpsMode === false) {
    warnings.push({
      id: 'insecureCookies',
      message: 'HTTPS-aware cookies are disabled. Use SESSION_DECK_HTTPS=auto unless this instance is intentionally HTTP-only.',
    });
  }

  if (appConfig.trustProxy) {
    warnings.push({
      id: 'trustProxyEnabled',
      message: 'Trust proxy is enabled. Only use it behind a trusted reverse proxy.',
    });
  }

  for (const socketPath of dockerSocketPaths(env)) {
    if (checkAccessibleFile(socketPath, deps, constants.R_OK | constants.W_OK)) {
      const displayPath = redactPath(socketPath, deps.homedir());
      warnings.push({
        id: 'dockerSocket',
        path: displayPath,
        message: `Docker socket access at ${displayPath} gives authenticated users control over the Docker daemon.`,
      });
      break;
    }
  }

  const dockerEndpoint = dockerTcpEndpoint(env);
  if (dockerEndpoint) {
    warnings.push({
      id: 'dockerTcpEndpoint',
      endpoint: dockerEndpoint.endpoint,
      tlsVerify: dockerEndpoint.tlsVerify,
      message: dockerEndpoint.tlsVerify
        ? `Docker TCP endpoint ${dockerEndpoint.endpoint} is configured. Verify the Docker API is restricted to trusted clients.`
        : `Docker TCP endpoint ${dockerEndpoint.endpoint} is configured without TLS verification. This can expose Docker daemon control over the network.`,
    });
  }

  return item('security', warnings.length ? 'warning' : 'ok', {
    message: warnings.length ? 'Deployment security warnings need review' : 'Deployment security settings look conservative',
    secureCookies,
    httpsMode,
    trustProxy: !!appConfig.trustProxy,
    corsOriginCount: appConfig.corsOrigins?.length || 0,
    securityWarnings: warnings,
  });
}

function parseHttpsMode(value) {
  const text = String(value || 'auto').trim().toLowerCase();
  if (text === 'auto') return 'auto';
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return 'auto';
}

export function dockerSocketPaths(env = {}) {
  const paths = new Set(['/var/run/docker.sock']);
  const dockerHost = String(env.DOCKER_HOST || '').trim();
  if (dockerHost.startsWith('unix://')) {
    const socketPath = dockerHost.slice('unix://'.length).trim();
    if (socketPath) paths.add(socketPath);
  }
  return [...paths];
}

export function dockerTcpEndpoint(env = {}) {
  const dockerHost = String(env.DOCKER_HOST || '').trim();
  if (!dockerHost.startsWith('tcp://')) return null;
  const endpoint = dockerHost.slice('tcp://'.length).trim();
  if (!endpoint) return null;
  return {
    endpoint,
    tlsVerify: env.DOCKER_TLS_VERIFY === '1' || env.DOCKER_TLS_VERIFY === 'true',
  };
}

function detectGatewayCycles(rows) {
  const byId = new Map(rows.map(row => [row.id, row]));
  const cycles = [];
  const seenCycleKeys = new Set();

  for (const row of rows) {
    const path = [];
    const pathIndexes = new Map();
    let current = row;

    while (current?.gateway_host_id) {
      if (pathIndexes.has(current.id)) {
        const cycle = path.slice(pathIndexes.get(current.id));
        const key = cycle.map(host => host.id).sort((a, b) => a - b).join(':');
        if (!seenCycleKeys.has(key)) {
          seenCycleKeys.add(key);
          cycles.push({
            ids: cycle.map(host => host.id),
            names: cycle.map(host => host.name),
          });
        }
        break;
      }

      pathIndexes.set(current.id, path.length);
      path.push(current);
      current = byId.get(current.gateway_host_id);
    }
  }

  return cycles;
}

function checkHostInventory(db) {
  const rows = db.prepare(`
    SELECT id, name, connection_type, enabled, gateway_host_id, identity_file
    FROM managed_hosts
    ORDER BY sort_order, name
  `).all();
  const ids = new Set(rows.map(row => row.id));
  const dockerHostRows = rows.filter(row => row.connection_type === 'docker');
  const dockerHosts = dockerHostRows.length;
  const dockerGatewayHosts = dockerHostRows.filter(row => row.gateway_host_id).length;
  const dockerDirectHosts = dockerHosts - dockerGatewayHosts;
  const gatewayMissing = rows
    .filter(row => row.gateway_host_id && !ids.has(row.gateway_host_id))
    .map(row => ({ id: row.id, name: row.name, gatewayHostId: row.gateway_host_id }));
  const gatewayCycles = detectGatewayCycles(rows);
  const enabledWithoutIdentity = rows
    .filter(row => row.enabled && row.connection_type !== 'docker' && !row.identity_file)
    .map(row => ({ id: row.id, name: row.name }));

  const status = gatewayMissing.length || gatewayCycles.length ? 'error' : (enabledWithoutIdentity.length ? 'warning' : 'ok');
  return item('hosts', status, {
    message: gatewayMissing.length
      ? 'Some hosts reference missing gateways'
      : gatewayCycles.length
        ? 'Some hosts have gateway cycles'
      : enabledWithoutIdentity.length
        ? 'Some enabled SSH hosts do not specify a key'
        : 'Host inventory looks consistent',
    total: rows.length,
    enabled: rows.filter(row => row.enabled).length,
    dockerHosts,
    dockerDirectHosts,
    dockerGatewayHosts,
    gatewayMissing,
    gatewayCycles,
    enabledWithoutIdentity,
  });
}

function checkAuditLog(db) {
  try {
    const count = countAuditEvents(db);
    return item('auditLog', 'ok', {
      message: count ? 'Audit log is recording administrative actions' : 'Audit log is ready',
      eventCount: count,
      recentEvents: listRecentAuditEvents(db, 5).map(event => ({
        id: event.id,
        actor: event.actor,
        action: event.action,
        targetType: event.target_type,
        targetId: event.target_id,
        targetName: event.target_name,
        status: event.status,
        error: event.error,
        createdAt: event.created_at,
      })),
    });
  } catch (err) {
    return item('auditLog', 'warning', {
      message: `Audit log is not readable: ${cleanHostError(err)}`,
    });
  }
}

export async function createDiagnosticsReport(db, deps = {}) {
  const resolvedDeps = {
    accessSync,
    dbPath: config.dbPath,
    execFile: execFileAsync,
    homedir,
    env: process.env,
    appConfig: config,
    listSshKeys,
    loadPtyModule,
    ...deps,
  };

  const checks = [
    checkDatabase(db),
    checkDataDirectory(resolvedDeps),
    checkSshConfig(resolvedDeps),
    checkSshKeys(db, resolvedDeps),
    checkHostInventory(db),
    checkAuditLog(db),
    checkSecurityConfig(resolvedDeps),
    checkNodePty(resolvedDeps),
    await checkCommand('tmux', 'tmux', ['-V'], resolvedDeps, {
      optional: true,
      okMessage: 'Local tmux is available',
      missingMessage: 'tmux is not installed on this host',
    }),
    await checkCommand('docker', 'docker', ['version', '--format', '{{.Server.Version}}'], resolvedDeps, {
      optional: true,
      okMessage: 'Local Docker daemon is reachable',
      missingMessage: 'Docker CLI is not installed or not available',
    }),
  ];

  return {
    status: worstStatus(checks),
    generatedAt: new Date().toISOString(),
    checks,
  };
}
