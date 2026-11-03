import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { FIX_PROMPT, fixRetryPrompt, importsContextBlock } from '../src/prompts';

test('importsContextBlock labels imports as context only, empty when none', () => {
  assert.equal(importsContextBlock('domain.py', [], false), '');
  const block = importsContextBlock('domain.py', ['import math'], false);
  assert.match(block, /Imports already in domain\.py/);
  assert.match(block, /do not re-add these/);
  assert.match(block, /import math/);
  assert.match(importsContextBlock('domain.py', ['import math'], true), /further imports omitted/);
});

test('fixRetryPrompt keeps FIX_PROMPT verbatim first, instruction verbatim, selection last', () => {
  const prompt = fixRetryPrompt(
    'math is already imported, fix the domain error without adding an import',
    'result = math.sqrt(-1)',
    'domain.py',
    ['import math'],
    false,
  );
  assert.ok(prompt.startsWith(FIX_PROMPT), 'FIX_PROMPT verbatim first');
  assert.match(prompt, /User instruction: math is already imported/);
  assert.match(prompt, /Follow this instruction\. It overrides your default approach\./);
  assert.match(prompt, /Imports already in domain\.py/);
  assert.ok(prompt.trimEnd().endsWith('```'), 'selection block is last');
  assert.match(prompt, /result = math\.sqrt\(-1\)/);
});

test('fixRetryPrompt with no imports has no imports block', () => {
  const prompt = fixRetryPrompt('fix it', 'x = 1', 'x.py', [], false);
  assert.doesNotMatch(prompt, /Imports already in/);
  assert.match(prompt, /User instruction: fix it/);
});
