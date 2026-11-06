// Chat-answer fence parsing and the host-side block store, 0.1.9.
// The panel renders code first and prose under it; Copy/Insert name a
// block by id + index, and the host looks the exact text up here.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ChatBlockStore, parseChatAnswer } from '../src/chatBlocks';

const CSV_ANSWER = `Sure, here's an example that reads a CSV file:

\`\`\`python
import csv

with open('example.csv', 'r') as file:
    reader = csv.reader(file)
    for row in reader:
        print(row)
\`\`\`

This code uses the 'csv' module to read the file.`;

test('one fenced block: code extracted, prose keeps the explanation, order is code first', () => {
  const { blocks, prose } = parseChatAnswer(CSV_ANSWER);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].lang, 'python');
  assert.ok(blocks[0].code.includes("with open('example.csv', 'r') as file:"));
  assert.ok(blocks[0].code.includes('print(row)'));
  assert.ok(!blocks[0].code.includes('```'), 'fences are not part of the code');
  assert.ok(prose.includes("Sure, here's an example"));
  assert.ok(prose.includes("This code uses the 'csv' module"));
  assert.ok(!prose.includes('import csv'), 'prose must not carry the code');
});

test('multiple blocks come back in order, each with its language', () => {
  const text = 'First:\n\n```python\nprint(1)\n```\n\nThen:\n\n```javascript\nconsole.log(2);\n```\n\nDone.';
  const { blocks, prose } = parseChatAnswer(text);
  assert.deepEqual(blocks.map((b) => b.lang), ['python', 'javascript']);
  assert.equal(blocks[0].code, 'print(1)');
  assert.equal(blocks[1].code, 'console.log(2);');
  assert.equal(prose, 'First:\n\nThen:\n\nDone.');
});

test('no fence: no blocks, prose is the whole answer', () => {
  const { blocks, prose } = parseChatAnswer('Just an explanation, no code at all.');
  assert.deepEqual(blocks, []);
  assert.equal(prose, 'Just an explanation, no code at all.');
});

test('unclosed fence still yields the code; a same-line fence is not a fence', () => {
  const unclosed = parseChatAnswer('Here is the code:\n\n```python\nprint(1)\n');
  assert.equal(unclosed.blocks.length, 1);
  assert.equal(unclosed.blocks[0].code, 'print(1)');
  assert.equal(unclosed.prose, 'Here is the code:');
  // Same rule as stripFences: ```def greet(name): has spaces, so the
  // first line is code, not a language tag — and no closing fence
  // means the whole thing is prose, not a block.
  const sameLine = parseChatAnswer('```def greet(name):\n    return 1');
  assert.deepEqual(sameLine.blocks, []);
  assert.ok(sameLine.prose.includes('def greet(name):'));
});

test('fence with no language tag, and an empty block', () => {
  const { blocks } = parseChatAnswer('```\nplain text\n```');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].lang, '');
  assert.equal(blocks[0].code, 'plain text');
  assert.equal(parseChatAnswer('```python\n```').blocks[0].code, '');
});

test('store: register returns the blocks, get returns the exact block text by id + index', () => {
  const store = new ChatBlockStore();
  const id = store.nextId();
  store.register(id, CSV_ANSWER, 87.5);
  const found = store.get(id, 0);
  assert.ok(found);
  assert.equal(found.seconds, 87.5);
  assert.ok(found.block.code.startsWith('import csv'));
  assert.equal(store.get(id, 1), undefined, 'only one block in this answer');
  assert.equal(store.get('no-such-id', 0), undefined, 'unknown answer id');
});

test('store: clear drops every answer, so a stale Insert cannot fire', () => {
  const store = new ChatBlockStore();
  const id = store.nextId();
  store.register(id, CSV_ANSWER, 1);
  store.clear();
  assert.equal(store.get(id, 0), undefined);
});
