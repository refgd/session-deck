import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discoverSessionTypeProcesses,
  localPaneCommand,
  mapHostsForSessionTypeScan,
  paneCommand,
  parsePaneCommands,
  remotePaneCommand,
} from '../src/services/session-type-scanner.js';

test('mapHostsForSessionTypeScan maps managed host rows and falls back to localhost', () => {
  assert.deepEqual(mapHostsForSessionTypeScan([]), [
    { name: 'localhost', hostname: '127.0.0.1', isLocal: true, connectionType: 'ssh' },
  ]);

  assert.deepEqual(mapHostsForSessionTypeScan([{
    id: 3,
    name: 'prod',
    hostname: 'prod.example',
    user: 'root',
    port: 2222,
    auth_method: 'key',
    group_name: 'VPS',
    identity_file: '~/keys/prod',
    connection_type: 'ssh',
    docker_container: null,
    gateway_host_id: 9,
    is_local: 0,
    enabled: 1,
  }]), [{
    id: 3,
    name: 'prod',
    hostname: 'prod.example',
    user: 'root',
    port: 2222,
    identityFile: '~/keys/prod',
    authMethod: 'key',
    group: 'VPS',
    isLocal: false,
    connectionType: 'ssh',
    dockerContainer: null,
    gatewayHostId: 9,
    enabled: true,
  }]);
});

test('mapHostsForSessionTypeScan preserves normalized hosts with attached gateways', () => {
  const gatewayHost = {
    id: 2,
    name: 'jump',
    hostname: 'jump.example',
    connectionType: 'ssh',
    isLocal: false,
  };
  const host = {
    id: 3,
    name: 'app',
    hostname: 'app.internal',
    connectionType: 'ssh',
    isLocal: false,
    gatewayHost,
  };

  assert.deepEqual(mapHostsForSessionTypeScan([host]), [host]);
});

test('parsePaneCommands trims, lowercases, and drops empty commands', () => {
  assert.deepEqual(parsePaneCommands(' Bash \n\nNODE\nzsh\n'), ['bash', 'node', 'zsh']);
});

test('pane command builders produce local and SSH scan commands', () => {
  assert.deepEqual(localPaneCommand(), {
    command: 'tmux',
    args: ['list-panes', '-a', '-F', '#{pane_current_command}'],
    timeout: 5000,
  });

  const remote = remotePaneCommand({
    hostname: 'prod.example',
    user: 'root',
    port: 2222,
    identityFile: '/keys/prod',
  });
  assert.equal(remote.command, 'ssh');
  assert.deepEqual(remote.args.slice(0, 8), [
    '-o',
    'ConnectTimeout=3',
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-i',
    '/keys/prod',
  ]);
  assert.deepEqual(remote.args.slice(8, 11), ['-p', '2222', 'root@prod.example']);
  assert.equal(remote.args.at(-1), "tmux 'list-panes' '-a' '-F' '#{pane_current_command}'");
  assert.equal(remote.timeout, 5000);
});

test('paneCommand scans Docker containers through docker exec', () => {
  assert.deepEqual(paneCommand({
    name: 'app',
    hostname: 'app',
    connectionType: 'docker',
    dockerContainer: 'app',
  }, { timeoutMs: 3000 }), {
    command: 'docker',
    args: ['exec', 'app', 'tmux', 'list-panes', '-a', '-F', '#{pane_current_command}'],
    timeout: 3000,
  });
});

test('discoverSessionTypeProcesses scans local and remote hosts best-effort', async () => {
  const calls = [];
  const execCommand = async (commandSpec) => {
    calls.push(commandSpec);
    if (commandSpec.command === 'tmux') return 'bash\nnode\n';
    if (commandSpec.args.includes('bad.example') || commandSpec.args.includes('bad')) throw new Error('unreachable');
    return 'node\npython3\n';
  };

  const discovered = await discoverSessionTypeProcesses([
    { name: 'local', hostname: '127.0.0.1', is_local: 1 },
    { name: 'prod', hostname: 'prod.example', user: 'root', is_local: 0 },
    { name: 'container', hostname: 'app', connection_type: 'docker', docker_container: 'app', is_local: 0 },
    { name: 'bad', hostname: 'bad.example', is_local: 0 },
  ], { execCommand });

  assert.deepEqual(discovered, ['bash', 'node', 'python3']);
  assert.equal(calls.length, 4);
  assert.equal(calls[0].command, 'tmux');
  assert.equal(calls[1].command, 'ssh');
  assert.equal(calls[2].command, 'docker');
  assert.equal(calls[3].command, 'ssh');
});

test('discoverSessionTypeProcesses limits concurrent remote scans', async () => {
  let activeRemote = 0;
  let maxActiveRemote = 0;
  const execCommand = async (commandSpec) => {
    if (commandSpec.command === 'tmux') return 'bash\n';
    activeRemote++;
    maxActiveRemote = Math.max(maxActiveRemote, activeRemote);
    await new Promise(resolve => setTimeout(resolve, 5));
    activeRemote--;
    return 'node\n';
  };

  const discovered = await discoverSessionTypeProcesses([
    { name: 'one', hostname: 'one.example', is_local: 0 },
    { name: 'two', hostname: 'two.example', is_local: 0 },
    { name: 'three', hostname: 'three.example', is_local: 0 },
    { name: 'four', hostname: 'four.example', is_local: 0 },
  ], { execCommand, concurrency: 2 });

  assert.deepEqual(discovered, ['bash', 'node']);
  assert.equal(maxActiveRemote <= 2, true);
});
