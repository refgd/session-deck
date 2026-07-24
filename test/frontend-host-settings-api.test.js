import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createManagedHost,
  deleteManagedHost,
  deleteSshKey,
  dockerContainersPath,
  installTmuxOnManagedHost,
  loadDockerContainers,
  loadDockerContainersResult,
  loadManagedHosts,
  loadSshKeys,
  managedHostCount,
  saveSshKey,
  testAllManagedHosts,
  testManagedHost,
  updateManagedHost,
} from '../frontend/src/lib/host-settings-api.js';

test('host settings API list helpers return arrays with stable defaults', async () => {
  assert.deepEqual(await loadManagedHosts({ api: async () => ({ hosts: [{ name: 'app' }] }) }), [{ name: 'app' }]);
  assert.deepEqual(await loadManagedHosts({ api: async () => ({}) }), []);
  assert.deepEqual(await loadSshKeys({ api: async () => ({ keys: [{ name: 'deploy' }] }) }), [{ name: 'deploy' }]);
  assert.deepEqual(await loadSshKeys({ api: async () => ({}) }), []);
});

test('host settings API writes expected managed host payloads', async () => {
  const calls = [];
  const api = async (path, options) => calls.push({ path, options });
  const host = { name: 'app', hostname: 'app.internal' };

  await createManagedHost(host, { api });
  await updateManagedHost('host/name', host, { api });

  assert.deepEqual(calls, [
    {
      path: '/api/managed-hosts',
      options: { method: 'POST', body: host },
    },
    {
      path: '/api/managed-hosts/host%2Fname',
      options: { method: 'PUT', body: host },
    },
  ]);
});

test('host settings API encodes SSH key and host action identifiers', async () => {
  const calls = [];
  const api = async (path, options) => {
    calls.push({ path, options });
    return { name: 'deleted' };
  };

  await saveSshKey({ name: 'deploy key' }, { api });
  await deleteSshKey('deploy/key', { api });
  await deleteManagedHost('host/name', { api });
  await testManagedHost('host/name', { api });
  await installTmuxOnManagedHost('host/name', { api });

  assert.deepEqual(calls, [
    { path: '/api/ssh-keys', options: { method: 'POST', body: { name: 'deploy key' } } },
    { path: '/api/ssh-keys/deploy%2Fkey', options: { method: 'DELETE' } },
    { path: '/api/managed-hosts/host%2Fname', options: { method: 'DELETE' } },
    { path: '/api/managed-hosts/host%2Fname/test', options: { method: 'POST' } },
    { path: '/api/managed-hosts/host%2Fname/install-tmux', options: { method: 'POST' } },
  ]);
});

test('docker container discovery preserves direct and gateway paths', async () => {
  assert.equal(dockerContainersPath(), '/api/docker/containers');
  assert.equal(dockerContainersPath('jump host'), '/api/docker/containers?gateway_host_id=jump%20host');

  const calls = [];
  const containers = await loadDockerContainers('jump host', {
    api: async (path) => {
      calls.push(path);
      return {
        containers: ['app'],
        context: { scope: 'gateway', gatewayType: 'ssh', gatewayName: 'jump' },
      };
    },
  });

  assert.deepEqual(containers, ['app']);
  assert.deepEqual(calls, ['/api/docker/containers?gateway_host_id=jump%20host']);

  assert.deepEqual(await loadDockerContainersResult('', {
    api: async () => ({
      containers: ['local-app'],
      context: { scope: 'local', operation: 'docker ps' },
    }),
  }), {
    containers: ['local-app'],
    context: { scope: 'local', operation: 'docker ps' },
  });
});

test('managed host count and test-all wrappers normalize small API shapes', async () => {
  assert.equal(await managedHostCount({ api: async () => ({ count: '3' }) }), 3);
  assert.equal(await managedHostCount({ api: async () => ({ count: 'bad' }) }), 0);

  const calls = [];
  await testAllManagedHosts({
    api: async (path, options) => {
      calls.push({ path, options });
      return { tested: 0, results: [] };
    },
  });

  assert.deepEqual(calls, [{
    path: '/api/managed-hosts/test-all',
    options: { method: 'POST' },
  }]);
});
