import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWithConcurrency } from '../src/lib/async-utils.js';

test('mapWithConcurrency preserves order and caps active work', async () => {
  const items = [1, 2, 3, 4, 5, 6];
  let active = 0;
  let maxActive = 0;

  const result = await mapWithConcurrency(items, 2, async (item, index) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, item % 2 === 0 ? 1 : 5));
    active--;
    return `${index}:${item}`;
  });

  assert.deepEqual(result, ['0:1', '1:2', '2:3', '3:4', '4:5', '5:6']);
  assert.equal(maxActive <= 2, true);
});
