// Splice + fence-strip + a small line diff for the preview, spec 6.5.
// Accept is never automatic: the extension host applies exactly one
// WorkspaceEdit, one undo step, only when the user clicks Accept/Insert.
export function stripFences(text: string): string {
  let out = text.trim();
  const hadFence = out.startsWith('```');
  if (hadFence) { out = out.slice(3); }
  // Language tag only when it is the whole first line, e.g. ```python\n,
  // and only after a real opening fence. A same-line fence like
  // ```def greet(name): must NOT eat "def" as a tag: that first line
  // contains spaces, so it is code, not a tag.
  const nl = out.indexOf('\n');
  if (hadFence && nl >= 0) {
    const first = out.slice(0, nl).trim();
    if (/^[A-Za-z0-9_-]+$/.test(first)) { out = out.slice(nl + 1); }
  }
  if (out.endsWith('```')) { out = out.slice(0, -3); }
  return out.trim();
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

/**
 * Where a proposal goes and exactly what Accept writes. 0.1.4 dogfood
 * fix: Insert with code selected used to insert at the cursor and keep
 * the selected code, so a fixed `def greet(name):` landed above the
 * broken `def greet(name)` and the file had both. Now any action with a
 * non-empty selection replaces that selection; Insert with no selection
 * inserts at the cursor. If the selection ended with a newline and the
 * model's code doesn't, the newline is kept so the next line isn't joined.
 */
export function planEdit(
  kind: 'fix' | 'insert',
  fullText: string,
  selStart: number,
  selEnd: number,
  active: number,
  code: string,
): { start: number; end: number; replacement: string; spliced: string } {
  const hasSelection = selEnd > selStart;
  if (kind === 'fix' || hasSelection) {
    const selected = fullText.slice(selStart, selEnd);
    const replacement = selected.endsWith('\n') && !code.endsWith('\n') ? code + '\n' : code;
    return { start: selStart, end: selEnd, replacement, spliced: fullText.slice(0, selStart) + replacement + fullText.slice(selEnd) };
  }
  const replacement = code.endsWith('\n') ? code : code + '\n';
  return { start: active, end: active, replacement, spliced: fullText.slice(0, active) + replacement + fullText.slice(active) };
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
