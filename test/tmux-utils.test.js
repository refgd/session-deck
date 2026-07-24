import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertValidSessionName,
  classifyTmuxError,
  cleanTmuxError,
  isTmuxServerNotRunning,
  normalizeStartDir,
  tmuxErrorDiagnostics,
} from '../src/services/tmux-utils.js';

test('classifyTmuxError maps common connection and tmux failures', () => {
  assert.equal(classifyTmuxError({ message: 'Connection timed out' }), 'unreachable');
  assert.equal(classifyTmuxError({ stderr: 'No route to host' }), 'unreachable');
  assert.equal(classifyTmuxError({ message: 'spawn tmux ENOENT' }), 'no-tmux');
  assert.equal(classifyTmuxError({ stderr: 'Permission denied (publickey)' }), 'auth-failed');
  assert.equal(classifyTmuxError({ message: 'something else' }), 'error');
});

test('isTmuxServerNotRunning detects non-error empty tmux states', () => {
  assert.equal(isTmuxServerNotRunning({ stderr: 'no server running on /tmp/tmux-1000/default' }), true);
  assert.equal(isTmuxServerNotRunning({ message: 'error connecting to /tmp/tmux-0/default' }), true);
  assert.equal(isTmuxServerNotRunning({ message: 'Permission denied' }), false);
});

test('cleanTmuxError returns user-facing diagnostics', () => {
  assert.equal(cleanTmuxError({ message: 'spawn tmux ENOENT' }), 'tmux is not installed on this host');
  assert.equal(cleanTmuxError({ stderr: 'no server running on /tmp/tmux-1000/default' }), 'tmux is not running on this host');
  assert.equal(cleanTmuxError({ stderr: 'Permission denied (publickey)' }), 'SSH authentication failed');
  assert.equal(cleanTmuxError({ stderr: 'duplicate session: main' }), 'session already exists');
  assert.equal(cleanTmuxError({ stderr: 'no such session: main' }), 'session not found');
  assert.equal(cleanTmuxError({ message: 'Command failed: ssh host\nraw detail' }), 'raw detail');
  assert.equal(
    cleanTmuxError({ message: 'Command failed: tmux list-sessions -F #{session_name}| error connecting to /tmp/tmux-0/default (No such file or directory)' }),
    'tmux is not running on this host',
  );
});

test('tmuxErrorDiagnostics keeps command execution context without stacks', () => {
  const err = Object.assign(new Error('Command failed'), {
    code: 1,
    signal: null,
    cmd: 'tmux list-sessions',
    stderr: 'error connecting to /tmp/tmux-0/default',
    stdout: 'x'.repeat(5000),
  });

  const diagnostics = tmuxErrorDiagnostics(err);

  assert.equal(diagnostics.code, 1);
  assert.equal(diagnostics.signal, null);
  assert.equal(diagnostics.command, 'tmux list-sessions');
  assert.equal(diagnostics.stderr, 'error connecting to /tmp/tmux-0/default');
  assert.match(diagnostics.stdout, /\[truncated\]$/);
  assert.equal('stack' in diagnostics, false);
});

test('assertValidSessionName follows public API session name rules', () => {
  assert.doesNotThrow(() => assertValidSessionName('main.dev-1'));
  assert.throws(() => assertValidSessionName(''), /Session name is required/);
  assert.throws(() => assertValidSessionName('bad/name'), /Invalid session name/);
  assert.throws(() => assertValidSessionName('x'.repeat(65)), /Invalid session name/);
});

test('normalizeStartDir trims optional paths and rejects unsafe values', () => {
  assert.equal(normalizeStartDir(undefined), null);
  assert.equal(normalizeStartDir('  /srv/app  '), '/srv/app');
  assert.throws(
    () => normalizeStartDir(123),
    Object.assign(/Start directory must be a string/, { statusCode: 400 }),
  );
  assert.throws(
    () => normalizeStartDir(`/srv/app\nwhoami`),
    Object.assign(/Start directory cannot contain control characters/, { statusCode: 400 }),
  );
  assert.throws(
    () => normalizeStartDir('x'.repeat(1025)),
    Object.assign(/Start directory must be 1024 bytes or fewer/, { statusCode: 400 }),
  );
});
