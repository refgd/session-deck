import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import managedHostRoutes, { sshKeyResponse } from '../src/routes/managed-hosts.js';
import { createMemoryDb } from '../test-support/db.js';

async function buildServer() {
  const app = Fastify({ logger: false });
  const db = createMemoryDb();
  app.decorate('db', db);
  app.addHook('onClose', () => db.close());
  await app.register(managedHostRoutes);
  return app;
}

function makeDbUnavailable(db) {
  db.prepare = () => {
    throw Object.assign(new Error('database unavailable'), {
      code: 'SQLITE_IOERR',
      path: '/data/session-deck.db',
    });
  };
}

test('managed host test-all route uses bounded concurrency', () => {
  const source = readFileSync(new URL('../src/routes/managed-hosts.js', import.meta.url), 'utf8');

  assert.match(source, /MANAGED_HOST_TEST_CONCURRENCY\s*=\s*4/);
  assert.match(source, /mapWithConcurrency\(\s*hosts,\s*MANAGED_HOST_TEST_CONCURRENCY/);
});

test('managed host command routes have explicit rate limits', () => {
  const source = readFileSync(new URL('../src/routes/managed-hosts.js', import.meta.url), 'utf8');

  assert.match(source, /HOST_TEST_RATE_LIMIT_MAX\s*=\s*60/);
  assert.match(source, /HOST_TEST_RATE_LIMIT_WINDOW\s*=\s*'1 minute'/);
  assert.match(source, /HOST_INSTALL_RATE_LIMIT_MAX\s*=\s*10/);
  assert.match(source, /HOST_INSTALL_RATE_LIMIT_WINDOW\s*=\s*'10 minutes'/);
  assert.match(source, /HOST_TEST_ALL_RATE_LIMIT_MAX\s*=\s*10/);
  assert.match(source, /HOST_TEST_ALL_RATE_LIMIT_WINDOW\s*=\s*'1 minute'/);
  assert.match(source, /max:\s*HOST_TEST_RATE_LIMIT_MAX,\s*timeWindow:\s*HOST_TEST_RATE_LIMIT_WINDOW/s);
  assert.match(source, /max:\s*HOST_INSTALL_RATE_LIMIT_MAX,\s*timeWindow:\s*HOST_INSTALL_RATE_LIMIT_WINDOW/s);
  assert.match(source, /max:\s*HOST_TEST_ALL_RATE_LIMIT_MAX,\s*timeWindow:\s*HOST_TEST_ALL_RATE_LIMIT_WINDOW/s);
});

test('docker container listing route has an explicit rate limit', () => {
  const source = readFileSync(new URL('../src/routes/managed-hosts.js', import.meta.url), 'utf8');

  assert.match(source, /DOCKER_CONTAINER_RATE_LIMIT_MAX\s*=\s*30/);
  assert.match(source, /DOCKER_CONTAINER_RATE_LIMIT_WINDOW\s*=\s*'1 minute'/);
  assert.match(source, /rateLimit:\s*\{\s*max:\s*DOCKER_CONTAINER_RATE_LIMIT_MAX,\s*timeWindow:\s*DOCKER_CONTAINER_RATE_LIMIT_WINDOW/s);
});

test('ssh key API responses include redacted display paths and usage', () => {
  const keyPath = join(homedir(), '.ssh', 'id_ed25519');
  const key = {
    name: 'id_ed25519',
    path: keyPath,
    source: 'ssh',
    managed: false,
  };

  assert.deepEqual(sshKeyResponse(key, [
    { id: 2, name: 'prod', identity_file: keyPath },
    { id: 3, name: 'other', identity_file: '/keys/other' },
  ]), {
    ...key,
    displayPath: '~/.../id_ed25519',
    usedByHosts: [{ id: 2, name: 'prod' }],
  });
});

test('managed host inventory read responses are not cached', async () => {
  const app = await buildServer();
  try {
    const responses = [
      await app.inject('/api/managed-hosts'),
      await app.inject('/api/managed-hosts/count'),
      await app.inject('/api/managed-hosts/999'),
      await app.inject('/api/ssh-keys'),
      await app.inject('/api/docker/containers?gateway_host_id=abc'),
    ];

    for (const response of responses) {
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers.pragma, 'no-cache');
    }
    assert.equal(responses[0].statusCode, 200);
    assert.equal(responses[1].statusCode, 200);
    assert.equal(responses[2].statusCode, 404);
    assert.equal(responses[3].statusCode, 200);
    assert.equal(responses[4].statusCode, 400);
  } finally {
    await app.close();
  }
});

test('managed host read routes expose stable database errors', async () => {
  const app = await buildServer();
  try {
    makeDbUnavailable(app.db);

    const hosts = await app.inject('/api/managed-hosts');
    assert.equal(hosts.statusCode, 500);
    assert.deepEqual(hosts.json(), {
      error: 'database unavailable',
      message: 'database unavailable',
      statusCode: 500,
      code: 'SQLITE_IOERR',
      path: '/.../session-deck.db',
    });

    const single = await app.inject('/api/managed-hosts/1');
    assert.equal(single.statusCode, 500);
    assert.equal(single.json().message, 'database unavailable');
    assert.equal(single.json().id, 1);

    const count = await app.inject('/api/managed-hosts/count');
    assert.equal(count.statusCode, 500);
    assert.equal(count.json().message, 'database unavailable');

    const keys = await app.inject('/api/ssh-keys');
    assert.equal(keys.statusCode, 500);
    assert.equal(keys.json().message, 'database unavailable');
  } finally {
    await app.close();
  }
});

test('managed host write and action routes expose stable database errors', async () => {
  const app = await buildServer();
  try {
    makeDbUnavailable(app.db);

    const create = await app.inject({
      method: 'POST',
      url: '/api/managed-hosts',
      payload: { name: 'box', hostname: '10.0.0.5', user: 'root' },
    });
    assert.equal(create.statusCode, 500);
    assert.equal(create.json().message, 'database unavailable');
    assert.equal(create.json().name, 'box');

    const update = await app.inject({
      method: 'PUT',
      url: '/api/managed-hosts/1',
      payload: { name: 'box' },
    });
    assert.equal(update.statusCode, 500);
    assert.equal(update.json().message, 'database unavailable');
    assert.equal(update.json().id, 1);

    const remove = await app.inject({
      method: 'DELETE',
      url: '/api/managed-hosts/1',
    });
    assert.equal(remove.statusCode, 500);
    assert.equal(remove.json().message, 'database unavailable');
    assert.equal(remove.json().id, 1);

    const testHost = await app.inject({
      method: 'POST',
      url: '/api/managed-hosts/1/test',
    });
    assert.equal(testHost.statusCode, 500);
    assert.equal(testHost.json().message, 'database unavailable');
    assert.equal(testHost.json().id, 1);
  } finally {
    await app.close();
  }
});

test('docker container listing rejects invalid gateway ids before probing Docker', async () => {
  const app = await buildServer();
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/docker/containers?gateway_host_id=abc',
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().message, 'Invalid gateway host');
  } finally {
    await app.close();
  }
});

