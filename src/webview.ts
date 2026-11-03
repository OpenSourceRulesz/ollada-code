// Webview HTML for the ollada-code panel.
// Theme: VS Code variables for everything structural. Ollada constants
// are few and fixed: accent #6C6FD8 is logo/icons/active markers/
// slider/large graphics ONLY, never small text or links on light themes.
// Primary buttons and text accents are #5558C9, hover #6265D6.
// UI font is the VS Code font (var(--vscode-font-family)); Geist
// bundling is deferred before any publish (spec 10c, license unchecked).
// Code always uses the editor font. No forced near-black skin.
//
// 0.1.4 layout (dogfood fixes):
// - Chat is always visible. Setup is a collapsible section under the
//   header, open while serve isn't reachable, collapsed once it is.
// - Header stays at the top, the chat log scrolls in the middle, and
//   the context chip, Explain / Fix / Insert, and the composer are
//   pinned to the bottom. New messages scroll the log to the bottom.
// - The context chip always shows the file and lines that will be sent.
// - Each proposal is its own card with an id. Discard removes that card.
//   A blocked proposal (syntax error) has Accept / Insert turned off.
// - The Watch diffusion button only appears when serve returned real
//   snapshots. Stock serve 0.3.4 never does, so it never appears there.
export function getWebviewHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    background: var(--vscode-sideBar-background);
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    margin: 0; padding: 0;
  }
  #shell { display: flex; flex-direction: column; height: 100vh; }
  #top {
    flex: none; display: flex; align-items: center; gap: 8px; padding: 8px 12px;
    border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
  }
  #top .name { font-weight: 600; }
  #header-status { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #setup {
    flex: none; max-height: 50vh; overflow-y: auto; padding: 4px 12px 10px;
    border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
  }
  #serve-banner {
    flex: none; display: none; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 12px;
    border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
    background: var(--vscode-inputValidation-warningBackground);
  }
  #log { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 12px; }
  #dock {
    flex: none; padding: 8px 12px 10px; display: flex; flex-direction: column; gap: 8px;
    border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
  }
  h2 { font-size: 1.1em; margin: 8px 0; }
  .secondary { color: var(--vscode-descriptionForeground); }
  .small { font-size: 0.9em; }
  button {
    background: #5558C9; color: #fff; border: 1px solid transparent;
    border-radius: 4px; padding: 6px 12px; cursor: pointer; font: inherit;
  }
  button:hover { background: #6265D6; }
  button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  button:disabled, button:disabled:hover { opacity: 0.5; cursor: default; background: #5558C9; }
  button.secondary:disabled, button.secondary:disabled:hover { background: var(--vscode-button-secondaryBackground); }
  button:focus-visible, input:focus-visible, textarea:focus-visible, summary:focus-visible {
    outline: 2px solid var(--vscode-focusBorder); outline-offset: 1px;
  }
  .link-btn { background: transparent; color: var(--vscode-textLink-foreground); padding: 2px 4px; }
  .link-btn:hover { background: transparent; text-decoration: underline; }
  a { color: #5558C9; }
  body.vscode-dark a { color: #A9ABEE; }
  textarea {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
    border-radius: 4px; width: 100%; padding: 6px; font: inherit; resize: vertical;
  }
  .card {
    border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
    border-radius: 8px; padding: 10px; margin: 10px 0;
  }
  .card-recommended { border-color: #5558C9; background: rgba(85, 88, 201, 0.10); }
  #model-picker .card { cursor: pointer; }
  .card-selected { border-color: #5558C9; border-width: 2px; }
  .step { display: flex; gap: 8px; align-items: flex-start; margin: 10px 0; }
  .step-circle {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; min-width: 22px; border-radius: 50%;
    font-size: 0.85em; font-weight: 700; flex-shrink: 0; margin-top: 1px;
  }
  .step-done { background: #2DA44E; color: #fff; }
  .step-num { background: #5558C9; color: #fff; }
  .step-warn { background: #D29922; color: #1f1f1f; }
  .fit-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; vertical-align: middle; margin-right: 2px; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
  .dot-ok { background: #2DA44E; }
  .dot-warn { background: #D29922; }
  .pill-btn {
    background: transparent; border: 1px solid var(--vscode-widget-border);
    color: var(--vscode-foreground); border-radius: 999px; padding: 5px 12px;
  }
  .pill-btn:hover { border-color: #5558C9; background: rgba(85, 88, 201, 0.12); }
  .pill-btn:disabled, .pill-btn:disabled:hover { background: transparent; border-color: var(--vscode-widget-border); }
  .chip {
    display: inline-flex; align-items: center; gap: 6px; max-width: 100%;
    padding: 3px 8px; border-radius: 4px; font-size: 0.9em;
    border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
    color: var(--vscode-descriptionForeground);
  }
  .chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip.empty { border-style: dashed; }
  .composer-row { display: flex; gap: 6px; align-items: flex-end; }
  .send-btn {
    width: 40px; min-width: 40px; height: 40px; font-size: 1.25em; line-height: 1; padding: 0; border-radius: 8px;
  }
  .pill {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
    border-radius: 4px; padding: 6px 8px; font-family: var(--vscode-editor-font-family);
    font-size: var(--vscode-editor-font-size); word-break: break-all; margin-top: 4px;
  }
  .row { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .badge { font-weight: 600; }
  .diff { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); white-space: pre-wrap; margin: 8px 0; }
  .diff .add { background: var(--vscode-diffEditor-insertedLineBackground); display: block; }
  .diff .remove { background: var(--vscode-diffEditor-removedLineBackground); display: block; }
  .warning {
    background: var(--vscode-inputValidation-warningBackground);
    border: 1px solid var(--vscode-inputValidation-warningBorder);
    border-radius: 8px; padding: 8px; margin: 8px 0;
  }
  .blocked {
    background: var(--vscode-inputValidation-errorBackground);
    border: 1px solid var(--vscode-inputValidation-errorBorder);
    border-radius: 8px; padding: 8px; margin: 8px 0;
  }
  .msg { margin: 10px 0; }
  .msg .meta { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
  .msg.user .body { background: rgba(85, 88, 201, 0.12); border-radius: 8px; padding: 6px 10px; display: inline-block; }
  .note { color: var(--vscode-descriptionForeground); margin: 8px 0; font-size: 0.95em; }
  .logo { display: inline-flex; }
  .mask { background: #6C6FD8; color: transparent; border-radius: 2px; padding: 0 2px; }
  body.vscode-light .mask { background: #D3D4F0; }
  #replay-screen { position: fixed; inset: 0; background: var(--vscode-sideBar-background); padding: 12px; overflow-y: auto; display: none; }
  @media (max-width: 360px) { .row { flex-direction: column; } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; scroll-behavior: auto !important; } }
</style>
</head>
<body>
<div id="shell">
  <header id="top">
    <span class="logo" aria-hidden="true"><svg width="18" height="18" viewBox="12 24 106 100" fill="#6C6FD8"><circle cx="26" cy="34" r="10"/><circle cx="22" cy="76" r="10"/><circle cx="38" cy="114" r="10"/><circle cx="72" cy="74" r="10"/><circle cx="108" cy="52" r="10"/><circle cx="108" cy="96" r="10"/></svg></span>
    <span class="name">Ollada</span>
    <span id="header-status" class="secondary small">Checking…</span>
    <button id="setup-toggle" class="secondary" aria-expanded="true" aria-controls="setup"><span id="setup-dot" class="dot dot-warn" aria-hidden="true"></span>Setup</button>
  </header>

  <section id="setup" aria-label="Setup">
    <h2>Set up Ollada on this machine</h2>
    <p class="secondary small">Nothing downloads or starts until you click. No telemetry.</p>
    <div id="setup-steps"></div>
    <div id="model-picker"></div>
    <p id="cache-note" class="secondary small"></p>
    <div class="row">
      <button id="check-again-btn" class="secondary">Check again</button>
    </div>
    <p class="secondary small">Replay needs a future ollada serve that records diffusion steps. Serve 0.3.4 doesn’t, so there’s no replay yet.</p>
  </section>

  <div id="serve-banner" role="status">
    <span id="serve-banner-text">Serve isn’t running.</span>
    <button id="start-serve-btn">Start serve</button>
  </div>

  <main id="log" aria-live="polite" aria-label="Chat"></main>

  <footer id="dock">
    <div><span id="chip" class="chip empty" title=""><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/></svg><span id="chip-text">No file selected</span></span></div>
    <div class="actions">
      <button id="explain-btn" class="pill-btn" disabled>Explain selection</button>
      <button id="fix-btn" class="pill-btn" disabled>Fix selection</button>
      <button id="insert-btn" class="pill-btn" disabled>Insert at cursor</button>
    </div>
    <div class="composer-row">
      <label for="composer" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Message</label>
      <textarea id="composer" rows="2" placeholder="Ask about this file (Ctrl+Enter to send)"></textarea>
      <button id="send-btn" class="send-btn" aria-label="Send">→</button>
    </div>
    <p class="secondary small" style="margin:0">With code selected, Insert replaces the selection. With nothing selected, it writes at the cursor. It doesn’t read the code after the cursor yet; that comes with API-level fill-in-the-middle in Phase 2.</p>
  </footer>
</div>

<section id="replay-screen" aria-label="Watch diffusion">
  <p><button id="back-link" class="link-btn">‹ Back to the chat</button></p>
  <h2>Watch diffusion</h2>
  <p class="secondary" id="replay-sub"></p>
  <div id="replay-canvas" class="diff"></div>
  <p><span id="replay-status"></span> <span id="replay-counter" style="float:right"></span></p>
  <div class="row">
    <button id="replay-prev" class="secondary" aria-label="Previous step">‹</button>
    <button id="replay-play">Play</button>
    <button id="replay-next" class="secondary" aria-label="Next step">›</button>
    <input id="replay-slider" type="range" min="0" max="0" value="0" aria-label="Step" style="flex:1">
  </div>
</section>
<script>
  const vscode = acquireVsCodeApi();
  const state = { frames: [], frameIndex: 0, totalSteps: 0, replaySub: '', setupTouched: false, setupOpen: true, serving: null };
  function post(type, data) { vscode.postMessage(Object.assign({ type: type }, data || {})); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  const log = document.getElementById('log');
  function scrollLog() { log.scrollTop = log.scrollHeight; }
  function append(el) { log.appendChild(el); scrollLog(); }

  function setSetupOpen(open) {
    state.setupOpen = open;
    document.getElementById('setup').style.display = open ? 'block' : 'none';
    document.getElementById('setup-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  document.getElementById('setup-toggle').onclick = function() { state.setupTouched = true; setSetupOpen(!state.setupOpen); };

  function renderSetup(m) {
    let canonical = 0;
    document.getElementById('setup-steps').innerHTML = m.steps.map(function(s) {
      let circle = '';
      if (s.icon === '✓') { canonical++; circle = '<span class="step-circle step-done" aria-hidden="true">✓</span>'; }
      else if (s.icon === '⚠') { circle = '<span class="step-circle step-warn" aria-hidden="true">!</span>'; }
      else { canonical++; circle = '<span class="step-circle step-num" aria-hidden="true">' + canonical + '</span>'; }
      return '<div class="step">' + circle + '<div><strong>' + esc(s.title) + '</strong><div class="secondary small">' + esc(s.detail) + '</div>' +
        (s.command ? '<div class="pill">' + esc(s.command) + ' <button class="secondary" data-copy="' + esc(s.command) + '">Copy</button></div>' : '') +
        (s.action === 'changePython' ? '<div class="row"><button class="secondary" data-act="changePython">Change Python</button></div>' : '') +
        '</div></div>';
    }).join('');
    document.getElementById('model-picker').innerHTML = m.models.map(function(row) {
      return '<div class="card' + (row.recommended ? ' card-recommended' : '') + (row.selected ? ' card-selected' : '') + '" data-select="' + esc(row.model) + '" title="Click to select this model"><strong style="font-family:var(--vscode-editor-font-family)">' + esc(row.model) + '</strong> ' +
        (row.recommended ? '<span class="badge">Recommended</span> ' : '') +
        (row.selected ? '<span class="badge">Selected</span> ' : '') +
        '<span class="fit-dot" style="background:' + esc(row.dot || '#8B949E') + '" aria-hidden="true"></span> ' +
        '<span class="badge">' + esc(row.label) + '</span><br><span class="secondary small">' + esc(row.detail || '') + '</span>' +
        (row.downloaded ? '<div class="row"><span class="secondary">Downloaded</span></div>' :
          (row.button ? '<div class="row"><button data-download="' + esc(row.model) + '">Download</button></div>' : '')) + '</div>';
    }).join('');
    document.getElementById('cache-note').textContent = m.cacheNote || '';
    const dot = document.getElementById('setup-dot');
    dot.className = 'dot ' + (m.serving ? 'dot-ok' : 'dot-warn');
    // Open while serve isn't reachable, collapsed once it is, unless the
    // user has toggled it themselves.
    if (!state.setupTouched && state.serving !== m.serving) { setSetupOpen(!m.serving); }
    state.serving = m.serving;
    const banner = document.getElementById('serve-banner');
    if (m.serving) { banner.style.display = 'none'; }
    else {
      banner.style.display = 'flex';
      document.getElementById('serve-banner-text').textContent = m.serveBanner || 'Serve isn’t running.';
      const btn = document.getElementById('start-serve-btn');
      btn.textContent = m.serveButton || 'Start serve';
      btn.disabled = !m.canStartServe;
    }
    document.getElementById('header-status').textContent = m.headerStatus || '';
  }
  document.getElementById('setup').addEventListener('click', function(e) {
    const t = e.target.closest('button');
    if (t) {
      if (t.dataset.copy) { post('copy', { text: t.dataset.copy }); }
      if (t.dataset.download) { post('download', { model: t.dataset.download }); }
      if (t.dataset.act === 'changePython') { post('changePython', {}); }
      return;
    }
    // Card click (not a button): select that model. Download buttons
    // are handled above and must not also select.
    const card = e.target.closest('[data-select]');
    if (card) { post('selectModel', { model: card.dataset.select }); }
  });

  function renderContext(c) {
    const chip = document.getElementById('chip');
    document.getElementById('chip-text').textContent = c.label;
    chip.title = c.path || '';
    chip.className = 'chip' + (c.hasFile ? '' : ' empty');
    const ex = document.getElementById('explain-btn'), fx = document.getElementById('fix-btn'), ins = document.getElementById('insert-btn');
    ex.disabled = !c.explain; fx.disabled = !c.fix; ins.disabled = !c.insert;
    const need = c.hasFile ? 'Select the code first' : 'Open a file first';
    ex.title = c.explain ? 'Explain ' + c.label : need;
    fx.title = c.fix ? 'Fix ' + c.label : need;
    ins.title = c.insert ? (c.hasSelection ? 'Replace ' + c.label : 'Insert at the cursor in ' + c.label) : 'Open a file first';
  }

  function addMessage(meta, body, isCode, cls) {
    const el = document.createElement('div'); el.className = 'msg' + (cls ? ' ' + cls : '');
    el.innerHTML = (meta ? '<div class="meta">' + esc(meta) + '</div>' : '') +
      '<div class="body">' + (isCode ? '<pre class="diff">' + esc(body) + '</pre>' : esc(body)) + '</div>';
    append(el);
  }
  function addNote(text) { const el = document.createElement('div'); el.className = 'note'; el.textContent = text; append(el); }

  let waitingEl = null;
  function showWaiting(title, elapsed, rangeLine) {
    if (!waitingEl) { waitingEl = document.createElement('div'); waitingEl.className = 'card'; append(waitingEl); }
    waitingEl.innerHTML = '<strong>' + esc(title) + '</strong> <span style="float:right;font-family:var(--vscode-editor-font-family)">' + esc(elapsed) + '</span>' +
      (rangeLine ? '<p class="secondary small">' + esc(rangeLine) + '</p>' : '') +
      '<p class="secondary small">There’s no live preview yet.</p>' +
      '<button class="secondary" data-cancel="1">Cancel</button>';
  }
  function hideWaiting() { if (waitingEl) { waitingEl.remove(); waitingEl = null; } }

  function showResult(r) {
    const el = document.createElement('div'); el.className = 'card'; el.dataset.id = r.id;
    const diffHtml = r.diff.map(function(d) {
      const cls = d.kind === 'add' ? 'add' : d.kind === 'remove' ? 'remove' : '';
      const prefix = d.kind === 'add' ? '+' : d.kind === 'remove' ? '-' : ' ';
      return '<span class="' + cls + '">' + esc(prefix + d.text) + '</span>';
    }).join('\\n');
    const checksHtml = r.checks ? r.checks.map(function(c) {
      return '<span>' + (c.pass ? '✓ ' : '✗ ') + esc(c.name) + (c.message ? ' — ' + esc(c.message) : '') + '</span>';
    }).join(' · ') : '';
    const warnsHtml = r.warnings ? r.warnings.map(function(w) { return '<span>! ' + esc(w) + '</span>'; }).join(' · ') : '';
    el.innerHTML = '<div><span>' + esc(r.meta) + '</span><span style="float:right">' + esc(r.time) + '</span></div>' +
      '<div class="secondary small">' + esc(r.contextLabel) + '</div>' +
      '<pre class="diff">' + diffHtml + '</pre>' +
      (r.checks ? '<div class="small">' + checksHtml + (warnsHtml ? ' · ' + warnsHtml : '') + '</div>' : '') +
      '<div class="' + (r.blocked ? 'blocked' : 'warning') + '">' + esc(r.warning) + '</div>' +
      '<div class="row">' +
      '<button data-accept="' + esc(r.id) + '"' + (r.blocked ? ' disabled aria-disabled="true" title="Turned off: the proposed file has a syntax error"' : '') + (r.acceptPrimary ? '' : ' class="secondary"') + '>' + esc(r.acceptLabel) + '</button>' +
      '<button data-reject="' + esc(r.id) + '"' + (r.acceptPrimary ? ' class="secondary"' : '') + '>' + esc(r.rejectLabel) + '</button>' +
      (r.replayAvailable ? '<button data-watch="' + esc(r.id) + '" class="secondary">Watch diffusion</button>' : '') +
      '</div>';
    append(el);
  }
  function dismissCard(id, note) {
    const el = log.querySelector('.card[data-id="' + CSS.escape(id) + '"]');
    if (el) { el.remove(); }
    if (note) { addNote(note); }
  }
  log.addEventListener('click', function(e) {
    const t = e.target.closest('button'); if (!t) { return; }
    if (t.dataset.cancel) { post('cancel', {}); }
    if (t.dataset.accept && !t.disabled) { t.disabled = true; post('accept', { id: t.dataset.accept }); }
    if (t.dataset.reject) { t.disabled = true; post('reject', { id: t.dataset.reject }); }
    if (t.dataset.watch) { post('watch', { id: t.dataset.watch }); }
  });

  function renderReplay() {
    const frame = state.frames[state.frameIndex] || null;
    document.getElementById('replay-sub').textContent = state.replaySub || '';
    if (!frame) { document.getElementById('replay-canvas').textContent = ''; return; }
    document.getElementById('replay-canvas').innerHTML = frame.tokens.map(function(tok, i) {
      return frame.masked[i] ? '<span class="mask">' + esc(tok) + '</span>' : esc(tok);
    }).join('');
    document.getElementById('replay-status').textContent = 'Block ' + (frame.block + 1) + ', step ' + (frame.step + 1);
    document.getElementById('replay-counter').textContent = (state.frameIndex + 1) + ' / ' + state.totalSteps;
    const slider = document.getElementById('replay-slider');
    slider.max = String(Math.max(0, state.frames.length - 1)); slider.value = String(state.frameIndex);
  }

  document.getElementById('start-serve-btn').onclick = function() { post('startServe', {}); };
  document.getElementById('check-again-btn').onclick = function() { post('checkAgain', {}); };
  document.getElementById('explain-btn').onclick = function() { post('action', { action: 'explain' }); };
  document.getElementById('fix-btn').onclick = function() { post('action', { action: 'fix' }); };
  document.getElementById('insert-btn').onclick = function() { post('action', { action: 'insert' }); };
  document.getElementById('send-btn').onclick = function() {
    const box = document.getElementById('composer');
    const v = box.value; if (v.trim()) { post('chat', { text: v }); box.value = ''; }
  };
  document.getElementById('composer').addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); document.getElementById('send-btn').click(); }
  });
  document.getElementById('back-link').onclick = function() { document.getElementById('replay-screen').style.display = 'none'; };
  document.getElementById('replay-prev').onclick = function() { state.frameIndex = Math.max(0, state.frameIndex - 1); renderReplay(); };
  document.getElementById('replay-next').onclick = function() { state.frameIndex = Math.min(state.frames.length - 1, state.frameIndex + 1); renderReplay(); };
  document.getElementById('replay-slider').oninput = function(e) { state.frameIndex = Number(e.target.value); renderReplay(); };
  document.getElementById('replay-play').onclick = function() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { state.frameIndex = state.frames.length - 1; renderReplay(); return; }
    const timer = setInterval(function() {
      if (state.frameIndex >= state.frames.length - 1) { clearInterval(timer); return; }
      state.frameIndex++; renderReplay();
    }, 220);
  };

  window.addEventListener('message', function(event) {
    const m = event.data;
    if (m.type === 'setup') { renderSetup(m); }
    if (m.type === 'context') { renderContext(m); }
    if (m.type === 'status') { document.getElementById('header-status').textContent = m.status; }
    if (m.type === 'userMessage') { addMessage(m.contextLabel ? 'Sent: ' + m.contextLabel : '', m.text, false, 'user'); }
    if (m.type === 'message') { addMessage(m.meta, m.body, m.isCode); }
    if (m.type === 'hint') { addNote(m.text); }
    if (m.type === 'waiting') { showWaiting(m.title, m.elapsed, m.rangeLine); }
    if (m.type === 'waitingDone') { hideWaiting(); }
    if (m.type === 'result') { showResult(m.result); }
    if (m.type === 'dismiss') { dismissCard(m.id, m.note); }
    if (m.type === 'replay') {
      state.frames = m.frames; state.frameIndex = 0; state.totalSteps = m.totalSteps; state.replaySub = m.sub;
      document.getElementById('replay-screen').style.display = 'block'; renderReplay();
    }
  });
  setSetupOpen(true);
  post('ready', {});
</script>
</body>
</html>`;
}
