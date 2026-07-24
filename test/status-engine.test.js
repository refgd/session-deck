import test from 'node:test';
import assert from 'node:assert/strict';
import { StatusEngine } from '../src/services/status-engine.js';

test('StatusEngine caps tracked panes and evicts oldest entries', () => {
  const engine = new StatusEngine({ maxPanes: 2 });

  engine.register('pane-1', 'local', 'one');
  engine.register('pane-2', 'local', 'two');
  engine.register('pane-3', 'local', 'three');

  assert.deepEqual(engine.getAll().map(pane => pane.ptyId), ['pane-2', 'pane-3']);
  assert.equal(engine.get('pane-1'), null);
});

test('StatusEngine duplicate register clears stale idle timers', () => {
  const previousSetTimeout = global.setTimeout;
  const previousClearTimeout = global.clearTimeout;
  const timers = [];
  const cleared = [];

  global.setTimeout = (fn, ms) => {
    const timer = { fn, ms };
    timers.push(timer);
    return timer;
  };
  global.clearTimeout = (timer) => {
    cleared.push(timer);
  };

  try {
    const engine = new StatusEngine({ maxPanes: 10 });
    engine.register('pane-1', 'local', 'one');
    engine.feed('pane-1', 'this is enough meaningful output to start an idle timer');

    assert.equal(timers.length, 1);
    engine.register('pane-1', 'local', 'one-again');

    assert.deepEqual(cleared, [timers[0]]);
    assert.equal(engine.get('pane-1').session, 'one-again');
  } finally {
    global.setTimeout = previousSetTimeout;
    global.clearTimeout = previousClearTimeout;
  }
});

test('StatusEngine classifies Codex running output as working', () => {
  const engine = new StatusEngine({ maxPanes: 10 });
  engine.register('pane-codex', 'local', 'codex');

  engine.feed('pane-codex', 'Codex is running command: npm test\n');

  assert.equal(engine.get('pane-codex').status, 'working');
});

test('StatusEngine classifies Codex approval prompts as asking', () => {
  const engine = new StatusEngine({ maxPanes: 10 });
  engine.register('pane-codex', 'local', 'codex');

  engine.feed('pane-codex', 'Codex requires your approval to run this command.\nAllow command or deny?\n');

  assert.equal(engine.get('pane-codex').status, 'asking');
});

test('StatusEngine treats Codex input prompt as completion after work', () => {
  const engine = new StatusEngine({ maxPanes: 10 });
  engine.register('pane-codex', 'local', 'codex');

  engine.feed('pane-codex', 'Codex is applying patch to frontend files\n');
  engine.feed('pane-codex', '\n› Message Codex\n');

  assert.equal(engine.get('pane-codex').status, 'done');
});
