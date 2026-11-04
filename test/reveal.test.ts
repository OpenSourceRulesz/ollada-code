import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { revealOrder, scrambleToken } from '../src/reveal';

function seeded(seed: number): () => number {
  return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
}

test('reveal commits every token exactly once, and the last step commits the rest', () => {
  for (const [count, steps] of [[0, 14], [1, 14], [5, 14], [40, 14], [400, 14]]) {
    const order = revealOrder(count, steps, seeded(count + 7));
    const flat = order.flat();
    assert.equal(flat.length, count);
    assert.deepEqual([...flat].sort((a, b) => a - b), Array.from({ length: count }, (_, i) => i));
    assert.ok(order.length <= steps);
  }
});

test('scrambled guesses keep the token shape, so the text does not jump around', () => {
  const g = scrambleToken('Hello, x2!', seeded(3));
  assert.equal(g.length, 'Hello, x2!'.length);
  assert.match(g, /^[A-Z][a-z]{4}, [a-z][0-9]!$/);
  assert.equal(scrambleToken('(){}:', seeded(1)), '(){}:');
});

test('both functions are self-contained, so they can be injected into the webview as source', () => {
  const order = new Function(`return (${revealOrder.toString()})`)() as typeof revealOrder;
  const scr = new Function(`return (${scrambleToken.toString()})`)() as typeof scrambleToken;
  assert.equal(order(10, 4, seeded(9)).flat().length, 10);
  assert.equal(scr('abc', seeded(2)).length, 3);
});
