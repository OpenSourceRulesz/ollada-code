// Webview HTML for the ollada-code panel.
// Theme: VS Code variables for everything structural. Ollada constants
// are few and fixed: accent #6C6FD8 is logo/icons/active markers/
// slider/large graphics ONLY, never small text or links on light themes.
// Primary buttons and text accents are #5558C9, hover #6265D6.
// UI font is the VS Code font (var(--vscode-font-family)); Geist
// bundling is deferred before any publish (spec 10c, license unchecked).
// Code always uses the editor font.
export function getWebviewHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; }
  body {
    background: var(--vscode-sideBar-background);
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    margin: 0; padding: 12px;
  }
  h2 { font-size: 1.15em; margin: 8px 0; }
  .secondary { color: var(--vscode-descriptionForeground); }
  button {
    background: #5558C9; color: #fff; border: 1px solid transparent;
    border-radius: 4px; padding: 6px 12px; cursor: pointer;
  }
  button:hover { background: #6265D6; }
  button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  button:disabled { opacity: 0.5; cursor: default; }
  button:focus-visible, input:focus-visible, textarea:focus-visible {
    outline: 2px solid var(--vscode-focusBorder); outline-offset: 1px;
  }
  a { color: #5558C9; }
  body.vscode-dark a { color: #A9ABEE; }
  input, textarea {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px; width: 100%; padding: 6px;
  }
  .card {
    border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
    border-radius: 6px; padding: 10px; margin: 10px 0;
  }
  .pill {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
    border-radius: 4px; padding: 6px 8px; font-family: var(--vscode-editor-font-family);
    font-size: var(--vscode-editor-font-size); word-break: break-all;
  }
  .step { margin: 8px 0; }
  .row { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
  .badge { font-weight: 600; }
  .diff { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); white-space: pre-wrap; }
  .diff .add { background: var(--vscode-diffEditor-insertedLineBackground); display: block; }
  .diff .remove { background: var(--vscode-diffEditor-removedLineBackground); display: block; }
  .warning {
    background: var(--vscode-inputValidation-warningBackground);
    border: 1px solid var(--vscode-inputValidation-warningBorder);
    border-radius: 4px; padding: 8px; margin: 8px 0;
  }
  .msg { margin: 10px 0; }
  .msg .meta { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
  .logo { color: #6C6FD8; font-size: 1.4em; letter-spacing: 2px; }
  .mask { background: #6C6FD8; color: transparent; border-radius: 2px; padding: 0 2px; }
  body.vscode-light .mask { background: #D3D4F0; }
  @media (max-width: 360px) { .row { flex-direction: column; } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
</head>
<body>
<div id="app" aria-live="polite">
  <div><span class="logo" aria-label="Ollada six-dot mark">● ● ● ● ● ●</span> <strong>Ollada</strong> <span id="header-status" class="secondary"></span></div>

  <section id="setup-screen" style="display:none">
    <h2>Set up Ollada on this machine</h2>
    <p class="secondary">Nothing downloads or starts until you click. No telemetry.</p>
    <div id="setup-steps"></div>
    <div id="model-picker"></div>
    <div class="row">
      <button id="start-serve-btn">Start serve</button>
      <button id="check-again-btn" class="secondary">Check again</button>
    </div>
    <p id="setup-note" class="secondary"></p>
  </section>

  <section id="chat-screen" style="display:none">
    <div class="row">
      <button id="explain-btn" class="secondary">Explain selection</button>
      <button id="fix-btn" class="secondary">Fix selection</button>
      <button id="insert-btn" class="secondary">Insert at cursor</button>
    </div>
    <div id="messages"></div>
    <div id="waiting" class="card" style="display:none"></div>
    <div id="result" class="card" style="display:none"></div>
    <div class="row">
      <textarea id="composer" rows="3" placeholder="Ask about this file"></textarea>
    </div>
    <div class="row"><button id="send-btn">Send</button></div>
    <p class="secondary">Inserting writes new code at the cursor. It doesn’t read the code after the cursor yet; that comes with API-level fill-in-the-middle in Phase 2.</p>
  </section>

  <section id="replay-screen" style="display:none">
    <p><a href="#" id="back-link">‹ Back to the fix</a></p>
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
    <p class="secondary">Legend: Not reached yet · Current block, still masked · Just written. Replay works with SDAR models. For other models this button reads “Replay not available for this model”.</p>
  </section>
</div>
<script>
  const vscode = acquireVsCodeApi();
  let state = { screen: 'setup', model: 'sdar:1.7b', port: null, frames: [], frameIndex: 0, totalSteps: 0 };
  function post(type, data) { vscode.postMessage(Object.assign({ type }, data || {})); }
  function show(screen) {
    state.screen = screen;
    document.getElementById('setup-screen').style.display = screen === 'setup' ? 'block' : 'none';
    document.getElementById('chat-screen').style.display = screen === 'chat' ? 'block' : 'none';
    document.getElementById('replay-screen').style.display = screen === 'replay' ? 'block' : 'none';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function renderSetup(steps, models, note) {
    document.getElementById('setup-steps').innerHTML = steps.map(function(s) {
      return '<div class="step">' + esc(s.icon) + ' <strong>' + esc(s.title) + '</strong> — ' + esc(s.detail) +
        (s.command ? '<div class="pill">' + esc(s.command) + ' <button class="secondary" onclick="post(\\'copy\\',{text:' + JSON.stringify(s.command) + '})">Copy</button></div>' : '') + '</div>';
    }).join('');
    document.getElementById('model-picker').innerHTML = models.map(function(m) {
      return '<div class="card"><strong style="font-family:var(--vscode-editor-font-family)">' + esc(m.model) + '</strong> ' +
        (m.recommended ? '<span class="badge">Recommended</span> ' : '') +
        '<span class="badge">' + esc(m.label) + '</span><br><span class="secondary">' + esc(m.detail || '') + '</span>' +
        (m.button ? '<div class="row"><button onclick="post(\\'download\\',{model:' + JSON.stringify(m.model) + '})">Download</button></div>' : '') + '</div>';
    }).join('');
    document.getElementById('setup-note').textContent = note || '';
  }
  function addMessage(meta, body, isCode) {
    const el = document.createElement('div'); el.className = 'msg';
    el.innerHTML = '<div class="meta">' + esc(meta) + '</div><div>' + (isCode ? '<pre class="diff">' + esc(body) + '</pre>' : esc(body)) + '</div>';
    document.getElementById('messages').appendChild(el);
  }
  function showWaiting(title, elapsed, rangeLine) {
    const el = document.getElementById('waiting'); el.style.display = 'block';
    el.innerHTML = '<strong>' + esc(title) + '</strong> <span style="float:right;font-family:var(--vscode-editor-font-family)">' + esc(elapsed) + '</span>' +
      (rangeLine ? '<p class="secondary">' + esc(rangeLine) + '</p>' : '') +
      '<p class="secondary">There’s no live preview yet. When the answer arrives you can replay how it formed.</p>' +
      '<button class="secondary" onclick="post(\\'cancel\\',{})">Cancel</button>';
  }
  function hideWaiting() { document.getElementById('waiting').style.display = 'none'; }
  function showResult(result) {
    const el = document.getElementById('result'); el.style.display = 'block';
    const diffHtml = result.diff.map(function(d) {
      const cls = d.kind === 'add' ? 'add' : d.kind === 'remove' ? 'remove' : '';
      const prefix = d.kind === 'add' ? '+' : d.kind === 'remove' ? '-' : ' ';
      return '<span class="' + cls + '">' + esc(prefix + d.text) + '</span>';
    }).join('\\n');
    const checksHtml = result.checks ? result.checks.map(function(c) {
      return '<span>' + (c.pass ? '✓ ' : '✗ ') + esc(c.name) + (c.message ? ' — ' + esc(c.message) : '') + '</span>';
    }).join(' · ') : '';
    const warnsHtml = result.warnings ? result.warnings.map(function(w) { return '<span>⚠ ' + esc(w) + '</span>'; }).join(' · ') : '';
    el.innerHTML = '<div><span>' + esc(result.meta) + '</span><span style="float:right">' + esc(result.time) + '</span></div>' +
      '<pre class="diff">' + diffHtml + '</pre>' +
      (result.checks ? '<div>' + checksHtml + (warnsHtml ? ' · ' + warnsHtml : '') + '</div>' : '') +
      '<div class="warning">' + esc(result.warning) + '</div>' +
      '<div class="row">' +
      '<button id="accept-btn">' + esc(result.acceptLabel || 'Accept') + '</button>' +
      '<button id="reject-btn" class="secondary">' + esc(result.rejectLabel || 'Reject') + '</button>' +
      '<button id="watch-btn" class="secondary" ' + (result.replayAvailable ? '' : 'disabled') + '>' + esc(result.replayAvailable ? 'Watch diffusion' : 'Replay not available for this model') + '</button>' +
      '</div>';
    document.getElementById('accept-btn').onclick = function() { post('accept', {}); };
    document.getElementById('reject-btn').onclick = function() { post('reject', {}); };
    document.getElementById('watch-btn').onclick = function() { post('watch', {}); };
  }
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
    const v = document.getElementById('composer').value; if (v.trim()) { post('chat', { text: v }); }
  };
  document.getElementById('back-link').onclick = function(e) { e.preventDefault(); show('chat'); };
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
    if (m.type === 'setup') { renderSetup(m.steps, m.models, m.note); show('setup'); }
    if (m.type === 'ready') { document.getElementById('header-status').textContent = m.status; show('chat'); }
    if (m.type === 'status') { document.getElementById('header-status').textContent = m.status; }
    if (m.type === 'message') { addMessage(m.meta, m.body, m.isCode); }
    if (m.type === 'waiting') { showWaiting(m.title, m.elapsed, m.rangeLine); }
    if (m.type === 'waitingDone') { hideWaiting(); }
    if (m.type === 'result') { showResult(m.result); }
    if (m.type === 'replay') {
      state.frames = m.frames; state.frameIndex = 0; state.totalSteps = m.totalSteps; state.replaySub = m.sub;
      show('replay'); renderReplay();
    }
    if (m.type === 'hint') { addMessage('', m.text, false); }
  });
  post('ready', {});
</script>
</body>
</html>`;
}
