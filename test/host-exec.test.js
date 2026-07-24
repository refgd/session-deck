import test from 'node:test';
import assert from 'node:assert/strict';
import { execCommandSpec, hostShellCommand, tmuxExecCommand } from '../src/services/host-exec.js';

const localHost = {
  name: 'local',
  isLocal: true,
  connectionType: 'ssh',
};

test('tmuxExecCommand builds local tmux commands directly', () => {
  assert.deepEqual(tmuxExecCommand(localHost, ['list-sessions', '-F', '#{session_name}'], { timeoutMs: 3000 }), {
    command: 'tmux',
    args: ['list-sessions', '-F', '#{session_name}'],
    timeout: 3000,
  });
});

test('tmuxExecCommand builds Docker tmux commands through docker exec', () => {
  assert.deepEqual(tmuxExecCommand({
    name: 'container',
    connectionType: 'docker',
    hostname: 'sessiondeck',
    dockerContainer: 'sessiondeck',
  }, ['rename-session', '-t', 'old', 'new'], { timeoutMs: 5000 }), {
    command: 'docker',
    args: ['exec', 'sessiondeck', 'tmux', 'rename-session', '-t', 'old', 'new'],
    timeout: 5000,
  });
});

test('tmuxExecCommand builds SSH tmux commands through configured gateways', () => {
  const cmd = tmuxExecCommand({
    name: 'target',
    connectionType: 'ssh',
    hostname: 'target.internal',
    user: 'root',
    gatewayHost: {
      connectionType: 'docker',
      hostname: 'gateway-container',
      dockerContainer: 'gateway-container',
    },
  }, ['new-session', '-d', '-s', "main'one"], { timeoutMs: 5000 });

  assert.equal(cmd.command, 'docker');
  assert.deepEqual(cmd.args.slice(0, 4), ['exec', '-i', 'gateway-container', 'ssh']);
  assert.equal(cmd.args.at(-2), 'root@target.internal');
  assert.equal(cmd.args.at(-1), "tmux 'new-session' '-d' '-s' 'main'\\''one'");
  assert.equal(cmd.timeout, 7000);
});

test('hostShellCommand builds local shell commands directly', () => {
  assert.deepEqual(hostShellCommand(localHost, 'pwd', { timeoutMs: 2000 }), {
    command: 'sh',
    args: ['-lc', 'pwd'],
    timeout: 2000,
  });
});

test('hostShellCommand builds Docker shell commands through docker exec', () => {
  assert.deepEqual(hostShellCommand({
    name: 'container',
    connectionType: 'docker',
    hostname: 'sessiondeck',
    dockerContainer: 'sessiondeck',
  }, 'pwd', { timeoutMs: 2000 }), {
    command: 'docker',
    args: ['exec', 'sessiondeck', 'sh', '-lc', 'pwd'],
    timeout: 2000,
  });
});

test('hostShellCommand builds SSH shell commands through configured gateways', () => {
  const cmd = hostShellCommand({
    name: 'target',
    connectionType: 'ssh',
    hostname: 'target.internal',
    user: 'root',
    gatewayHost: {
      connectionType: 'docker',
      hostname: 'gateway-container',
      dockerContainer: 'gateway-container',
    },
  }, 'pwd', { timeoutMs: 3000 });

  assert.equal(cmd.command, 'docker');
  assert.deepEqual(cmd.args.slice(0, 4), ['exec', '-i', 'gateway-container', 'ssh']);
  assert.equal(cmd.args.at(-2), 'root@target.internal');
  assert.equal(cmd.args.at(-1), 'pwd');
  assert.equal(cmd.timeout, 5000);
});

test('execCommandSpec runs command specs and returns stdout', async () => {
  const stdout = await execCommandSpec({
    command: process.execPath,
    args: ['-e', 'process.stdout.write("ok")'],
    timeout: 3000,
  });

  assert.equal(stdout, 'ok');
});
