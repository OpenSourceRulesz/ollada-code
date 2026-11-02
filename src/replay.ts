// Replay step math, spec 5.9.
// Counter is steps elapsed / total steps, NEVER tokens.
// Total steps = blocks * steps per block. Example from the spec:
// 7 blocks x 4 steps = 28 total; block 4, step 1 = step 13.
export interface SnapshotFrame {
  block: number;
  step: number;
  tokens: string[];
  masked: boolean[];
}

export interface Snapshots {
  block_length: number;
  steps: number;
  frames: SnapshotFrame[];
}

export function totalSteps(snapshots: Snapshots): number {
  if (snapshots.frames.length === 0) { return 0; }
  const maxBlock = Math.max(...snapshots.frames.map((f) => f.block));
  return (maxBlock + 1) * snapshots.steps;
}

/** 1-based step number for a frame, e.g. block 3 (0-based) step 0 = 13 when steps=4. */
export function stepNumber(frame: SnapshotFrame, stepsPerBlock: number): number {
  return frame.block * stepsPerBlock + frame.step + 1;
}

/**
 * Whether Replay is available for a chat response.
 * Disabled with "Replay not available for this model" whenever the
 * response has no snapshots field, whatever the family — including
 * every response from stock ollada 0.3.4, which has no snapshots.
 * Frames are never synthesized.
 */
export function replayAvailable(response: unknown): response is { snapshots: Snapshots } {
  if (!response || typeof response !== 'object') { return false; }
  const snaps = (response as { snapshots?: unknown }).snapshots;
  return !!snaps && typeof snaps === 'object' && Array.isArray((snaps as Snapshots).frames);
}
