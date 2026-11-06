// Chat-answer code blocks, 0.1.9.
//
// A free-chat answer is prose with fenced code blocks in it. The panel
// renders the code first (one block per fenced block, in order, each
// with Copy + Insert) and the prose underneath as the explanation.
// This module is the single source of truth for that split: the
// extension host parses the answer once and stores the blocks, and the
// webview runs the same parser (interpolated into its script, see
// src/webview.ts) so the two can never disagree about which block is
// which.
//
// Fence rule, same as stripFences in splice.ts: an opening fence is a
// line that is exactly ``` plus an optional language tag
// ([A-Za-z0-9_-]+). A same-line fence like ```def greet(name): is
// NOT a fence — its first line contains spaces, so it is code, not a
// tag. An unclosed fence runs to the end of the answer; the model
// sometimes drops the closing fence, and the code is still the code.
//
// The store is host-side only: Insert never trusts the webview to
// round-trip code. The webview posts a block id + index; the host
// looks the exact block text up here and feeds it to proposeEdit, so
// what Accept writes is byte-identical to what the model wrote.

export interface ChatCodeBlock {
  lang: string;
  code: string;
}

export interface ParsedChatAnswer {
  blocks: ChatCodeBlock[];
  /** The answer with every fenced block removed, blank lines collapsed, trimmed. */
  prose: string;
}

export function parseChatAnswer(text: string): ParsedChatAnswer {
  // NOTE: this function is injected into the webview as source
  // (`const parseChatAnswer = (<fn source>)`, see src/webview.ts),
  // so it must stay self-contained: no imports, no outside
  // references — the fence regex lives inside it, not at module
  // level, for exactly that reason.
  const FENCE = /^```([A-Za-z0-9_-]*)[ \t]*$/;
  const lines = String(text ?? '').split('\n');
  const blocks: ChatCodeBlock[] = [];
  const proseLines: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = FENCE.exec(lines[i]);
    if (!m) {
      proseLines.push(lines[i]);
      i++;
      continue;
    }
    const lang = m[1] || '';
    const codeLines: string[] = [];
    i++;
    while (i < lines.length && !FENCE.test(lines[i])) {
      codeLines.push(lines[i]);
      i++;
    }
    // Skip the closing fence when there is one; an unclosed fence
    // simply runs out of lines.
    if (i < lines.length) { i++; }
    blocks.push({ lang, code: codeLines.join('\n').replace(/\n+$/, '') });
  }
  const prose = proseLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { blocks, prose };
}

export interface StoredAnswer {
  blocks: ChatCodeBlock[];
  /** Wall-clock seconds of the model run that produced the answer. */
  seconds: number;
}

/** Host-side store: answer id -> the blocks that answer carried. */
export class ChatBlockStore {
  private answers = new Map<string, StoredAnswer>();
  private seq = 0;

  nextId(): string {
    this.seq++;
    return `a${Date.now().toString(36)}-${this.seq}`;
  }

  register(id: string, text: string, seconds: number): StoredAnswer {
    const parsed = parseChatAnswer(text);
    const stored: StoredAnswer = { blocks: parsed.blocks, seconds };
    this.answers.set(id, stored);
    return stored;
  }

  /** The exact block text for one tap, or undefined when it is gone. */
  get(id: string, index: number): { block: ChatCodeBlock; seconds: number } | undefined {
    const stored = this.answers.get(id);
    if (!stored) { return undefined; }
    const block = stored.blocks[index];
    if (!block) { return undefined; }
    return { block, seconds: stored.seconds };
  }

  clear(): void {
    this.answers.clear();
  }
}
