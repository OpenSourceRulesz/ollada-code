// ollada-code, Phase 1 only.
// Guided Setup, chat panel with active file + selection, three actions
// (Explain selection, Fix selection, Insert at cursor), diff preview
// with Accept/Reject, local Python checks before accepting, and
// watch-after diffusion replay for SDAR (real snapshots only).
//
// Out of Phase 1, deliberately: autocomplete, terminal commands run by
// the model, multi-file edits, agent loops, streaming, live animation,
// saved threads, persistent memory, remote/hosted serve, telemetry,
// bundled models, Marketplace publish.
//
// Hard rules enforced here:
// - All model calls are POST /api/chat on 127.0.0.1:<port> only.
//   Never localhost, never /v1/completions (not in stock 0.3.4).
// - Fix prompt is verbatim (see prompts.ts). Accept never automatic.
// - Port rule: try 11435, then 11436, 11437, and so on, say which in
//   the UI, never kill the process holding a port.
// - Setup never runs pip/pull/serve without a click. pip is never run
//   by the extension at all; it only shows the command with a copy button.
// - Install: CPU `pip install "ollada[cpu,server]"`, GPU
//   `pip install "ollada[gpu,server]"`, everywhere.
// - Minimum serve version 0.3.4 for Setup/Chat/Explain/Fix/Insert.
//   Replay needs a future serve with snapshots; until then the button
//   is disabled and frames are never synthesized.
// - Checks PASS is never presented as correct (see prompts.ts warning).
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runChecks } from './checks';
import { fitLabel, NEMOTRON_DETAIL, recommendedIndex } from './fitLabels';
import type { MachineKind, RecommendRow } from './fitLabels';
import { pickPort } from './ports';
import { CHECKS_PASSED_WARNING, EXPLAIN_PROMPT, FIX_PROMPT, insertPrompt } from './prompts';
import { replayAvailable, totalSteps } from './replay';
import type { Snapshots } from './replay';
import { countChangedLines, simpleDiff, spliceInsert, spliceSelection, stripFences } from './splice';
import { WaitingHistory } from './waiting';
import type { ActionKind } from './waiting';
import { getWebviewHtml } from './webview';
import { shouldShowChat, showDownloadButton } from './screen';

const MIN_VERSION = '0.3.4';

interface SetupStep { icon: string; title: string; detail: string; command?: string; }
interface ModelRowView { model: string; label: string; detail: string; button: boolean; downloaded: boolean; recommended: boolean; }

interface PendingEdit {
  kind: 'fix' | 'insert' | 'explain';
  uri: vscode.Uri;
  version: number;
  startOffset: number;
  endOffset: number;
  originalText: string;
  newText: string;
  spliced: string;
  model: string;
  seconds: number;
  snapshots?: Snapshots;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) { return (pa[i] || 0) - (pb[i] || 0); }
  }
  return 0;
}

function runCommand(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = childProcess.spawn(cmd, args, { shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += String(d); });
    child.stderr.on('data', (d) => { stderr += String(d); });
    child.on('error', (err) => { resolve({ stdout, stderr: String(err), code: 1 }); });
    child.on('close', (code) => { resolve({ stdout, stderr, code: code ?? 1 }); });
  });
}

