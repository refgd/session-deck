import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWorkspaces,
  loadWorkspaces,
  updatePaneSession,
  updatePaneTitle,
} from '../frontend/src/lib/stores/workspaces.js';

test('workspace pane updates ignore invalid paths without saving', async () => {
  const env = installWorkspaceStoreEnv();

  try {
    await loadWorkspaces();

    await updatePaneSession(1, [3], 'api', 'vps');
    updatePaneTitle(1, [3], 'bad');

    assert.deepEqual(getWorkspaces()[0].layout, {
      split: 'h',
      children: [
        { session: 'main', host: 'reliant' },
        { session: null, host: 'reliant' },
      ],
    });
    assert.deepEqual(env.fetches.map(entry => entry.method), ['GET']);
  } finally {
    env.restore();
  }
});

test('workspace pane updates save valid leaf paths', async () => {
  const env = installWorkspaceStoreEnv();

  try {
    await loadWorkspaces();

    await updatePaneSession(1, [1], 'api', 'vps');
    updatePaneTitle(1, [1], 'API');
    env.runPendingTimers();

    assert.deepEqual(getWorkspaces()[0].layout.children[1], {
      session: 'api',
      host: 'vps',
      paneTitle: 'API',
    });
    assert.equal(env.fetches.filter(entry => entry.method === 'PUT').length, 1);
  } finally {
    env.restore();
  }
});

function installWorkspaceStoreEnv() {
  const previousFetch = global.fetch;
  const previousSetTimeout = global.setTimeout;
  const previousClearTimeout = global.clearTimeout;
  const timers = [];
  const cleared = new Set();
  const fetches = [];

  global.fetch = async (path, init = {}) => {
    const method = init.method || 'GET';
    fetches.push({ path, method, body: init.body });
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => {
        if (method === 'GET') {
          return {
            workspaces: [{
              id: 1,
              name: 'Main',
              layout: {
                split: 'h',
                children: [
                  { session: 'main', host: 'reliant' },
                  { session: null, host: 'reliant' },
                ],
              },
            }],
          };
        }
        return {};
      },
    };
  };
  global.setTimeout = (fn, ms) => {
    const timer = { fn, ms };
    timers.push(timer);
    return timer;
  };
  global.clearTimeout = (timer) => {
    if (timer) cleared.add(timer);
  };

  return {
    fetches,
    runPendingTimers() {
      for (const timer of timers) {
        if (!cleared.has(timer)) timer.fn();
      }
    },
    restore() {
      global.fetch = previousFetch;
      global.setTimeout = previousSetTimeout;
      global.clearTimeout = previousClearTimeout;
    },
  };
}
