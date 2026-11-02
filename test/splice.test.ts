import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { stripFences, spliceSelection, spliceInsert, simpleDiff, countChangedLines } from '../src/splice';

test('stripFences removes fences, leaves bare code alone', () => {
  assert.equal(stripFences('```python\ndef f():\n    return 1\n```'), 'def f():\n    return 1');
  assert.equal(stripFences('def f():\n    return 1'), 'def f():\n    return 1');
});

test('spliceSelection replaces exactly the selection', () => {
  assert.equal(spliceSelection('def f():\n    return 1\n', 0, 22, 'def f():\n    return 2\n'), 'def f():\n    return 2\n');
});

test('spliceInsert inserts at cursor without touching the rest', () => {
  const out = spliceInsert('a\nb\n', 2, 'x = 1');
  assert.equal(out, 'a\nx = 1\nb\n');
});

test('simpleDiff counts changed lines for the off-by-one fix', () => {
  const before = 'def sum_first_n(n):\n    return sum(range(n))\n';
  const after = 'def sum_first_n(n):\n    return sum(range(1, n + 1))\n';
  const diff = simpleDiff(before, after);
  assert.equal(countChangedLines(diff), 2, 'one removed + one added');
});
