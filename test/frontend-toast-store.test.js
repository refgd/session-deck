import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearToasts,
  dismissToast,
  resetToastStoreForTest,
  showToast,
  subscribeToasts,
} from '../frontend/src/lib/stores/toasts.js';

test('showToast publishes toasts and auto-dismiss timers by type', () => {
  const env = installTimerEnv();
  const snapshots = [];
  const unsubscribe = subscribeToasts(toasts => snapshots.push(toasts));

  try {
    const infoId = showToast('Saved', 'success');
    const errorId = showToast('Failed', 'error');

    assert.equal(infoId, 1);
    assert.equal(errorId, 2);
    assert.deepEqual(snapshots.at(-1), [
      { id: 1, message: 'Saved', type: 'success' },
      { id: 2, message: 'Failed', type: 'error' },
    ]);
    assert.deepEqual(env.timers.map(timer => timer.ms), [3000, 8000]);

    env.runTimer(env.timers[0]);
    assert.deepEqual(snapshots.at(-1), [
      { id: 2, message: 'Failed', type: 'error' },
    ]);
  } finally {
    unsubscribe();
    resetToastStoreForTest();
    env.restore();
  }
});

test('dismissToast and clearToasts clear pending timers', () => {
  const env = installTimerEnv();
  const snapshots = [];
  const unsubscribe = subscribeToasts(toasts => snapshots.push(toasts));

  try {
    const first = showToast('One');
    showToast('Two');

    dismissToast(first);
    assert.equal(env.clearedTimers.length, 1);
    assert.deepEqual(snapshots.at(-1), [
      { id: 2, message: 'Two', type: 'info' },
    ]);

    clearToasts();
    assert.equal(env.clearedTimers.length, 2);
    assert.deepEqual(snapshots.at(-1), []);
  } finally {
    unsubscribe();
    resetToastStoreForTest();
    env.restore();
  }
});

function installTimerEnv() {
  const previousSetTimeout = global.setTimeout;
  const previousClearTimeout = global.clearTimeout;
  const timers = [];
  const clearedTimers = [];

  global.setTimeout = (fn, ms) => {
    const timer = { fn, ms, cancelled: false };
    timers.push(timer);
    return timer;
  };
  global.clearTimeout = (timer) => {
    if (timer) timer.cancelled = true;
    clearedTimers.push(timer);
  };

  return {
    timers,
    clearedTimers,
    runTimer(timer) {
      if (!timer.cancelled) timer.fn();
    },
    restore() {
      global.setTimeout = previousSetTimeout;
      global.clearTimeout = previousClearTimeout;
    },
  };
}
