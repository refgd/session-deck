import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNewCredentials } from '../src/lib/credentials.js';

test('validateNewCredentials accepts valid matching credentials', () => {
  assert.equal(validateNewCredentials('admin', 'password123', 'password123'), null);
});

test('validateNewCredentials rejects missing or weak credentials', () => {
  assert.equal(validateNewCredentials('', 'password123', 'password123'), 'Username is required');
  assert.equal(validateNewCredentials('admin', '', ''), 'Password is required');
  assert.equal(validateNewCredentials('admin', 'short', 'short'), 'Password must be at least 8 characters');
  assert.equal(validateNewCredentials('admin', 'password123', 'different'), 'Passwords do not match');
});
