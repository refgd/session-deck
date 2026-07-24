import test from 'node:test';
import assert from 'node:assert/strict';
import { setupErrorMessage, setupImportResult } from '../frontend/src/lib/setup-utils.js';

test('setupImportResult advances after imported hosts and explains empty imports', () => {
  assert.deepEqual(setupImportResult({ imported: 3 }), {
    nextStep: 2,
    toastType: 'success',
    message: 'Imported 3 hosts from SSH config',
  });
  assert.deepEqual(setupImportResult({ imported: 0 }), {
    nextStep: null,
    toastType: 'info',
    message: 'No hosts found in SSH config. Add hosts manually.',
  });
});

test('setupErrorMessage keeps setup failures concise', () => {
  assert.equal(setupErrorMessage('Failed to import', new Error('ENOENT')), 'Failed to import: ENOENT');
  assert.equal(setupErrorMessage('Test failed', null), 'Test failed: Unknown error');
});
