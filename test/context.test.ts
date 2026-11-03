import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { actionsEnabled, captureContext, chipLabel, planAction } from '../src/context';
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

test('serve not running is reported before any model call', () => {
  const plan = planAction('fix', captureContext(state())!, false);
  assert.equal(plan.ok, false);
  assert.match((plan as { hint: string }).hint, /Serve isn’t running/);
});
