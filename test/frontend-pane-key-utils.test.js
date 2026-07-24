import test from 'node:test';
import assert from 'node:assert/strict';
import { paneSessionKey } from '../frontend/src/lib/pane-key-utils.js';

test('paneSessionKey normalizes host and session into a stable pane key', () => {
  assert.equal(paneSessionKey(null, 'main', 'local'), 'local:main');
  assert.equal(paneSessionKey('', 'main', 'local'), 'local:main');
  assert.equal(paneSessionKey('vps', 'main', 'local'), 'vps:main');
  assert.equal(paneSessionKey('vps', '', 'local'), null);
  assert.equal(paneSessionKey('vps', null, 'local'), null);
});
