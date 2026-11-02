// Webview HTML for the ollada-code panel.
// Theme: VS Code variables for everything structural. Ollada constants
// are few and fixed: accent #6C6FD8 is logo/icons/active markers/
// slider/large graphics ONLY, never small text or links on light themes.
// Primary buttons and text accents are #5558C9, hover #6265D6.
// UI font is the VS Code font (var(--vscode-font-family)); Geist
// bundling is deferred before any publish (spec 10c, license unchecked).
// Mockup v2 polish (0.1.3, presentation only): step circles, fit dots,
// Recommended card tint, pill chat buttons, arrow send button, green-dot
// serving header. Panel stays Beside; backgrounds/text/borders/inputs/
// diff colours stay VS Code theme variables, no forced navy skin.
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
    border-radius: 8px; padding: 10px; margin: 10px 0;
  }
  .card-recommended { border-color: #5558C9; background: rgba(85, 88, 201, 0.10); }
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
  .serving-dot { color: #2DA44E; }
  .pill-btn {
    background: transparent; border: 1px solid var(--vscode-widget-border);
    color: var(--vscode-foreground); border-radius: 999px; padding: 6px 14px;
  }
  .pill-btn:hover { border-color: #5558C9; background: rgba(85, 88, 201, 0.12); }
  .composer-row { align-items: flex-end; }
  .composer-row textarea { flex: 1; }
  .send-btn {
    background: #5558C9; color: #fff; border-radius: 8px;
    width: 40px; min-width: 40px; height: 40px; font-size: 1.25em; line-height: 1; padding: 0;
  }
  .send-btn:hover { background: #6265D6; }
  .pill {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
    border-radius: 4px; padding: 6px 8px; font-family: var(--vscode-editor-font-family);
    font-size: var(--vscode-editor-font-size); word-break: break-all;
  }
  .row { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
  .badge { font-weight: 600; }
  .diff { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); white-space: pre-wrap; }
  .diff .add { background: var(--vscode-diffEditor-insertedLineBackground); display: block; }
  .diff .remove { background: var(--vscode-diffEditor-removedLineBackground); display: block; }
  .warning {
    background: var(--vscode-inputValidation-warningBackground);
    border: 1px solid var(--vscode-inputValidation-warningBorder);
    border-radius: 8px; padding: 8px; margin: 8px 0;
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
      <button id="explain-btn" class="pill-btn">Explain selection</button>
      <button id="fix-btn" class="pill-btn">Fix selection</button>
      <button id="insert-btn" class="pill-btn">Insert at cursor</button>
      <button id="setup-btn" class="pill-btn">Setup</button>
    </div>
    <div id="messages"></div>
    <div id="waiting" class="card" style="display:none"></div>
    <div id="result" class="card" style="display:none"></div>
    <div class="row composer-row">
      <textarea id="composer" rows="3" placeholder="Ask about this file (Ctrl+Enter to send)"></textarea>
      <button id="send-btn" class="send-btn" aria-label="Send">→</button>
    </div>
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
    // Mockup v2 step circles. Done steps (✓) get a green check circle;
    // pending steps (•) get a numbered circle in primary, counted over
    // non-warning steps in Setup order (Python 1, ollada 2, Pick a
    // model 3, Start serve 4); warning steps (⚠) get an amber warning
    // circle and do not consume a number, so a server-extra warning
    // never renumbers Pick a model / Start serve.
    let canonical = 0;
    document.getElementById('setup-steps').innerHTML = steps.map(function(s) {
      let circle = '';
      if (s.icon === '✓') { canonical++; circle = '<span class="step-circle step-done" aria-hidden="true">✓</span>'; }
      else if (s.icon === '⚠') { circle = '<span class="step-circle step-warn" aria-hidden="true">⚠</span>'; }
      else { canonical++; circle = '<span class="step-circle step-num" aria-hidden="true">' + canonical + '</span>'; }
      return '<div class="step">' + circle + '<div><strong>' + esc(s.title) + '</strong> — ' + esc(s.detail) +
        (s.command ? '<div class="pill">' + esc(s.command) + ' <button class="secondary" onclick="post(\\'copy\\',{text:' + JSON.stringify(s.command) + '})">Copy</button></div>' : '') + '</div></div>';
    }).join('');
    document.getElementById('model-picker').innerHTML = models.map(function(m) {
      return '<div class="card' + (m.recommended ? ' card-recommended' : '') + '"><strong style="font-family:var(--vscode-editor-font-family)">' + esc(m.model) + '</strong> ' +
        (m.recommended ? '<span class="badge">Recommended</span> ' : '') +
        '<span class="fit-dot" style="background:' + esc(m.dot || '#8B949E') + '" aria-hidden="true"></span> ' +
        '<span class="badge">' + esc(m.label) + '</span><br><span class="secondary">' + esc(m.detail || '') + '</span>' +
        (m.downloaded ? '<div class="row"><span class="secondary">Downloaded</span></div>' :
          (m.button ? '<div class="row"><button onclick="post(\\'download\\',{model:' + JSON.stringify(m.model) + '})">Download</button></div>' : '')) + '</div>';
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
  // Ctrl+Enter / Cmd+Enter sends; plain Enter still inserts a newline,
  // so multi-line composing is unchanged.
  document.getElementById('composer').addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); document.getElementById('send-btn').click(); }
  });
  document.getElementById('setup-btn').onclick = function() { post('showSetup', {}); };
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
    if (m.type === 'ready') {
      const s = String(m.status || '');
      const h = document.getElementById('header-status');
      if (s.charAt(0) === '●') { h.innerHTML = '<span class="serving-dot">●</span> ' + esc(s.slice(1).trim()); }
      else { h.textContent = s; }
      show('chat');
    }
    if (m.type === 'status') { document.getElementById('header-status').textContent = m.status; }
    // Chat-screen content always switches to Chat first. This is the
    // one action-visibility mechanism (the extension does not also
    // post a show-chat before these): without it, a Fix/Explain
    // answer posted while Setup was visible landed in the hidden
    // chat-screen div. 'waitingDone' alone does not switch, it only
    // hides the waiting card after a shown wait.
    if (m.type === 'message') { show('chat'); addMessage(m.meta, m.body, m.isCode); }
    if (m.type === 'waiting') { show('chat'); showWaiting(m.title, m.elapsed, m.rangeLine); }
    if (m.type === 'waitingDone') { hideWaiting(); }
    if (m.type === 'result') { show('chat'); showResult(m.result); }
    if (m.type === 'replay') {
      state.frames = m.frames; state.frameIndex = 0; state.totalSteps = m.totalSteps; state.replaySub = m.sub;
      show('replay'); renderReplay();
    }
    if (m.type === 'hint') { show('chat'); addMessage('', m.text, false); }
  });
  post('ready', {});
</script>
</body>
</html>`;
}
