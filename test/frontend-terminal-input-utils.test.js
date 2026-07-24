import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canSendTerminalInput,
  terminalInputModeLabel,
} from '../frontend/src/lib/terminal-input-utils.js';

function t(key) {
  return {
    readOnly: 'Read-only',
    inputEnabled: 'Input enabled',
  }[key] || key;
}

test('canSendTerminalInput blocks terminal writes in read-only mode', () => {
  assert.equal(canSendTerminalInput({ readOnly: false, wsReady: true }), true);
  assert.equal(canSendTerminalInput({ readOnly: true, wsReady: true }), false);
  assert.equal(canSendTerminalInput({ readOnly: false, wsReady: false }), false);
});

test('terminalInputModeLabel maps read-only state to translated labels', () => {
  assert.equal(terminalInputModeLabel(t, true), 'Read-only');
  assert.equal(terminalInputModeLabel(t, false), 'Input enabled');
});
