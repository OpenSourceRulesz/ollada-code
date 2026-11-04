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
// - Port rule: reuse an ollada serve that already answers; otherwise try
//   11435, then 11436, 11437, and so on, say which in the UI, and never
//   kill the process holding a port.
// - Setup never runs pip/pull/serve without a click. pip is never run
//   by the extension at all; it only shows the command with a copy button.
// - Install: CPU `pip install "ollada[cpu,server]"`, GPU
//   `pip install "ollada[gpu,server]"`, everywhere.
// - Minimum serve version 0.3.4 for Setup/Chat/Explain/Fix/Insert.
//   Replay needs a future serve with snapshots; until then there is no
//   Replay button and frames are never synthesized.
// - Checks PASS is never presented as correct (see prompts.ts warning).
//   A syntax error in the proposed file turns Accept / Insert off.
//
// 0.1.4 dogfood fixes (see the changelog for the full list):
// - Chat lives in the Ollada sidebar view, not a Beside editor panel.
//   A Beside panel takes over the editor area, so clicking it left no
//   active text editor and the extension said "Open a file first." The
//   extension also tracks the last real text editor and snapshots its
//   file and selection at click time, for files inside or outside the
//   workspace.
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { CACHE_SCRIPT, parseCacheResult } from './cacheScript';
import { runChecks } from './checks';
import { actionsEnabled, captureContext, chipLabel, planAction } from './context';
import type { CapturedContext, RawEditorState } from './context';
import { fitDotColor, fitLabel, NEMOTRON_DETAIL, recommendedIndex } from './fitLabels';
import type { MachineKind, RecommendRow } from './fitLabels';
import { findOlladaServe, FIRST_PORT, MAX_PORT, pickPort, probeOllada } from './ports';
import { gateProposal, ProposalStore } from './proposals';
import type { Proposal } from './proposals';
import { CHECKS_PASSED_WARNING, EXPLAIN_PROMPT, FIX_PROMPT, fixRetryPrompt, importsContextBlock, insertPrompt } from './prompts';
import { pythonCandidates } from './python';
import type { PythonCandidate } from './python';
import { replayAvailable, totalSteps } from './replay';
import type { Snapshots } from './replay';
import { countChangedLines, isImportOnlyReplacement, planEdit, simpleDiff, stripFences } from './splice';
import { WaitingHistory } from './waiting';
import type { ActionKind } from './waiting';
import { getWebviewHtml } from './webview';
import { checkKey, isMercuryModel, MERCURY_CONSENT, MERCURY_MODELS, MERCURY_SECRET, mercuryChat } from './mercury';
import { showDownloadButton } from './screen';

const MIN_VERSION = '0.3.4';
const VIEW_ID = 'ollada-code.chat';

interface SetupStep { icon: string; title: string; detail: string; command?: string; action?: 'changePython'; }
interface ModelRowView { model: string; label: string; detail: string; button: boolean; downloaded: boolean; recommended: boolean; selected: boolean; dot: string; }
interface FoundPython { path: string; source: string; hasOllada: boolean; }

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) { return (pa[i] || 0) - (pb[i] || 0); }
  }
  return 0;
}

function runCommand(cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = childProcess.spawn(cmd, args, { shell: false, env: env ?? process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += String(d); });
    child.stderr.on('data', (d) => { stderr += String(d); });
    child.on('error', (err) => { resolve({ stdout, stderr: String(err), code: 1 }); });
    child.on('close', (code) => { resolve({ stdout, stderr, code: code ?? 1 }); });
  });
}

