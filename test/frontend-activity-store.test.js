import test from 'node:test';
import assert from 'node:assert/strict';
import { startActivityPolling, stopActivityPolling } from '../frontend/src/lib/stores/activity.js';

test('startActivityPolling is idempotent until stopped', () => {
  const previousFetch = global.fetch;
  const previousSetInterval = global.setInterval;
  const previousClearInterval = global.clearInterval;
  const intervals = [];
  const cleared = [];

  global.fetch = async () => ({
    ok: true,
    json: async () => ({ activity: [] }),
  });
  global.setInterval = (fn, ms) => {
    const id = { fn, ms };
    intervals.push(id);
    return id;
  };
  global.clearInterval = (id) => {
    cleared.push(id);
  };

  try {
    stopActivityPolling();
    startActivityPolling();
    startActivityPolling();

    assert.equal(intervals.length, 1);
    assert.equal(intervals[0].ms, 10000);

    stopActivityPolling();
    startActivityPolling();

    assert.equal(intervals.length, 2);
    assert.deepEqual(cleared, [intervals[0]]);
  } finally {
    stopActivityPolling();
    global.fetch = previousFetch;
    global.setInterval = previousSetInterval;
    global.clearInterval = previousClearInterval;
  }
});