test('docker container listing rejects missing gateway hosts before probing Docker', async () => {
  const app = await buildServer();
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/docker/containers?gateway_host_id=999',
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.json().message, 'Gateway host not found');
  } finally {
    await app.close();
  }
});

test('managed host id routes reject invalid ids before database lookup', async () => {
  const app = await buildServer();
  try {
    const requests = [
      { method: 'GET', url: '/api/managed-hosts/abc' },
      { method: 'PUT', url: '/api/managed-hosts/abc', payload: { name: 'box' } },
      { method: 'DELETE', url: '/api/managed-hosts/abc' },
      { method: 'POST', url: '/api/managed-hosts/abc/test' },
      { method: 'POST', url: '/api/managed-hosts/abc/install-tmux' },
    ];

    for (const request of requests) {
      const response = await app.inject(request);
      assert.equal(response.statusCode, 400);
      assert.deepEqual(response.json(), {
        error: 'id must be a positive integer',
        message: 'id must be a positive integer',
        statusCode: 400,
        id: 'abc',
      });
    }
  } finally {
    await app.close();
  }
});

test('managed host create route writes an audit event without sensitive payloads', async () => {
  const app = await buildServer();
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/managed-hosts',
      payload: {
        name: 'audited',
        hostname: '10.0.0.8',
        user: 'root',
        identity_file: '/keys/audited',
      },
    });

    assert.equal(response.statusCode, 201);
    const event = app.db.prepare('SELECT * FROM audit_events WHERE action = ?').get('managed_host.create');
    assert.equal(event.target_type, 'managed_host');
    assert.equal(event.target_name, 'audited');
    assert.equal(event.status, 'ok');
    assert.deepEqual(JSON.parse(event.details_json), {
      connectionType: 'ssh',
      gatewayHostId: null,
      enabled: true,
    });
  } finally {
    await app.close();
  }
});

