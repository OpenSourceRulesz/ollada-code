// Waiting history, spec 5.5.
// A bar/range is shown ONLY after at least 3 local runs of the same
// action with the same model, computed from those runs. The mockup's
// 2.8-13.2s range is sample content from the Dell script run
// (2.799s to 13.192s) and must NEVER be pre-seeded into globalState.
// This module starts empty and only learns from real runs on this machine.
export type ActionKind = 'fix' | 'explain' | 'insert';

export interface RunRecord { action: ActionKind; model: string; seconds: number; }

export class WaitingHistory {
  private runs: RunRecord[] = [];

  constructor(seed: RunRecord[] = []) {
    // Seed is only for tests with explicit local runs. Production code
    // constructs this with no seed, so the store starts empty.
    this.runs = [...seed];
  }

  record(action: ActionKind, model: string, seconds: number): void {
    if (Number.isFinite(seconds) && seconds > 0) {
      this.runs.push({ action, model, seconds });
    }
  }

  /** Range for this action+model, or null when fewer than 3 runs. */
  rangeFor(action: ActionKind, model: string): { min: number; max: number; count: number } | null {
    const matching = this.runs.filter((r) => r.action === action && r.model === model);
    if (matching.length < 3) { return null; }
    const seconds = matching.map((r) => r.seconds);
    return { min: Math.min(...seconds), max: Math.max(...seconds), count: matching.length };
  }

  /** Fraction of the local range elapsed, or null when no range yet. */
  fractionFor(action: ActionKind, model: string, elapsed: number): number | null {
    const range = this.rangeFor(action, model);
    if (!range || range.max <= range.min) { return null; }
    return Math.min(1, Math.max(0, (elapsed - range.min) / (range.max - range.min)));
  }

  toJSON(): RunRecord[] { return [...this.runs]; }
  static fromJSON(data: unknown): WaitingHistory {
    if (!Array.isArray(data)) { return new WaitingHistory(); }
    const runs = data.filter(
      (r): r is RunRecord =>
        r && typeof r.action === 'string' && typeof r.model === 'string' && typeof r.seconds === 'number',
    );
    return new WaitingHistory(runs);
  }
}
