import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LAYOUT_DEPTH,
  MAX_LAYOUT_JSON_BYTES,
  MAX_LAYOUT_PANES,
  countLayoutPanes,
  parseLayoutJson,
  stripLayoutSessions,
} from '../src/lib/layout-utils.js';

test('stripLayoutSessions preserves layout structure and replaces session assignments', () => {
  const layout = {
    direction: 'h',
    size: 70,
    children: [
      { session: 'main', host: 'prod', size: 40, paneTitle: 'ignored' },
      {
        direction: 'v',
        children: [
          { session: 'logs', host: 'prod' },
          { session: 'shell', host: 'dev' },
        ],
      },
    ],
  };

  assert.deepEqual(stripLayoutSessions(layout, { defaultHost: 'local' }), {
    direction: 'h',
    size: 70,
    children: [
      { session: 'pane-1', host: 'local', size: 40 },
      {
        direction: 'v',
        children: [
          { session: 'pane-2', host: 'local' },
          { session: 'pane-3', host: 'local' },
        ],
      },
    ],
  });
});

test('countLayoutPanes counts only leaf session panes', () => {
  assert.equal(countLayoutPanes(null), 0);
  assert.equal(countLayoutPanes({ session: 'main' }), 1);
  assert.equal(countLayoutPanes({
    children: [
      { session: 'one' },
      { children: [{ session: 'two' }, { note: 'not a pane' }] },
    ],
  }), 2);
});

test('parseLayoutJson accepts object JSON and rejects invalid layouts', () => {
  assert.deepEqual(parseLayoutJson('{"session":"main"}'), { session: 'main' });
  assert.throws(() => parseLayoutJson('null'), /layout_json must be a JSON object/);
  assert.throws(() => parseLayoutJson('[]'), /layout_json must be a JSON object/);
  assert.throws(() => parseLayoutJson('not json'), /Unexpected token/);
});

test('parseLayoutJson rejects oversized, too deep, and too wide layouts', () => {
  assert.throws(
    () => parseLayoutJson(JSON.stringify({ note: 'x'.repeat(MAX_LAYOUT_JSON_BYTES) })),
    Object.assign(/layout_json is too large/, { statusCode: 400 }),
  );
  assert.throws(
    () => parseLayoutJson(JSON.stringify(deepLayout(MAX_LAYOUT_DEPTH + 1))),
    Object.assign(/layout_json depth must be 32 or less/, { statusCode: 400 }),
  );
  assert.throws(
    () => parseLayoutJson(JSON.stringify({ children: Array.from({ length: MAX_LAYOUT_PANES + 1 }, (_, index) => ({ session: `pane-${index}` })) })),
    Object.assign(/layout_json children must be 16 or fewer per node/, { statusCode: 400 }),
  );
  assert.throws(
    () => parseLayoutJson(JSON.stringify(manyPanes(MAX_LAYOUT_PANES + 1))),
    Object.assign(/layout_json must contain 64 panes or fewer/, { statusCode: 400 }),
  );
});

function deepLayout(depth) {
  let node = { session: 'leaf' };
  for (let i = 0; i < depth; i++) {
    node = { children: [node] };
  }
  return node;
}

function manyPanes(count) {
  if (count <= 1) return { session: 'leaf' };
  const left = Math.floor(count / 2);
  return { children: [manyPanes(left), manyPanes(count - left)] };
}
