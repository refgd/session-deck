import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPTURE_TRUNCATION_NOTICE,
  captureSession,
  createSession,
  deleteSession,
  gitRepoRootCommand,
  renameSession,
  scrollSession,
  sendLinesToSession,
  truncateCaptureText,
} from '../src/services/tmux.js';

const host = {
  name: 'local',
  isLocal: true,
  connectionType: 'ssh',
};

test('gitRepoRootCommand shell-quotes working directories', () => {
  assert.equal(
    gitRepoRootCommand("/srv/app's/main"),
    "cd '/srv/app'\\''s/main' && git rev-parse --show-toplevel 2>/dev/null"
  );
});

test('tmux mutation helpers reject invalid existing session names before execution', async () => {
  await assert.rejects(
    () => renameSession(host, 'bad/name', 'good-name'),
    Object.assign(/Invalid session name/, { statusCode: 400 })
  );

  await assert.rejects(
    () => deleteSession(host, 'bad/name'),
    Object.assign(/Invalid session name/, { statusCode: 400 })
  );
});

test('tmux create rejects invalid start directories before execution', async () => {
  await assert.rejects(
    () => createSession(host, 'main', `/tmp/app\nwhoami`),
    Object.assign(/Start directory cannot contain control characters/, { statusCode: 400 })
  );

  await assert.rejects(
    () => createSession(host, 'main', 'x'.repeat(1025)),
    Object.assign(/Start directory must be 1024 bytes or fewer/, { statusCode: 400 })
  );
});

test('tmux scroll and capture reject invalid session names before execution', async () => {
  await assert.rejects(
    () => scrollSession(host, 'bad/name', -20),
    Object.assign(/Invalid session name/, { statusCode: 400 })
  );

  await assert.rejects(
    () => captureSession(host, 'bad/name'),
    Object.assign(/Invalid session name/, { statusCode: 400 })
  );
});

test('tmux send-lines rejects invalid session names before execution', async () => {
  await assert.rejects(
    () => sendLinesToSession(host, 'bad/name', ['echo ok'], { delayMs: 0 }),
    Object.assign(/Invalid session name/, { statusCode: 400 })
  );
});

test('truncateCaptureText caps capture output and appends a clear notice', () => {
  const small = 'short capture';
  assert.equal(truncateCaptureText(small, 100), small);

  const truncated = truncateCaptureText('x'.repeat(120), 100);
  assert.equal(Buffer.byteLength(truncated) <= 100, true);
  assert.equal(truncated.endsWith(CAPTURE_TRUNCATION_NOTICE), true);
});

test('truncateCaptureText preserves UTF-8 character boundaries', () => {
  const truncated = truncateCaptureText('你好'.repeat(50), 100);

  assert.equal(Buffer.byteLength(truncated) <= 100, true);
  assert.equal(truncated.includes('\uFFFD'), false);
  assert.equal(truncated.endsWith(CAPTURE_TRUNCATION_NOTICE), true);
});
