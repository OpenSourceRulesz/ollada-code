import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { stripFences, spliceSelection, spliceInsert, simpleDiff, countChangedLines } from '../src/splice';

test('stripFences removes fences, leaves bare code alone', () => {
  assert.equal(stripFences('```python\ndef f():\n    return 1\n```'), 'def f():\n    return 1');
  assert.equal(stripFences('def f():\n    return 1'), 'def f():\n    return 1');
});

test('stripFences removes fences sharing a line with code (0.1.5 colon bug)', () => {
  assert.equal(
    stripFences('```def greet(name):\n    print(f"Hello, {name}!")\n```'),
    'def greet(name):\n    print(f"Hello, {name}!")',
  );
  assert.equal(
    stripFences('```python\ndef f():\n    return 1\n```'),
    'def f():\n    return 1',
  );
  assert.equal(
    stripFences('def f():\n    return 1\n```'),
    'def f():\n    return 1',
  );
  assert.equal(stripFences('```def f():\n    return 1'), 'def f():\n    return 1');
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

import { planEdit } from '../src/splice';

const BROKEN = 'def greet(name)\n    print(f"Hello, {name}!")\n';
const FIXED = 'def greet(name):\n    print(f"Hello, {name}!")';

test('Insert with code selected replaces the selection: no duplicate function', () => {
  const e = planEdit('insert', BROKEN, 0, BROKEN.length, BROKEN.length, FIXED);
  assert.equal(e.spliced, FIXED + '\n', 'the selection is replaced and its trailing newline kept');
  assert.equal(e.spliced.split('def greet').length - 1, 1, 'exactly one def greet');
  assert.ok(!e.spliced.includes('def greet(name)\n'), 'the broken line is gone');
});

test('Fix replaces exactly the selection, even a partial one', () => {
  const firstLine = 'def greet(name)'.length;
  const e = planEdit('fix', BROKEN, 0, firstLine, firstLine, 'def greet(name):');
  assert.equal(e.spliced, 'def greet(name):\n    print(f"Hello, {name}!")\n');
});

test('Insert with no selection writes at the cursor and keeps the rest', () => {
  const end = BROKEN.length;
  const e = planEdit('insert', BROKEN, end, end, end, 'greet("x")');
  assert.equal(e.spliced, BROKEN + 'greet("x")\n');
  assert.equal(e.start, end);
  assert.equal(e.end, end);
});
