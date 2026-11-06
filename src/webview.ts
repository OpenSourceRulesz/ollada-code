// Webview HTML for the ollada-code panel, 0.1.7 redesign.
//
// Look: the Ollada website by default (Geist and Geist Mono bundled in
// media/fonts under the SIL Open Font License 1.1, navy surfaces,
// periwinkle accent, masked-block motifs). Setting ollada-code.appearance
// = "theme" switches surfaces, text and fonts to the user's VS Code theme.
// Primary buttons are #5558C9 with white text (5.8:1) in both looks. The
// logo accent #6C6FD8 is for the logo, icons and large graphics only.
//
// Structure: header (logo, Chat/Setup tabs, model switcher, status line,
// collapse-all and clear) / Chat tab: scrolling log of turns + bottom dock
// (context chip, actions, growing composer, info) / Setup tab.
//
// Turns: every action is one collapsible turn that keeps what was sent
// (the code), the answer or proposal (diff, checks), and the outcome
// (Applied, Discarded, ...). Starting a new turn collapses finished ones.
//
// Animation (ollada-code.animation, default on; off for reduced motion):
// masked blocks while the model works, then the real answer resolves in
// (see src/reveal.ts). It is presentational, not a recording of how the
// model generated the answer. Real serve snapshots, when a future serve
// returns them, still open the separate Watch diffusion replay.
import { revealOrder, scrambleToken } from './reveal';
import { parseChatAnswer } from './chatBlocks';

export interface WebviewFonts { sans: string; mono: string; }

