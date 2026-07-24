import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import assert from 'node:assert/strict';
import { listRunningContainers, dockerListContext } from '../src/services/docker.js';
import { testHost } from '../src/services/managed-host-diagnostics.js';
import {
  captureSession,
  createSession,
  deleteSession,
  listSessions,
  sendLinesToSession,
} from '../src/services/tmux.js';

const execFileAsync = promisify(execFile);
const runIntegration = process.env.SESSION_DECK_RUN_INTEGRATION === '1';
const integrationSkip = runIntegration
  ? false
  : 'Set SESSION_DECK_RUN_INTEGRATION=1 to run real tmux/Docker/SSH integration checks';

const localHost = {
  name: 'local',
  isLocal: true,
  connectionType: 'ssh',
};

test('real local tmux session lifecycle works end-to-end', { skip: integrationSkip }, async () => {
  await execFileAsync('tmux', ['-V'], { timeout: 3000 });

  const sessionName = `sd-it-${Date.now()}`;
  try {
    const created = await createSession(localHost, sessionName);
    assert.deepEqual(created, { success: true, host: 'local', session: sessionName });

    await sendLinesToSession(localHost, sessionName, ['printf session-deck-integration'], {
      delayMs: 0,
      timeout: 3000,
    });
    await new Promise(resolve => setTimeout(resolve, 250));

    const listed = await listSessions(localHost, { timeout: 5000 });
    assert.equal(listed.status, 'online');
    assert.ok(listed.sessions.some(session => session.name === sessionName));

    const capture = await captureSession(localHost, sessionName);
    assert.match(capture, /session-deck-integration/);
  } finally {
    await deleteSession(localHost, sessionName).catch(() => {});
  }
});

test('real Docker container discovery can query the local Docker daemon', {
  skip: runIntegration && process.env.SESSION_DECK_INTEGRATION_DOCKER === '1'
    ? false
    : 'Set SESSION_DECK_RUN_INTEGRATION=1 and SESSION_DECK_INTEGRATION_DOCKER=1 to query real Docker',
}, async () => {
  const containers = await listRunningContainers();
  assert.equal(Array.isArray(containers), true);
  assert.deepEqual(dockerListContext(), { scope: 'local', operation: 'docker ps' });
});

test('real SSH host diagnostics can reach a configured host', {
  skip: runIntegration && process.env.SESSION_DECK_INTEGRATION_SSH_HOST
    ? false
    : 'Set SESSION_DECK_RUN_INTEGRATION=1 and SESSION_DECK_INTEGRATION_SSH_HOST to test real SSH',
}, async () => {
  const host = {
    name: process.env.SESSION_DECK_INTEGRATION_SSH_HOST,
    hostname: process.env.SESSION_DECK_INTEGRATION_SSH_HOST,
    user: process.env.SESSION_DECK_INTEGRATION_SSH_USER || undefined,
    port: process.env.SESSION_DECK_INTEGRATION_SSH_PORT
      ? Number(process.env.SESSION_DECK_INTEGRATION_SSH_PORT)
      : 22,
    identityFile: process.env.SESSION_DECK_INTEGRATION_SSH_KEY || undefined,
    connectionType: 'ssh',
  };

  const result = await testHost(host);
  assert.equal(result.status, 'ok', result.error || 'SSH host should be reachable');
  assert.ok(result.steps.some(step => step.name === 'ssh' && step.status === 'ok'));
});
