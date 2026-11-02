import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { WaitingHistory } from '../src/waiting';

test('no range before 3 runs, and never pre-seeded', () => {
  const h = new WaitingHistory();
  assert.equal(h.rangeFor('fix', 'sdar:1.7b'), null);
  h.record('fix', 'sdar:1.7b', 2.8);
  h.record('fix', 'sdar:1.7b', 13.2);
  assert.equal(h.rangeFor('fix', 'sdar:1.7b'), null, '2 runs is not enough');
  h.record('fix', 'sdar:1.7b', 9.9);
  const range = h.rangeFor('fix', 'sdar:1.7b');
  assert.deepEqual(range, { min: 2.8, max: 13.2, count: 3 });
});

test('ranges are per action+model, not shared', () => {
  const h = new WaitingHistory();
  for (const s of [1, 2, 3]) { h.record('fix', 'sdar:1.7b', s); }
  assert.equal(h.rangeFor('explain', 'sdar:1.7b'), null);
  assert.equal(h.rangeFor('fix', 'sdar:4b'), null);
});

test('fromJSON ignores malformed stored data', () => {
  const h = WaitingHistory.fromJSON([{ action: 'fix', model: 'sdar:1.7b', seconds: 'fast' }]);
  assert.equal(h.rangeFor('fix', 'sdar:1.7b'), null);
});
