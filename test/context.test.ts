import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { actionsEnabled, captureContext, chipLabel, extractHeaderImports, headerImportsTruncated, planAction } from '../src/context';
import type { RawEditorState } from '../src/context';

const BROKEN = 'def greet(name)\n    print(f"Hello, {name}!")\n';

function state(over: Partial<RawEditorState> = {}): RawEditorState {
  return {
    path: 'C:\\Users\\user\\Documents\\ollada-cpu\\broken_colon.py', uri: 'file:///c%3A/Users/user/Documents/ollada-cpu/broken_colon.py',
    languageId: 'python', version: 3, fullText: BROKEN, selStart: 0, selEnd: BROKEN.length, active: BROKEN.length, ...over,
  };
}

test('selection is captured at click time and the snapshot does not change afterwards', () => {
  const raw = state();
  const ctx = captureContext(raw)!;
  // Later, focus moves to the panel and the live editor state changes or disappears.
  raw.selStart = 0; raw.selEnd = 0; raw.fullText = '';
  assert.equal(ctx.hasSelection, true);
  assert.equal(ctx.selectionText, BROKEN);
  assert.equal(ctx.label, 'broken_colon.py:1-2', 'whole-line selection ending at a newline covers lines 1-2, not 1-3');
  assert.equal(chipLabel(ctx), 'broken_colon.py:1-2');
});

test('a file outside the opened workspace works the same as one inside it', () => {
  const outside = captureContext(state({ path: 'C:\\Users\\user\\Documents\\broken_colon.py', uri: 'file:///c%3A/Users/user/Documents/broken_colon.py' }))!;
  assert.equal(outside.label, 'broken_colon.py:1-2');
  assert.deepEqual(planAction('fix', outside, true), { ok: true });
  const posix = captureContext(state({ path: '/tmp/elsewhere/broken_colon.py', selEnd: 15 }))!;
  assert.equal(posix.label, 'broken_colon.py:1');
});

test('no selection or no file: Explain/Fix are off and the model is never called', () => {
  const noSel = captureContext(state({ selStart: 4, selEnd: 4, active: 4 }))!;
  assert.equal(noSel.label, 'broken_colon.py, no selection');
  assert.deepEqual(actionsEnabled(noSel), { explain: false, fix: false, insert: true });
  assert.deepEqual(actionsEnabled(undefined), { explain: false, fix: false, insert: false });
  assert.equal(chipLabel(undefined), 'No file selected');
  let modelCalls = 0;
  const callModelIfPlanned = (action: 'explain' | 'fix' | 'insert', ctx: typeof noSel | undefined) => {
    const plan = planAction(action, ctx, true);
    if (plan.ok) { modelCalls++; }
    return plan;
  };
  const fix = callModelIfPlanned('fix', noSel);
  assert.equal(fix.ok, false);
  assert.match((fix as { hint: string }).hint, /Nothing is selected in broken_colon\.py/);
  assert.equal(callModelIfPlanned('explain', undefined).ok, false);
  assert.equal(callModelIfPlanned('insert', undefined).ok, false);
  assert.equal(modelCalls, 0, 'no empty prompt ever reaches the model');
  assert.equal(callModelIfPlanned('insert', noSel).ok, true, 'Insert at the cursor needs a file, not a selection');
});

test('header imports: shebang, comments, docstring skipped; collection stops at first def', () => {
  const text = '#!/usr/bin/env python3\n# a comment\n"""Module docs.\nMore docs.\n"""\nimport math\nfrom os import path\n\ndef f():\n    import json\n';
  assert.deepEqual(extractHeaderImports(text, 'python', 'x.py'), ['import math', 'from os import path']);
  const ctx = captureContext(state({ fullText: text, selStart: 0, selEnd: 10 }))!;
  assert.deepEqual(ctx.headerImports, ['import math', 'from os import path']);
  assert.equal(ctx.headerImportsTruncated, false);
});

test('header imports: parenthesised and backslash continuations kept whole; function-local imports excluded', () => {
  const text = 'from x import (\n    a,\n    b,\n)\nimport os \\\n    as operating\n\ndef f():\n    pass\n';
  assert.deepEqual(extractHeaderImports(text, 'python', 'x.py'), ['from x import (\n    a,\n    b,\n)', 'import os \\\n    as operating']);
});

test('header imports: unterminated docstring stops, non-Python returns empty, cap truncates', () => {
  assert.deepEqual(extractHeaderImports('"""never closed\nimport math\n', 'python', 'x.py'), []);
  assert.deepEqual(extractHeaderImports('import math\n', 'typescript', 'x.ts'), []);
  const many = Array.from({ length: 30 }, (_, i) => `import mod${i}`).join('\n') + '\n\ndef f():\n    pass\n';
  const got = extractHeaderImports(many, 'python', 'x.py');
  assert.equal(got.length, 25, 'capped at 25 lines');
  assert.equal(headerImportsTruncated(many, 'python', 'x.py'), true, 'a 26th import line exists');
  assert.equal(headerImportsTruncated('import math\n\ndef f():\n    pass\n', 'python', 'x.py'), false);
});

test('serve not running is reported before any model call', () => {
  const plan = planAction('fix', captureContext(state())!, false);
  assert.equal(plan.ok, false);
  assert.match((plan as { hint: string }).hint, /Serve isn’t running/);
});
