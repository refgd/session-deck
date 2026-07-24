import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
  MAX_TERMINAL_COLS,
  MAX_TERMINAL_ROWS,
  MIN_TERMINAL_COLS,
  MIN_TERMINAL_ROWS,
  assertTerminalSessionName,
  normalizeTerminalSize,
  resolveTerminalHost,
  terminalId,
  terminalSpawnCommand,
} from '../src/lib/terminal-utils.js';

test('normalizeTerminalSize applies stable defaults for missing or invalid dimensions', () => {
  assert.deepEqual(normalizeTerminalSize(), {
    cols: DEFAULT_TERMINAL_COLS,
    rows: DEFAULT_TERMINAL_ROWS,
  });
  assert.deepEqual(normalizeTerminalSize({ cols: 'bad', rows: null }), {
    cols: DEFAULT_TERMINAL_COLS,
    rows: DEFAULT_TERMINAL_ROWS,
  });
});

test('normalizeTerminalSize parses strings and clamps dimensions', () => {
  assert.deepEqual(normalizeTerminalSize({ cols: '120px', rows: '40' }), {
    cols: 120,
    rows: 40,
  });
  assert.deepEqual(normalizeTerminalSize({ cols: -1, rows: 1 }), {
    cols: MIN_TERMINAL_COLS,
    rows: MIN_TERMINAL_ROWS,
  });
  assert.deepEqual(normalizeTerminalSize({ cols: 10000, rows: 10000 }), {
    cols: MAX_TERMINAL_COLS,
    rows: MAX_TERMINAL_ROWS,
  });
});

test('terminalId keeps host, session, and timestamp readable', () => {
  assert.equal(terminalId('local', 'main', 1234), 'local:main:1234');
});

test('terminalSpawnCommand attaches local or unresolved hosts with tmux directly', () => {
  const commands = commandStubs();

  assert.deepEqual(terminalSpawnCommand(null, 'main', commands), {
    command: 'tmux',
    args: ['-u', 'attach-session', '-t', 'main'],
  });
  assert.deepEqual(terminalSpawnCommand({ isLocal: true }, 'main', commands), {
    command: 'tmux',
    args: ['-u', 'attach-session', '-t', 'main'],
  });
});

test('terminalSpawnCommand rejects invalid session names before command construction', () => {
  assert.throws(
    () => terminalSpawnCommand({ isLocal: true }, 'bad/name', commandStubs()),
    Object.assign(/Invalid session name/, { statusCode: 400 })
  );
  assert.throws(
    () => assertTerminalSessionName('x'.repeat(65)),
    Object.assign(/Invalid session name/, { statusCode: 400 })
  );
});

test('terminalSpawnCommand attaches docker hosts through docker exec with UTF-8 env', () => {
  const commands = commandStubs();
  const host = { connectionType: 'docker', dockerContainer: 'app' };
  const cmd = terminalSpawnCommand(host, 'main', commands);

  assert.deepEqual(cmd, {
    command: 'docker-stub',
    args: [host, ['tmux', '-u', 'attach-session', '-t', 'main'], {
      interactive: true,
      execOptions: ['-e', 'TERM=xterm-256color', '-e', 'LANG=C.UTF-8', '-e', 'LC_ALL=C.UTF-8'],
    }],
  });
});

test('terminalSpawnCommand attaches SSH hosts through terminalAttachCommand', () => {
  const commands = commandStubs();
  const host = { connectionType: 'ssh', hostname: 'host.example' };

  assert.deepEqual(terminalSpawnCommand(host, 'main', commands), {
    command: 'ssh-stub',
    args: [host, 'main'],
  });
});

test('resolveTerminalHost treats missing and localhost names as local', () => {
  assert.deepEqual(resolveTerminalHost(''), { isLocal: true });
  assert.deepEqual(resolveTerminalHost('localhost'), { isLocal: true });
});

test('resolveTerminalHost prefers managed hosts from the database', () => {
  const managed = { name: 'prod', hostname: '10.0.0.8' };
  const found = resolveTerminalHost('prod', {
    db: {},
    findHost: (_db, hostName) => hostName === 'prod' ? managed : null,
    parseSSHConfig: () => [{ name: 'prod', hostname: 'ssh-config.example' }],
  });

  assert.equal(found, managed);
});

test('resolveTerminalHost falls back to SSH config names and aliases', () => {
  const configHost = { name: 'prod', aliases: ['prod-alias'], hostname: 'prod.example' };
  assert.equal(resolveTerminalHost('prod-alias', {
    parseSSHConfig: () => [configHost],
  }), configHost);
});

test('resolveTerminalHost recognizes the configured default host as local when hostname matches', () => {
  assert.deepEqual(resolveTerminalHost('reliant', {
    defaultHost: 'reliant',
    hostname: 'reliant-container',
  }), { isLocal: true });
});

test('resolveTerminalHost returns null for unknown remote hosts', () => {
  assert.equal(resolveTerminalHost('missing', {
    defaultHost: 'reliant',
    hostname: 'other-host',
    parseSSHConfig: () => [],
  }), null);
});

function commandStubs() {
  return {
    dockerExecCommand: (...args) => ({ command: 'docker-stub', args }),
    terminalAttachCommand: (...args) => ({ command: 'ssh-stub', args }),
  };
}
