// Fit-label mapping, spec 5.3. The extension never reimplements
// `ollada recommend`: it takes recommend's verdict (fits / tight /
// won't fit / unknown) plus the machine kind, and maps it to a UI label.
// "Much slower" is defined in the spec as a CPU fib time more than 2x
// sdar:1.7b's; the caller supplies that boolean, it is not guessed here.
export type RecommendVerdict = 'fits' | 'tight' | "won't fit" | 'unknown';
export type MachineKind = 'gpu' | 'cpu';
export type FitLabel = 'Fits' | 'Tight' | "Won't fit" | 'Runs on CPU' | 'Runs, slowly' | 'Needs a GPU' | 'Unknown';

export interface RecommendRow {
  model: string;
  verdict: RecommendVerdict;
  /** CPU-verified on this machine class (sdar:1.7b, sdar:4b, nemotron:3b). */
  cpuVerified: boolean;
  /** CPU fib time more than 2x sdar:1.7b's fib time, where known. */
  muchSlowerThanSdar17b: boolean;
  /** Detail line shown under the model name, or undefined if unknown. */
  detail?: string;
}

export function fitLabel(row: RecommendRow, kind: MachineKind): FitLabel {
  if (kind === 'gpu') {
    if (row.verdict === 'fits') { return 'Fits'; }
    if (row.verdict === 'tight') { return 'Tight'; }
    if (row.verdict === "won't fit") { return "Won't fit"; }
    return 'Unknown';
  }
  // CPU machine: recommend's GPU verdict does not describe CPU usability.
  if (row.cpuVerified && !row.muchSlowerThanSdar17b) { return 'Runs on CPU'; }
  if (row.cpuVerified && row.muchSlowerThanSdar17b) { return 'Runs, slowly'; }
  return 'Needs a GPU';
}

export function isGreenLabel(label: FitLabel): boolean {
  return label === 'Fits' || label === 'Runs on CPU';
}

export function isRedLabel(label: FitLabel): boolean {
  return label === "Won't fit" || label === 'Needs a GPU';
}

/**
 * Mockup v2 fit dot, display only. The dot is a small graphic marker,
 * not small text, so these marker colours are not subject to the
 * #6C6FD8 small-text rule. Green = good fit, amber = caution/slow,
 * red = does not fit, grey = unknown.
 */
export function fitDotColor(label: FitLabel): string {
  if (label === 'Fits' || label === 'Runs on CPU') { return '#2DA44E'; }
  if (label === 'Tight' || label === 'Runs, slowly') { return '#D29922'; }
  if (label === "Won't fit" || label === 'Needs a GPU') { return '#CF222E'; }
  return '#8B949E';
}

/** First green row in recommend order gets the Recommended tag. */
export function recommendedIndex(rows: RecommendRow[], kind: MachineKind): number {
  for (let i = 0; i < rows.length; i++) {
    if (isGreenLabel(fitLabel(rows[i], kind))) { return i; }
  }
  return -1;
}

/**
 * Nemotron detail line, round 2 cleanup.
 * The spec's 3x / 9x ratios are CLI cold-load times (fib 19.0s vs 6.3s,
 * train ~60s vs 21.2s, capital 17.9s vs 1.9s), NOT warm-serve speeds.
 * There is no warm-serve Dell comparison for nemotron yet, so the
 * shipped line drops the ratio instead of presenting it as speed.
 * The Runs, slowly label itself stands: fib 3.0x is over the 2x bar.
 */
export const NEMOTRON_DETAIL = '7.66 GB weights. Runs, slowly on CPU here.';
export const NEMOTRON_DETAIL_QUALIFIED =
  '7.66 GB weights. CLI times, including load: about 3x sdar:1.7b on longer prompts, about 9x on a one-word answer. Warm-serve comparison not yet measured.';
