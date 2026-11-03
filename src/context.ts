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
