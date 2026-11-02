import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { fitLabel, isGreenLabel, isRedLabel, recommendedIndex, NEMOTRON_DETAIL } from '../src/fitLabels';

test('GPU mapping: fits/tight/won\'t fit', () => {
  assert.equal(fitLabel({ model: 'dream:7b', verdict: 'fits', cpuVerified: false, muchSlowerThanSdar17b: false }, 'gpu'), 'Fits');
  assert.equal(fitLabel({ model: 'dream:7b', verdict: 'tight', cpuVerified: false, muchSlowerThanSdar17b: false }, 'gpu'), 'Tight');
  assert.equal(fitLabel({ model: 'diffcoder:8b', verdict: "won't fit", cpuVerified: false, muchSlowerThanSdar17b: false }, 'gpu'), "Won't fit");
});

test('CPU mapping: 1.7b Runs on CPU, 4b/nemotron Runs, slowly, dream/diffcoder Needs a GPU', () => {
  assert.equal(fitLabel({ model: 'sdar:1.7b', verdict: 'unknown', cpuVerified: true, muchSlowerThanSdar17b: false }, 'cpu'), 'Runs on CPU');
  assert.equal(fitLabel({ model: 'sdar:4b', verdict: 'unknown', cpuVerified: true, muchSlowerThanSdar17b: true }, 'cpu'), 'Runs, slowly');
  assert.equal(fitLabel({ model: 'nemotron:3b', verdict: 'unknown', cpuVerified: true, muchSlowerThanSdar17b: true }, 'cpu'), 'Runs, slowly');
  assert.equal(fitLabel({ model: 'dream:7b', verdict: 'unknown', cpuVerified: false, muchSlowerThanSdar17b: false }, 'cpu'), 'Needs a GPU');
  assert.equal(fitLabel({ model: 'diffcoder:8b', verdict: 'unknown', cpuVerified: false, muchSlowerThanSdar17b: false }, 'cpu'), 'Needs a GPU');
});

test('dream and diffcoder are never combined: distinct rows, distinct labels possible', () => {
  const rows = [
    { model: 'dream:7b', verdict: 'fits' as const, cpuVerified: false, muchSlowerThanSdar17b: false },
    { model: 'diffcoder:8b', verdict: 'tight' as const, cpuVerified: false, muchSlowerThanSdar17b: false },
  ];
  assert.equal(rows.length, 2);
  assert.equal(fitLabel(rows[0], 'gpu'), 'Fits');
  assert.equal(fitLabel(rows[1], 'gpu'), 'Tight');
});

test('Recommended is first green row in recommend order, red rows have no button', () => {
  const rows = [
    { model: 'dream:7b', verdict: 'unknown' as const, cpuVerified: false, muchSlowerThanSdar17b: false },
    { model: 'sdar:1.7b', verdict: 'unknown' as const, cpuVerified: true, muchSlowerThanSdar17b: false },
  ];
  assert.equal(recommendedIndex(rows, 'cpu'), 1);
  assert.equal(isGreenLabel('Runs on CPU'), true);
  assert.equal(isRedLabel('Needs a GPU'), true);
});

test('nemotron detail drops the cold-load ratio', () => {
  assert.equal(NEMOTRON_DETAIL, '7.66 GB weights. Runs, slowly on CPU here.');
  assert.ok(!NEMOTRON_DETAIL.includes('9x'), 'detail must not present the 9x capital ratio as speed');
});