test('managed host test returns structured diagnostic steps for local hosts', async () => {
  const app = await buildServer();
  try {
    const host = app.db.prepare(`
      INSERT INTO managed_hosts (name, hostname, user, group_name, is_local)
      VALUES ('local-test', 'localhost', null, 'Local', 1)
    `).run();

    const response = await app.inject({
      method: 'POST',
      url: `/api/managed-hosts/${host.lastInsertRowid}/test`,
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.status, 'ok');
    assert.ok(Array.isArray(body.steps));
    assert.ok(body.steps.some(step => step.name === 'local' && step.status === 'ok'));
    assert.ok(body.steps.some(step => step.name === 'tmux'));
    assert.ok(body.steps.every(step => step.label && step.status));

    const row = app.db.prepare('SELECT * FROM managed_hosts WHERE id = ?').get(host.lastInsertRowid);
    assert.equal(row.last_test_status, 'ok');
    assert.equal(row.last_test_error, null);
    assert.equal(row.last_test_os, body.os);
    assert.equal(row.last_test_os_id, body.osId);
    assert.equal(row.last_test_tmux_version, body.tmuxVersion);
    assert.equal(row.last_test_duration_ms, body.durationMs);
    assert.deepEqual(JSON.parse(row.last_test_steps_json), body.steps);

    const list = await app.inject('/api/managed-hosts');
    const listedHost = list.json().hosts.find(item => item.id === host.lastInsertRowid);
    assert.equal(listedHost.last_test_status, 'ok');
    assert.deepEqual(JSON.parse(listedHost.last_test_steps_json), body.steps);
  } finally {
    await app.close();
  }
});

test('managed host update preserves existing gateway when omitted', async () => {
  const app = await buildServer();
  try {
    const gateway = app.db.prepare(`
      INSERT INTO managed_hosts (name, hostname, user, group_name)
      VALUES ('gateway', '10.0.0.1', 'root', 'VPS')
    `).run();
    const target = app.db.prepare(`
      INSERT INTO managed_hosts (name, hostname, user, group_name, gateway_host_id)
      VALUES ('target', '10.0.0.2', 'root', 'VPS', ?)
    `).run(gateway.lastInsertRowid);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/managed-hosts/${target.lastInsertRowid}`,
      payload: { name: 'target-renamed' },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.name, 'target-renamed');
    assert.equal(body.gateway_host_id, gateway.lastInsertRowid);
  } finally {
    await app.close();
  }
});

test('managed host update clears gateway when explicitly empty', async () => {
  const app = await buildServer();
  try {
    const gateway = app.db.prepare(`
      INSERT INTO managed_hosts (name, hostname, user, group_name)
      VALUES ('gateway', '10.0.0.1', 'root', 'VPS')
    `).run();
    const target = app.db.prepare(`
      INSERT INTO managed_hosts (name, hostname, user, group_name, gateway_host_id)
      VALUES ('target', '10.0.0.2', 'root', 'VPS', ?)
    `).run(gateway.lastInsertRowid);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/managed-hosts/${target.lastInsertRowid}`,
      payload: { gateway_host_id: '' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().gateway_host_id, null);
  } finally {
    await app.close();
  }
});

test('managed host update rejects indirect gateway cycles', async () => {
  const app = await buildServer();
  try {
    const first = app.db.prepare(`
      INSERT INTO managed_hosts (name, hostname, user, group_name)
      VALUES ('first', '10.0.0.1', 'root', 'VPS')
    `).run();
    const second = app.db.prepare(`
      INSERT INTO managed_hosts (name, hostname, user, group_name, gateway_host_id)
      VALUES ('second', '10.0.0.2', 'root', 'VPS', ?)
    `).run(first.lastInsertRowid);
    const third = app.db.prepare(`
      INSERT INTO managed_hosts (name, hostname, user, group_name, gateway_host_id)
      VALUES ('third', '10.0.0.3', 'root', 'VPS', ?)
    `).run(second.lastInsertRowid);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/managed-hosts/${first.lastInsertRowid}`,
      payload: { gateway_host_id: third.lastInsertRowid },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().message, 'Gateway chain cannot contain a cycle');
    assert.equal(app.db.prepare('SELECT gateway_host_id FROM managed_hosts WHERE id = ?').get(first.lastInsertRowid).gateway_host_id, null);
  } finally {
    await app.close();
  }
});
