import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { pickFirstFree, FIRST_PORT } from '../src/ports';

test('picks 11435 when free, skips Code.exe-held 11435/11436, never kills', () => {
  assert.equal(pickFirstFree(0, new Set()), FIRST_PORT);
  assert.equal(pickFirstFree(0, new Set([11435, 11436])), 11437);
  assert.equal(pickFirstFree(11437, new Set([11437])), 11438);
});

test('preferred port is honoured when free', () => {
  assert.equal(pickFirstFree(11440, new Set([11435])), 11440);
});
