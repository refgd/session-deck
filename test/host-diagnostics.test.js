import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDiagnosticStep,
  cleanHostError,
  diagnosticStep,
  getInstallCommand,
  parseOsRelease,
} from '../src/lib/host-diagnostics.js';

test('parseOsRelease extracts normalized OS id and pretty name', () => {
  assert.deepEqual(
    parseOsRelease('NAME="Ubuntu"\nID=Ubuntu\nPRETTY_NAME="Ubuntu 24.04 LTS"\n'),
    { osId: 'ubuntu', os: 'Ubuntu 24.04 LTS' },
  );
  assert.deepEqual(
    parseOsRelease("ID='alpine'\nPRETTY_NAME='Alpine Linux'\n"),
    { osId: 'alpine', os: 'Alpine Linux' },
  );
});

test('parseOsRelease falls back when os-release is incomplete', () => {
  assert.deepEqual(parseOsRelease('', 'Linux'), { osId: null, os: 'Linux' });
  assert.deepEqual(parseOsRelease('ID=debian\n', 'Linux'), { osId: 'debian', os: 'debian' });
});

test('getInstallCommand supports common Linux distributions and sudo control', () => {
  assert.equal(
    getInstallCommand(' UBUNTU '),
    'sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y tmux',
  );
  assert.equal(
    getInstallCommand('debian', { sudo: false }),
    'apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y tmux',
  );
  assert.equal(getInstallCommand('opensuse-leap'), 'sudo zypper install -y tmux');
  assert.equal(getInstallCommand('unknown-os'), '# Install tmux for unknown-os');
});

test('cleanHostError returns short user-facing connection diagnostics', () => {
  assert.equal(cleanHostError({ message: 'connect ETIMEDOUT 10.0.0.2' }), 'Connection timed out');
  assert.equal(cleanHostError({ stderr: 'Permission denied (publickey)' }), 'Permission denied (auth failed)');
  assert.equal(cleanHostError({ stderr: 'Host key verification failed.' }), 'Host key verification failed');
  assert.equal(cleanHostError({ stderr: 'ssh: Could not resolve hostname bad: Name or service not known' }), 'Could not resolve hostname');
  assert.equal(cleanHostError({ message: 'Command failed: ssh host\nraw failure\nmore detail' }), 'raw failure');
});

test('diagnosticStep returns stable public step fields', () => {
  assert.deepEqual(diagnosticStep('ssh', 'ok', {
    durationMs: 12,
    detail: 'root@app.internal',
  }), {
    name: 'ssh',
    label: 'SSH connection',
    status: 'ok',
    durationMs: 12,
    detail: 'root@app.internal',
  });

  assert.deepEqual(diagnosticStep('custom', 'error', {
    durationMs: Number.NaN,
    error: 'failed',
  }), {
    name: 'custom',
    label: 'custom',
    status: 'error',
    error: 'failed',
  });
});

test('addDiagnosticStep appends to result steps and initializes missing arrays', () => {
  const result = {};
  const step = addDiagnosticStep(result, 'docker', 'error', { error: 'Docker failed' });

  assert.equal(step.label, 'Docker container');
  assert.deepEqual(result.steps, [{
    name: 'docker',
    label: 'Docker container',
    status: 'error',
    error: 'Docker failed',
  }]);
});
