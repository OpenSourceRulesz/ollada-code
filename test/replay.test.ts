import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { replayAvailable, stepNumber, totalSteps } from '../src/replay';

test('counter is steps, never tokens: 7 blocks x 4 steps = 28, block 4 step 1 = 13', () => {
  const snaps = {
    block_length: 4, steps: 4,
    frames: [
      { block: 0, step: 0, tokens: [], masked: [] },
      { block: 3, step: 0, tokens: [], masked: [] },
      { block: 6, step: 3, tokens: [], masked: [] },
    ],
  };
  assert.equal(totalSteps(snaps), 28);
  assert.equal(stepNumber(snaps.frames[1], 4), 13);
  assert.equal(stepNumber(snaps.frames[2], 4), 28);
});

test('replay unavailable whenever snapshots are missing, whatever the family', () => {
  assert.equal(replayAvailable({ model: 'sdar:1.7b', message: { content: 'hi' } }), false);
  assert.equal(replayAvailable({ model: 'nemotron:3b', message: { content: 'hi' } }), false);
  assert.equal(replayAvailable(null), false);
  assert.equal(replayAvailable({ snapshots: { block_length: 4, steps: 4, frames: [] } }), true);
});