async function httpJson(port: number, pathName: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  // fetch is available in the VS Code extension host (Node 20+).
  // Every call uses 127.0.0.1, never localhost (managed-PC proxy).
  const response = await fetch(`http://127.0.0.1:${port}${pathName}`, init);
  const text = await response.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  return { status: response.status, body };
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Ollada Serve');
  context.subscriptions.push(output);
  const history = WaitingHistory.fromJSON(context.globalState.get('ollada-code.waitingRuns'));
  const saveHistory = () => { void context.globalState.update('ollada-code.waitingRuns', history.toJSON()); };

  let panel: vscode.WebviewPanel | undefined;
  let currentWebview: vscode.Webview | undefined;
  let serveChild: childProcess.ChildProcess | undefined;
  let servePort: number | undefined;
  let serveModel = vscode.workspace.getConfiguration('ollada-code').get<string>('model', 'sdar:1.7b');
  let pending: PendingEdit | undefined;
  let abortController: AbortController | undefined;
  let lastSnapshots: Snapshots | undefined;
  let lastResultMeta = '';

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  statusBar.text = 'Ollada: not running';
  statusBar.command = 'ollada-code.openPanel';
  statusBar.show();
  context.subscriptions.push(statusBar);

  function post(type: string, data: Record<string, unknown> = {}): void {
    void currentWebview?.postMessage({ type, ...data });
  }
  function setStatus(text: string): void {
    statusBar.text = text;
    post('status', { status: text });
  }

  async function findPython(): Promise<string | undefined> {
    const configured = vscode.workspace.getConfiguration('ollada-code').get<string>('pythonPath', '');
    if (configured) { return configured; }
    // Python extension API first, per spec 6.1, guarded: the extension
    // may not be installed, and its API shape is accessed dynamically.
    try {
      const pyExt = vscode.extensions.getExtension('ms-python.python');
      const api = pyExt?.exports as { environments?: { getActiveEnvironmentPath?: () => Promise<{ path?: string }> } } | undefined;
      const envPath = await api?.environments?.getActiveEnvironmentPath?.();
      if (envPath?.path) { return envPath.path; }
    } catch { /* fall through to .venv / PATH */ }
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const venv = path.join(folder.uri.fsPath, '.venv', 'Scripts', 'python.exe');
      if (fs.existsSync(venv)) { return venv; }
      const venvPosix = path.join(folder.uri.fsPath, '.venv', 'bin', 'python');
      if (fs.existsSync(venvPosix)) { return venvPosix; }
    }
    for (const candidate of ['python', 'python3']) {
      const found = await runCommand(process.platform === 'win32' ? 'where' : 'which', [candidate]);
      if (found.code === 0 && found.stdout.trim()) { return candidate; }
    }
    return undefined;
  }

  function checksScriptPath(): string {
    return path.join(context.extensionPath, 'python', 'checks.py');
  }

  async function getOlladaVersion(python: string): Promise<string | undefined> {
    if (servePort) {
      try {
        const res = await httpJson(servePort, '/api/version');
        if (res.status === 200 && res.body && typeof res.body === 'object') {
          const v = (res.body as { version?: unknown }).version;
          if (typeof v === 'string') { return v; }
        }
      } catch { /* fall through to CLI */ }
    }
    const res = await runCommand(python, ['-m', 'ollada.cli', '--version']);
    const match = res.stdout.match(/ollada\s+([\d.]+)/i) || res.stderr.match(/ollada\s+([\d.]+)/i);
    return match ? match[1] : undefined;
  }

  async function getRecommend(python: string): Promise<{ kind: MachineKind; rows: RecommendRow[]; raw: string }> {
    const res = await runCommand(python, ['-m', 'ollada.cli', 'recommend']);
    const raw = res.stdout + res.stderr;
    const kind: MachineKind = raw.includes('no GPU detected') ? 'cpu' : 'gpu';
    const cpuVerified: Record<string, boolean> = { 'sdar:1.7b': true, 'sdar:4b': true, 'nemotron:3b': true };
    const muchSlower: Record<string, boolean> = { 'sdar:4b': true, 'nemotron:3b': true };
    const details: Record<string, string> = {
      'sdar:1.7b': '3.9 GB RAM at peak. 4.1 GB download.',
      'sdar:4b': '8.6 GB RAM. On longer prompts, 2.5 to 3x slower than sdar:1.7b here; on short answers, about 1.3x.',
      'nemotron:3b': NEMOTRON_DETAIL,
      'dream:7b': 'Not tested on CPU.',
      'diffcoder:8b': 'Not tested on CPU.',
    };
    const rows: RecommendRow[] = [];
    for (const line of raw.split('\n')) {
      const m = line.match(/^(\S+)\s+(fits|tight|won't fit|unknown)\b/);
      if (!m) { continue; }
      const model = m[1];
      rows.push({
        model,
        verdict: m[2] as RecommendRow['verdict'],
        cpuVerified: cpuVerified[model] ?? false,
        muchSlowerThanSdar17b: muchSlower[model] ?? false,
        detail: details[model],
      });
    }
    if (rows.length === 0) {
      // Recommend failed or its format changed: show the shelf with
      // unknown verdicts rather than inventing fit labels.
      for (const model of ['diffcoder:8b', 'dream:7b', 'sdar:4b', 'nemotron:3b', 'sdar:1.7b']) {
        rows.push({
          model, verdict: 'unknown',
          cpuVerified: cpuVerified[model] ?? false,
          muchSlowerThanSdar17b: muchSlower[model] ?? false,
          detail: details[model],
        });
      }
    }
    return { kind, rows, raw };
  }

  // Downloaded check, non-downloading and no guessed cache path.
  // ollada has no list/show flag for this: list prints the shelf,
  // show prints the recipe and fit. The shelf's own cache test is in
  // its rm command (cli.py): huggingface_hub.scan_cache_dir() repos
  // matched against each recipe's source. This runs exactly that test
  // (recipe sources from ollada.recipes.load_catalog, cache from
  // scan_cache_dir, which honours HF_HOME) in one python invocation
  // for the whole shelf. Any failure returns an empty set, so the UI
  // falls back to showing Download — it never claims Downloaded
  // without a check. A repo present in the cache counts as downloaded,
  // the same definition the shelf's rm command uses; pull is
  // cache-first, so a partial cache is completed by pull, not redownloaded.
  async function getDownloadedModels(python: string): Promise<Set<string>> {
    const script = [
      'import sys',
      'try:',
      '    from huggingface_hub import scan_cache_dir',
      '    from ollada.recipes import load_catalog',
      '    cached = {r.repo_id for r in list(scan_cache_dir().repos)}',
      '    for rec in load_catalog():',
      '        print(rec.name + " " + ("cached" if rec.source in cached else "missing"))',
      'except Exception:',
      '    sys.exit(1)',
    ].join('\n');
    const res = await runCommand(python, ['-c', script]);
    if (res.code !== 0) { return new Set(); }
    const out = new Set<string>();
    for (const line of res.stdout.split('\n')) {
      const m = line.match(/^(\S+)\s+cached$/);
      if (m) { out.add(m[1]); }
    }
    return out;
  }

  async function buildSetup(): Promise<{ steps: SetupStep[]; models: ModelRowView[]; note: string; ready: boolean; kind: MachineKind }> {
    const python = await findPython();
    const steps: SetupStep[] = [];
    let kind: MachineKind = 'cpu';
    let models: ModelRowView[] = [];
    let ready = false;
    let note = '';
    if (!python) {
      steps.push({ icon: '⚠', title: 'Python 3.12 to 3.14', detail: 'No Python interpreter found. Install Python 3.12 to 3.14, then Check again.' });
      return { steps, models, note, ready, kind };
    }
    const versionRes = await runCommand(python, ['--version']);
    const versionText = (versionRes.stdout + versionRes.stderr).trim();
    const vm = versionText.match(/Python\s+(\d+)\.(\d+)\.(\d+)/);
    if (!vm) {
      steps.push({ icon: '⚠', title: 'Python 3.12 to 3.14', detail: `Could not read a Python version from: ${versionText}` });
    } else {
      const major = parseInt(vm[1], 10);
      const minor = parseInt(vm[2], 10);
      if (major !== 3 || minor > 14) {
        steps.push({
          icon: '⚠', title: 'Python 3.15 found. Ollada needs 3.12 to 3.14.',
          detail: 'On 3.15, pip quietly installs ollada 0.1.0, which doesn’t have sdar:1.7b. Python 3.12 is recommended.',
        });
      } else if (major !== 3 || minor < 12) {
        steps.push({ icon: '⚠', title: `Python ${vm[1]}.${vm[2]} found. Ollada needs 3.12 to 3.14.`, detail: 'Python 3.12 is recommended.' });
      } else {
        steps.push({ icon: '✓', title: 'Python 3.12 to 3.14', detail: `Found Python ${vm[1]}.${vm[2]} in ${python}` });
      }
    }
    // Server extra check: FastAPI + uvicorn must import.
    const serverRes = await runCommand(python, ['-c', 'import fastapi, uvicorn']);
    const serverMissing = serverRes.code !== 0;
    const olladaVersion = await getOlladaVersion(python);
    // Machine kind first: the install pill (cpu,server vs gpu,server)
    // depends on it, and recommend is the source of that kind.
    const recommend = await getRecommend(python);
    kind = recommend.kind;
    const installCmd = kind === 'gpu' ? 'pip install "ollada[gpu,server]"' : 'pip install "ollada[cpu,server]"';
    if (!olladaVersion) {
      steps.push({
        icon: '⚠', title: 'ollada isn’t installed in .venv',
        detail: 'Run this in a terminal with .venv active. Ollada won’t run pip for you.',
        command: installCmd,
      });
    } else if (compareVersions(olladaVersion, MIN_VERSION) < 0) {
      steps.push({
        icon: '⚠', title: `ollada ${olladaVersion} found. This extension needs 0.3.4 or newer.`,
        detail: 'If you’re on Python 3.15, that’s why: switch to 3.12 to 3.14 first. Otherwise, upgrade:',
        command: kind === 'gpu' ? 'pip install -U "ollada[gpu,server]"' : 'pip install -U "ollada[cpu,server]"',
      });
    } else {
      steps.push({ icon: '✓', title: `ollada ${MIN_VERSION}`, detail: `Found in ${python}` });
    }
    if (serverMissing && olladaVersion) {
      steps.push({
        icon: '⚠', title: 'ollada serve needs the server extra',
        detail: 'Run the command below in the same .venv, then Check again.',
        command: installCmd,
      });
    }
    const recIndex = recommendedIndex(recommend.rows, kind);
    const downloaded = olladaVersion ? await getDownloadedModels(python) : new Set<string>();
    models = recommend.rows.map((row, i) => {
      const label = fitLabel(row, kind);
      const isDownloaded = downloaded.has(row.model);
      return {
        model: row.model,
        label,
        detail: row.detail ?? '',
        button: showDownloadButton(label, isDownloaded),
        downloaded: isDownloaded,
        recommended: i === recIndex,
      };
    });
    steps.push({ icon: '•', title: 'Pick a model', detail: 'From ollada recommend, for this machine.' });
    if (servePort) {
      steps.push({ icon: '✓', title: 'Start ollada serve', detail: `Serving ${serveModel} on ${servePort}` });
      ready = true;
    } else {
      const picked = await pickPort(vscode.workspace.getConfiguration('ollada-code').get<number>('servePort', 0));
      steps.push({
        icon: '•', title: 'Start ollada serve',
        detail: picked.skipped.length > 0
          ? `Port ${picked.skipped.join(', ')} ${picked.skipped.length === 1 ? 'is' : 'are'} in use by another app, so Ollada will use ${picked.port}.`
          : `Ollada will use port ${picked.port}.`,
      });
      note = `Start serve on ${picked.port} when you are ready. Nothing downloads or starts until you click.`;
    }
    return { steps, models, note, ready, kind };
  }

  // Single source of screen choice. 'setup' is always posted first;
  // 'ready' (which shows Chat in the webview) is posted only after it,
  // and only when serve is running and Setup was not forced. That
  // ordering is the fix: previously startServe posted 'ready' and then
  // refreshSetup posted 'setup' seconds later, so Setup always won
  // and Chat was unreachable. forceSetup=true is the chat screen's
  // Setup button: it shows Setup again without touching serve.
  async function refreshSetup(forceSetup = false): Promise<void> {
    const setup = await buildSetup();
    post('setup', { steps: setup.steps, models: setup.models, note: setup.note });
    if (setup.ready) {
      setStatus(`Ollada: serving ${serveModel} on ${servePort}`);
      if (shouldShowChat(setup.ready, forceSetup)) {
        post('ready', { status: `Ollada: serving ${serveModel} on ${servePort}` });
      }
    }
  }

  async function startServe(): Promise<void> {
    const python = await findPython();
    if (!python) {
      void vscode.window.showWarningMessage('Ollada: no Python interpreter found. Check Setup first.');
      return;
    }
    if (serveChild) {
      void vscode.window.showInformationMessage(`Ollada serve is already running on ${servePort}.`);
      return;
    }
    const preferred = vscode.workspace.getConfiguration('ollada-code').get<number>('servePort', 0);
    const picked = await pickPort(preferred);
    const args = ['-m', 'ollada.cli', 'serve', '--host', '127.0.0.1', '--port', String(picked.port)];
    output.appendLine(`Starting: ${python} ${args.join(' ')}`);
    output.show(true);
    serveChild = childProcess.spawn(python, args, { shell: false });
    serveChild.stdout?.on('data', (d) => output.append(String(d)));
    serveChild.stderr?.on('data', (d) => output.append(String(d)));
    serveChild.on('exit', (code) => {
      output.appendLine(`Ollada serve exited with code ${code}.`);
      serveChild = undefined;
      servePort = undefined;
      setStatus('Ollada: not running');
      void refreshSetup();
    });
    // Poll /health until it answers, up to 30 seconds.
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (!serveChild) { return; }
      try {
        const res = await httpJson(picked.port, '/health');
        if (res.status === 200) {
          servePort = picked.port;
          setStatus(`Ollada: serving ${serveModel} on ${servePort}`);
          // No premature post('ready') here: refreshSetup posts setup
          // first, then ready, so Chat is the final screen.
          void refreshSetup();
          return;
        }
      } catch { /* not up yet */ }
    }
    void vscode.window.showWarningMessage(
      `Ollada: could not reach serve on ${picked.port}. It may have stopped, or the server extra may be missing. ` +
      `Fallback command (copy it into a terminal with .venv active): ${python} -m ollada.cli serve --host 127.0.0.1 --port ${picked.port}`,
    );
  }

  async function chatOnce(model: string, prompt: string, signal: AbortSignal): Promise<{ text: string; snapshots?: Snapshots; raw: unknown }> {
    if (!servePort) { throw new Error('Serve is not running. Start serve in Setup first.'); }
    const url = `http://127.0.0.1:${servePort}/api/chat`;
    const attempts: Array<Record<string, unknown> | undefined> = [
      // Proposal only (spec 6.7): ask a future serve to record snapshots.
      // Stock 0.3.4 has no snapshots field and ignores nothing it must
      // understand; if it rejects the option, retry without options.
      { record_snapshots: true },
      undefined,
    ];
    let lastError: unknown;
    for (const options of attempts) {
      const body: Record<string, unknown> = { model, messages: [{ role: 'user', content: prompt }] };
      if (options) { body.options = options; }
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
      const text = await response.text();
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch { /* keep text */ }
      if (!response.ok) {
        const detail = parsed && typeof parsed === 'object'
          ? String((parsed as { detail?: unknown; error?: unknown }).detail ?? (parsed as { error?: unknown }).error ?? text)
          : text;
        if (response.status === 409) {
          throw new Error('This model doesn’t fit this machine right now. Pick a smaller one in Setup, or close other apps.');
        }
        if (options) { lastError = new Error(detail); continue; }
        throw new Error(detail);
      }
      const content = parsed && typeof parsed === 'object'
        ? (parsed as { message?: { content?: unknown } }).message?.content
        : undefined;
      if (typeof content !== 'string') { throw new Error('Serve returned a chat response without message content.'); }
      const snapshots = replayAvailable(parsed) ? (parsed as { snapshots: Snapshots }).snapshots : undefined;
      return { text: content, snapshots, raw: parsed };
    }
    throw lastError instanceof Error ? lastError : new Error('Chat request failed.');
  }

  function activeSelection(): { editor: vscode.TextEditor; text: string; startOffset: number; endOffset: number; fileName: string } | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return undefined; }
    const selection = editor.selection;
    if (selection.isEmpty) { return undefined; }
    const doc = editor.document;
    return {
      editor,
      text: doc.getText(selection),
      startOffset: doc.offsetAt(selection.start),
      endOffset: doc.offsetAt(selection.end),
      fileName: path.basename(doc.fileName),
    };
  }

  async function runAction(action: ActionKind): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      post('hint', { text: 'Open a file first.' });
      return;
    }
    const doc = editor.document;
    const selection = editor.selection;
    let prompt: string;
    let title: string;
    let kind: PendingEdit['kind'] = action;
    if (action === 'fix') {
      const sel = activeSelection();
      if (!sel) { post('hint', { text: 'Select the code first.' }); return; }
      prompt = `${FIX_PROMPT}\n\n\`\`\`\n${sel.text}\n\`\`\``;
      title = 'Working on a fix';
    } else if (action === 'explain') {
      const sel = activeSelection();
      if (!sel) { post('hint', { text: 'Select the code first.' }); return; }
      // PROPOSED, UNTESTED prompt (see prompts.ts).
      prompt = `${EXPLAIN_PROMPT}\n\n\`\`\`\n${sel.text}\n\`\`\``;
      title = 'Working on an explanation';
    } else {
      // Insert at cursor. PROPOSED, UNTESTED prompt (see prompts.ts).
      // Phase 1 Insert does not read the code after the cursor.
      const cursor = selection.active;
      const lineText = doc.lineAt(cursor.line).text;
      prompt = insertPrompt(`Insert code at line ${cursor.line + 1} in ${path.basename(doc.fileName)}, after: ${lineText}`, path.basename(doc.fileName));
      title = 'Writing code to insert';
      kind = 'insert';
    }
    if (!servePort) {
      post('hint', { text: 'Serve is not running. Start serve in Setup first.' });
      return;
    }
    const model = serveModel;
    // Long-input warning, spec 6.4: ~300 tokens for sdar:1.7b on CPU.
    const estimatedTokens = Math.round(prompt.length / 4);
    if (model === 'sdar:1.7b' && estimatedTokens > 300) {
      const choice = await vscode.window.showWarningMessage(
        `This selection is long for sdar:1.7b on CPU (about ${estimatedTokens} tokens). It may be slow, and fixes longer than 128 tokens get cut off.`,
        'Send anyway', 'Cancel',
      );
      if (choice !== 'Send anyway') { return; }
    }
    abortController = new AbortController();
    const started = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - started) / 1000;
      const range = history.rangeFor(action, model);
      const rangeLine = range
        ? `On this machine, recent ${action}s with ${model} took ${range.min.toFixed(1)} to ${range.max.toFixed(1)} s. The bar shows time against that range, not progress inside the model.`
        : undefined;
      post('waiting', { title, elapsed: `${elapsed.toFixed(1)} s`, rangeLine });
    }, 500);
    try {
      const result = await chatOnce(model, prompt, abortController.signal);
      const seconds = (Date.now() - started) / 1000;
      history.record(action, model, seconds);
      saveHistory();
      post('waitingDone', {});
      const clean = stripFences(result.text);
      lastSnapshots = result.snapshots;
      if (action === 'explain') {
        post('message', { meta: `${path.basename(doc.fileName)} — explanation, ${seconds.toFixed(1)} s`, body: clean, isCode: false });
        return;
      }
      const fullText = doc.getText();
      if (action === 'fix') {
        const sel = activeSelection();
        if (!sel) { post('hint', { text: 'Select the code first.' }); return; }
        const spliced = spliceSelection(fullText, sel.startOffset, sel.endOffset, clean);
        pending = {
          kind: 'fix', uri: doc.uri, version: doc.version,
          startOffset: sel.startOffset, endOffset: sel.endOffset,
          originalText: fullText, newText: clean, spliced, model, seconds,
          snapshots: result.snapshots,
        };
        await showFixResult(doc, spliced, clean, seconds, result.snapshots);
      } else {
        const offset = doc.offsetAt(selection.active);
        const spliced = spliceInsert(fullText, offset, clean);
        pending = {
          kind: 'insert', uri: doc.uri, version: doc.version,
          startOffset: offset, endOffset: offset,
          originalText: fullText, newText: clean, spliced, model, seconds,
          snapshots: result.snapshots,
        };
        await showFixResult(doc, spliced, clean, seconds, result.snapshots, true);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        post('hint', { text: 'Cancelled. The model may keep running server-side until it finishes.' });
      } else {
        post('hint', { text: `Ollada error: ${err instanceof Error ? err.message : String(err)}` });
      }
    } finally {
      clearInterval(timer);
      post('waitingDone', {});
    }
  }

  async function showFixResult(
    doc: vscode.TextDocument, spliced: string, clean: string, seconds: number,
    snapshots: Snapshots | undefined, isInsert = false,
  ): Promise<void> {
    const diff = simpleDiff(doc.getText(), spliced);
    const changed = countChangedLines(diff);
    const meta = isInsert
      ? `${countChangedLines(simpleDiff('', clean))} lines to insert at line ${doc.positionAt(pending?.startOffset ?? 0).line + 1}`
      : `${changed} line${changed === 1 ? '' : 's'} changed`;
    lastResultMeta = meta;
    let checks: Array<{ name: string; pass: boolean; message?: string }> = [];
    let warnings: string[] = [];
    let warning = 'No checks for this language yet. Review the change before accepting.';
    if (doc.languageId === 'python' || doc.fileName.endsWith('.py')) {
      const python = await findPython();
      if (python) {
        try {
          const result = await runChecks(python, checksScriptPath(), spliced);
          checks = [
            { name: 'Syntax', pass: !result.findings.some((f) => f.kind === 'syntax') },
            { name: 'Undefined names', pass: !result.findings.some((f) => f.kind === 'undefined') },
            { name: 'Dead code', pass: !result.findings.some((f) => f.kind === 'dead') },
          ];
          for (const f of result.findings) {
            const entry = checks.find((c) => c.name === (f.kind === 'syntax' ? 'Syntax' : f.kind === 'undefined' ? 'Undefined names' : 'Dead code'));
            if (entry) { entry.message = f.message; }
          }
          warnings = result.warnings.map((w) => w.message);
          const failed = checks.find((c) => !c.pass);
          warning = failed
            ? `Checks found a problem: ${failed.name}. Review before accepting.`
            : CHECKS_PASSED_WARNING;
        } catch (err) {
          warning = `Checks could not run: ${err instanceof Error ? err.message : String(err)}. Review the change before accepting.`;
        }
      } else {
        warning = 'No Python interpreter found, so checks could not run. Review the change before accepting.';
      }
    }
    const hasFailedCheck = checks.some((c) => !c.pass);
    post('result', {
      result: {
        meta,
        time: `${seconds.toFixed(1)} s`,
        diff: diff.map((d) => ({ kind: d.kind, text: d.text })),
        checks: checks.length > 0 ? checks : undefined,
        warnings,
        warning,
        acceptLabel: isInsert ? 'Insert' : 'Accept',
        rejectLabel: isInsert ? 'Discard' : 'Reject',
        replayAvailable: !!snapshots,
        acceptPrimary: !hasFailedCheck,
      },
    });
  }

  function openPanel(): void {
    if (panel) { panel.reveal(); return; }
    panel = vscode.window.createWebviewPanel('ollada-code.chat', 'Ollada', vscode.ViewColumn.Beside, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    panel.webview.html = getWebviewHtml();
    currentWebview = panel.webview;
    const panelWebview = panel.webview;
    panel.onDidDispose(() => { panel = undefined; if (currentWebview === panelWebview) { currentWebview = undefined; } });
    const handleMessage = async (message: { type: string; [key: string]: unknown }) => {
      switch (message.type) {
        case 'ready':
          void refreshSetup();
          break;
        case 'checkAgain':
          void refreshSetup();
          break;
        case 'showSetup':
          // Back to Setup without stopping serve: serveChild and
          // servePort are untouched, so Start serve again while
          // serving still reports "already running".
          void refreshSetup(true);
          break;
        case 'startServe':
          void startServe();
          break;
        case 'copy':
          if (typeof message.text === 'string') { void vscode.env.clipboard.writeText(message.text); }
          break;
        case 'download': {
          const model = String(message.model ?? '');
          const python = await findPython();
          if (!python) { post('hint', { text: 'No Python interpreter found.' }); break; }
          const terminal = vscode.window.createTerminal('Ollada: pull');
          terminal.show();
          terminal.sendText(`${python} -m ollada.cli pull ${model}`);
          break;
        }
        case 'action':
          void runAction(message.action as ActionKind);
          break;
        case 'chat': {
          // Free-form chat: same /api/chat path, no edit, no checks.
          if (!servePort) { post('hint', { text: 'Serve is not running. Start serve in Setup first.' }); break; }
          const controller = new AbortController();
          try {
            const result = await chatOnce(serveModel, String(message.text ?? ''), controller.signal);
            post('message', { meta: `${serveModel}`, body: stripFences(result.text), isCode: false });
          } catch (err) {
            post('hint', { text: `Ollada error: ${err instanceof Error ? err.message : String(err)}` });
          }
          break;
        }
        case 'cancel':
          abortController?.abort();
          break;
        case 'accept': {
          if (!pending) { break; }
          const editor = vscode.window.activeTextEditor;
          if (!editor || editor.document.uri.toString() !== pending.uri.toString()) {
            post('hint', { text: 'Open the original file first, then Accept.' });
            break;
          }
          if (editor.document.version !== pending.version) {
            post('hint', { text: 'The file changed while Ollada was working. Run it again.' });
            pending = undefined;
            break;
          }
          const edit = new vscode.WorkspaceEdit();
          const range = new vscode.Range(
            editor.document.positionAt(pending.startOffset),
            editor.document.positionAt(pending.endOffset),
          );
          edit.replace(pending.uri, range, pending.kind === 'insert' ? pending.newText + '\n' : pending.newText);
          const applied = await vscode.workspace.applyEdit(edit);
          if (applied) {
            post('message', { meta: lastResultMeta, body: 'Applied.', isCode: false });
          }
          pending = undefined;
          break;
        }
        case 'reject':
          pending = undefined;
          post('message', { meta: lastResultMeta, body: 'Discarded.', isCode: false });
          break;
        case 'watch': {
          if (!lastSnapshots) {
            post('hint', { text: 'Replay not available for this model' });
            break;
          }
          const total = totalSteps(lastSnapshots);
          post('replay', {
            frames: lastSnapshots.frames,
            totalSteps: total,
            sub: `How this answer formed, replayed from the steps ollada serve recorded. ${serveModel} writes in blocks of ${lastSnapshots.block_length} tokens, ${lastSnapshots.steps} steps per block.`,
          });
          break;
        }
        default:
          break;
      }
    };
    panel.webview.onDidReceiveMessage(handleMessage);
    void refreshSetup();
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('ollada-code.openPanel', openPanel),
    vscode.commands.registerCommand('ollada-code.explainSelection', () => { openPanel(); void runAction('explain'); }),
    vscode.commands.registerCommand('ollada-code.fixSelection', () => { openPanel(); void runAction('fix'); }),
    vscode.commands.registerCommand('ollada-code.insertAtCursor', () => { openPanel(); void runAction('insert'); }),
    vscode.commands.registerCommand('ollada-code.startServe', () => void startServe()),
    vscode.commands.registerCommand('ollada-code.checkAgain', () => void refreshSetup()),
    vscode.window.registerWebviewViewProvider('ollada-code.chat', {
      resolveWebviewView(view) {
        // The side view is the spec's primary surface. Commands open the
        // same Beside panel, so the side view delegates to it: clicking
        // the Ollada activity-bar view opens the full panel, which
        // carries the complete message handler. This avoids two live
        // webviews with divergent state in Phase 1.
        view.webview.options = { enableScripts: true };
        view.webview.html = getWebviewHtml();
        view.webview.onDidReceiveMessage((message: { type: string }) => {
          if (message.type === 'ready') { openPanel(); }
        });
      },
    }),
  );
}

export function deactivate(): void {
  // Serve is a child process of the extension; VS Code terminates it
  // with the extension host. Nothing else needs cleanup here.
}