function usableEditor(editor: vscode.TextEditor | undefined): editor is vscode.TextEditor {
  if (!editor || editor.document.isClosed) { return false; }
  const scheme = editor.document.uri.scheme;
  return scheme === 'file' || scheme === 'untitled';
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Ollada');
  context.subscriptions.push(output);
  const history = WaitingHistory.fromJSON(context.globalState.get('ollada-code.waitingRuns'));
  const saveHistory = () => { void context.globalState.update('ollada-code.waitingRuns', history.toJSON()); };

  let view: vscode.WebviewView | undefined;
  let serveChild: childProcess.ChildProcess | undefined;
  let servePort: number | undefined;
  let serveReused = false;
  let serveModel = vscode.workspace.getConfiguration('ollada-code').get<string>('model', 'sdar:4b');
  // 0.1.8: Mercury (Inception) is the one optional cloud model. Its key is in
  // SecretStorage; mercuryConnected mirrors whether one is saved.
  let mercuryConnected = false;
  let lastLocalModel = isMercuryModel(serveModel) ? 'sdar:4b' : serveModel;
  void context.secrets.get(MERCURY_SECRET).then((k) => { mercuryConnected = !!k; });
  let machineKind: MachineKind = 'cpu';
  const proposals = new ProposalStore();
  // 0.1.6: the snapshot a Fix proposal was made from, so a Discard can
  // offer a one-time Retry fix with an instruction against that same
  // selection. Never written to, never persisted.
  let lastFixContext: CapturedContext | undefined;
  const snapshotsById = new Map<string, Snapshots>();
  let abortController: AbortController | undefined;
  let lastEditor: vscode.TextEditor | undefined = usableEditor(vscode.window.activeTextEditor) ? vscode.window.activeTextEditor : undefined;
  let pythonCache: FoundPython | undefined;
  let refreshing: Promise<void> | undefined;

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  statusBar.text = 'Ollada: not running';
  statusBar.command = 'ollada-code.openPanel';
  statusBar.show();
  context.subscriptions.push(statusBar);

  function post(type: string, data: Record<string, unknown> = {}): void {
    void view?.webview.postMessage({ type, ...data });
  }

  // ---------- editor context ----------
  function editorState(): RawEditorState | undefined {
    const editor = usableEditor(vscode.window.activeTextEditor) ? vscode.window.activeTextEditor : lastEditor;
    if (!usableEditor(editor)) { return undefined; }
    const doc = editor.document;
    const sel = editor.selection;
    return {
      path: doc.uri.scheme === 'file' ? doc.uri.fsPath : doc.fileName,
      uri: doc.uri.toString(),
      languageId: doc.languageId,
      version: doc.version,
      fullText: doc.getText(),
      selStart: doc.offsetAt(sel.start),
      selEnd: doc.offsetAt(sel.end),
      active: doc.offsetAt(sel.active),
    };
  }
  function postContext(): void {
    const ctx = captureContext(editorState());
    const enabled = actionsEnabled(ctx);
    post('context', {
      label: chipLabel(ctx), path: ctx?.path ?? '', hasFile: !!ctx, hasSelection: !!ctx?.hasSelection, ...enabled,
      headerImports: ctx?.headerImports ?? [], headerImportsTruncated: ctx?.headerImportsTruncated ?? false,
    });
  }
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      // Focus moving to the Ollada view, the Output panel or a webview
      // reports no text editor; keep the last real one.
      if (usableEditor(editor)) { lastEditor = editor; }
      postContext();
    }),
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (usableEditor(e.textEditor)) { lastEditor = e.textEditor; postContext(); }
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      if (lastEditor && lastEditor.document === doc) { lastEditor = undefined; postContext(); }
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (lastEditor && e.document === lastEditor.document) { postContext(); }
    }),
  );

  // ---------- Python ----------
  async function pythonExtensionPath(): Promise<string | undefined> {
    try {
      const pyExt = vscode.extensions.getExtension('ms-python.python');
      const api = pyExt?.exports as { environments?: { getActiveEnvironmentPath?: () => Promise<{ path?: string }> } } | undefined;
      return (await api?.environments?.getActiveEnvironmentPath?.())?.path;
    } catch { return undefined; }
  }
  function childDirs(dir: string): string[] {
    try {
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
        .slice(0, 50)
        .map((d) => path.join(dir, d.name));
    } catch { return []; }
  }
  async function listCandidates(): Promise<PythonCandidate[]> {
    return pythonCandidates({
      configured: vscode.workspace.getConfiguration('ollada-code').get<string>('pythonPath', '') || undefined,
      pythonExtension: await pythonExtensionPath(),
      folders: (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath),
      childDirs,
      exists: (p) => fs.existsSync(p),
      join: path.join,
    });
  }
  async function canImportOllada(python: string): Promise<boolean> {
    const res = await runCommand(python, ['-c', 'import ollada']);
    return res.code === 0;
  }
  /**
   * The Python whose ollada the extension uses. A configured path always
   * wins (the user chose it). Otherwise the first candidate that can
   * import ollada; if none can, the first one that runs, so Setup can say
   * exactly which Python it checked.
   */
  async function findPython(): Promise<FoundPython | undefined> {
    if (pythonCache) { return pythonCache; }
    const candidates = await listCandidates();
    const configured = candidates.find((c) => c.source.startsWith('the ollada-code.pythonPath'));
    if (configured) {
      pythonCache = { ...configured, hasOllada: await canImportOllada(configured.path) };
      return pythonCache;
    }
    let firstRunnable: PythonCandidate | undefined;
    for (const c of candidates) {
      const runs = await runCommand(c.path, ['--version']);
      if (runs.code !== 0) { continue; }
      firstRunnable = firstRunnable ?? c;
      if (await canImportOllada(c.path)) { pythonCache = { ...c, hasOllada: true }; return pythonCache; }
    }
    if (firstRunnable) { pythonCache = { ...firstRunnable, hasOllada: false }; }
    return pythonCache;
  }
  async function changePython(): Promise<void> {
    const candidates = (await listCandidates()).filter((c) => !c.source.startsWith('the ollada-code.pythonPath'));
    const items: Array<vscode.QuickPickItem & { value?: string; browse?: boolean; clear?: boolean }> = [
      ...candidates.map((c) => ({ label: c.path, description: c.source, value: c.path })),
      { label: 'Browse for a Python executable…', browse: true },
      { label: 'Use automatic detection', description: 'clears the ollada-code.pythonPath setting', clear: true },
    ];
    const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Which Python has ollada installed? (usually the .venv python)' });
    if (!picked) { return; }
    let value: string | undefined;
    if (picked.clear) { value = ''; }
    else if (picked.browse) {
      const uris = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Use this Python', title: 'Pick the Python that has ollada installed' });
      if (!uris || uris.length === 0) { return; }
      value = uris[0].fsPath;
    } else { value = picked.value; }
    await vscode.workspace.getConfiguration('ollada-code').update('pythonPath', value, vscode.ConfigurationTarget.Global);
    pythonCache = undefined;
    void refreshSetup();
  }
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('ollada-code.pythonPath')) { pythonCache = undefined; }
    if (e.affectsConfiguration('ollada-code.model')) { serveModel = vscode.workspace.getConfiguration('ollada-code').get<string>('model', 'sdar:4b'); }
  }));

  function checksScriptPath(): string {
    return path.join(context.extensionPath, 'python', 'checks.py');
  }

  async function getOlladaVersion(python: string): Promise<string | undefined> {
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

  /** Cached models, from the same test ollada's rm command uses. See cacheScript.ts. */
  async function getDownloadedModels(python: string): Promise<{ cached: Set<string>; note: string }> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ollada-code-cache-'));
    const file = path.join(dir, 'cache_check.py');
    try {
      fs.writeFileSync(file, CACHE_SCRIPT, 'utf-8');
      const res = await runCommand(python, [file]);
      const result = parseCacheResult(res.stdout, res.stderr);
      if (!result.ok) {
        output.appendLine(`Model cache check failed with ${python}: ${result.error ?? 'unknown error'}`);
        return {
          cached: new Set(),
          note: `Couldn’t check the model cache${result.cacheDir ? ` at ${result.cacheDir}` : ''}: ${result.error ?? 'unknown error'}. Showing Download for every model; pull reuses anything already cached.`,
        };
      }
      if (result.missingCache) {
        return { cached: result.cached, note: `No Hugging Face cache found at ${result.cacheDir}. If your models live somewhere else (HF_HOME), start VS Code from a terminal where HF_HOME is set.` };
      }
      return { cached: result.cached, note: `Checked the model cache at ${result.cacheDir}.` };
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  // ---------- serve ----------
  /** Reuse an ollada serve that already answers (ours or one started by hand) before ever offering a new one. */
  async function detectServe(): Promise<void> {
    if (servePort && await probeOllada(servePort, 1500)) { return; }
    if (servePort && !serveChild) { servePort = undefined; serveReused = false; }
    const preferred = vscode.workspace.getConfiguration('ollada-code').get<number>('servePort', 0);
    const start = preferred > 0 ? preferred : FIRST_PORT;
    const found = await findOlladaServe(start, Math.min(start + 9, MAX_PORT));
    if (found) {
      servePort = found.port;
      serveReused = !serveChild;
      output.appendLine(`Using existing ollada serve ${found.version} on 127.0.0.1:${found.port}.`);
    }
  }

  async function buildSetup(): Promise<Record<string, unknown>> {
    const steps: SetupStep[] = [];
    let models: ModelRowView[] = [];
    let cacheNote = '';
    await detectServe();
    const py = await findPython();
    if (!py) {
      steps.push({ icon: '⚠', title: 'Python 3.12 to 3.14', detail: 'No Python interpreter found. Install Python 3.12 to 3.14, or pick one with Change Python, then Check again.', action: 'changePython' });
    } else {
      const versionRes = await runCommand(py.path, ['--version']);
      const versionText = (versionRes.stdout + versionRes.stderr).trim();
      const vm = versionText.match(/Python\s+(\d+)\.(\d+)\.(\d+)/);
      const where = `Checking ${py.path} (from ${py.source}).`;
      if (!vm) {
        steps.push({ icon: '⚠', title: 'Python 3.12 to 3.14', detail: `Could not read a Python version from: ${versionText}. ${where}`, action: 'changePython' });
      } else {
        const major = parseInt(vm[1], 10);
        const minor = parseInt(vm[2], 10);
        if (major !== 3 || minor > 14) {
          steps.push({ icon: '⚠', title: `Python ${vm[1]}.${vm[2]} found. Ollada needs 3.12 to 3.14.`, detail: `On 3.15, pip quietly installs ollada 0.1.0, which doesn’t have sdar:1.7b. Python 3.12 is recommended. ${where}`, action: 'changePython' });
        } else if (minor < 12) {
          steps.push({ icon: '⚠', title: `Python ${vm[1]}.${vm[2]} found. Ollada needs 3.12 to 3.14.`, detail: `Python 3.12 is recommended. ${where}`, action: 'changePython' });
        } else {
          steps.push({ icon: '✓', title: `Python ${vm[1]}.${vm[2]}`, detail: where, action: 'changePython' });
        }
      }
      const recommend = py.hasOllada ? await getRecommend(py.path) : undefined;
      machineKind = recommend?.kind ?? machineKind;
      const installCmd = machineKind === 'gpu' ? 'pip install "ollada[gpu,server]"' : 'pip install "ollada[cpu,server]"';
      const olladaVersion = py.hasOllada ? await getOlladaVersion(py.path) : undefined;
      if (!py.hasOllada || !olladaVersion) {
        steps.push({
          icon: '⚠', title: 'ollada isn’t installed for this Python',
          detail: `Run this in a terminal with that Python’s venv active, or pick the Python that has ollada with Change Python. Ollada won’t run pip for you.`,
          command: installCmd,
        });
      } else if (compareVersions(olladaVersion, MIN_VERSION) < 0) {
        steps.push({
          icon: '⚠', title: `ollada ${olladaVersion} found. This extension needs 0.3.4 or newer.`,
          detail: 'If you’re on Python 3.15, that’s why: switch to 3.12 to 3.14 first. Otherwise, upgrade:',
          command: machineKind === 'gpu' ? 'pip install -U "ollada[gpu,server]"' : 'pip install -U "ollada[cpu,server]"',
        });
      } else {
        steps.push({ icon: '✓', title: `ollada ${olladaVersion}`, detail: `Installed for ${py.path}.` });
        const serverRes = await runCommand(py.path, ['-c', 'import fastapi, uvicorn']);
        if (serverRes.code !== 0 && !servePort) {
          steps.push({ icon: '⚠', title: 'ollada serve needs the server extra', detail: 'Run the command below in the same venv, then Check again.', command: installCmd });
        }
      }
      if (recommend) {
        const recIndex = recommendedIndex(recommend.rows, machineKind);
        const cache = olladaVersion ? await getDownloadedModels(py.path) : { cached: new Set<string>(), note: '' };
        cacheNote = cache.note;
        models = recommend.rows.map((row, i) => {
          const label = fitLabel(row, machineKind);
          const isDownloaded = cache.cached.has(row.model);
          return {
            model: row.model, label, detail: row.detail ?? '',
            button: showDownloadButton(label, isDownloaded),
            downloaded: isDownloaded, recommended: i === recIndex, selected: row.model === serveModel, dot: fitDotColor(label),
          };
        });
        steps.push({ icon: '•', title: 'Pick a model', detail: 'From ollada recommend, for this machine.' });
      }
    }
    let serveBanner = '';
    let serveButton = 'Start serve';
    let canStartServe = !!py?.hasOllada;
    if (servePort) {
      steps.push({ icon: '✓', title: 'ollada serve', detail: serveReused ? `Using existing serve on ${servePort}.` : `Serving on ${servePort}.` });
    } else {
      const picked = await pickPort(vscode.workspace.getConfiguration('ollada-code').get<number>('servePort', 0));
      const skippedText = picked.skipped.length > 0
        ? `Port ${picked.skipped.join(', ')} ${picked.skipped.length === 1 ? 'is' : 'are'} in use by another app (not an ollada serve), so Ollada will use ${picked.port}.`
        : `Ollada will use port ${picked.port}.`;
      steps.push({ icon: '•', title: 'Start ollada serve', detail: skippedText });
      serveBanner = `Serve isn’t running. ${skippedText}`;
      serveButton = `Start serve on ${picked.port}`;
      canStartServe = canStartServe && !serveChild;
    }
    const kindText = machineKind === 'cpu' ? 'CPU' : 'GPU';
    const cloudSelected = isMercuryModel(serveModel);
    const headerStatus = cloudSelected
      ? `${serveModel}, cloud (Inception)${mercuryConnected ? '' : ', not connected'}`
      : servePort
        ? `${serveModel} on ${kindText}, serve on ${servePort}${serveReused ? ' (existing)' : ''}`
        : 'Serve isn’t running';
    return {
      steps, models, cacheNote, serving: !!servePort, serveBanner, serveButton, canStartServe, headerStatus,
      mercury: { connected: mercuryConnected, selected: cloudSelected, model: MERCURY_MODELS[0] },
      cloudActive: cloudSelected && mercuryConnected,
    };
  }

  let refreshAgain = false;
  async function refreshSetup(): Promise<void> {
    // One refresh at a time; a request that arrives mid-refresh runs once
    // more afterwards, so the panel never keeps a stale Setup.
    if (refreshing) { refreshAgain = true; return refreshing; }
    refreshing = (async () => {
      try {
        do {
          refreshAgain = false;
          const setup = await buildSetup();
          post('setup', setup);
          statusBar.text = servePort ? `Ollada: serving on ${servePort}${serveReused ? ' (existing)' : ''}` : 'Ollada: not running';
        } while (refreshAgain);
      } finally {
        refreshing = undefined;
      }
    })();
    return refreshing;
  }

  async function startServe(): Promise<void> {
    await detectServe();
    if (servePort) {
      // Never start a second server when one already answers.
      void refreshSetup();
      return;
    }
    const py = await findPython();
    if (!py) {
      void vscode.window.showWarningMessage('Ollada: no Python interpreter found. Check Setup first.');
      return;
    }
    if (serveChild) { return; }
    const picked = await pickPort(vscode.workspace.getConfiguration('ollada-code').get<number>('servePort', 0));
    const args = ['-m', 'ollada.cli', 'serve', '--host', '127.0.0.1', '--port', String(picked.port)];
    output.appendLine(`Starting: ${py.path} ${args.join(' ')}`);
    output.show(true);
    serveChild = childProcess.spawn(py.path, args, { shell: false });
    serveChild.stdout?.on('data', (d) => output.append(String(d)));
    serveChild.stderr?.on('data', (d) => output.append(String(d)));
    serveChild.on('exit', (code) => {
      output.appendLine(`Ollada serve exited with code ${code}.`);
      serveChild = undefined;
      if (!serveReused) { servePort = undefined; }
      void refreshSetup();
    });
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (!serveChild) { return; }
      if (await probeOllada(picked.port)) {
        servePort = picked.port;
        serveReused = false;
        void refreshSetup();
        return;
      }
    }
    void vscode.window.showWarningMessage(
      `Ollada: could not reach serve on ${picked.port}. It may have stopped, or the server extra may be missing. ` +
      `Fallback command (copy it into a terminal with the venv active): ${py.path} -m ollada.cli serve --host 127.0.0.1 --port ${picked.port}`,
    );
  }

  // ---------- model calls ----------
  async function chatOnce(model: string, prompt: string, signal: AbortSignal): Promise<{ text: string; snapshots?: Snapshots }> {
    if (isMercuryModel(model)) {
      // Cloud path: Inception's Mercury API only (see mercury.ts). Same prompts, same proposal flow.
      const key = await context.secrets.get(MERCURY_SECRET);
      if (!key) { throw new Error('Mercury isn’t connected. Connect it in Setup, or pick a local model.'); }
      return { text: await mercuryChat(fetch as unknown as Parameters<typeof mercuryChat>[0], key, model, prompt, signal) };
    }
    if (!servePort) { throw new Error('Serve isn’t running. Start serve from Setup at the top of the panel.'); }
    const url = `http://127.0.0.1:${servePort}/api/chat`;
    const attempts: Array<Record<string, unknown> | undefined> = [
      // Proposal only (spec 6.7): ask a future serve to record snapshots.
      // If a serve rejects the option, retry without options.
      { record_snapshots: true },
      undefined,
    ];
    let lastError: unknown;
    for (const options of attempts) {
      const body: Record<string, unknown> = { model, messages: [{ role: 'user', content: prompt }] };
      if (options) { body.options = options; }
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
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
      const content = parsed && typeof parsed === 'object' ? (parsed as { message?: { content?: unknown } }).message?.content : undefined;
      if (typeof content !== 'string') { throw new Error('Serve returned a chat response without message content.'); }
      const snapshots = replayAvailable(parsed) ? (parsed as { snapshots: Snapshots }).snapshots : undefined;
      return { text: content, snapshots };
    }
    throw lastError instanceof Error ? lastError : new Error('Chat request failed.');
  }

  function codeBlock(text: string): string { return `\`\`\`\n${text}\n\`\`\``; }

  /** Ready to send with the selected model: Mercury needs a saved key, local models need serve. */
  function canSend(): boolean { return isMercuryModel(serveModel) ? mercuryConnected : !!servePort; }
  function cloudBlockedHint(): string | undefined {
    return isMercuryModel(serveModel) && !mercuryConnected ? 'Mercury isn’t connected. Connect it in Setup, or pick a local model.' : undefined;
  }
  /**
   * The cloud warning. Before code goes to Mercury, say plainly where it
   * goes and who bills it. "Always send" is remembered; "Send" asks again
   * next time; closing the dialog sends nothing.
   */
  async function confirmCloud(): Promise<boolean> {
    if (!isMercuryModel(serveModel)) { return true; }
    if (context.globalState.get<boolean>(MERCURY_CONSENT)) { return true; }
    const choice = await vscode.window.showWarningMessage(
      'Send this to Mercury?',
      {
        modal: true,
        detail: 'Mercury runs on Inception Labs’ servers, not on this machine. Your selected code, the file’s imports and your message will be sent to Inception, and usage is billed to your Inception account. Pick a local model to keep code on this machine.',
      },
      'Send to Mercury', 'Always send to Mercury',
    );
    if (choice === 'Always send to Mercury') { await context.globalState.update(MERCURY_CONSENT, true); return true; }
    return choice === 'Send to Mercury';
  }
  async function connectMercury(): Promise<void> {
    const key = await vscode.window.showInputBox({
      title: 'Connect Mercury (Inception Labs)',
      prompt: 'Paste your Inception API key. It’s stored in VS Code’s secret storage and only sent to api.inceptionlabs.ai.',
      password: true, ignoreFocusOut: true, placeHolder: 'Inception API key',
    });
    if (!key) { return; }
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Checking the key with Inception…' },
      () => checkKey(fetch as unknown as Parameters<typeof checkKey>[0], key),
    );
    if (!result.ok) { void vscode.window.showErrorMessage(`Mercury not connected: ${result.message}`); return; }
    await context.secrets.store(MERCURY_SECRET, key.trim());
    mercuryConnected = true;
    void vscode.window.showInformationMessage('Mercury is connected. Pick mercury-3 in the model menu to use it.');
    void refreshSetup();
  }
  async function disconnectMercury(): Promise<void> {
    await context.secrets.delete(MERCURY_SECRET);
    mercuryConnected = false;
    if (isMercuryModel(serveModel)) {
      serveModel = lastLocalModel;
      await vscode.workspace.getConfiguration('ollada-code').update('model', serveModel, vscode.ConfigurationTarget.Global);
    }
    void refreshSetup();
  }

  /** Explain / Fix / Insert, using the editor snapshot taken when the button was clicked. */
  async function runAction(action: ActionKind, ctx: CapturedContext | undefined): Promise<void> {
    await detectServe();
    const blocked = cloudBlockedHint();
    if (blocked) { post('hint', { text: blocked }); return; }
    const plan = planAction(action, ctx, canSend());
    if (!plan.ok || !ctx) {
      post('hint', { text: plan.ok ? 'No file selected.' : plan.hint });
      if (!servePort) { void refreshSetup(); }
      return;
    }
    let prompt: string;
    let title: string;
    let shown: string;
    if (action === 'fix') {
      // 0.1.6: header imports travel with Fix only, labelled as context
      // so the model does not re-add an import that is already there.
      const block = importsContextBlock(ctx.fileName, ctx.headerImports, ctx.headerImportsTruncated);
      prompt = block ? `${FIX_PROMPT}\n\n${block}\n\n${codeBlock(ctx.selectionText)}` : `${FIX_PROMPT}\n\n${codeBlock(ctx.selectionText)}`;
      title = 'Working on a fix';
      shown = 'Fix selection';
    } else if (action === 'explain') {
      // PROPOSED, UNTESTED prompt (see prompts.ts).
      prompt = `${EXPLAIN_PROMPT}\n\n${codeBlock(ctx.selectionText)}`;
      title = 'Working on an explanation';
      shown = 'Explain selection';
    } else if (ctx.hasSelection) {
      // Insert with code selected: the result replaces the selection.
      // PROPOSED, UNTESTED prompt (see prompts.ts).
      prompt = insertPrompt(`Rewrite this code from ${ctx.fileName} as a complete, working replacement:\n\n${codeBlock(ctx.selectionText)}`, ctx.fileName);
      title = 'Writing code to replace the selection';
      shown = 'Insert at cursor (replaces the selection)';
    } else {
      // Insert with no selection: write at the cursor. Phase 1 Insert
      // does not read the code after the cursor. PROPOSED, UNTESTED.
      const lines = ctx.fullText.split('\n');
      const lineText = lines[ctx.startLine - 1] ?? '';
      prompt = insertPrompt(`Insert code at line ${ctx.startLine} in ${ctx.fileName}, after: ${lineText}`, ctx.fileName);
      title = 'Writing code to insert';
      shown = 'Insert at cursor';
    }
    if (!(await confirmCloud())) { post('hint', { text: 'Not sent. Pick a local model to keep code on this machine.' }); return; }
    // 0.1.7: the turn keeps what was sent, so the log shows the code, not just a label.
    post('userMessage', { text: shown, title: shown, kind: action, contextLabel: ctx.label, code: action === 'insert' && !ctx.hasSelection ? '' : ctx.selectionText, cloud: isMercuryModel(serveModel) });
    // 0.1.6: Fix (one-shot and retry) shares one attempt path, so a
    // retry goes through the same token warning, waiting timer, model
    // call, and proposal gate as the original Fix.
    if (action === 'fix') { await runFixAttempt(ctx, prompt); return; }
    const model = serveModel;
    const estimatedTokens = Math.round(prompt.length / 4);
    if (model === 'sdar:1.7b' && estimatedTokens > 300) {
      const choice = await vscode.window.showWarningMessage(
        `This selection is long for sdar:1.7b on CPU (about ${estimatedTokens} tokens). It may be slow, and fixes longer than 128 tokens get cut off.`,
        'Send anyway', 'Cancel',
      );
      if (choice !== 'Send anyway') { post('hint', { text: 'Not sent.' }); return; }
    }
    abortController = new AbortController();
    const started = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - started) / 1000;
      const range = history.rangeFor(action, model);
      const rangeLine = range
        ? `On this machine, recent ${action}s with ${model} took ${range.min.toFixed(1)} to ${range.max.toFixed(1)} s. The time shown is wall clock, not progress inside the model.`
        : undefined;
      post('waiting', { title, elapsed: `${elapsed.toFixed(1)} s`, rangeLine });
    }, 500);
    try {
      const result = await chatOnce(model, prompt, abortController.signal);
      const seconds = (Date.now() - started) / 1000;
      history.record(action, model, seconds);
      saveHistory();
      clearInterval(timer);
      post('waitingDone', {});
      const clean = stripFences(result.text);
      if (action === 'explain') {
        post('message', { meta: `${ctx.label}, explanation, ${seconds.toFixed(1)} s`, body: clean, isCode: false });
        return;
      }
      // Fix returns earlier via runFixAttempt; only explain/insert reach here.
      await proposeEdit('insert', ctx, clean, seconds, result.snapshots);
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

  /** One Fix attempt: token warning, waiting timer, model call, proposal. Shared by one-shot Fix and by Retry fix. */
  async function runFixAttempt(ctx: CapturedContext, prompt: string): Promise<void> {
    const model = serveModel;
    const estimatedTokens = Math.round(prompt.length / 4);
    if (model === 'sdar:1.7b' && estimatedTokens > 300) {
      const choice = await vscode.window.showWarningMessage(
        `This selection is long for sdar:1.7b on CPU (about ${estimatedTokens} tokens). It may be slow, and fixes longer than 128 tokens get cut off.`,
        'Send anyway', 'Cancel',
      );
      if (choice !== 'Send anyway') { post('hint', { text: 'Not sent.' }); return; }
    }
    abortController = new AbortController();
    const started = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - started) / 1000;
      const range = history.rangeFor('fix', model);
      const rangeLine = range
        ? `On this machine, recent fixes with ${model} took ${range.min.toFixed(1)} to ${range.max.toFixed(1)} s. The time shown is wall clock, not progress inside the model.`
        : undefined;
      post('waiting', { title: 'Working on a fix', elapsed: `${elapsed.toFixed(1)} s`, rangeLine });
    }, 500);
    try {
      const result = await chatOnce(model, prompt, abortController.signal);
      const seconds = (Date.now() - started) / 1000;
      history.record('fix', model, seconds);
      saveHistory();
      clearInterval(timer);
      post('waitingDone', {});
      await proposeEdit('fix', ctx, stripFences(result.text), seconds, result.snapshots);
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

  /**
   * 0.1.6: Fix-with-user-instruction, offered only after a Fix proposal
   * is Discarded. User-click-bounded, never automatic, never a loop:
   * one instruction, one new proposal through the normal path. The
   * retry reuses the original Fix snapshot, so if the file changed
   * since then it refuses and asks for a fresh selection instead of
   * splicing stale text.
   */
  async function runFixWithInstruction(instruction: string): Promise<void> {
    const ctx = lastFixContext;
    if (!ctx || !ctx.hasSelection) {
      post('hint', { text: 'No discarded Fix to retry. Select the code and Fix again.' });
      return;
    }
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === ctx.uri);
    if (doc && doc.version !== ctx.version) {
      post('hint', { text: 'The file changed since that Fix, so nothing was sent. Re-select the code and Fix again.' });
      return;
    }
    await detectServe();
    const blockedFix = cloudBlockedHint();
    if (blockedFix) { post('hint', { text: blockedFix }); return; }
    const plan = planAction('fix', ctx, canSend());
    if (!plan.ok) { post('hint', { text: plan.hint }); return; }
    if (!(await confirmCloud())) { post('hint', { text: 'Not sent. Pick a local model to keep code on this machine.' }); return; }
    post('userMessage', { text: `Retry fix: ${instruction}`, title: `Retry fix: ${instruction}`, kind: 'fix', contextLabel: ctx.label, code: ctx.selectionText, cloud: isMercuryModel(serveModel) });
    const prompt = fixRetryPrompt(instruction, ctx.selectionText, ctx.fileName, ctx.headerImports, ctx.headerImportsTruncated);
    await runFixAttempt(ctx, prompt);
  }

  async function proposeEdit(kind: 'fix' | 'insert', ctx: CapturedContext, code: string, seconds: number, snapshots: Snapshots | undefined): Promise<void> {
    if (kind === 'fix') { lastFixContext = ctx; }
    const edit = planEdit(kind, ctx.fullText, ctx.selStart, ctx.selEnd, ctx.active, code);
    const diff = simpleDiff(ctx.fullText, edit.spliced);
    const changed = countChangedLines(diff);
    const replacing = kind === 'fix' || ctx.hasSelection;
    const acceptLabel = replacing && kind === 'fix' ? 'Accept' : 'Insert';
    const rejectLabel = kind === 'fix' ? 'Reject' : 'Discard';
    const meta = replacing
      ? `${changed} line${changed === 1 ? '' : 's'} changed in ${ctx.label}`
      : `${countChangedLines(simpleDiff('', code))} lines to insert at line ${ctx.startLine} of ${ctx.fileName}`;
    let checks: Array<{ name: string; pass: boolean; message?: string }> | undefined;
    let warnings: string[] = [];
    let warning = 'No checks for this language yet. Review the change before accepting.';
    let blocked = false;
    // 0.1.6: an import-only Fix proposal is blocked, even though the
    // old verifier passes it. A proposal that merely adds imports
    // inside the selection (without being import-only) warns and
    // demotes Accept to secondary instead.
    let importOnly = false;
    let addsImports = false;
    if (kind === 'fix') {
      importOnly = isImportOnlyReplacement(ctx.selectionText, code);
      if (!importOnly) {
        const selHasImport = ctx.selectionText.split('\n').some((l) => /^import\s/.test(l.trim()) || /^from\s+\S+\s+import\s/.test(l.trim()));
        const repHasImport = code.split('\n').some((l) => /^import\s/.test(l.trim()) || /^from\s+\S+\s+import\s/.test(l.trim()));
        addsImports = !selHasImport && repHasImport;
      }
    }
    if (ctx.languageId === 'python' || ctx.path.endsWith('.py')) {
      const py = await findPython();
      if (py) {
        try {
          const result = await runChecks(py.path, checksScriptPath(), edit.spliced);
          const names: Record<string, string> = { syntax: 'Syntax', undefined: 'Undefined names', dead: 'Dead code' };
          checks = ['syntax', 'undefined', 'dead'].map((k) => {
            const f = result.findings.find((x) => x.kind === k);
            return { name: names[k], pass: !f, message: f?.message };
          });
          warnings = result.warnings.map((w) => w.message);
          const gate = gateProposal(result.findings, acceptLabel);
          blocked = gate.blocked;
          const failed = checks.find((c) => !c.pass);
          warning = gate.blocked ? (gate.reason ?? '') : failed ? `Checks found a problem: ${failed.name}. Review before accepting.` : CHECKS_PASSED_WARNING;
        } catch (err) {
          warning = `Checks could not run: ${err instanceof Error ? err.message : String(err)}. Review the change before accepting.`;
        }
      } else {
        warning = 'No Python interpreter found, so checks could not run. Review the change before accepting.';
      }
    }
    if (!blocked && importOnly) {
      blocked = true;
      warning = 'This proposal only adds imports and does not change the selected code, so Accept is turned off. Discard it and try again, or use the retry below to tell the model what to change.';
    } else if (!blocked && addsImports) {
      warnings.push('This proposal adds imports inside the selection — check where they land');
    }
    const { proposal, replacedId } = proposals.create({
      kind, uri: ctx.uri, version: ctx.version, start: edit.start, end: edit.end,
      replacement: edit.replacement, originalText: ctx.fullText, spliced: edit.spliced, blocked,
    });
    if (replacedId) {
      snapshotsById.delete(replacedId);
      post('dismiss', { id: replacedId, note: 'Earlier proposal dismissed; a newer one replaced it. The file was not changed.' });
    }
    if (snapshots) { snapshotsById.set(proposal.id, snapshots); }
    post('result', {
      result: {
        id: proposal.id, meta, time: `${seconds.toFixed(1)} s`, contextLabel: `Sent: ${ctx.label}`,
        diff: diff.map((d) => ({ kind: d.kind, text: d.text })), checks, warnings, warning, blocked,
        acceptLabel, rejectLabel, acceptPrimary: !blocked && !addsImports && !(checks ?? []).some((c) => !c.pass),
        replayAvailable: !!snapshots,
      },
    });
  }

  async function acceptProposal(id: string): Promise<void> {
    const p: Proposal | undefined = proposals.get(id);
    if (!p) { post('dismiss', { id, note: 'That proposal is no longer pending. The file was not changed.' }); return; }
    if (p.blocked) { post('hint', { text: 'This proposal is blocked, so it can’t be applied. Discard it.' }); return; }
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === p.uri);
    if (!doc || doc.isClosed) {
      proposals.discard(id);
      post('dismiss', { id, note: 'The file was closed, so nothing was applied. Run it again.' });
      return;
    }
    if (doc.version !== p.version) {
      proposals.discard(id);
      post('dismiss', { id, note: 'The file changed while Ollada was working, so nothing was applied. Run it again.' });
      return;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, new vscode.Range(doc.positionAt(p.start), doc.positionAt(p.end)), p.replacement);
    const applied = await vscode.workspace.applyEdit(edit);
    proposals.discard(id);
    snapshotsById.delete(id);
    post('dismiss', { id, note: applied ? 'Applied. Undo with Ctrl+Z in the editor.' : 'VS Code didn’t apply the edit. The file was not changed.' });
  }

  function rejectProposal(id: string): void {
    // The proposal was never written to the file, so the file is untouched.
    // 0.1.6: discarding a Fix offers one retry row against that same
    // snapshot; discarding an Insert does not.
    const p = proposals.get(id);
    const offerRetryFix = p?.kind === 'fix' && !!lastFixContext;
    const retryContextLabel = offerRetryFix ? lastFixContext?.label : undefined;
    proposals.discard(id);
    snapshotsById.delete(id);
    post('dismiss', { id, note: 'Discarded. The file was not changed.', offerRetryFix, retryContextLabel });
  }

  async function freeChat(text: string): Promise<void> {
    const ctx = captureContext(editorState());
    await detectServe();
    const blockedChat = cloudBlockedHint();
    if (blockedChat) { post('hint', { text: blockedChat }); return; }
    const plan = planAction('chat', ctx, canSend());
    if (plan.ok && !(await confirmCloud())) { post('hint', { text: 'Not sent. Pick a local model to keep code on this machine.' }); return; }
    const firstLine = text.trim().split(/\r?\n/)[0];
    post('userMessage', { text, title: firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine, kind: 'chat', contextLabel: ctx ? ctx.label : '', code: ctx?.hasSelection ? ctx.selectionText : '', cloud: isMercuryModel(serveModel) });
    if (!plan.ok) { post('hint', { text: plan.hint }); return; }
    // Chat includes the selected code when there is a selection, so the
    // model has the context the chip shows.
    const prompt = ctx?.hasSelection ? `${text}\n\nCode from ${ctx.fileName}, lines ${ctx.startLine} to ${ctx.endLine}:\n${codeBlock(ctx.selectionText)}` : text;
    const controller = new AbortController();
    abortController = controller;
    const started = Date.now();
    const timer = setInterval(() => post('waiting', { title: 'Working on an answer', elapsed: `${((Date.now() - started) / 1000).toFixed(1)} s` }), 500);
    try {
      const result = await chatOnce(serveModel, prompt, controller.signal);
      clearInterval(timer);
      post('waitingDone', {});
      post('message', { meta: `${serveModel}, ${((Date.now() - started) / 1000).toFixed(1)} s`, body: stripFences(result.text), isCode: false });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') { post('hint', { text: 'Cancelled.' }); }
      else { post('hint', { text: `Ollada error: ${err instanceof Error ? err.message : String(err)}` }); }
    } finally {
      clearInterval(timer);
      post('waitingDone', {});
    }
  }

  // ---------- view ----------
  function postSettings(): void {
    const cfg = vscode.workspace.getConfiguration('ollada-code');
    post('settings', { appearance: cfg.get<string>('appearance', 'brand'), animation: cfg.get<boolean>('animation', true) });
  }
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('ollada-code.appearance') || e.affectsConfiguration('ollada-code.animation')) { postSettings(); }
  }));

  async function handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'ready': {
        postSettings();
        postContext();
        void refreshSetup();
        // A view that was re-created only re-shows a proposal that is still pending.
        const p = proposals.pending();
        if (p) {
          proposals.discard(p.id);
          snapshotsById.delete(p.id);
          post('hint', { text: 'An earlier proposal was dismissed when the panel reloaded. The file was not changed.' });
        }
        break;
      }
      case 'checkAgain': pythonCache = undefined; void refreshSetup(); break;
      case 'selectModel': {
        // Card click in Setup: persist as a user setting so it survives
        // reloads, then refresh so header + Selected badge update.
        // Download clicks do NOT come through here and do not change it.
        const model = String(message.model ?? '');
        if (isMercuryModel(model) && !mercuryConnected) { void connectMercury(); break; }
        if (model && !isMercuryModel(model)) { lastLocalModel = model; }
        if (model) {
          await vscode.workspace.getConfiguration('ollada-code').update('model', model, vscode.ConfigurationTarget.Global);
          serveModel = model;
          void refreshSetup();
        }
        break;
      }
      case 'changePython': void changePython(); break;
      case 'connectMercury': void connectMercury(); break;
      case 'disconnectMercury': void disconnectMercury(); break;
      case 'startServe': void startServe(); break;
      case 'copy':
        if (typeof message.text === 'string') { void vscode.env.clipboard.writeText(message.text); }
        break;
      case 'download': {
        const model = String(message.model ?? '');
        const py = await findPython();
        if (!py) { post('hint', { text: 'No Python interpreter found.' }); break; }
        const terminal = vscode.window.createTerminal('Ollada: pull');
        terminal.show();
        // Quote a path with spaces; PowerShell needs & to run a quoted path.
        const exe = /\s/.test(py.path) ? (process.platform === 'win32' ? `& "${py.path}"` : `"${py.path}"`) : py.path;
        terminal.sendText(`${exe} -m ollada.cli pull ${model}`);
        break;
      }
      case 'action': {
        // Snapshot the editor now, at click time, before anything else runs.
        const ctx = captureContext(editorState());
        void runAction(message.action as ActionKind, ctx);
        break;
      }
      case 'chat': void freeChat(String(message.text ?? '')); break;
      case 'cancel': abortController?.abort(); break;
      case 'clear': {
        // Clear chat: stop the request on screen and drop any pending
        // proposal, so a card that is no longer visible can never be accepted.
        abortController?.abort();
        const p = proposals.pending();
        if (p) { proposals.discard(p.id); snapshotsById.delete(p.id); }
        break;
      }
      case 'accept': void acceptProposal(String(message.id ?? '')); break;
      case 'reject': rejectProposal(String(message.id ?? '')); break;
      case 'retryFix': {
        const instruction = String(message.text ?? '').trim();
        if (!instruction) { post('hint', { text: 'Type an instruction for the retry fix first.' }); break; }
        void runFixWithInstruction(instruction);
        break;
      }
      case 'watch': {
        const snaps = snapshotsById.get(String(message.id ?? ''));
        if (!snaps) { break; }
        post('replay', {
          frames: snaps.frames,
          totalSteps: totalSteps(snaps),
          sub: `How this answer formed, replayed from the steps ollada serve recorded. ${serveModel} writes in blocks of ${snaps.block_length} tokens, ${snaps.steps} steps per block.`,
        });
        break;
      }
      default: break;
    }
  }

  async function revealView(): Promise<void> {
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
  }

  /** Command palette / keybinding path: snapshot the editor first, then show the view. */
  function commandAction(action: ActionKind): void {
    const ctx = captureContext(editorState());
    void (async () => {
      await revealView();
      // Give a freshly created view a moment to load before posting to it.
      for (let i = 0; i < 20 && !view; i++) { await new Promise((r) => setTimeout(r, 100)); }
      await runAction(action, ctx);
    })();
  }

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, {
      resolveWebviewView(webviewView) {
        view = webviewView;
        const media = vscode.Uri.joinPath(context.extensionUri, 'media');
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [media] };
        // Geist and Geist Mono ship with the extension (SIL OFL 1.1, media/fonts/GEIST-LICENSE.txt); no network.
        webviewView.webview.html = getWebviewHtml({
          sans: webviewView.webview.asWebviewUri(vscode.Uri.joinPath(media, 'fonts', 'Geist-Variable.woff2')).toString(),
          mono: webviewView.webview.asWebviewUri(vscode.Uri.joinPath(media, 'fonts', 'GeistMono-Variable.woff2')).toString(),
        });
        webviewView.webview.onDidReceiveMessage((m: { type: string; [key: string]: unknown }) => { void handleMessage(m); });
        webviewView.onDidDispose(() => { if (view === webviewView) { view = undefined; } });
      },
    }, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('ollada-code.openPanel', () => void revealView()),
    vscode.commands.registerCommand('ollada-code.explainSelection', () => commandAction('explain')),
    vscode.commands.registerCommand('ollada-code.fixSelection', () => commandAction('fix')),
    vscode.commands.registerCommand('ollada-code.insertAtCursor', () => commandAction('insert')),
    vscode.commands.registerCommand('ollada-code.startServe', () => void startServe()),
    vscode.commands.registerCommand('ollada-code.checkAgain', () => { pythonCache = undefined; void refreshSetup(); }),
    vscode.commands.registerCommand('ollada-code.changePython', () => void changePython()),
    vscode.commands.registerCommand('ollada-code.connectMercury', () => void connectMercury()),
    vscode.commands.registerCommand('ollada-code.disconnectMercury', () => void disconnectMercury()),
  );
}

export function deactivate(): void {
  // A serve the extension started is its child process; VS Code ends it
  // with the extension host. A serve the user started is never touched.
}
