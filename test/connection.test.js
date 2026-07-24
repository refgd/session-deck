import test from 'node:test';
import assert from 'node:assert/strict';
import { dockerExecCommand, expandHomePath, shellJoin, sshBaseArgs, sshCommand, sshTarget, terminalAttachCommand } from '../src/services/connection.js';
import { dockerListCommand } from '../src/services/docker.js';

const sshGateway = {
  connectionType: 'ssh',
  hostname: 'gateway.example',
  user: 'ops',
  port: 2222,
  identityFile: '/keys/gateway',
};

const dockerGateway = {
  connectionType: 'docker',
  hostname: 'gateway-container',
  dockerContainer: 'gateway-container',
};

test('dockerListCommand lists local containers without a gateway', () => {
  assert.deepEqual(dockerListCommand(), {
    command: 'docker',
    args: ['ps', '--format', '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}'],
  });
});

test('dockerListCommand lists Docker containers through an SSH gateway', () => {
  const cmd = dockerListCommand(sshGateway);

  assert.equal(cmd.command, 'ssh');
  assert.deepEqual(cmd.args.slice(0, 8), [
    '-o',
    'ConnectTimeout=5',
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-i',
    '/keys/gateway',
  ]);
  assert.deepEqual(cmd.args.slice(8, 11), ['-p', '2222', 'ops@gateway.example']);
  assert.equal(cmd.args[11], shellJoin(['docker', 'ps', '--format', '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}']));
});

test('dockerExecCommand executes a target container through an SSH gateway', () => {
  const cmd = dockerExecCommand({
    connectionType: 'docker',
    hostname: 'app',
    dockerContainer: 'app',
    gatewayHost: sshGateway,
  }, ['tmux', '-V']);

  assert.equal(cmd.command, 'ssh');
  assert.equal(cmd.args.at(-2), 'ops@gateway.example');
  assert.equal(cmd.args.at(-1), shellJoin(['docker', 'exec', 'app', 'tmux', '-V']));
});

test('dockerExecCommand executes through a Docker gateway container', () => {
  const cmd = dockerExecCommand({
    connectionType: 'docker',
    hostname: 'app',
    gatewayHost: dockerGateway,
  }, ['sh', '-lc', 'echo ok']);

  assert.deepEqual(cmd, {
    command: 'docker',
    args: ['exec', 'gateway-container', 'docker', 'exec', 'app', 'sh', '-lc', 'echo ok'],
  });
});

test('sshBaseArgs uses ProxyCommand so SSH gateway identity and port are honored', () => {
  const args = sshBaseArgs({
    hostname: 'target.internal',
    user: 'root',
    identityFile: '/keys/target',
    gatewayHost: sshGateway,
  });

  assert.deepEqual(args.slice(0, 8), [
    '-o',
    'ConnectTimeout=5',
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-i',
    '/keys/target',
  ]);
  const proxyIndex = args.findIndex(arg => arg.startsWith('ProxyCommand='));
  assert.notEqual(proxyIndex, -1);
  assert.match(args[proxyIndex], /'-i' '\/keys\/gateway'/);
  assert.match(args[proxyIndex], /'-p' '2222'/);
  assert.match(args[proxyIndex], /'ops@gateway\.example'/);
});

test('sshCommand targets the final host after SSH options', () => {
  const cmd = sshCommand({
    hostname: 'target.internal',
    user: 'root',
    gatewayHost: sshGateway,
  }, 'tmux -V');

  assert.equal(cmd.command, 'ssh');
  assert.equal(cmd.args.at(-2), sshTarget({ hostname: 'target.internal', user: 'root' }));
  assert.equal(cmd.args.at(-1), 'tmux -V');
});

test('sshCommand reaches SSH targets through a Docker gateway container', () => {
  const cmd = sshCommand({
    hostname: 'target.internal',
    user: 'root',
    port: 2223,
    identityFile: '/keys/target',
    gatewayHost: dockerGateway,
  }, 'tmux -V');

  assert.equal(cmd.command, 'docker');
  assert.deepEqual(cmd.args.slice(0, 4), ['exec', '-i', 'gateway-container', 'ssh']);
  assert.deepEqual(cmd.args.slice(4, 12), [
    '-o',
    'ConnectTimeout=5',
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-i',
    '/keys/target',
  ]);
  assert.deepEqual(cmd.args.slice(12), ['-p', '2223', 'root@target.internal', 'tmux -V']);
});

test('expandHomePath only expands a leading tilde segment', () => {
  const previousHome = process.env.HOME;
  process.env.HOME = '/home/sessiondeck';
  try {
    assert.equal(expandHomePath('~'), '/home/sessiondeck');
    assert.equal(expandHomePath('~/keys/id_ed25519'), '/home/sessiondeck/keys/id_ed25519');
    assert.equal(expandHomePath('/tmp/~literal/key'), '/tmp/~literal/key');
  } finally {
    process.env.HOME = previousHome;
  }
});

test('sshBaseArgs and ProxyCommand use safe leading-tilde expansion', () => {
  const previousHome = process.env.HOME;
  process.env.HOME = '/home/sessiondeck';
  try {
    const args = sshBaseArgs({
      hostname: 'target.internal',
      user: 'root',
      identityFile: '~/target',
      gatewayHost: {
        ...sshGateway,
        identityFile: '/tmp/~literal/gateway',
      },
    });

    assert.deepEqual(args.slice(6, 8), ['-i', '/home/sessiondeck/target']);
    const proxy = args.find(arg => arg.startsWith('ProxyCommand='));
    assert.match(proxy, /'\/tmp\/~literal\/gateway'/);
  } finally {
    process.env.HOME = previousHome;
  }
});

test('terminalAttachCommand shell-quotes session names', () => {
  const cmd = terminalAttachCommand({
    hostname: 'target.internal',
    user: 'root',
  }, "main'bad");

  assert.equal(cmd.command, 'ssh');
  assert.equal(cmd.args.at(-1), "LANG=C.UTF-8 LC_ALL=C.UTF-8 tmux -u attach-session -t 'main'\\''bad'");
});
