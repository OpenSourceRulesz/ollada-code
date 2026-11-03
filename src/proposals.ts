// Proposal lifecycle and the verifier gate, pure and testable.
//
// 0.1.4 dogfood fixes:
// - Discard did not dismiss the card. The extension cleared its pending
//   edit but never told the panel, so the card stayed with live Insert /
//   Discard buttons. Every proposal now has one id; the panel renders a
//   card per id; Accept / Discard name that id; the store drops it and
//   the extension tells the panel to remove that exact card.
// - A proposal whose spliced file has a syntax error is blocked: Accept /
//   Insert is disabled, Discard is the only action. A warning next to an
//   easy Insert button is how a broken file gets accepted by accident.

export interface ProposalInput {
  kind: 'fix' | 'insert';
  uri: string;
  version: number;     // document version the proposal was made against
  start: number;       // range replaced in the original text
  end: number;
  replacement: string; // exactly the text Accept writes
  originalText: string;
  spliced: string;     // originalText with the replacement applied (what the preview and checks used)
  blocked: boolean;
  blockReason?: string;
}

export interface Proposal extends ProposalInput { id: string; }

export class ProposalStore {
  private current: Proposal | undefined;
  private seq = 0;

  /** Add a proposal. Only one is pending at a time; returns the id of any proposal it replaced. */
  create(input: ProposalInput): { proposal: Proposal; replacedId?: string } {
    const replacedId = this.current?.id;
    this.seq++;
    const proposal: Proposal = { ...input, id: `p${Date.now().toString(36)}-${this.seq}` };
    this.current = proposal;
    return { proposal, replacedId };
  }

  pending(): Proposal | undefined { return this.current; }

  get(id: string): Proposal | undefined { return this.current && this.current.id === id ? this.current : undefined; }

  /** Drop the proposal. Returns false if it was already gone (a stale card); the panel removes the card either way. */
  discard(id: string): boolean {
    if (this.current && this.current.id === id) { this.current = undefined; return true; }
    return false;
  }
}

export interface GateFinding { kind: string; message: string; }

/** A syntax error in the spliced file blocks Accept / Insert. Other findings warn but do not block. */
export function gateProposal(findings: GateFinding[], acceptLabel: string): { blocked: boolean; reason?: string } {
  const syntax = findings.find((f) => f.kind === 'syntax');
  if (!syntax) { return { blocked: false }; }
  return {
    blocked: true,
    reason: `The proposed file has a syntax error (${syntax.message}), so ${acceptLabel} is turned off. Discard it, then select the code and try again.`,
  };
}

/** What Accept writes, applied to text. Used to prove Discard leaves the file byte-identical and Accept writes exactly the preview. */
export function applyProposal(text: string, p: ProposalInput): string {
  return text.slice(0, p.start) + p.replacement + text.slice(p.end);
}
