import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import diagnosticsRoutes from '../src/routes/diagnostics.js';
import { createDiagnosticsReport, dockerSocketPaths, dockerTcpEndpoint, redactPath } from '../src/services/diagnostics.js';
import { createMemoryDb } from '../test-support/db.js';

function deps(options = {}) {
  const readable = new Set(options.readable || []);
  return {
    homedir: () => '/home/test',
    dbPath: options.dbPath || '/data/session-deck.db',
    sshConfigPath: options.sshConfigPath || '/home/test/.ssh/config',
    env: options.env || {},
    appConfig: options.appConfig || {
      host: '127.0.0.1',
      corsOrigins: [],
      trustProxy: false,
    },
    accessSync(path) {
      if (!readable.has(path)) throw new Error(`ENOENT: ${path}`);
    },
    listSshKeys: () => options.keys || [],
    loadPtyModule: () => {
      if (options.failPty) throw new Error(options.ptyError || 'Failed to load native module: pty.node');
      return { spawn() {} };
    },
    execFile: async (command) => {
      if (options.failCommands?.includes(command)) {
        throw new Error(`spawn ${command} ENOENT`);
      }
      return { stdout: command === 'tmux' ? 'tmux 3.4\n' : '27.5.1\n' };
    },
  };
}

test('createDiagnosticsReport returns ok when local dependencies and references are readable', async () => {
  const db = createMemoryDb();
  db.prepare(`
    INSERT INTO managed_hosts (name, hostname, user, identity_file)
    VALUES ('app', 'app.internal', 'root', '/keys/app')
  `).run();
  db.prepare(`
    INSERT INTO audit_events (actor, action, target_type, target_name, status)
    VALUES ('admin', 'session.create', 'session', 'main', 'ok')
  `).run();

  const report = await createDiagnosticsReport(db, deps({
    readable: ['/data', '/home/test/.ssh/config', '/keys/app'],
    keys: [{ name: 'app', path: '/keys/app' }],
  }));

  assert.equal(report.status, 'ok');
  assert.equal(report.checks.find(check => check.name === 'database').hostCount, 1);
  assert.equal(report.checks.find(check => check.name === 'dataDirectory').status, 'ok');
  assert.equal(report.checks.find(check => check.name === 'dataDirectory').path, '/.../data');
  assert.equal(report.checks.find(check => check.name === 'sshKeys').missingKeys.length, 0);
  assert.equal(report.checks.find(check => check.name === 'security').status, 'ok');
  const audit = report.checks.find(check => check.name === 'auditLog');
  assert.equal(audit.status, 'ok');
  assert.equal(audit.eventCount, 1);
  assert.deepEqual(audit.recentEvents.map(event => event.action), ['session.create']);
  assert.equal(report.checks.find(check => check.name === 'nodePty').status, 'ok');
  assert.equal(report.checks.find(check => check.name === 'tmux').version, 'tmux 3.4');
  assert.match(report.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('createDiagnosticsReport surfaces missing optional local dependencies as warnings', async () => {
  const db = createMemoryDb();
  db.prepare(`
    INSERT INTO managed_hosts (name, hostname, user, identity_file)
    VALUES ('app', 'app.internal', 'root', '/keys/missing')
  `).run();

  const report = await createDiagnosticsReport(db, deps({
    readable: ['/data'],
    failCommands: ['tmux', 'docker'],
  }));

  assert.equal(report.status, 'warning');
  assert.equal(report.checks.find(check => check.name === 'sshConfig').status, 'warning');
  assert.equal(report.checks.find(check => check.name === 'sshConfig').path, '~/.../config');
  assert.deepEqual(report.checks.find(check => check.name === 'sshKeys').missingKeys, [{
    name: 'app',
    identity_file: '/.../missing',
  }]);
  assert.equal(report.checks.find(check => check.name === 'tmux').message, 'tmux is not installed on this host');
});

test('createDiagnosticsReport surfaces deployment security warnings', async () => {
  const db = createMemoryDb();

  const report = await createDiagnosticsReport(db, deps({
    readable: ['/data', '/home/test/.ssh/config', '/var/run/docker.sock'],
    env: { DOCKER_HOST: 'unix:///var/run/docker.sock' },
    appConfig: {
      host: '0.0.0.0',
      corsOrigins: ['https://deck.example.com'],
      trustProxy: true,
      https: false,
    },
  }));
  const security = report.checks.find(check => check.name === 'security');

  assert.equal(report.status, 'warning');
  assert.equal(security.status, 'warning');
  assert.equal(security.secureCookies, false);
  assert.equal(security.httpsMode, false);
  assert.equal(security.trustProxy, true);
  assert.equal(security.corsOriginCount, 1);
  assert.deepEqual(security.securityWarnings.map(warning => warning.id), [
    'insecureCookies',
    'trustProxyEnabled',
    'dockerSocket',
  ]);
  assert.equal(security.securityWarnings.find(warning => warning.id === 'dockerSocket').path, '/.../docker.sock');
});

test('createDiagnosticsReport treats automatic HTTPS mode as deployment-safe', async () => {
  const db = createMemoryDb();

  const report = await createDiagnosticsReport(db, deps({
    readable: ['/data', '/home/test/.ssh/config'],
    appConfig: {
      host: '0.0.0.0',
      corsOrigins: [],
      trustProxy: false,
      https: 'auto',
    },
  }));
  const security = report.checks.find(check => check.name === 'security');

  assert.equal(security.status, 'ok');
  assert.equal(security.secureCookies, true);
  assert.equal(security.httpsMode, 'auto');
  assert.deepEqual(security.securityWarnings, []);
});

test('createDiagnosticsReport summarizes direct and gateway Docker hosts', async () => {
  const db = createMemoryDb();
  const gateway = db.prepare(`
    INSERT INTO managed_hosts (name, hostname, user, identity_file)
    VALUES ('jump', 'jump.internal', 'root', '/keys/jump')
  `).run();
  db.prepare(`
    INSERT INTO managed_hosts (name, hostname, connection_type, auth_method, docker_container, group_name, port)
    VALUES ('local-container', 'app', 'docker', 'docker', 'app', 'Docker', 0)
  `).run();
  db.prepare(`
    INSERT INTO managed_hosts (name, hostname, connection_type, auth_method, docker_container, group_name, port, gateway_host_id)
    VALUES ('remote-container', 'worker', 'docker', 'docker', 'worker', 'Docker', 0, ?)
  `).run(gateway.lastInsertRowid);

  const report = await createDiagnosticsReport(db, deps({
    readable: ['/data', '/home/test/.ssh/config', '/keys/jump'],
  }));
  const hosts = report.checks.find(check => check.name === 'hosts');

  assert.equal(hosts.status, 'ok');
  assert.equal(hosts.dockerHosts, 2);
  assert.equal(hosts.dockerDirectHosts, 1);
  assert.equal(hosts.dockerGatewayHosts, 1);
});

test('createDiagnosticsReport detects custom unix Docker socket paths', async () => {
  const db = createMemoryDb();

  const report = await createDiagnosticsReport(db, deps({
    readable: ['/data', '/home/test/.ssh/config', '/srv/docker/custom.sock'],
    env: { DOCKER_HOST: 'unix:///srv/docker/custom.sock' },
  }));
  const security = report.checks.find(check => check.name === 'security');
  const dockerSocket = security.securityWarnings.find(warning => warning.id === 'dockerSocket');

  assert.equal(report.status, 'warning');
  assert.equal(dockerSocket.path, '/.../custom.sock');
  assert.match(dockerSocket.message, /\/\.\.\.\/custom\.sock/);
});

test('createDiagnosticsReport warns for Docker TCP endpoints', async () => {
  const db = createMemoryDb();

  const report = await createDiagnosticsReport(db, deps({
    readable: ['/data', '/home/test/.ssh/config'],
    env: { DOCKER_HOST: 'tcp://docker.example:2375' },
  }));
  const security = report.checks.find(check => check.name === 'security');
  const dockerTcp = security.securityWarnings.find(warning => warning.id === 'dockerTcpEndpoint');

  assert.equal(report.status, 'warning');
  assert.equal(dockerTcp.endpoint, 'docker.example:2375');
  assert.equal(dockerTcp.tlsVerify, false);
  assert.match(dockerTcp.message, /without TLS verification/);
});

test('dockerSocketPaths includes default and unix DOCKER_HOST paths', () => {
  assert.deepEqual(dockerSocketPaths({}), ['/var/run/docker.sock']);
  assert.deepEqual(dockerSocketPaths({ DOCKER_HOST: 'tcp://docker.example:2375' }), ['/var/run/docker.sock']);
  assert.deepEqual(dockerSocketPaths({ DOCKER_HOST: 'unix:///srv/docker/custom.sock' }), [
    '/var/run/docker.sock',
    '/srv/docker/custom.sock',
  ]);
});

test('dockerTcpEndpoint parses TCP Docker host TLS state', () => {
  assert.equal(dockerTcpEndpoint({}), null);
  assert.equal(dockerTcpEndpoint({ DOCKER_HOST: 'unix:///var/run/docker.sock' }), null);
  assert.deepEqual(dockerTcpEndpoint({ DOCKER_HOST: 'tcp://docker.example:2375' }), {
    endpoint: 'docker.example:2375',
    tlsVerify: false,
  });
  assert.deepEqual(dockerTcpEndpoint({ DOCKER_HOST: 'tcp://docker.example:2376', DOCKER_TLS_VERIFY: '1' }), {
    endpoint: 'docker.example:2376',
    tlsVerify: true,
  });
});

test('createDiagnosticsReport reports node-pty native module load failures as errors', async () => {
  const db = createMemoryDb();

  const report = await createDiagnosticsReport(db, deps({
    readable: ['/data', '/home/test/.ssh/config'],
    failPty: true,
    ptyError: 'Failed to load native module: pty.node',
  }));
  const check = report.checks.find(entry => entry.name === 'nodePty');

  assert.equal(report.status, 'error');
  assert.equal(check.status, 'error');
  assert.match(check.message, /node-pty native module failed to load/);
  assert.match(check.message, /pty\.node/);
});

test('createDiagnosticsReport reports data directory permission errors', async () => {
  const db = createMemoryDb();

  const report = await createDiagnosticsReport(db, deps({
    readable: ['/home/test/.ssh/config'],
    dbPath: '/data/session-deck.db',
  }));
  const check = report.checks.find(entry => entry.name === 'dataDirectory');

  assert.equal(report.status, 'error');
  assert.equal(check.status, 'error');
  assert.equal(check.path, '/.../data');
  assert.match(check.message, /ENOENT: \/data/);
});

test('redactPath keeps path hints without exposing full local paths', () => {
  assert.equal(redactPath('/home/test/.ssh/id_ed25519', '/home/test'), '~/.../id_ed25519');
  assert.equal(redactPath('/var/lib/session-deck/key.pem', '/home/test'), '/.../key.pem');
  assert.equal(redactPath('relative/key.pem', '/home/test'), '.../key.pem');
  assert.equal(redactPath('', '/home/test'), '');
});

test('createDiagnosticsReport marks inconsistent host inventory as error', async () => {
  const db = createMemoryDb();
  db.prepare('PRAGMA foreign_keys = OFF').run();
  db.prepare(`
    INSERT INTO managed_hosts (name, hostname, gateway_host_id)
    VALUES ('app', 'app.internal', 999)
  `).run();

  const report = await createDiagnosticsReport(db, deps({
    readable: ['/data', '/home/test/.ssh/config'],
  }));

  assert.equal(report.status, 'error');
  assert.deepEqual(report.checks.find(check => check.name === 'hosts').gatewayMissing, [{
    id: 1,
    name: 'app',
    gatewayHostId: 999,
  }]);
});

test('createDiagnosticsReport detects gateway cycles', async () => {
  const db = createMemoryDb();
  const app = db.prepare(`
    INSERT INTO managed_hosts (name, hostname, identity_file)
    VALUES ('app', 'app.internal', '/keys/app')
  `).run();
  const jump = db.prepare(`
    INSERT INTO managed_hosts (name, hostname, identity_file, gateway_host_id)
    VALUES ('jump', 'jump.internal', '/keys/jump', ?)
  `).run(app.lastInsertRowid);
  db.prepare('UPDATE managed_hosts SET gateway_host_id = ? WHERE id = ?').run(jump.lastInsertRowid, app.lastInsertRowid);

  const report = await createDiagnosticsReport(db, deps({
    readable: ['/data', '/home/test/.ssh/config', '/keys/app', '/keys/jump'],
  }));
  const hosts = report.checks.find(check => check.name === 'hosts');

  assert.equal(report.status, 'error');
  assert.equal(hosts.status, 'error');
  assert.equal(hosts.message, 'Some hosts have gateway cycles');
  assert.deepEqual(hosts.gatewayCycles, [{
    ids: [1, 2],
    names: ['app', 'jump'],
  }]);
});

test('diagnostics route returns the report payload', async () => {
  const app = Fastify({ logger: false });
  const db = createMemoryDb();
  app.decorate('db', db);
  app.addHook('onClose', () => db.close());
  await app.register(diagnosticsRoutes);

  try {
    const response = await app.inject({ method: 'GET', url: '/api/diagnostics' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers.pragma, 'no-cache');
    const body = response.json();
    assert.ok(['ok', 'warning', 'error'].includes(body.status));
    assert.equal(Array.isArray(body.checks), true);
  } finally {
    await app.close();
  }
});

test('audit events route returns recent events with bounded limit', async () => {
  const app = Fastify({ logger: false });
  const db = createMemoryDb();
  app.decorate('db', db);
  app.addHook('onClose', () => db.close());
  await app.register(diagnosticsRoutes);

  db.prepare(`
    INSERT INTO audit_events (actor, action, target_type, target_name, status, details_json, error)
    VALUES
      ('admin', 'session.create', 'session', 'main', 'ok', '{"paneCount":1}', NULL),
      ('admin', 'managed_host.test', 'host', 'box', 'error', NULL, 'timeout')
  `).run();

  try {
    const response = await app.inject({ method: 'GET', url: '/api/audit-events?limit=1' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers.pragma, 'no-cache');
    assert.deepEqual(response.json(), {
      events: [{
        id: 2,
        actor: 'admin',
        action: 'managed_host.test',
        target_type: 'host',
        target_id: null,
        target_name: 'box',
        status: 'error',
        details: null,
        error: 'timeout',
        ip: null,
        created_at: response.json().events[0].created_at,
      }],
      limit: 1,
    });
  } finally {
    await app.close();
  }
});
