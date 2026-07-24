import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closePaneLayout,
  cloneLayout,
  movePaneLayout,
  scheduleLayoutCommit,
  selectSessionTargetPane,
  splitPaneLayout,
  workspaceCreateDraft,
  workspaceNameById,
} from '../frontend/src/lib/workspace-action-utils.js';

test('splitPaneLayout adds an empty pane without mutating the source layout', () => {
  const layout = { session: 'main', host: 'local', size: 1 };
  const next = splitPaneLayout(layout, [], 'h', 'local');

  assert.deepEqual(layout, { session: 'main', host: 'local', size: 1 });
  assert.equal(next.split, 'h');
  assert.deepEqual(next.children.map(child => child.session), ['main', null]);
});

test('layout actions clone only layout fields and ignore uncloneable extras', () => {
  const layout = {
    session: 'main',
    host: 'local',
    paneTitle: 'Main',
    extra: globalThis,
  };

  assert.throws(() => structuredClone(layout.extra), /could not be cloned|DataCloneError/);
  const cloned = cloneLayout(layout);
  assert.deepEqual(cloned, {
    session: 'main',
    host: 'local',
    paneTitle: 'Main',
  });

  const next = splitPaneLayout(layout, [], 'h', 'local');
  assert.equal(next.split, 'h');
  assert.deepEqual(next.children[0], {
    session: 'main',
    host: 'local',
    size: 1,
    paneTitle: 'Main',
  });
  assert.equal(next.children[1].session, null);
  assert.equal('extra' in next.children[0], false);
});

test('closePaneLayout refuses to close the last pane and closes larger layouts', () => {
  assert.deepEqual(closePaneLayout({ session: 'main', host: 'local' }, []), {
    layout: null,
    error: 'last-pane',
  });

  const layout = {
    split: 'h',
    children: [
      { session: 'main', host: 'local' },
      { session: 'logs', host: 'local' },
    ],
  };
  const result = closePaneLayout(layout, [1]);

  assert.equal(result.error, null);
  assert.equal(result.layout.session, 'main');
  assert.equal(result.layout.host, 'local');
  assert.equal(result.layout.size, 1);
  assert.equal(layout.children.length, 2);
});

test('movePaneLayout moves panes without mutating the source layout', () => {
  const layout = {
    split: 'h',
    children: [
      { session: 'main', host: 'local' },
      { session: 'logs', host: 'local' },
    ],
  };

  const next = movePaneLayout(layout, 'main', 'logs', 'right');

  assert.equal(layout.children[0].session, 'main');
  assert.ok(next);
});

test('selectSessionTargetPane prefers pending path, then focused pane, then first pane', () => {
  const layout = {
    split: 'h',
    children: [
      { session: 'main', host: 'local' },
      { session: 'logs', host: 'box' },
      { session: null, host: 'local' },
    ],
  };

  assert.deepEqual(selectSessionTargetPane(layout, {
    pendingPath: [2],
    focusedId: 'box:logs',
    defaultHost: 'local',
  }).target.path, [2]);

  assert.deepEqual(selectSessionTargetPane(layout, {
    focusedId: 'box:logs',
    defaultHost: 'local',
  }).target.path, [1]);

  assert.deepEqual(selectSessionTargetPane(layout, { defaultHost: 'local' }).target.path, [0]);
});

test('scheduleLayoutCommit clears active state and commits through an injected scheduler', () => {
  const calls = [];
  const layout = { session: 'main', host: 'local' };
  const scheduled = [];
  const result = scheduleLayoutCommit({
    workspaceId: 7,
    layout,
    clearActive: () => calls.push(['clear']),
    restoreActive: id => calls.push(['restore', id]),
    updateLayout: (id, nextLayout) => calls.push(['update', id, nextLayout]),
    schedule: (callback, delay) => scheduled.push({ callback, delay }),
  });

  assert.equal(result, true);
  assert.deepEqual(calls, [['clear']]);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 50);

  scheduled[0].callback();
  assert.deepEqual(calls, [
    ['clear'],
    ['restore', 7],
    ['update', 7, layout],
  ]);
});

test('scheduleLayoutCommit skips incomplete commits', () => {
  const calls = [];
  assert.equal(scheduleLayoutCommit({
    workspaceId: null,
    layout: { session: 'main' },
    clearActive: () => calls.push('clear'),
  }), false);
  assert.equal(scheduleLayoutCommit({
    workspaceId: 1,
    layout: null,
    clearActive: () => calls.push('clear'),
  }), false);
  assert.deepEqual(calls, []);
});

test('workspaceCreateDraft trims names and creates one empty pane', () => {
  assert.equal(workspaceCreateDraft('   '), null);
  assert.deepEqual(workspaceCreateDraft(' Ops ', 'local'), {
    name: 'Ops',
    layout: { session: null, host: 'local', size: 1 },
  });
});

test('workspaceNameById returns workspace names with a fallback', () => {
  const workspaces = [{ id: 1, name: 'Ops' }];
  assert.equal(workspaceNameById(workspaces, 1), 'Ops');
  assert.equal(workspaceNameById(workspaces, 2), 'workspace');
  assert.equal(workspaceNameById(workspaces, 2, ''), '');
});
