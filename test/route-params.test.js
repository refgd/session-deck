import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePositiveRouteId } from '../src/lib/route-params.js';

test('parsePositiveRouteId accepts positive integer route params', () => {
  assert.equal(parsePositiveRouteId('1'), 1);
  assert.equal(parsePositiveRouteId('42'), 42);
  assert.equal(parsePositiveRouteId(7), 7);
});

test('parsePositiveRouteId rejects invalid ids before database lookup', () => {
  for (const value of ['', '0', '-1', '1.5', 'abc', null]) {
    assert.throws(
      () => parsePositiveRouteId(value),
      err => err.message === 'id must be a positive integer' &&
        err.statusCode === 400 &&
        err.id === value,
    );
  }
});
