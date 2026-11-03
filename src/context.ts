// Editor context capture, pure and testable without VS Code.
//
// 0.1.4 dogfood fix: the panel used to read vscode.window.activeTextEditor
// when a panel button was clicked. By then focus had moved to the panel,
// so there was no active editor and the extension said "Open a file
// first." / "Select the code first." even with the file open and the
// code selected. Now the extension snapshots the editor state at click
// time (from the last real text editor, which it tracks), builds a
// CapturedContext here, and uses that one snapshot for the whole action.
// Nothing here looks at workspace folders: a file outside the opened
// workspace works the same as one inside it.

export interface RawEditorState {
  path: string;        // absolute file path (any folder, inside or outside the workspace)
  uri: string;         // document URI string, used to find the document again on Accept
  languageId: string;
  version: number;     // document version at capture time
  fullText: string;    // whole document text at capture time
  selStart: number;    // selection start offset
  selEnd: number;      // selection end offset
  active: number;      // cursor offset
}

export interface CapturedContext extends RawEditorState {
  fileName: string;
  hasSelection: boolean;
  selectionText: string;
  startLine: number;   // 1-based
  endLine: number;     // 1-based, inclusive
  label: string;       // what the chip shows, e.g. broken_colon.py:1-2
  // 0.1.6: top-level imports from the file header, Python only. Sent
  // with Fix only, so the model does not re-add an import that is
  // already there (the sqrt case: it proposed `import math` for a file
  // that already imported math). Nothing else from the file is sent:
  // no function bodies, no surrounding lines, no other files.
  headerImports: string[];
  headerImportsTruncated: boolean;
}

/**
 * Extract consecutive top-level import lines from the head of a Python
 * file. Skips a shebang, blank lines, `#` comments, and a top module
 * docstring (until its closing quotes; if unterminated, stop — do not
 * guess). Joins parenthesised and backslash continuations, stops at
 * the first non-import line, and caps at 25 lines / 1,000 chars so a
 * huge header never eats the prompt. Returns [] for non-Python files
 * and for files with no header imports.
 */
export function extractHeaderImports(fullText: string, languageId: string, path: string): string[] {
  if (languageId !== 'python' && !path.endsWith('.py')) { return []; }
  const lines = fullText.split('\n');
  let i = 0;
  // Shebang, blanks, comments.
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === '' || t.startsWith('#')) { i++; continue; }
    break;
  }
  // Module docstring: skip to its closing quotes, or stop if unterminated.
  if (i < lines.length) {
    const t = lines[i].trim();
    const quote = t.startsWith('"""') ? '"""' : t.startsWith("'''") ? "'''" : undefined;
    if (quote) {
      const rest = t.slice(3);
      if (rest.includes(quote)) { i++; }
      else {
        i++;
        let closed = false;
        while (i < lines.length) { if (lines[i].includes(quote)) { closed = true; i++; break; } i++; }
        if (!closed) { return []; }
      }
      while (i < lines.length) { const u = lines[i].trim(); if (u === '' || u.startsWith('#')) { i++; continue; } break; }
    }
  }
  const out: string[] = [];
  let chars = 0;
  while (i < lines.length) {
    const first = lines[i];
    const t = first.trim();
    if (!/^import\s/.test(t) && !/^from\s+\S+\s+import\s/.test(t)) { break; }
    // Join continuations: open parens, or a trailing backslash.
    let joined = first;
    let depth = (first.match(/\(/g) || []).length - (first.match(/\)/g) || []).length;
    while ((depth > 0 || joined.trimEnd().endsWith('\\')) && i + 1 < lines.length) {
      i++;
      joined += '\n' + lines[i];
      depth += (lines[i].match(/\(/g) || []).length - (lines[i].match(/\)/g) || []).length;
    }
    if (out.length >= 25 || chars + joined.length > 1000) { break; }
    out.push(joined);
    chars += joined.length;
    i++;
  }
  return out;
}

