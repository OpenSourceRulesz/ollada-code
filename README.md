# ollada-code — VS Code extension, Phase 1

**ollada-code** is the VS Code extension for ollada, the shelf for
open-source diffusion language models. It is distinct from **ollada**
(the CLI and daemon, `pip install ollada`, version 0.3.4) and from the
parked **SDAR code LoRA** idea (scaling SDAR 1.7B LoRA fine-tuning into
a larger coding model, parked 2026-11-01). Never call this extension
just "ollada", and never call that parked model "ollada-code".

Version: 0.1.2, independent of ollada 0.3.4. Publisher: OpenSourceRulesz.
0.1.0, 0.1.1, and 0.1.2 are published on the VS Code Marketplace as OpenSourceRulesz.ollada-code.
Install from VS Code Extensions search, not by transferring a .vsix file.
GitHub repo: github.com/OpenSourceRulesz/ollada-code.

## Phase 1 only

- Guided Setup (Python, ollada, model picker, serve), nothing downloads
  or starts until you click. pip is never run by the extension.
- Chat panel that knows the active file and selection automatically.
- Three commands only: Explain selection, Fix selection, Insert at cursor.
- Diff preview with Accept/Reject. Accept is never automatic, one
  WorkspaceEdit, one undo step, and Accept is disabled if the file
  changed while ollada was working.
- Local Python checks before accepting, run on the spliced file.
- Watch-after diffusion replay for SDAR, real snapshots only.

Out of Phase 1, deliberately: autocomplete, terminal commands run by
the model, multi-file edits, agent loops, streaming, live animation,
saved threads, persistent memory, remote/hosted serve, telemetry,
bundled models.

## Hard rules the code enforces

- All model calls are `POST /api/chat` on `127.0.0.1:<port>` only.
  Never `localhost` (the managed-PC proxy can affect localhost tools),
  never `/v1/completions` (not in stock ollada 0.3.4; the 2026-11-02
  patch is not merged and not on PyPI).
- Minimum serve version 0.3.4 for Setup, Chat, Explain, Fix, Insert.
  Replay needs a future serve version that returns snapshots; until
  then the Watch diffusion button is disabled with
  "Replay not available for this model" for every response, whatever
  the family, including every stock 0.3.4 response. Frames are never
  synthesized. The counter, when snapshots exist, is steps elapsed /
  total steps, never tokens.
- Fix prompt, verbatim from the Dell script tests: "Fix this code.
  Output ONLY the fixed code, no explanation, no markdown fences.
  Preserve the function name and signature, and do not change
  unrelated logic." Fences are stripped from replies anyway.
- Explain and Insert prompts are **proposed and untested**, unlike Fix
  which is proven. They are labelled as such in `src/prompts.ts`.
  Do not present Explain or Insert results as measured.
- Port rule: try 11435, then 11436, 11437, and so on, say which port
  in the UI, never kill the process holding a port. On the work laptop,
  Code.exe itself holds 11435 and 11436 LISTENING, so 11437 is the
  expected serve port there.
- Install, everywhere: CPU `pip install "ollada[cpu,server]"`, GPU
  `pip install "ollada[gpu,server]"`. `[cpu]` alone can `run` but not
  `serve`. If serve fails because FastAPI/uvicorn are missing, Setup
  shows a "Server extra missing" screen with that command and a
  Check again button. Upgrade pill: `pip install -U "ollada[cpu,server]"`
  (gpu variant on a GPU machine).
- Model picker: rows come from `ollada recommend` in recommend order,
  one row per model, fit logic is not reimplemented. Fit labels, spec
  5.3: GPU fits/tight/won't fit map to Fits/Tight/Won't fit; CPU
  sdar:1.7b is Runs on CPU, sdar:4b and nemotron:3b are Runs, slowly,
  dream:7b and diffcoder:8b are Needs a GPU. Dream and diffcoder are
  always separate rows (desktop GPU peaks 9.13 GB vs 13.65 GB).
  Recommended is the first green row in recommend order. Red rows have
  no Download button.
- Nemotron detail line drops the ratio: "7.66 GB weights. Runs, slowly
  on CPU here." The spec's 3x / 9x ratios are CLI cold-load times
  (fib 19.0s vs 6.3s, capital 17.9s vs 1.9s), not warm-serve speeds,
  and there is no warm-serve Dell comparison for nemotron yet. The
  Runs, slowly label stands: fib 3.0x is over the 2x bar in spec 5.3.
- Checks before accepting, Python files only, run on the spliced file:
  syntax, undefined names, dead code after return/raise/break/continue
  in the same block, plus broad `except` as a warning icon, never a
  failure. Broad except is new work: the original verifier does not
  have it. The prefix/suffix byte-identity drift check is NOT ported:
  it is specific to the `<<HOLE>>` case and Fix/Insert have no hole.
- **Checks passed is never proof of correctness.** The warning box
  always says so when checks pass. The script-test find_max case
  passes checks and still raises TypeError at runtime
  (`max_val=None`, then `if x > max_val`). Run the function on 2 or
  3 inputs before relying on a fix.