export function getWebviewHtml(fonts?: WebviewFonts): string {
  const fontFaces = fonts
    ? `@font-face { font-family: 'Geist'; src: url('${fonts.sans}') format('woff2'); font-weight: 100 900; font-display: swap; }
  @font-face { font-family: 'Geist Mono'; src: url('${fonts.mono}') format('woff2'); font-weight: 100 900; font-display: swap; }`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  ${fontFaces}
  :root { --primary: #5558C9; --primary-hover: #6265D6; }
  body.brand {
    --bg: #12131F; --surface: #1A1C2E; --well: #0C0D16; --ink: #E9EAF6; --muted: #A0A3C0;
    --line: #2B2D45; --accent: #6C6FD8; --link: #8E91EA; --mask: #2C2E52; --mask-strong: #3A3D80;
    --ok: #58C48C; --warn: #E3B04B; --bad: #FF8A78;
    --add-bg: rgba(88, 196, 140, 0.14); --rem-bg: rgba(255, 138, 120, 0.14);
    --warn-bg: rgba(227, 176, 75, 0.07); --bad-bg: rgba(255, 138, 120, 0.10);
    --font: 'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif;
    --mono: 'Geist Mono', ui-monospace, 'Cascadia Code', Consolas, monospace;
  }
  body.theme {
    --bg: var(--vscode-sideBar-background); --surface: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
    --well: var(--vscode-editor-background); --ink: var(--vscode-foreground); --muted: var(--vscode-descriptionForeground);
    --line: var(--vscode-panel-border, var(--vscode-widget-border, rgba(128,128,128,.35))); --accent: #6C6FD8;
    --link: var(--vscode-textLink-foreground); --mask: rgba(108, 111, 216, 0.28); --mask-strong: rgba(108, 111, 216, 0.5);
    --ok: var(--vscode-testing-iconPassed, #2DA44E); --warn: var(--vscode-editorWarning-foreground, #D29922); --bad: var(--vscode-testing-iconFailed, #CF222E);
    --add-bg: var(--vscode-diffEditor-insertedLineBackground); --rem-bg: var(--vscode-diffEditor-removedLineBackground);
    --warn-bg: var(--vscode-inputValidation-warningBackground); --bad-bg: var(--vscode-inputValidation-errorBackground);
    --font: var(--vscode-font-family, system-ui, sans-serif); --mono: var(--vscode-editor-font-family, ui-monospace, monospace);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--font); font-size: 13px; line-height: 1.5; }
  button { font: inherit; color: inherit; cursor: pointer; }
  button:focus-visible, select:focus-visible, textarea:focus-visible, .turn-head:focus-visible {
    outline: 2px solid var(--vscode-focusBorder, var(--accent)); outline-offset: 1px;
  }
  .vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .muted { color: var(--muted); }
  .small { font-size: 12px; }
  code, pre, .mono { font-family: var(--mono); }

  .btn { background: var(--primary); color: #fff; border: 0; border-radius: 6px; padding: 6px 14px; font-weight: 500; }
  .btn:hover { background: var(--primary-hover); }
  .btn:disabled, .btn:disabled:hover { opacity: .45; cursor: default; background: var(--primary); }
  .btn-ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 6px 12px; }
  .btn-ghost:hover { border-color: var(--accent); }
  .btn-ghost:disabled { opacity: .45; cursor: default; border-color: var(--line); }
  .icon-btn { background: transparent; border: 1px solid transparent; border-radius: 6px; width: 28px; height: 28px; display: inline-grid; place-items: center; color: var(--muted); padding: 0; }
  .icon-btn:hover { color: var(--ink); border-color: var(--line); }

  #shell { display: flex; flex-direction: column; height: 100vh; }
  #top { flex: none; padding: 9px 12px; border-bottom: 1px solid var(--line); }
  .top-row { display: flex; align-items: center; gap: 10px; }
  .brand-mark { display: inline-flex; align-items: center; gap: 7px; font-weight: 600; letter-spacing: -0.01em; }
  .spacer { flex: 1; }
  .seg { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
  .seg button { background: transparent; border: 0; border-radius: 6px; padding: 3px 10px; color: var(--muted); font-weight: 500; white-space: nowrap; }
  .top-row { min-width: 0; }
  .seg { flex: none; }
  .brand-mark { flex: none; }
  .seg button[aria-selected="true"] { background: var(--primary); color: #fff; }
  .seg button:hover:not([aria-selected="true"]) { color: var(--ink); }
  .tab-dot { display: inline-block; width: 6px; height: 6px; border-radius: 3px; margin-left: 6px; vertical-align: middle; background: var(--warn); }
  .tab-dot.ok { background: var(--ok); }
  .model-pick { display: inline-flex; align-items: center; gap: 6px; padding: 0 4px 0 9px; height: 26px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); min-width: 0; flex: 0 1 auto; max-width: 60%; }
  @media (max-width: 340px) { .brand-mark .word { display: none; } .top-row { gap: 6px; } }
  .model-pick:focus-within { border-color: var(--accent); }
  #model-select { appearance: none; -webkit-appearance: none; background: transparent; color: var(--ink); border: 0; font: 12px var(--mono); min-width: 0; max-width: 100%; padding: 0 18px 0 2px; outline: none; cursor: pointer; }
  .model-pick { position: relative; }
  .model-pick .chev-sel { position: absolute; right: 7px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--muted); }
  #model-select option { background: var(--surface); color: var(--ink); }
  .log-tools { flex: none; display: flex; justify-content: flex-end; gap: 4px; padding: 6px 10px 0; }
  .log-tools[hidden] { display: none; }
  .text-btn { background: transparent; border: 0; border-radius: 6px; padding: 2px 8px; color: var(--muted); font-size: 12px; }
  .text-btn:hover { color: var(--ink); background: var(--surface); }
  .dot { width: 7px; height: 7px; border-radius: 4px; flex: none; background: var(--warn); }
  .dot.ok { background: var(--ok); }

  #serve-banner { flex: none; display: none; align-items: center; flex-wrap: wrap; gap: 8px 10px; padding: 8px 12px; background: var(--warn-bg); border-bottom: 1px solid var(--line); }
  #serve-banner-text { flex: 1; min-width: 160px; }

  .tabpanel { flex: 1; min-height: 0; display: none; flex-direction: column; }
  .tabpanel.active { display: flex; }
  #log { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 12px 14px; display: flex; flex-direction: column; gap: 10px; }
  #dock { flex: none; border-top: 1px solid var(--line); padding: 8px 12px 10px; display: flex; flex-direction: column; gap: 8px; background: var(--bg); }
  .chip { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 2px 8px; border: 1px solid var(--line); border-radius: 6px; color: var(--muted); font: 12px var(--mono); }
  .chip.empty { border-style: dashed; }
  .chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dock-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .composer-box { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
  .composer-box:focus-within { border-color: var(--accent); }
  #composer { display: block; width: 100%; min-height: 38px; max-height: 45vh; resize: vertical; background: transparent; color: var(--ink); border: 0; padding: 9px 11px 4px; font: inherit; outline: none; }
  #composer::placeholder { color: var(--muted); }
  .composer-tools { display: flex; align-items: center; gap: 4px; padding: 4px 6px 6px 8px; }
  .act { background: transparent; border: 1px solid var(--line); border-radius: 6px; padding: 3px 10px; color: var(--ink); font-size: 12px; font-weight: 500; }
  .act:hover:not(:disabled) { border-color: var(--accent); background: rgba(108, 111, 216, 0.10); }
  .act:disabled { opacity: .4; cursor: default; }
  .send { width: 30px; height: 30px; display: inline-grid; place-items: center; border: 0; border-radius: 8px; background: var(--primary); color: #fff; padding: 0; }
  .send:hover { background: var(--primary-hover); }
  .hint { margin-right: 4px; }
  @media (max-width: 320px) { .hint { display: none; } }
  #about { display: none; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; background: var(--surface); }
  #about.open { display: block; }
  #about p { margin: 4px 0; }

  .turn { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
  .turn-head { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: transparent; border: 0; text-align: left; }
  .turn-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .turn-ctx { color: var(--muted); font: 12px var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; }
  .pill { flex: none; font-size: 11px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); }
  .pill.work { color: var(--link); border-color: var(--mask-strong); }
  .pill.ok { color: var(--ok); }
  .pill.bad { color: var(--bad); }
  .pill.warn { color: var(--warn); }
  .chev { flex: none; color: var(--muted); transition: transform .15s; }
  .turn.collapsed .chev { transform: rotate(-90deg); }
  .turn-body { padding: 0 10px 10px; display: flex; flex-direction: column; gap: 8px; }
  .turn.collapsed .turn-body { display: none; }
  .label { font-size: 11px; color: var(--muted); text-transform: none; margin-bottom: 2px; }
  .sent pre, .diff, .answer.code { margin: 0; background: var(--well); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font: 12px/1.55 var(--mono); white-space: pre-wrap; word-break: break-word; max-height: 260px; overflow: auto; }
  .user-text { white-space: pre-wrap; }
  .answer { white-space: pre-wrap; word-break: break-word; }
  .code-block { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .code-block-head { display: flex; align-items: center; gap: 6px; padding: 4px 6px 4px 10px; background: var(--surface); border-bottom: 1px solid var(--line); font: 12px var(--mono); color: var(--muted); }
  .code-block-head .lang { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .code-block pre { margin: 0; background: var(--well); padding: 8px 10px; font: 12px/1.55 var(--mono); white-space: pre-wrap; word-break: break-word; max-height: 260px; overflow: auto; }
  .diff > span { display: block; min-height: 1.55em; }
  .diff .add { background: var(--add-bg); }
  .diff .rem { background: var(--rem-bg); }
  .meta { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 12px; }
  .checks { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 12px; }
  .chk-pass { color: var(--ok); } .chk-fail { color: var(--bad); } .chk-warn { color: var(--warn); }
  .box { border-radius: 8px; padding: 8px 10px; font-size: 12px; }
  .box.warn { background: var(--warn-bg); border-left: 3px solid var(--warn); }
  .box.bad { background: var(--bad-bg); border: 1px solid var(--bad); }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .note { color: var(--muted); font-size: 12px; }
  .retry textarea { width: 100%; min-height: 48px; resize: vertical; background: var(--bg); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; font: inherit; }

  .rv.m { background: var(--mask); color: transparent; border-radius: 3px; }
  .rv.g { color: var(--muted); }
  .diffusing { background: var(--well); border: 1px solid var(--line); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
  .mask-line { display: flex; gap: 5px; flex-wrap: wrap; }
  .mask-cell { height: 12px; border-radius: 3px; background: var(--mask); font: 11px/12px var(--mono); color: var(--muted); overflow: hidden; text-align: center; }
  .mask-cell.g { background: transparent; }
  .wait-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .elapsed { font-family: var(--mono); color: var(--ink); }

  .welcome { margin: 0; padding: 8px 4px 14px; }
  .welcome h1 { font-size: 28px; line-height: 1.05; letter-spacing: -0.035em; margin: 0 0 12px; font-weight: 600; max-width: 12ch; }
  .welcome p { margin: 0 0 16px; color: var(--muted); max-width: 36ch; }
  .starters { display: flex; flex-direction: column; gap: 6px; max-width: 32rem; }
  .starter { display: flex; align-items: baseline; gap: 8px; width: 100%; text-align: left; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 8px 11px; color: var(--ink); }
  .starter:hover:not(:disabled) { border-color: var(--accent); }
  .starter:disabled { cursor: default; color: var(--muted); }
  .starter b { font-weight: 600; }
  .starter span { font: 12px var(--mono); color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

  #setup-panel { overflow-y: auto; padding: 12px; }
  #setup-panel.active { display: block; }
  .steps { list-style: none; margin: 0 0 14px; padding: 0; display: flex; flex-direction: column; gap: 12px; }
  .step { display: flex; gap: 10px; }
  .step-mark { flex: none; width: 22px; height: 22px; border-radius: 11px; display: grid; place-items: center; font-size: 12px; font-weight: 600; }
  .step-mark.ok { background: rgba(88, 196, 140, 0.18); color: var(--ok); }
  .step-mark.warn { background: var(--warn-bg); color: var(--warn); }
  .step-mark.todo { background: var(--primary); color: #fff; }
  .step-title { font-weight: 600; }
  .cmd { display: flex; align-items: center; gap: 6px; margin-top: 6px; background: var(--well); border: 1px solid var(--line); border-radius: 8px; padding: 4px 4px 4px 10px; }
  .cmd code { flex: 1; min-width: 0; overflow-x: auto; white-space: nowrap; font-size: 12px; }
  .models { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; margin: 6px 0 10px; }
  .model { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; padding: 9px 12px; border-top: 1px solid var(--line); cursor: pointer; }
  .model:first-child { border-top: 0; }
  .model:hover { background: rgba(108, 111, 216, 0.08); }
  .model.selected { background: rgba(85, 88, 201, 0.16); box-shadow: inset 3px 0 0 var(--primary); }
  .model-name { font-family: var(--mono); font-weight: 500; }
  .tag { font-size: 11px; color: var(--link); margin-left: 6px; }
  .fit { font-size: 12px; display: inline-flex; align-items: center; gap: 5px; }
  .fit i { width: 7px; height: 7px; border-radius: 4px; display: inline-block; }
  .model-side { grid-row: 1 / span 2; grid-column: 2; align-self: center; font-size: 12px; color: var(--muted); }
  .section-title { font-size: 12px; color: var(--muted); margin: 14px 0 6px; }
  .cloud { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; }
  .cloud.on { box-shadow: inset 3px 0 0 var(--link); }
  .cloud p { margin: 4px 0 8px; }
  .cloud-tag { flex: none; font-size: 11px; padding: 1px 7px; border-radius: 999px; color: var(--link); border: 1px solid var(--mask-strong); }
  .dot.is-cloud { background: var(--link); }

  #replay-screen { position: fixed; inset: 0; background: var(--bg); padding: 12px; overflow-y: auto; display: none; }
  .mask { background: var(--mask-strong); color: transparent; border-radius: 2px; }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>
</head>
<body class="brand">
<div id="shell">
  <header id="top">
    <div class="top-row">
      <span class="brand-mark"><svg width="18" height="17" viewBox="12 24 106 100" fill="#6C6FD8" aria-hidden="true"><circle cx="26" cy="34" r="10"/><circle cx="22" cy="76" r="10"/><circle cx="38" cy="114" r="10"/><circle cx="72" cy="74" r="10"/><circle cx="108" cy="52" r="10"/><circle cx="108" cy="96" r="10"/></svg><span class="word">Ollada</span></span>
      <div class="seg" role="tablist" aria-label="Panel">
        <button role="tab" id="tab-chat" aria-selected="true" aria-controls="chat-panel">Chat</button>
        <button role="tab" id="tab-setup" aria-selected="false" aria-controls="setup-panel" tabindex="-1">Setup<span id="setup-dot" class="tab-dot" aria-hidden="true"></span></button>
      </div>
      <span class="spacer"></span>
      <span class="model-pick" id="model-pick" title="Checking…">
        <span id="status-dot" class="dot" aria-hidden="true"></span>
        <label for="model-select" class="vh">Model</label>
        <select id="model-select"><option>…</option></select>
        <svg class="chev-sel" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
      </span>
    </div>
    <span id="status-text" class="vh" role="status">Checking…</span>
  </header>

  <div id="serve-banner" role="status">
    <span id="serve-banner-text">Serve isn’t running.</span>
    <button id="start-serve-btn" class="btn">Start serve</button>
    <button id="banner-setup-btn" class="btn-ghost">Open Setup</button>
  </div>

  <section id="chat-panel" class="tabpanel active" role="tabpanel" aria-labelledby="tab-chat">
    <div id="log-tools" class="log-tools" hidden>
      <button id="collapse-btn" class="text-btn">Collapse all</button>
      <button id="clear-btn" class="text-btn">Clear chat</button>
    </div>
    <main id="log" aria-live="polite" aria-label="Chat history">
      <div id="welcome" class="welcome">
        <h1 id="welcome-title" aria-label="Pull a diffusion model. Run it.">Pull a diffusion model. Run it.</h1>
        <p>Fix, explain or rewrite code with a diffusion model. Every change is a preview until you accept it.</p>
        <div><button id="welcome-replay" class="text-btn" title="Replay the headline reveal">Replay headline</button></div>
        <div id="starters" class="starters"></div>
      </div>
    </main>
    <footer id="dock">
      <div class="dock-row">
        <span id="chip" class="chip empty"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/></svg><span id="chip-text">No file selected</span></span>
        <span class="spacer"></span>
        <button id="about-btn" class="icon-btn" aria-expanded="false" aria-controls="about" title="How these actions work" aria-label="How these actions work"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.01"/></svg></button>
      </div>
      <div id="about" class="small muted">
        <p>Fix and Explain work on the selected code. Replace rewrites the selection; with nothing selected, Insert writes at the cursor. Insert doesn’t read the code after the cursor yet.</p>
        <p>For Python files, Fix also sends the file’s top-level imports, so the model doesn’t add one that’s already there. The chip shows “+ imports” when it does.</p>
        <p>The masked-block animation is an illustration: the answer arrives whole when the model finishes, and the reveal isn’t a recording of how it was generated. Turn it off with the ollada-code.animation setting.</p>
      </div>
      <div class="composer-box">
        <label for="composer" class="vh">Message</label>
        <textarea id="composer" rows="1" placeholder="Ask about this file"></textarea>
        <div class="composer-tools">
          <button id="explain-btn" class="act" disabled>Explain</button>
          <button id="fix-btn" class="act" disabled>Fix</button>
          <button id="insert-btn" class="act" disabled>Insert</button>
          <span class="spacer"></span>
          <span class="hint small muted" aria-hidden="true">Ctrl+Enter</span>
          <button id="send-btn" class="send" aria-label="Send message" title="Send (Ctrl+Enter)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg></button>
        </div>
      </div>
    </footer>
  </section>

  <section id="setup-panel" class="tabpanel" role="tabpanel" aria-labelledby="tab-setup">
    <ol id="setup-steps" class="steps"></ol>
    <div class="section-title">Models <span class="muted">(click one to use it)</span></div>
    <div id="model-list" class="models"></div>
    <p id="cache-note" class="muted small"></p>
    <div class="section-title">Cloud model <span class="muted">(optional)</span></div>
    <div id="cloud" class="cloud"></div>
    <div class="actions"><button id="check-again-btn" class="btn-ghost">Check again</button></div>
    <p class="muted small">Nothing downloads or starts until you click. No telemetry.</p>
  </section>
</div>

<section id="replay-screen" aria-label="Watch diffusion">
  <p><button id="back-link" class="btn-ghost">‹ Back to the chat</button></p>
  <h2>Watch diffusion</h2>
  <p class="muted" id="replay-sub"></p>
  <div id="replay-canvas" class="diff"></div>
  <p><span id="replay-status"></span> <span id="replay-counter" style="float:right"></span></p>
  <div class="actions">
    <button id="replay-prev" class="btn-ghost" aria-label="Previous step">‹</button>
    <button id="replay-play" class="btn">Play</button>
    <button id="replay-next" class="btn-ghost" aria-label="Next step">›</button>
    <input id="replay-slider" type="range" min="0" max="0" value="0" aria-label="Step" style="flex:1">
  </div>
</section>
<script>
  const vscode = acquireVsCodeApi();
  const revealOrder = (${revealOrder.toString()});
  const scrambleToken = (${scrambleToken.toString()});
  const parseChatAnswer = (${parseChatAnswer.toString()});
  const S = { animate: true, turn: null, turnSeq: 0, frames: [], frameIndex: 0, totalSteps: 0, serving: null, models: [] };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function post(type, data) { vscode.postMessage(Object.assign({ type: type }, data || {})); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) { e.className = cls; } if (html != null) { e.innerHTML = html; } return e; }
  const log = document.getElementById('log');
  function scrollLog() { log.scrollTop = log.scrollHeight; }
  function animOn() { return S.animate && !reduceMotion; }

  // ---------- tabs ----------
  function showTab(name) {
    const chat = name === 'chat';
    document.getElementById('tab-chat').setAttribute('aria-selected', String(chat));
    document.getElementById('tab-setup').setAttribute('aria-selected', String(!chat));
    document.getElementById('tab-chat').tabIndex = chat ? 0 : -1;
    document.getElementById('tab-setup').tabIndex = chat ? -1 : 0;
    document.getElementById('chat-panel').classList.toggle('active', chat);
    document.getElementById('setup-panel').classList.toggle('active', !chat);
  }
  document.getElementById('tab-chat').onclick = function() { showTab('chat'); };
  document.getElementById('tab-setup').onclick = function() { showTab('setup'); };
  document.querySelector('[role=tablist]').addEventListener('keydown', function(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') { return; }
    const toSetup = document.getElementById('tab-chat').getAttribute('aria-selected') === 'true';
    showTab(toSetup ? 'setup' : 'chat');
    document.getElementById(toSetup ? 'tab-setup' : 'tab-chat').focus();
  });
  document.getElementById('banner-setup-btn').onclick = function() { showTab('setup'); };

  // ---------- reveal (presentational, see src/reveal.ts) ----------
  function tokenize(text) { return String(text).split(/(\\s+)/).filter(function(t) { return t.length > 0; }); }
  function revealInto(container, text, done) {
    container.textContent = '';
    if (!animOn() || !text) { container.textContent = text; if (done) { done(); } return; }
    const parts = tokenize(text);
    const spans = [];
    parts.forEach(function(p) {
      if (/^\\s+$/.test(p)) { container.appendChild(document.createTextNode(p)); return; }
      const s = el('span', 'rv m'); s.textContent = p; s.dataset.t = p; container.appendChild(s); spans.push(s);
    });
    const order = revealOrder(spans.length, 14, Math.random);
    let step = 0; let timer = null;
    function finish() {
      if (timer) { clearInterval(timer); timer = null; }
      container.textContent = text;
      container.removeEventListener('click', finish);
      if (done) { done(); }
    }
    container.addEventListener('click', finish);
    timer = setInterval(function() {
      if (step >= order.length) { finish(); return; }
      order[step].forEach(function(i) { spans[i].className = 'rv'; spans[i].textContent = spans[i].dataset.t; spans[i].dataset.c = '1'; });
      spans.forEach(function(s) {
        if (s.dataset.c) { return; }
        if (Math.random() < 0.45) { s.className = 'rv g'; s.textContent = scrambleToken(s.dataset.t, Math.random); }
        else { s.className = 'rv m'; s.textContent = s.dataset.t; }
      });
      step++;
    }, 70);
  }
  function revealDiff(pre, lines) {
    pre.textContent = '';
    const adds = [];
    lines.forEach(function(d) {
      const line = el('span', d.kind === 'add' ? 'add' : d.kind === 'remove' ? 'rem' : '');
      const prefix = d.kind === 'add' ? '+ ' : d.kind === 'remove' ? '- ' : '  ';
      line.appendChild(document.createTextNode(prefix));
      const body = el('span'); line.appendChild(body);
      if (d.kind === 'add') { adds.push([body, d.text]); } else { body.textContent = d.text; }
      pre.appendChild(line);
    });
    adds.forEach(function(a) { revealInto(a[0], a[1]); });
  }

  // ---------- welcome headline (same effect as the website) ----------
  // Replayable: the headline reveal runs once on load, and again
  // whenever the Replay button on the welcome block is tapped.
  function replayWelcome() {
    const h = document.getElementById('welcome-title');
    if (!h) { return; }
    const span = el('span'); h.textContent = ''; h.appendChild(span);
    revealInto(span, 'Pull a diffusion model. Run it.');
  }
  replayWelcome();
  document.getElementById('welcome-replay').onclick = function() { replayWelcome(); };

  // ---------- turns ----------
  function collapseFinished() {
    log.querySelectorAll('.turn').forEach(function(t) { if (t.dataset.state !== 'pending' && t.dataset.state !== 'working') { setCollapsed(t, true); } });
  }
  function setCollapsed(t, c) { t.classList.toggle('collapsed', c); t.querySelector('.turn-head').setAttribute('aria-expanded', String(!c)); }
  function setStatus(t, text, kind) {
    const p = t.querySelector('.pill'); p.textContent = text; p.className = 'pill' + (kind ? ' ' + kind : '');
    t.dataset.state = kind === 'work' ? 'working' : (text === 'Proposed' ? 'pending' : 'done');
  }
  function syncTools() { document.getElementById('log-tools').hidden = !log.querySelector('.turn'); }
  function newTurn(title, ctxLabel, code, isUserText, cloud) {
    const w = document.getElementById('welcome'); if (w) { w.style.display = 'none'; }
    collapseFinished();
    S.turnSeq++;
    const t = el('article', 'turn'); t.dataset.turn = String(S.turnSeq);
    const head = el('button', 'turn-head');
    head.setAttribute('aria-expanded', 'true');
    head.innerHTML = '<span class="turn-title">' + esc(title) + '</span><span class="turn-ctx">' + esc(ctxLabel || '') + '</span>' + (cloud ? '<span class="cloud-tag" title="Sent to Inception’s servers">cloud</span>' : '') + '<span class="pill work">Working</span>' +
      '<svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
    head.onclick = function() { setCollapsed(t, !t.classList.contains('collapsed')); };
    const body = el('div', 'turn-body');
    if (code) {
      const sent = el('div', 'sent');
      sent.innerHTML = '<div class="label">' + (isUserText ? 'Code sent with your message' : 'Code sent') + '</div>';
      const pre = el('pre'); pre.textContent = code; sent.appendChild(pre); body.appendChild(sent);
    }
    t.appendChild(head); t.appendChild(body); log.appendChild(t);
    S.turn = t; syncTools(); scrollLog();
    return t;
  }
  function turnBody() { return S.turn ? S.turn.querySelector('.turn-body') : log; }
  function addNote(text) {
    const n = el('div', 'note'); n.textContent = text;
    turnBody().appendChild(n);
    scrollLog();
  }

  // ---------- waiting (masked blocks, presentational) ----------
  let waitEl = null; let waitTimer = null;
  function showWaiting(title, elapsed, rangeLine) {
    if (!waitEl) {
      waitEl = el('div', 'diffusing');
      waitEl.innerHTML = '<div class="wait-head"><span class="w-title"></span><span><span class="elapsed"></span> <button class="btn-ghost" data-cancel="1" style="padding:2px 10px;margin-left:6px">Cancel</button></span></div><div class="cells"></div><div class="w-range muted small"></div>';
      const cells = waitEl.querySelector('.cells');
      for (let r = 0; r < 3; r++) {
        const line = el('div', 'mask-line');
        for (let c = 0; c < 6 + Math.floor(Math.random() * 4); c++) { const cell = el('span', 'mask-cell'); cell.style.width = (18 + Math.floor(Math.random() * 46)) + 'px'; line.appendChild(cell); }
        cells.appendChild(line);
      }
      turnBody().appendChild(waitEl);
      if (animOn()) {
        waitTimer = setInterval(function() {
          waitEl.querySelectorAll('.mask-cell').forEach(function(cell) {
            if (Math.random() < 0.18) { cell.className = 'mask-cell g'; cell.textContent = scrambleToken('xxxxxx'.slice(0, Math.max(1, Math.round(parseInt(cell.style.width, 10) / 8))), Math.random); }
            else if (Math.random() < 0.5) { cell.className = 'mask-cell'; cell.textContent = ''; }
          });
        }, 140);
      }
      scrollLog();
    }
    waitEl.querySelector('.w-title').textContent = title;
    waitEl.querySelector('.elapsed').textContent = elapsed;
    waitEl.querySelector('.w-range').textContent = rangeLine || '';
  }
  function hideWaiting() { if (waitTimer) { clearInterval(waitTimer); waitTimer = null; } if (waitEl) { waitEl.remove(); waitEl = null; } }

  // ---------- results ----------
  function showResult(r) {
    if (!S.turn) { newTurn(r.meta, r.contextLabel || '', '', false); }
    const t = S.turn; const body = turnBody();
    const card = el('div', 'result'); card.dataset.id = r.id;
    card.innerHTML = '<div class="meta"><span>' + esc(r.meta) + '</span><span>' + esc(r.time) + '</span></div>';
    const pre = el('pre', 'diff'); card.appendChild(pre);
    if (r.checks) {
      const c = el('div', 'checks');
      c.innerHTML = r.checks.map(function(k) { return '<span class="' + (k.pass ? 'chk-pass' : 'chk-fail') + '">' + (k.pass ? '✓ ' : '✗ ') + esc(k.name) + (k.message ? ': ' + esc(k.message) : '') + '</span>'; }).join('') +
        (r.warnings || []).map(function(w) { return '<span class="chk-warn">! ' + esc(w) + '</span>'; }).join('');
      card.appendChild(c);
    }
    card.appendChild(el('div', 'box ' + (r.blocked ? 'bad' : 'warn'), esc(r.warning)));
    const acts = el('div', 'actions');
    acts.innerHTML = '<button class="' + (r.acceptPrimary ? 'btn' : 'btn-ghost') + '" data-accept="' + esc(r.id) + '"' + (r.blocked ? ' disabled title="Turned off: the proposed file has a syntax error"' : '') + '>' + esc(r.acceptLabel) + '</button>' +
      '<button class="' + (r.acceptPrimary ? 'btn-ghost' : 'btn') + '" data-reject="' + esc(r.id) + '">' + esc(r.rejectLabel) + '</button>' +
      '<button class="text-btn" data-replay="1" title="Replay the reveal (illustration)">Replay</button>' +
      (r.replayAvailable ? '<button class="btn-ghost" data-watch="' + esc(r.id) + '">Watch diffusion</button>' : '');
    card.appendChild(acts);
    card._diff = r.diff;
    body.appendChild(card);
    setStatus(t, 'Proposed', 'warn');
    revealDiff(pre, r.diff);
    scrollLog();
  }
  function resolveCard(id, note, offerRetryFix, retryContextLabel) {
    const card = log.querySelector('.result[data-id="' + CSS.escape(id) + '"]');
    const t = card ? card.closest('.turn') : S.turn;
    if (card) { const a = card.querySelector('.actions'); if (a) { a.querySelectorAll('[data-accept],[data-reject],[data-watch]').forEach(function(b) { b.remove(); }); } const box = card.querySelector('.box'); if (box) { box.remove(); } }
    if (t) {
      const lower = String(note || '').toLowerCase();
      if (lower.indexOf('applied.') === 0) { setStatus(t, 'Applied', 'ok'); }
      else if (lower.indexOf('discarded') === 0) { setStatus(t, 'Discarded', ''); }
      else if (lower.indexOf('earlier proposal') === 0) { setStatus(t, 'Replaced', ''); }
      else { setStatus(t, 'Not applied', 'bad'); }
      const n = el('div', 'note'); n.textContent = note || ''; t.querySelector('.turn-body').appendChild(n);
      if (offerRetryFix) {
        const row = el('div', 'retry');
        row.innerHTML = '<div class="label">Retry fix ' + esc(retryContextLabel || '') + '</div><textarea placeholder="What did the first fix miss? e.g. math is already imported, fix the domain error without adding an import"></textarea><div class="actions" style="margin-top:6px"><button class="btn" data-retry="1">Retry fix</button></div>';
        t.querySelector('.turn-body').appendChild(row);
      }
    }
    scrollLog();
  }
  // Code first, explanation under it. A fenced block becomes its own
  // block (language label + Copy + Insert); the prose with the blocks
  // removed is the explanation below. No blocks: render exactly as
  // before, one answer div. isCode answers (proposals shown as code)
  // never go through the fence split.
  function renderAnswerInto(wrap, text, isCode) {
    const parsed = isCode ? { blocks: [], prose: text } : parseChatAnswer(text);
    if (parsed.blocks.length === 0) {
      const a = el('div', 'answer' + (isCode ? ' code' : '')); a.dataset.text = text;
      wrap.appendChild(a);
      revealInto(a, text, scrollLog);
      return;
    }
    parsed.blocks.forEach(function(b, i) {
      const block = el('div', 'code-block');
      const head = el('div', 'code-block-head');
      head.innerHTML = '<span class="lang">' + esc(b.lang || 'code') + '</span>' +
        '<button class="btn-ghost" data-copy-block="' + i + '" style="padding:2px 10px">Copy</button>' +
        '<button class="btn" data-insert-block="' + i + '" style="padding:2px 10px">Insert</button>';
      block.appendChild(head);
      const pre = el('pre'); pre.textContent = b.code; block.appendChild(pre);
      wrap.appendChild(block);
    });
    if (parsed.prose) {
      const a = el('div', 'answer'); a.dataset.text = parsed.prose;
      wrap.appendChild(a);
      revealInto(a, parsed.prose, scrollLog);
    } else { scrollLog(); }
  }
  function showAnswer(meta, text, isCode, id) {
    if (!S.turn) { newTurn('Answer', '', '', false); }
    const t = S.turn; const body = turnBody();
    const wrap = el('div', 'answer-wrap');
    if (id) { wrap.dataset.answerId = id; }
    wrap.dataset.text = text; wrap.dataset.isCode = isCode ? '1' : '';
    wrap.innerHTML = '<div class="meta"><span>' + esc(meta) + '</span><button class="icon-btn" data-replay="1" title="Replay the reveal (illustration)" aria-label="Replay the reveal"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg></button></div>';
    body.appendChild(wrap);
    setStatus(t, 'Answered', 'ok');
    renderAnswerInto(wrap, text, isCode);
    scrollLog();
  }

  log.addEventListener('click', function(e) {
    const b = e.target.closest('button'); if (!b) { return; }
    if (b.dataset.cancel) { post('cancel', {}); }
    if (b.dataset.accept && !b.disabled) { b.disabled = true; post('accept', { id: b.dataset.accept }); }
    if (b.dataset.reject) { b.disabled = true; post('reject', { id: b.dataset.reject }); }
    if (b.dataset.watch) { post('watch', { id: b.dataset.watch }); }
    if (b.dataset.retry) {
      const row = b.closest('.retry'); const box = row ? row.querySelector('textarea') : null;
      const v = box ? box.value.trim() : '';
      if (v) { row.remove(); post('retryFix', { text: v }); } else if (box) { box.focus(); }
    }
    if (b.dataset.copyBlock != null) {
      // Copy and Insert name the block by index; the host looks the
      // exact text up in its own store, so the webview never
      // round-trips code.
      const wrap = b.closest('.answer-wrap');
      if (wrap && wrap.dataset.answerId) { post('copyChatBlock', { id: wrap.dataset.answerId, index: Number(b.dataset.copyBlock) }); }
    }
    if (b.dataset.insertBlock != null) {
      const wrap = b.closest('.answer-wrap');
      if (wrap && wrap.dataset.answerId) { b.disabled = true; post('insertChatBlock', { id: wrap.dataset.answerId, index: Number(b.dataset.insertBlock) }); }
    }
    if (b.dataset.replay) {
      const card = b.closest('.result'); const ans = b.closest('.answer-wrap');
      if (card && card._diff) { revealDiff(card.querySelector('.diff'), card._diff); }
      if (ans) {
        const meta = ans.querySelector('.meta');
        Array.from(ans.children).forEach(function(c) { if (c !== meta) { c.remove(); } });
        renderAnswerInto(ans, ans.dataset.text || '', ans.dataset.isCode === '1');
      }
    }
  });
  document.getElementById('collapse-btn').onclick = function() { log.querySelectorAll('.turn').forEach(function(t) { setCollapsed(t, true); }); };
  document.getElementById('clear-btn').onclick = function() {
    hideWaiting(); S.turn = null;
    log.querySelectorAll('.turn, .note').forEach(function(n) { n.remove(); });
    const w = document.getElementById('welcome'); if (w) { w.style.display = ''; }
    syncTools();
    post('clear', {});
  };

  // ---------- setup ----------
  function renderSetup(m) {
    document.getElementById('setup-steps').innerHTML = m.steps.map(function(s, i) {
      const mark = s.icon === '✓' ? '<span class="step-mark ok" aria-hidden="true">✓</span>' : s.icon === '⚠' ? '<span class="step-mark warn" aria-hidden="true">!</span>' : '<span class="step-mark todo" aria-hidden="true">' + (i + 1) + '</span>';
      return '<li class="step">' + mark + '<div style="min-width:0;flex:1"><div class="step-title">' + esc(s.title) + '</div><div class="muted small">' + esc(s.detail) + '</div>' +
        (s.command ? '<div class="cmd"><code>' + esc(s.command) + '</code><button class="btn-ghost" data-copy="' + esc(s.command) + '">Copy</button></div>' : '') +
        (s.action === 'changePython' ? '<div style="margin-top:6px"><button class="btn-ghost" data-act="changePython">Change Python</button></div>' : '') +
        '</div></li>';
    }).join('');
    S.models = m.models || [];
    document.getElementById('model-list').innerHTML = S.models.map(function(row) {
      return '<div class="model' + (row.selected ? ' selected' : '') + '" data-select="' + esc(row.model) + '" role="button" tabindex="0" aria-pressed="' + (row.selected ? 'true' : 'false') + '">' +
        '<div><span class="model-name">' + esc(row.model) + '</span>' + (row.recommended ? '<span class="tag">Recommended</span>' : '') + (row.selected ? '<span class="tag">In use</span>' : '') + '</div>' +
        '<div class="model-side">' + (row.downloaded ? 'Downloaded' : (row.button ? '<button class="btn" data-download="' + esc(row.model) + '">Download</button>' : '')) + '</div>' +
        '<div class="small"><span class="fit"><i style="background:' + esc(row.dot || '#8B949E') + '"></i>' + esc(row.label) + '</span> <span class="muted">' + esc(row.detail || '') + '</span></div>' +
        '</div>';
    }).join('');
    document.getElementById('cache-note').textContent = m.cacheNote || '';
    // header model switcher: downloaded models only
    const sel = document.getElementById('model-select');
    const usable = S.models.filter(function(r) { return r.downloaded || r.selected; });
    const mc = m.mercury || {};
    let opts = usable.map(function(r) { return '<option value="' + esc(r.model) + '"' + (r.selected && !mc.selected ? ' selected' : '') + '>' + esc(r.model) + '</option>'; }).join('');
    if (mc.connected || mc.selected) {
      // Grouped so the open menu says which model is cloud; the closed picker stays short, with the cloud-coloured dot.
      opts = (opts ? '<optgroup label="On this machine">' + opts + '</optgroup>' : '') +
        '<optgroup label="Cloud (Inception)"><option value="' + esc(mc.model) + '"' + (mc.selected ? ' selected' : '') + '>' + esc(mc.model) + '</option></optgroup>';
    }
    sel.innerHTML = opts || '<option>No model downloaded</option>';
    sel.disabled = !opts;
    renderCloud(mc);
    // status + serve banner
    document.getElementById('status-text').textContent = m.headerStatus || '';
    document.getElementById('model-pick').title = m.headerStatus || '';
    document.getElementById('status-dot').className = 'dot' + (m.cloudActive ? ' is-cloud' : m.serving ? ' ok' : '');
    document.getElementById('setup-dot').className = 'tab-dot' + (m.serving ? ' ok' : '');
    const banner = document.getElementById('serve-banner');
    if (m.serving || m.cloudActive) { banner.style.display = 'none'; }
    else {
      banner.style.display = 'flex';
      document.getElementById('serve-banner-text').textContent = m.serveBanner || 'Serve isn’t running.';
      const btn = document.getElementById('start-serve-btn'); btn.textContent = m.serveButton || 'Start serve'; btn.disabled = !m.canStartServe;
    }
    S.serving = m.serving;
  }
  function renderCloud(mc) {
    const box = document.getElementById('cloud'); if (!box) { return; }
    box.className = 'cloud' + (mc.selected && mc.connected ? ' on' : '');
    const head = '<div style="display:flex;align-items:center;gap:8px"><span class="model-name">' + esc(mc.model || 'mercury-3') + '</span><span class="cloud-tag">cloud</span><span class="muted small">Inception Labs</span></div>';
    const warn = '<p class="small muted">Mercury runs on Inception’s servers. Code you send to it leaves this machine, and usage is billed to your Inception account. ollada-code only connects to Inception’s API, and asks before the first send.</p>';
    let actions;
    if (!mc.connected) {
      actions = '<button class="btn-ghost" data-act="connectMercury">Connect with an Inception API key</button>';
    } else if (mc.selected) {
      actions = '<span class="small" style="color:var(--link);margin-right:8px">In use</span><button class="text-btn" data-act="disconnectMercury">Disconnect</button>';
    } else {
      actions = '<button class="btn-ghost" data-act="useMercury">Use mercury-3</button> <button class="text-btn" data-act="disconnectMercury">Disconnect</button>';
    }
    box.innerHTML = head + warn + '<div class="actions" style="align-items:center">' + actions + '</div>' +
      (mc.connected ? '<p class="small muted" style="margin:8px 0 0">Key saved in VS Code’s secret storage.</p>' : '');
  }
  document.getElementById('setup-panel').addEventListener('click', function(e) {
    const b = e.target.closest('button');
    if (b) {
      if (b.dataset.copy) { post('copy', { text: b.dataset.copy }); }
      if (b.dataset.download) { post('download', { model: b.dataset.download }); }
      if (b.dataset.act === 'changePython') { post('changePython', {}); }
      if (b.dataset.act === 'connectMercury') { post('connectMercury', {}); }
      if (b.dataset.act === 'disconnectMercury') { post('disconnectMercury', {}); }
      if (b.dataset.act === 'useMercury') { post('selectModel', { model: 'mercury-3' }); }
      return;
    }
    const row = e.target.closest('[data-select]'); if (row) { post('selectModel', { model: row.dataset.select }); }
  });
  document.getElementById('setup-panel').addEventListener('keydown', function(e) {
    const row = e.target.closest('[data-select]');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); post('selectModel', { model: row.dataset.select }); }
  });
  document.getElementById('model-select').onchange = function(e) { if (e.target.value) { post('selectModel', { model: e.target.value }); } };

  // ---------- context chip + actions ----------
  function renderContext(c) {
    const imports = c.headerImports || [];
    document.getElementById('chip-text').textContent = c.label + (imports.length ? ' + imports' : '');
    const chip = document.getElementById('chip');
    chip.title = (c.path || '') + (imports.length ? ' (imports sent with Fix: ' + imports.join(', ') + (c.headerImportsTruncated ? ', further imports omitted' : '') + ')' : '');
    chip.className = 'chip' + (c.hasFile ? '' : ' empty');
    const ex = document.getElementById('explain-btn'), fx = document.getElementById('fix-btn'), ins = document.getElementById('insert-btn');
    ex.disabled = !c.explain; fx.disabled = !c.fix; ins.disabled = !c.insert;
    const need = c.hasFile ? 'Select the code first' : 'Open a file first';
    ex.title = c.explain ? 'Explain ' + c.label : need;
    fx.title = c.fix ? 'Fix ' + c.label : need;
    ins.title = c.insert ? (c.hasSelection ? 'Replace ' + c.label : 'Insert at the cursor in ' + c.label) : 'Open a file first';
    ins.textContent = c.hasSelection ? 'Replace' : 'Insert';
    composer.placeholder = c.hasFile ? 'Ask about ' + String(c.label).split(':')[0].split(',')[0] : 'Ask anything';
    renderStarters(c);
  }
  function renderStarters(c) {
    const box = document.getElementById('starters'); if (!box) { return; }
    const file = String(c.label).split(':')[0].split(',')[0];
    let html = '';
    if (c.hasSelection) {
      html = '<button class="starter" data-start="fix"><b>Fix</b><span>' + esc(c.label) + '</span></button>' +
        '<button class="starter" data-start="explain"><b>Explain</b><span>' + esc(c.label) + '</span></button>' +
        '<button class="starter" data-start="insert"><b>Rewrite</b><span>' + esc(c.label) + '</span></button>';
    } else if (c.hasFile) {
      html = '<button class="starter" disabled><b>Select code</b><span>in ' + esc(file) + ' to fix or explain it</span></button>' +
        '<button class="starter" data-start="ask"><b>Ask</b><span>about ' + esc(file) + '</span></button>';
    } else {
      html = '<button class="starter" disabled><b>Open a file</b><span>to fix, explain or rewrite code</span></button>';
    }
    box.innerHTML = html;
  }
  document.getElementById('starters').addEventListener('click', function(e) {
    const b = e.target.closest('[data-start]'); if (!b || b.disabled) { return; }
    if (b.dataset.start === 'ask') { composer.focus(); return; }
    post('action', { action: b.dataset.start });
  });
  document.getElementById('explain-btn').onclick = function() { post('action', { action: 'explain' }); };
  document.getElementById('fix-btn').onclick = function() { post('action', { action: 'fix' }); };
  document.getElementById('insert-btn').onclick = function() { post('action', { action: 'insert' }); };
  document.getElementById('start-serve-btn').onclick = function() { post('startServe', {}); };
  document.getElementById('check-again-btn').onclick = function() { post('checkAgain', {}); };
  document.getElementById('about-btn').onclick = function() {
    const a = document.getElementById('about'); const open = !a.classList.contains('open');
    a.classList.toggle('open', open); this.setAttribute('aria-expanded', String(open));
  };
  const composer = document.getElementById('composer');
  function growComposer() { composer.style.height = 'auto'; composer.style.height = Math.min(composer.scrollHeight + 2, window.innerHeight * 0.45) + 'px'; }
  composer.addEventListener('input', growComposer);
  composer.addEventListener('keydown', function(e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); document.getElementById('send-btn').click(); } });
  document.getElementById('send-btn').onclick = function() { const v = composer.value; if (v.trim()) { post('chat', { text: v }); composer.value = ''; growComposer(); } };

  // ---------- real-snapshot replay (future serve) ----------
  function renderReplay() {
    const frame = S.frames[S.frameIndex] || null;
    document.getElementById('replay-sub').textContent = S.replaySub || '';
    if (!frame) { document.getElementById('replay-canvas').textContent = ''; return; }
    document.getElementById('replay-canvas').innerHTML = frame.tokens.map(function(tok, i) { return frame.masked[i] ? '<span class="mask">' + esc(tok) + '</span>' : esc(tok); }).join('');
    document.getElementById('replay-status').textContent = 'Block ' + (frame.block + 1) + ', step ' + (frame.step + 1);
    document.getElementById('replay-counter').textContent = (S.frameIndex + 1) + ' / ' + S.totalSteps;
    const slider = document.getElementById('replay-slider'); slider.max = String(Math.max(0, S.frames.length - 1)); slider.value = String(S.frameIndex);
  }
  document.getElementById('back-link').onclick = function() { document.getElementById('replay-screen').style.display = 'none'; };
  document.getElementById('replay-prev').onclick = function() { S.frameIndex = Math.max(0, S.frameIndex - 1); renderReplay(); };
  document.getElementById('replay-next').onclick = function() { S.frameIndex = Math.min(S.frames.length - 1, S.frameIndex + 1); renderReplay(); };
  document.getElementById('replay-slider').oninput = function(e) { S.frameIndex = Number(e.target.value); renderReplay(); };
  document.getElementById('replay-play').onclick = function() {
    if (reduceMotion) { S.frameIndex = S.frames.length - 1; renderReplay(); return; }
    const timer = setInterval(function() { if (S.frameIndex >= S.frames.length - 1) { clearInterval(timer); return; } S.frameIndex++; renderReplay(); }, 220);
  };

  // ---------- messages from the extension ----------
  window.addEventListener('message', function(event) {
    const m = event.data;
    if (m.type === 'settings') {
      document.body.className = m.appearance === 'theme' ? 'theme' : 'brand';
      S.animate = m.animation !== false;
    }
    if (m.type === 'setup') { renderSetup(m); }
    if (m.type === 'context') { renderContext(m); }
    if (m.type === 'status') { document.getElementById('status-text').textContent = m.status; document.getElementById('model-pick').title = m.status; }
    if (m.type === 'userMessage') { newTurn(m.title || m.text, m.contextLabel, m.code || '', m.kind === 'chat', !!m.cloud); if (m.kind === 'chat') { const u = el('div', 'user-text'); u.textContent = m.text; turnBody().insertBefore(u, turnBody().firstChild); } }
    if (m.type === 'message') { showAnswer(m.meta, m.body, m.isCode, m.id); }
    if (m.type === 'hint') {
      if (S.turn && S.turn.dataset.state === 'working') { setStatus(S.turn, /^Cancelled/.test(m.text) ? 'Cancelled' : 'Stopped', /^Cancelled/.test(m.text) ? '' : 'bad'); }
      addNote(m.text);
    }
    if (m.type === 'waiting') { showWaiting(m.title, m.elapsed, m.rangeLine); }
    if (m.type === 'waitingDone') { hideWaiting(); }
    if (m.type === 'result') { showResult(m.result); }
    if (m.type === 'dismiss') { resolveCard(m.id, m.note, m.offerRetryFix, m.retryContextLabel); }
    if (m.type === 'replay') {
      S.frames = m.frames; S.frameIndex = 0; S.totalSteps = m.totalSteps; S.replaySub = m.sub;
      document.getElementById('replay-screen').style.display = 'block'; renderReplay();
    }
  });
  renderStarters({ label: 'No file selected', hasFile: false, hasSelection: false });
  post('ready', {});
</script>
</body>
</html>`;
}