export function headerImportsTruncated(fullText: string, languageId: string, path: string): boolean {
  // Truncated when a 26th header import line exists, or the header
  // import block as a whole exceeds the cap. Recompute cheaply: run
  // the extractor on the full text, then check whether more import
  // lines follow the extracted ones in the header.
  const extracted = extractHeaderImports(fullText, languageId, path);
  if (extracted.length === 0) { return false; }
  const lines = fullText.split('\n');
  let consumed = 0;
  // Count lines the extractor consumed: skip shebang/blanks/comments/
  // docstring the same way, then count extracted joined lines.
  let i = 0;
  while (i < lines.length) { const t = lines[i].trim(); if (t === '' || t.startsWith('#')) { i++; continue; } break; }
  if (i < lines.length) {
    const t = lines[i].trim();
    const quote = t.startsWith('"""') ? '"""' : t.startsWith("'''") ? "'''" : undefined;
    if (quote) {
      if (t.slice(3).includes(quote)) { i++; }
      else { i++; while (i < lines.length && !lines[i].includes(quote)) { i++; } i++; }
      while (i < lines.length) { const u = lines[i].trim(); if (u === '' || u.startsWith('#')) { i++; continue; } break; }
    }
  }
  for (const block of extracted) { consumed += block.split('\n').length; }
  let j = i + consumed;
  // If the next header line is still an import, the extractor stopped
  // on a cap, not on the end of the imports.
  if (j < lines.length) {
    const t = lines[j].trim();
    if (/^import\s/.test(t) || /^from\s+\S+\s+import\s/.test(t)) { return true; }
  }
  return false;
}

export type ActionName = 'explain' | 'fix' | 'insert' | 'chat';

export function baseName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) { if (text.charCodeAt(i) === 10) { line++; } }
  return line;
}

export function captureContext(raw: RawEditorState | undefined): CapturedContext | undefined {
  if (!raw) { return undefined; }
  const start = Math.min(raw.selStart, raw.selEnd);
  const end = Math.max(raw.selStart, raw.selEnd);
  const hasSelection = end > start;
  const fileName = baseName(raw.path);
  const startLine = lineOf(raw.fullText, hasSelection ? start : raw.active);
  let endLine = hasSelection ? lineOf(raw.fullText, end) : startLine;
  // A selection that ends at the start of a line (whole lines selected)
  // does not include that line.
  if (hasSelection && endLine > startLine && raw.fullText.charCodeAt(end - 1) === 10) { endLine--; }
  const range = hasSelection ? (startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`) : '';
  return {
    ...raw,
    selStart: start,
    selEnd: end,
    fileName,
    hasSelection,
    selectionText: hasSelection ? raw.fullText.slice(start, end) : '',
    startLine,
    endLine,
    label: hasSelection ? `${fileName}:${range}` : `${fileName}, no selection`,
    headerImports: extractHeaderImports(raw.fullText, raw.languageId, raw.path),
    headerImportsTruncated: headerImportsTruncated(raw.fullText, raw.languageId, raw.path),
  };
}

export function chipLabel(ctx: CapturedContext | undefined): string {
  return ctx ? ctx.label : 'No file selected';
}

export function actionsEnabled(ctx: CapturedContext | undefined): { explain: boolean; fix: boolean; insert: boolean } {
  return { explain: !!ctx?.hasSelection, fix: !!ctx?.hasSelection, insert: !!ctx };
}

export type Plan = { ok: true } | { ok: false; hint: string };

/**
 * Decide, before any model call, whether an action can run. A failed
 * plan never reaches the model: an empty prompt makes the model ask for
 * context, which is the useless reply the dogfood run produced.
 */
export function planAction(action: ActionName, ctx: CapturedContext | undefined, serving: boolean): Plan {
  if (action === 'explain' || action === 'fix') {
    if (!ctx) { return { ok: false, hint: 'No file selected. Open a file and select the code first.' }; }
    if (!ctx.hasSelection) { return { ok: false, hint: `Nothing is selected in ${ctx.fileName}. Select the code first.` }; }
  }
  if (action === 'insert' && !ctx) {
    return { ok: false, hint: 'No file selected. Open a file and place the cursor first.' };
  }
  if (!serving) { return { ok: false, hint: 'Serve isn’t running. Start serve from Setup at the top of the panel.' }; }
  return { ok: true };
}
