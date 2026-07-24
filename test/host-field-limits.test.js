import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_HOST_GROUP_LENGTH,
  MAX_HOST_NAME_LENGTH,
  MAX_HOST_USER_LENGTH,
  MAX_HOSTNAME_LENGTH,
  MAX_IDENTITY_FILE_LENGTH,
  isTooLong,
} from '../src/lib/host-field-limits.js';

test('host field limits document shared managed-host boundaries', () => {
  assert.equal(MAX_HOST_NAME_LENGTH, 80);
  assert.equal(MAX_HOSTNAME_LENGTH, 253);
  assert.equal(MAX_HOST_USER_LENGTH, 128);
  assert.equal(MAX_HOST_GROUP_LENGTH, 64);
  assert.equal(MAX_IDENTITY_FILE_LENGTH, 4096);
});

test('isTooLong only flags strings above a configured boundary', () => {
  assert.equal(isTooLong('x'.repeat(3), 3), false);
  assert.equal(isTooLong('x'.repeat(4), 3), true);
  assert.equal(isTooLong(null, 3), false);
});
