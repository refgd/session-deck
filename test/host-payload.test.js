import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHostPayload } from '../src/lib/host-payload.js';

test('normalizeHostPayload creates an SSH host with trimmed fields and defaults', () => {
  const result = normalizeHostPayload({
    name: ' web ',
    hostname: ' 10.0.0.10 ',
    user: ' root ',
    identity_file: ' ~/.ssh/id_ed25519 ',
    group_name: '',
  });

  assert.deepEqual(result.value, {
    name: 'web',
    hostname: '10.0.0.10',
    user: 'root',
    port: 22,
    identity_file: '~/.ssh/id_ed25519',
    auth_method: 'key',
    group_name: 'Other',
    is_local: 0,
    connection_type: 'ssh',
    docker_container: null,
    gateway_host_id: null,
    enabled: 1,
  });
});

test('normalizeHostPayload creates Docker hosts from container names', () => {
  const result = normalizeHostPayload({
    name: ' app ',
    connection_type: 'docker',
    docker_container: ' sessiondeck ',
    user: 'ignored',
    identity_file: '/tmp/key',
    is_local: true,
  });

  assert.equal(result.value.hostname, 'sessiondeck');
  assert.equal(result.value.connection_type, 'docker');
  assert.equal(result.value.auth_method, 'docker');
  assert.equal(result.value.group_name, 'Docker');
  assert.equal(result.value.user, null);
  assert.equal(result.value.identity_file, null);
  assert.equal(result.value.port, 0);
  assert.equal(result.value.is_local, 0);
});

test('normalizeHostPayload validates required fields and numeric values', () => {
  assert.deepEqual(normalizeHostPayload({ name: 'missing-host' }), {
    error: 'Name and hostname are required',
  });
  assert.deepEqual(normalizeHostPayload({ name: 'bad-port', hostname: 'example.com', port: 70000 }), {
    error: 'Invalid port',
  });
  assert.deepEqual(normalizeHostPayload({ name: 'bad-gateway', hostname: 'example.com', gateway_host_id: 'abc' }), {
    error: 'Invalid gateway host',
  });
  assert.deepEqual(normalizeHostPayload({ name: 'bad-auth', hostname: 'example.com', auth_method: 'agent' }), {
    error: 'Invalid auth method',
  });
});

test('normalizeHostPayload validates host field lengths', () => {
  assert.deepEqual(normalizeHostPayload({ name: 'x'.repeat(81), hostname: 'example.com' }), {
    error: 'Host name is too long',
  });
  assert.deepEqual(normalizeHostPayload({ name: 'long-host', hostname: 'x'.repeat(254) }), {
    error: 'Hostname is too long',
  });
  assert.deepEqual(normalizeHostPayload({ name: 'long-user', hostname: 'example.com', user: 'u'.repeat(129) }), {
    error: 'Username is too long',
  });
  assert.deepEqual(normalizeHostPayload({ name: 'long-key', hostname: 'example.com', identity_file: `/keys/${'x'.repeat(4092)}` }), {
    error: 'Identity file path is too long',
  });
  assert.deepEqual(normalizeHostPayload({ name: 'long-group', hostname: 'example.com', group_name: 'g'.repeat(65) }), {
    error: 'Group name is too long',
  });
});

test('normalizeHostPayload accepts only supported SSH auth methods', () => {
  assert.equal(normalizeHostPayload({
    name: 'password-host',
    hostname: 'example.com',
    auth_method: 'password',
  }).value.auth_method, 'password');

  assert.equal(normalizeHostPayload({
    name: 'key-host',
    hostname: 'example.com',
    auth_method: 'key',
  }).value.auth_method, 'key');
});

test('normalizeHostPayload preserves existing values on partial update', () => {
  const result = normalizeHostPayload({ name: ' app2 ' }, {
    id: 2,
    name: 'app',
    hostname: '10.0.0.20',
    user: 'ubuntu',
    port: 2222,
    identity_file: '/keys/app',
    auth_method: 'key',
    group_name: 'VPS',
    is_local: 0,
    connection_type: 'ssh',
    docker_container: null,
    gateway_host_id: 1,
    enabled: 1,
  });

  assert.equal(result.value.name, 'app2');
  assert.equal(result.value.hostname, '10.0.0.20');
  assert.equal(result.value.gateway_host_id, 1);
  assert.equal(result.value.port, 2222);
});

test('normalizeHostPayload clears gateway only when explicitly empty', () => {
  const result = normalizeHostPayload({ gateway_host_id: '' }, {
    name: 'app',
    hostname: '10.0.0.20',
    port: 22,
    group_name: 'Other',
    connection_type: 'ssh',
    gateway_host_id: 1,
    enabled: 1,
  });

  assert.equal(result.value.gateway_host_id, null);
});
