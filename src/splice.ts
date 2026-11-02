// Splice + fence-strip + a small line diff for the preview, spec 6.5.
// Accept is never automatic: the extension host applies exactly one
// WorkspaceEdit, one undo step, only when the user clicks Accept/Insert.
export function stripFences(text: string): string {
  let out = text.trim();
  const match = out.match(/^```(?:\w+)?\s*\n([\s\S]*?)\n?```$/);
  if (match) { out = match[1].trim(); }
  return out;
}

/** Replace the selection range in `original` with `replacement`. */
export function spliceSelection(
  original: string,
  startOffset: number,
  endOffset: number,
  replacement: string,
): string {
  return original.slice(0, startOffset) + replacement + original.slice(endOffset);
}

/** Insert `insertion` at `offset`, keeping the rest of the file. */
export function spliceInsert(original: string, offset: number, insertion: string): string {
  const code = insertion.endsWith('\n') ? insertion : insertion + '\n';
  return original.slice(0, offset) + code + original.slice(offset);
}

export interface DiffLine { kind: 'same' | 'add' | 'remove'; text: string; }

/**
 * Small, honest line diff: common prefix/suffix, everything between
 * shown as removed then added. Good enough for a single-function
 * preview; it is not a general diff algorithm and does not claim to be.
 */
export function simpleDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) { start++; }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const out: DiffLine[] = [];
  for (let i = 0; i < start; i++) { out.push({ kind: 'same', text: a[i] }); }
  for (let i = start; i < endA; i++) { out.push({ kind: 'remove', text: a[i] }); }
  for (let i = start; i < endB; i++) { out.push({ kind: 'add', text: b[i] }); }
  for (let i = endA; i < a.length; i++) { out.push({ kind: 'same', text: a[i] }); }
  return out;
}

export function countChangedLines(diff: DiffLine[]): number {
  return diff.filter((d) => d.kind !== 'same').length;
}
