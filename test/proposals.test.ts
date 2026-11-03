import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import { applyProposal, gateProposal, ProposalStore } from '../src/proposals';
import type { ProposalInput } from '../src/proposals';
import { planEdit } from '../src/splice';
import { runChecks } from '../src/checks';

const BROKEN = 'def greet(name)\n    print(f"Hello, {name}!")\n';
const PY = process.env.OLLADA_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const CHECKS = path.join(__dirname, '..', '..', 'python', 'checks.py');

function input(over: Partial<ProposalInput> = {}): ProposalInput {
  const e = planEdit('insert', BROKEN, 0, BROKEN.length, BROKEN.length, 'def greet(name):\n    print(f"Hello, {name}!")');
  return { kind: 'insert', uri: 'file:///broken_colon.py', version: 1, start: e.start, end: e.end, replacement: e.replacement,
    originalText: BROKEN, spliced: e.spliced, blocked: false, ...over };
}

test('Discard removes the proposal for good and leaves the file byte-identical', () => {
  const store = new ProposalStore();
  const fileBefore = Buffer.from(BROKEN, 'utf-8');
  const { proposal } = store.create(input());
  assert.ok(store.get(proposal.id));
  assert.equal(store.discard(proposal.id), true);
  assert.equal(store.pending(), undefined, 'no card remains');
  assert.equal(store.get(proposal.id), undefined, 'a stale Accept/Discard for that id finds nothing');
  assert.equal(store.discard(proposal.id), false, 'a second Discard is a no-op, it never re-posts the card');
  // Discard never writes: the document text is still exactly what it was.
  assert.ok(Buffer.from(proposal.originalText, 'utf-8').equals(fileBefore));
});

test('a newer proposal replaces the old card instead of stacking a second one', () => {
  const store = new ProposalStore();
  const a = store.create(input()).proposal;
  const b = store.create(input());
  assert.equal(b.replacedId, a.id);
  assert.equal(store.get(a.id), undefined);
  assert.equal(store.pending()?.id, b.proposal.id);
});

test('Accept writes exactly what the preview showed', () => {
  const p = input();
  assert.equal(applyProposal(BROKEN, p), p.spliced);
});

test('gate: a syntax error blocks Accept/Insert; other findings only warn', () => {
  assert.equal(gateProposal([{ kind: 'syntax', message: "line 4: expected ':'" }], 'Insert').blocked, true);
  assert.match(gateProposal([{ kind: 'syntax', message: 'x' }], 'Insert').reason ?? '', /Insert is turned off/);
  assert.equal(gateProposal([{ kind: 'undefined', message: 'y' }], 'Accept').blocked, false);
  assert.equal(gateProposal([], 'Accept').blocked, false);
});

test('real checks.py: the dogfood duplicate (fixed def above broken def) is blocked; Discard leaves the file unchanged', async () => {
  // What 0.1.3 produced: Insert added a correct def at line 1 and kept the broken one.
  const duplicated = 'def greet(name):\n    print(f"Hello, {name}!")\n' + BROKEN;
  const result = await runChecks(PY, CHECKS, duplicated);
  const gate = gateProposal(result.findings, 'Insert');
  assert.equal(gate.blocked, true, `expected a syntax finding, got ${JSON.stringify(result.findings)}`);
  const store = new ProposalStore();
  const { proposal } = store.create(input({ spliced: duplicated, blocked: gate.blocked }));
  assert.equal(proposal.blocked, true);
  store.discard(proposal.id);
  assert.equal(store.pending(), undefined);
  assert.equal(proposal.originalText, BROKEN);
});

test('real checks.py: the 0.1.4 replace-selection result passes syntax and is not blocked', async () => {
  const p = input();
  const result = await runChecks(PY, CHECKS, p.spliced);
  assert.equal(gateProposal(result.findings, 'Insert').blocked, false, JSON.stringify(result.findings));
});
