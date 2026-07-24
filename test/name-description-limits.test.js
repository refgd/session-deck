import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_RESOURCE_DESCRIPTION_LENGTH,
  MAX_RESOURCE_NAME_LENGTH,
  normalizeResourceDescription,
  normalizeResourceName,
} from '../src/lib/name-description-limits.js';

test('normalizeResourceName trims names and enforces configured limits', () => {
  assert.deepEqual(normalizeResourceName('  main  ', { required: true }), { value: 'main' });
  assert.deepEqual(normalizeResourceName('', { required: true }), { error: 'Name is required' });
  assert.deepEqual(normalizeResourceName('x'.repeat(MAX_RESOURCE_NAME_LENGTH + 1)), { error: 'Name is too long' });
});

test('normalizeResourceDescription trims descriptions and enforces configured limits', () => {
  assert.deepEqual(normalizeResourceDescription(undefined, { defaultValue: '' }), { value: '' });
  assert.deepEqual(normalizeResourceDescription('  Useful context  '), { value: 'Useful context' });
  assert.deepEqual(normalizeResourceDescription('x'.repeat(MAX_RESOURCE_DESCRIPTION_LENGTH + 1)), {
    error: 'Description is too long',
  });
});
