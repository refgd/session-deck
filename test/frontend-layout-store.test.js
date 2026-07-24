import test from 'node:test';
import assert from 'node:assert/strict';
import { getLeafAtPath, movePane, removePane, splitPaneAt } from '../frontend/src/lib/stores/layout.js';

test('getLeafAtPath resolves only valid leaf paths', () => {
  const layout = {
    split: 'h',
    children: [
      { session: 'main', host: 'local' },
      {
        split: 'v',
        children: [
          { session: 'api', host: 'vps' },
          { session: null, host: 'vps' },
        ],
      },
    ],
  };

  const rootLeaf = { session: 'root', host: 'local' };
  assert.deepEqual(getLeafAtPath(layout, [1, 0]), { session: 'api', host: 'vps' });
  assert.equal(getLeafAtPath(rootLeaf, []), rootLeaf);
  assert.equal(getLeafAtPath(layout, []), null);
  assert.equal(getLeafAtPath(layout, [1]), null);
  assert.equal(getLeafAtPath(layout, [2]), null);
  assert.equal(getLeafAtPath(layout, [-1]), null);
  assert.equal(getLeafAtPath(layout, ['1']), null);
  assert.equal(getLeafAtPath(layout, null), null);
});

test('movePane resolves duplicate session names by host-qualified pane id', () => {
  const layout = {
    split: 'h',
    children: [
      { session: 'main', host: 'local' },
      { session: 'main', host: 'vps' },
      { session: 'api', host: 'vps' },
    ],
  };

  const moved = movePane(layout, 'vps:main', 'vps:api', 'right');

  assert.deepEqual(moved.children.map(pane => `${pane.host}:${pane.session}`), [
    'local:main',
    'vps:api',
    'vps:main',
  ]);
  assert.deepEqual(layout.children.map(pane => `${pane.host}:${pane.session}`), [
    'local:main',
    'vps:main',
    'vps:api',
  ]);
});

test('movePane swaps duplicate session names by host-qualified pane id', () => {
  const layout = {
    split: 'h',
    children: [
      { session: 'main', host: 'local' },
      { session: 'main', host: 'vps' },
    ],
  };

  const moved = movePane(layout, 'vps:main', 'local:main', 'swap');

  assert.deepEqual(moved.children.map(pane => `${pane.host}:${pane.session}`), [
    'vps:main',
    'local:main',
  ]);
});

test('movePane keeps legacy session-name moves working', () => {
  const layout = {
    split: 'h',
    children: [
      { session: 'one', host: 'local' },
      { session: 'two', host: 'vps' },
    ],
  };

  const moved = movePane(layout, 'one', 'two', 'right');

  assert.deepEqual(moved.children.map(pane => `${pane.host}:${pane.session}`), [
    'vps:two',
    'local:one',
  ]);
});

test('removePane ignores invalid nested paths without throwing', () => {
  const layout = {
    split: 'h',
    children: [
      { session: 'main', host: 'local' },
      { session: 'api', host: 'vps' },
    ],
  };

  assert.equal(removePane(layout, [9]), layout);
  assert.equal(removePane(layout, [0, 0]), layout);
  assert.equal(removePane(layout, null), layout);
});

test('splitPaneAt ignores invalid paths and splits valid leaves', () => {
  const layout = {
    split: 'h',
    children: [
      { session: 'main', host: 'local' },
      { session: 'api', host: 'vps' },
    ],
  };

  assert.equal(splitPaneAt(layout, [9], 'h'), layout);
  assert.equal(splitPaneAt(layout, [0, 0], 'h'), layout);
  assert.equal(splitPaneAt(layout, null, 'h'), layout);

  const updated = splitPaneAt(layout, [1], 'v', null, 'reliant');
  assert.deepEqual(updated.children[1], {
    split: 'v',
    size: 1,
    children: [
      { session: 'api', host: 'vps', size: 1 },
      { session: null, host: 'reliant', size: 1 },
    ],
  });
});