- Waiting: never pre-seed the 2.8–13.2s range. A bar/range shows only
  after at least 3 local runs of the same action with the same model,
  computed from those runs, stored in `globalState`. The 2.8–13.2s
  range is sample content from the Dell script run (2.799s–13.192s).
  No fake progress, no fake animation, no tok/s. `eval_count` for
  SDAR is canvas size, not answer tokens, so tok/s is never computed
  from it. Times are wall clock, warm, on this machine.
- Insert, Phase 1: writes at the cursor, does not read the code after
  the cursor. API-level fill-in-the-middle is Phase 2 only, and must
  never be called "true FIM" without that qualifier. Insert still
  shows wall-clock time in the meta row in a real build, even though
  the mockup example is illustrative and unmeasured.
- Theme and identity: VS Code theme variables for backgrounds, text,
  borders, inputs, and diff colors. Ollada navy is never forced into
  the editor. Six-dot Settling mark only (six #6C6FD8 circles). The
  pig is retired history, not used. Accent #6C6FD8 is logo, icons,
  active markers, slider, and large graphics only, never small text
  or links on light themes. Primary buttons and text accents are
  #5558C9 (new for the extension, not in the site CSS), hover
  #6265D6. The packaged icon is a 128x128 PNG generated from the
  six-dot coordinates, not an SVG (vsce rejects user SVGs).
- Machines are identified by specifications only, never make/model,
  in any UI string or public copy.

## Build choices (deferred to the builder, 2026-11-02)

- TypeScript, `@types/vscode`, esbuild for the production bundle
  (`node esbuild.js`, `--production` for the packaged build), and
  `@vscode/vsce` for packaging. `vscode:prepublish` runs `tsc` then
  the esbuild production bundle, so a clean checkout packages correctly.
- Extension host, webview, and Python checks are cleanly separated:
  `src/extension.ts` (host, Setup, serve, chat, apply), `src/webview.ts`
  (panel HTML/CSS/JS), `src/fitLabels.ts`, `src/ports.ts`,
  `src/waiting.ts`, `src/prompts.ts`, `src/replay.ts`,
  `src/splice.ts`, `src/checks.ts` (spawns the Python checker),
  `python/checks.py` (stdlib only).
- Checks run with the venv Python, exactly like the existing
  fix_file.py workflow, instead of reimplementing Python AST checks
  in TypeScript (which would risk diverging from the proven verifier).
- Serve starts as a child process of the extension, with an Ollada
  Serve output channel. If that start fails, the extension shows the
  exact external PowerShell command as a copyable fallback, for
  example: `<venv python> -m ollada.cli serve --host 127.0.0.1 --port 11437`.
  Download (pull) runs in a VS Code terminal named `Ollada: pull`,
  as in the spec.
- UI font is the VS Code font (`var(--vscode-font-family)`); code uses
  the editor font. Bundled Geist is deferred
  (spec 10c: the Geist license for bundling is unchecked); 0.1.0,
  0.1.1, and 0.1.2 use the VS Code font.
- Replay snapshots: the extension sends `options.record_snapshots: true`
  on the first chat attempt, as proposed in spec 6.7, and retries once
  without options if serve rejects it. This is a proposal, not a
  shipped serve feature. Stock 0.3.4 returns no snapshots, so Replay
  stays disabled there, which is the correct behaviour.
- The side view (activity bar, Ollada) delegates to the full panel:
  resolving the side view opens the Beside panel, which carries the
  complete message handler. This avoids two live webviews with
  divergent state in Phase 1.

## Layout

- `package.json` — publisher OpenSourceRulesz, name ollada-code, 0.1.2.
- `src/` — TypeScript source (see above).
- `python/checks.py` — bundled checker, stdlib only.
- `resources/icon.png` — 128x128 PNG six-dot icon, generated by
  `scripts/make_icon.py` from the logo.svg coordinates.
- `test/` — node:test unit tests for fit labels, port picking,
  waiting, replay, and splice.
- `test-fixtures/` — checks fixtures and recreated fix fixtures.
  The fix fixtures are recreations from the briefing descriptions,
  not the original script-test files (see
  `test-fixtures/fix/README.md`).
- `ollada-code-0.1.2.vsix` — packaged build, if packaging succeeded.

## Develop

```sh
npm install
npm run compile
npm test
npm run bundle
npx @vscode/vsce package
```

Installs use `TMPDIR=~/workspace` in the sandbox (the default /tmp is
a 512 MB tmpfs and dies on large installs).

## Dogfood on the Dell

See `BUILD_REPORT.md` for the exact steps. In short: install from
the Marketplace (Extensions view, search ollada-code, publisher
OpenSourceRulesz), run Setup with
ollada 0.3.4 `cpu,server` in the venv, start serve, download sdar:1.7b,
then Fix the 9 script-test files through the UI and report times,
correctness, checks, and the always-shown warning. Expect Replay to be
disabled on stock 0.3.4 — that is correct, not a bug.
