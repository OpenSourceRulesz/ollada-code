// Panel behaviour tests: the real webview HTML and script, loaded in jsdom,
// driven with the same messages the extension sends. Covers what can't be
// checked without VS Code being open: tabs, turns keeping what was sent,
// the result card lifecycle, the reveal ending on the real text, clear and
// collapse, and the theme switch.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as vm from 'node:vm';
import { getWebviewHtml } from '../src/webview';

type Posted = { type: string; [k: string]: unknown };

function load(opts: { reduceMotion?: boolean } = {}) {
  const posted: Posted[] = [];
  const dom = new JSDOM(getWebviewHtml({ sans: 'sans.woff2', mono: 'mono.woff2' }), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      (window as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = () => ({ postMessage: (m: Posted) => posted.push(JSON.parse(JSON.stringify(m)) as Posted) });
      (window as unknown as { matchMedia: (q: string) => unknown }).matchMedia = () => ({ matches: !!opts.reduceMotion });
      if (!(window as unknown as { CSS?: unknown }).CSS) {
        (window as unknown as { CSS: unknown }).CSS = { escape: (s: string) => String(s).replace(/["\\]/g, '\\$&') };
      }
    },
  });
  const w = dom.window;
  const send = (m: Record<string, unknown>) => w.dispatchEvent(new w.MessageEvent('message', { data: m }));
  const $ = (sel: string) => w.document.querySelector(sel) as HTMLElement | null;
  const $$ = (sel: string) => Array.from(w.document.querySelectorAll(sel)) as HTMLElement[];
  return { dom, w, send, $, $$, posted };
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SETUP = {
  type: 'setup',
  steps: [{ icon: '✓', title: 'Python 3.14', detail: 'Checking C:\\x\\python.exe (from the workspace .venv).', action: 'changePython' }, { icon: '✓', title: 'ollada 0.3.4', detail: 'Installed.' }],
  models: [
    { model: 'sdar:1.7b', label: 'Runs on CPU', detail: '3.9 GB RAM at peak.', button: false, downloaded: true, recommended: true, selected: false, dot: '#2DA44E' },
    { model: 'sdar:4b', label: 'Runs, slowly', detail: '8.6 GB RAM.', button: false, downloaded: true, recommended: false, selected: true, dot: '#D29922' },
    { model: 'dream:7b', label: 'Needs a GPU', detail: 'Not tested on CPU.', button: false, downloaded: false, recommended: false, selected: false, dot: '#CF222E' },
  ],
  cacheNote: 'Checked the model cache at C:\\hub.', serving: true, serveBanner: '', serveButton: 'Start serve', canStartServe: false,
  headerStatus: 'sdar:4b on CPU, serve on 11437 (existing)',
};
const RESULT = {
  id: 'p1', meta: '1 line changed in broken_mutate.py:3', time: '9.9 s', contextLabel: 'Sent: broken_mutate.py:3',
  diff: [{ kind: 'same', text: 'import cmath' }, { kind: 'remove', text: 'result = math.sqrt(-1)' }, { kind: 'add', text: 'result = cmath.sqrt(-1)' }],
  checks: [{ name: 'Syntax', pass: true }, { name: 'Undefined names', pass: true }, { name: 'Dead code', pass: true }],
  warnings: [], warning: 'Checks passed, but that isn’t proof it’s correct.', blocked: false,
  acceptLabel: 'Accept', rejectLabel: 'Reject', acceptPrimary: true, replayAvailable: false,
};

test('the panel script runs and says ready; website look is the default, theme switch works', () => {
  const { $, posted, send, w } = load();
  assert.equal(posted[0]?.type, 'ready');
  assert.equal(w.document.body.className, 'brand');
  assert.ok(w.document.querySelector('style')!.textContent!.includes("font-family: 'Geist'"));
  send({ type: 'settings', appearance: 'theme', animation: true });
  assert.equal(w.document.body.className, 'theme');
  assert.ok($('#welcome'), 'empty state shows the headline');
});

test('Chat and Setup are tabs; the model switcher lists downloaded models and posts selectModel', () => {
  const { $, $$, send, posted } = load();
  send(SETUP);
  assert.ok($('#chat-panel')!.classList.contains('active'));
  $('#tab-setup')!.click();
  assert.ok($('#setup-panel')!.classList.contains('active'));
  assert.ok(!$('#chat-panel')!.classList.contains('active'));
  assert.equal($$('#model-list .model').length, 3);
  assert.ok($('#model-list .model.selected')!.textContent!.includes('sdar:4b'));
  const options = $$('#model-select option').map((o) => o.textContent);
  assert.deepEqual(options, ['sdar:1.7b', 'sdar:4b'], 'only downloaded (or in-use) models');
  const sel = $('#model-select') as HTMLSelectElement;
  sel.value = 'sdar:1.7b'; sel.dispatchEvent(new sel.ownerDocument.defaultView!.Event('change'));
  assert.deepEqual(posted.at(-1), { type: 'selectModel', model: 'sdar:1.7b' });
  assert.equal($('#status-text')!.textContent, 'sdar:4b on CPU, serve on 11437 (existing)');
  assert.equal($('#serve-banner')!.style.display, 'none');
});

test('a Fix turn keeps the code that was sent, and keeps the diff after Accept', async () => {
  const { $, $$, send, posted } = load({ reduceMotion: true });
  send({ type: 'userMessage', text: 'Fix selection', title: 'Fix selection', kind: 'fix', contextLabel: 'broken_mutate.py:3', code: 'result = math.sqrt(-1)' });
  const turn = $('.turn')!;
  assert.equal(turn.querySelector('.turn-title')!.textContent, 'Fix selection');
  assert.equal(turn.querySelector('.turn-ctx')!.textContent, 'broken_mutate.py:3');
  assert.equal(turn.querySelector('.sent pre')!.textContent, 'result = math.sqrt(-1)', 'the log holds what was sent');
  send({ type: 'waiting', title: 'Working on a fix', elapsed: '1.0 s' });
  assert.ok(turn.querySelector('.diffusing'), 'masked-block waiting card inside the turn');
  send({ type: 'waitingDone' });
  send({ type: 'result', result: RESULT });
  assert.equal(turn.querySelector('.pill')!.textContent, 'Proposed');
  assert.ok(turn.querySelector('.diff')!.textContent!.includes('+ result = cmath.sqrt(-1)'));
  (turn.querySelector('[data-accept="p1"]') as HTMLButtonElement).click();
  assert.deepEqual(posted.at(-1), { type: 'accept', id: 'p1' });
  send({ type: 'dismiss', id: 'p1', note: 'Applied. Undo with Ctrl+Z in the editor.' });
  assert.equal(turn.querySelector('.pill')!.textContent, 'Applied');
  assert.equal(turn.querySelector('[data-accept]'), null, 'Accept/Reject are gone');
  assert.ok(turn.querySelector('.diff')!.textContent!.includes('cmath.sqrt'), 'the diff stays, so you can see what changed');
  assert.equal($$('.turn').length, 1);
});

test('Discard offers a retry inside the turn; a new turn collapses the finished one', () => {
  const { $, $$, send, posted } = load({ reduceMotion: true });
  send({ type: 'userMessage', text: 'Fix selection', title: 'Fix selection', kind: 'fix', contextLabel: 'f.py:3', code: 'x' });
  send({ type: 'result', result: RESULT });
  send({ type: 'dismiss', id: 'p1', note: 'Discarded. The file was not changed.', offerRetryFix: true, retryContextLabel: 'f.py:3' });
  const first = $('.turn')!;
  assert.equal(first.querySelector('.pill')!.textContent, 'Discarded');
  const box = first.querySelector('.retry textarea') as HTMLTextAreaElement;
  box.value = 'math is already imported';
  (first.querySelector('[data-retry]') as HTMLButtonElement).click();
  assert.deepEqual(posted.at(-1), { type: 'retryFix', text: 'math is already imported' });
  send({ type: 'userMessage', text: 'Retry fix: math is already imported', title: 'Retry fix: math is already imported', kind: 'fix', contextLabel: 'f.py:3', code: 'x' });
  assert.equal($$('.turn').length, 2);
  assert.ok(first.classList.contains('collapsed'), 'the finished turn collapses');
  (first.querySelector('.turn-head') as HTMLButtonElement).click();
  assert.ok(!first.classList.contains('collapsed'), 'and can be opened again');
});

test('the reveal ends on exactly the model text, and clicking skips it', async () => {
  const { $, send } = load({ reduceMotion: false });
  send({ type: 'settings', appearance: 'brand', animation: true });
  send({ type: 'userMessage', text: 'what does this do?', title: 'what does this do?', kind: 'chat', contextLabel: '', code: '' });
  const text = 'It computes the square root of -1 with cmath, which returns 1j.';
  send({ type: 'message', meta: 'sdar:4b, 3.2 s', body: text, isCode: false });
  const ans = $('.answer')!;
  assert.ok(ans.querySelector('.rv'), 'masked tokens while revealing');
  ans.click();
  assert.equal(ans.textContent, text);
  send({ type: 'message', meta: 'sdar:4b', body: 'second answer here', isCode: false });
  await wait(1400);
  const answers = Array.from(document_answers($));
  assert.equal(answers.at(-1), 'second answer here', 'finishes by itself on the real text');
});
function document_answers($: (s: string) => HTMLElement | null): string[] {
  const out: string[] = [];
  const doc = $('body')!.ownerDocument;
  doc.querySelectorAll('.answer').forEach((a) => out.push(a.textContent || ''));
  return out;
}

test('no animation with reduced motion or the setting off: text appears at once', () => {
  const off = load({ reduceMotion: false });
  off.send({ type: 'settings', appearance: 'brand', animation: false });
  off.send({ type: 'message', meta: 'm', body: 'plain answer', isCode: false });
  assert.equal(off.$('.answer')!.textContent, 'plain answer');
  assert.equal(off.$('.answer .rv'), null);
  const rm = load({ reduceMotion: true });
  rm.send({ type: 'message', meta: 'm', body: 'plain answer', isCode: false });
  assert.equal(rm.$('.answer .rv'), null);
});

test('Clear empties the log and tells the extension; collapse-all collapses every turn', () => {
  const { $, $$, send, posted } = load({ reduceMotion: true });
  send({ type: 'userMessage', text: 'a', title: 'a', kind: 'chat', contextLabel: '', code: '' });
  send({ type: 'message', meta: 'm', body: 'one', isCode: false });
  send({ type: 'userMessage', text: 'b', title: 'b', kind: 'chat', contextLabel: '', code: '' });
  $('#collapse-btn')!.click();
  assert.ok($$('.turn').every((t) => t.classList.contains('collapsed')));
  $('#clear-btn')!.click();
  assert.equal($$('.turn').length, 0);
  assert.equal(posted.at(-1)?.type, 'clear');
});

test('context chip, action buttons and the blocked (syntax error) card', () => {
  const { $, send } = load({ reduceMotion: true });
  send({ type: 'context', label: 'broken_mutate.py:1-4', path: 'C:\\x\\broken_mutate.py', hasFile: true, hasSelection: true, explain: true, fix: true, insert: true, headerImports: ['math'], headerImportsTruncated: false });
  assert.equal($('#chip-text')!.textContent, 'broken_mutate.py:1-4 + imports');
  assert.equal(($('#fix-btn') as HTMLButtonElement).disabled, false);
  assert.equal($('#insert-btn')!.textContent, 'Replace');
  send({ type: 'userMessage', text: 'Insert', title: 'Insert', kind: 'insert', contextLabel: 'x.py:1', code: 'x' });
  send({ type: 'result', result: { ...RESULT, id: 'p2', blocked: true, acceptPrimary: false, acceptLabel: 'Insert', rejectLabel: 'Discard', warning: 'The proposed file has a syntax error.' } });
  assert.equal(($('[data-accept="p2"]') as HTMLButtonElement).disabled, true, 'Insert is off for a syntax error');
  assert.ok($('.box.bad'));
});

test('the panel script compiles as plain JavaScript (catches template escaping mistakes)', () => {
  const html = getWebviewHtml({ sans: 'a', mono: 'b' });
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  assert.doesNotThrow(() => new vm.Script(script));
});

test('font stacks never depend on a VS Code variable without a fallback (the serif bug)', () => {
  const css = getWebviewHtml().split('<style>')[1].split('</style>')[0];
  const fontDecls = css.split('\n').filter((l) => /--font:|--mono:|font-family:/.test(l));
  for (const l of fontDecls) {
    for (const m of l.matchAll(/var\((--vscode-[\w-]+)([^)]*)\)/g)) {
      assert.ok(m[2].trim().startsWith(','), `var(${m[1]}) needs a fallback in: ${l.trim()}`);
    }
  }
});

test('empty state offers actions for the file you are in; tools appear only once there is a turn', () => {
  const { $, $$, send, posted } = load({ reduceMotion: true });
  assert.equal(($('#log-tools') as HTMLElement & { hidden: boolean }).hidden, true, 'no clear/collapse on an empty chat');
  assert.ok($('#starters')!.textContent!.includes('Open a file'));
  send({ type: 'context', label: 'broken_mutate.py:3', path: 'x', hasFile: true, hasSelection: true, explain: true, fix: true, insert: true, headerImports: [], headerImportsTruncated: false });
  const starters = $$('#starters [data-start]').map((b) => b.dataset.start);
  assert.deepEqual(starters, ['fix', 'explain', 'insert']);
  ($('#starters [data-start="fix"]') as HTMLButtonElement).click();
  assert.deepEqual(posted.at(-1), { type: 'action', action: 'fix' });
  assert.equal(($('#composer') as HTMLTextAreaElement).placeholder, 'Ask about broken_mutate.py');
  send({ type: 'context', label: 'broken_mutate.py, no selection', path: 'x', hasFile: true, hasSelection: false, explain: false, fix: false, insert: true, headerImports: [], headerImportsTruncated: false });
  assert.ok($('#starters')!.textContent!.includes('Select code'));
  send({ type: 'userMessage', text: 'Fix selection', title: 'Fix selection', kind: 'fix', contextLabel: 'f.py:3', code: 'x' });
  assert.equal(($('#log-tools') as HTMLElement & { hidden: boolean }).hidden, false);
  $('#clear-btn')!.click();
  assert.equal(($('#log-tools') as HTMLElement & { hidden: boolean }).hidden, true);
  assert.notEqual($('#welcome')!.style.display, 'none', 'the empty state comes back after Clear');
});

test('one header row: the model picker carries the serve status, no duplicate status line', () => {
  const { $, send } = load();
  send(SETUP);
  assert.equal($('#model-pick')!.title, 'sdar:4b on CPU, serve on 11437 (existing)');
  assert.ok($('#status-dot')!.classList.contains('ok'));
  assert.equal($('.status-row'), null);
  assert.ok($('#send-btn svg'), 'send is an icon button, not a text arrow');
});

test('Mercury: connect offered when not connected; cloud option only appears once connected', () => {
  const { $, $$, send, posted } = load({ reduceMotion: true });
  send({ ...SETUP, mercury: { connected: false, selected: false, model: 'mercury-3' }, cloudActive: false });
  assert.ok($('#cloud')!.textContent!.includes('leaves this machine'), 'the warning is always visible in Setup');
  assert.deepEqual($$('#model-select option').map((o) => o.textContent), ['sdar:1.7b', 'sdar:4b'], 'no cloud option before a key is saved');
  ($('#cloud [data-act="connectMercury"]') as HTMLButtonElement).click();
  assert.deepEqual(posted.at(-1), { type: 'connectMercury' });
  send({ ...SETUP, mercury: { connected: true, selected: false, model: 'mercury-3' }, cloudActive: false });
  assert.deepEqual($$('#model-select option').map((o) => o.textContent), ['sdar:1.7b', 'sdar:4b', 'mercury-3']);
  assert.deepEqual($$('#model-select optgroup').map((g) => g.getAttribute('label')), ['On this machine', 'Cloud (Inception)']);
  ($('#cloud [data-act="useMercury"]') as HTMLButtonElement).click();
  assert.deepEqual(posted.at(-1), { type: 'selectModel', model: 'mercury-3' });
  ($('#cloud [data-act="disconnectMercury"]') as HTMLButtonElement).click();
  assert.deepEqual(posted.at(-1), { type: 'disconnectMercury' });
});

test('Mercury in use: header shows cloud status, no serve banner, cloud turns are tagged', () => {
  const { $, send } = load({ reduceMotion: true });
  send({ ...SETUP, serving: false, serveBanner: 'Serve isn’t running.', headerStatus: 'mercury-3, cloud (Inception)', mercury: { connected: true, selected: true, model: 'mercury-3' }, cloudActive: true });
  assert.equal(($('#model-select') as HTMLSelectElement).value, 'mercury-3');
  assert.ok($('#status-dot')!.classList.contains('is-cloud'));
  assert.equal($('#serve-banner')!.style.display, 'none', 'no local-serve nag while the cloud model is in use');
  assert.ok($('#cloud')!.textContent!.includes('In use'));
  send({ type: 'userMessage', text: 'Fix selection', title: 'Fix selection', kind: 'fix', contextLabel: 'f.py:3', code: 'x', cloud: true });
  assert.equal($('.turn .cloud-tag')!.textContent, 'cloud');
  send({ type: 'userMessage', text: 'Fix selection', title: 'Fix selection', kind: 'fix', contextLabel: 'f.py:3', code: 'x', cloud: false });
  assert.equal(Array.from($('body')!.ownerDocument.querySelectorAll('.turn'))[1].querySelector('.cloud-tag'), null, 'local turns have no cloud tag');
});

test('Chat answer with a fenced block: code first with Copy + Insert, prose under it', () => {
  const { $, $$, send, posted } = load({ reduceMotion: true });
  send({ type: 'userMessage', text: 'write me a python file that reads a csv', title: 'write me a python file that reads a csv', kind: 'chat', contextLabel: '', code: '' });
  const body = "Sure, here's an example:\n\n```python\nimport csv\n\nwith open('example.csv', 'r') as file:\n    print(file.read())\n```\n\nThis code uses the 'csv' module.";
  send({ type: 'message', meta: 'sdar:4b, 87.5 s', body, isCode: false, id: 'a1' });
  const wrap = $('.answer-wrap')!;
  assert.ok(wrap, 'answer rendered');
  const blocks = $$('.code-block');
  assert.equal(blocks.length, 1, 'one fenced block, one code block');
  assert.ok(blocks[0].textContent!.includes("with open('example.csv', 'r') as file:"));
  assert.ok(blocks[0].textContent!.includes('python'), 'language label shown');
  assert.ok(blocks[0].querySelector('[data-copy-block="0"]'), 'Copy button on the block');
  assert.ok(blocks[0].querySelector('[data-insert-block="0"]'), 'Insert button on the block');
  // Code comes before the explanation in the DOM, and the explanation
  // does not carry the code.
  const order = Array.from(wrap.children).map((c) => c.className);
  assert.ok(order.indexOf('code-block') < order.indexOf('answer'), 'code first, prose under it: ' + order.join(', '));
  assert.ok($('.answer')!.textContent!.includes("This code uses the 'csv' module."));
  assert.ok(!$('.answer')!.textContent!.includes('import csv'));
  // Copy and Insert name the block by id + index; neither carries the code itself.
  (blocks[0].querySelector('[data-copy-block]') as HTMLButtonElement).click();
  assert.deepEqual(posted.at(-1), { type: 'copyChatBlock', id: 'a1', index: 0 });
  (blocks[0].querySelector('[data-insert-block]') as HTMLButtonElement).click();
  assert.deepEqual(posted.at(-1), { type: 'insertChatBlock', id: 'a1', index: 0 });
});

test('Chat answer with two blocks: each gets its own buttons and index', () => {
  const { $$, send } = load({ reduceMotion: true });
  send({ type: 'userMessage', text: 'two', title: 'two', kind: 'chat', contextLabel: '', code: '' });
  send({ type: 'message', meta: 'm', body: 'A:\n\n```python\nprint(1)\n```\n\nB:\n\n```python\nprint(2)\n```', isCode: false, id: 'a2' });
  const blocks = $$('.code-block');
  assert.equal(blocks.length, 2);
  assert.ok(blocks[0].textContent!.includes('print(1)'));
  assert.ok(blocks[1].textContent!.includes('print(2)'));
  assert.ok(blocks[1].querySelector('[data-insert-block="1"]'), 'second block has its own Insert with index 1');
});

test('Chat answer with no fence renders as before, with no code-block buttons', () => {
  const { $, $$, send } = load({ reduceMotion: true });
  send({ type: 'userMessage', text: 'why', title: 'why', kind: 'chat', contextLabel: '', code: '' });
  send({ type: 'message', meta: 'm', body: 'Just an explanation, no code.', isCode: false, id: 'a3' });
  assert.equal($$('.code-block').length, 0);
  assert.equal($('.answer')!.textContent, 'Just an explanation, no code.');
});

test('welcome headline replay: the button replays the reveal', () => {
  const { $, send } = load({ reduceMotion: true });
  send({ type: 'settings', appearance: 'brand', animation: true });
  const title = $('#welcome-title')!;
  assert.equal(title.textContent, 'Pull a diffusion model. Run it.');
  const btn = $('#welcome-replay') as HTMLButtonElement | null;
  assert.ok(btn, 'welcome block has a Replay button');
  btn!.click();
  assert.equal(title.textContent, 'Pull a diffusion model. Run it.', 'replay ends on the real headline');
});
