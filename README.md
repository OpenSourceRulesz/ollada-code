# ollada-code — VS Code extension, Phase 1

**ollada-code** is the VS Code extension for ollada, the shelf for
open-source diffusion language models. It is distinct from **ollada**
(the CLI and daemon, `pip install ollada`, version 0.3.4) and from the
parked **SDAR code LoRA** idea (scaling SDAR 1.7B LoRA fine-tuning into
a larger coding model, parked 2026-11-01). Never call this extension
just "ollada", and never call that parked model "ollada-code".

Version: 0.1.8 in this source, independent of ollada 0.3.4. Publisher: OpenSourceRulesz.
0.1.8 adds one optional cloud model, Mercury from Inception Labs, on top of the 0.1.7 redesign. Nothing else changed. Not published.
0.1.7 is a UI redesign and is not published: the website look (Geist, navy, periwinkle) with a theme option, Chat and Setup tabs, collapsible turns that keep what was sent and the diff, clear and collapse, a growing composer, and a masked-block animation while the model works and when the answer arrives.
0.1.0 through 0.1.5 are published on the VS Code Marketplace as OpenSourceRulesz.ollada-code. 0.1.6 is not yet published: Fix sends Python file-header imports as labelled context (chip shows “+ imports”), Fix-with-user-instruction as a one-time retry after Discard, and a hard block on import-only Fix proposals.
Install from VS Code Extensions search, not by transferring a .vsix file.
GitHub repo: github.com/OpenSourceRulesz/ollada-code.

## Phase 1 only

- Guided Setup (Python, ollada, model picker, serve), nothing downloads
  or starts until you click. pip is never run by the extension.
- Chat in the Ollada sidebar view, visible immediately, with Setup as a
  second tab and a model switcher in the header. When serve isn't
  reachable, a banner on Chat offers Start serve and Open Setup.
- Every action is one collapsible turn: what was sent (the code), the
  answer or the proposal (diff, checks), and the outcome (Applied,
  Discarded, Replaced, ...). The diff stays after Accept or Discard.
  Starting a new turn collapses finished ones; Collapse all and Clear
  sit in the header. Clear also drops any pending proposal.
- Animation (setting `ollada-code.animation`, default on, always off
  for reduced motion): masked blocks while the model works, then the
  real answer resolves in over about a second; click to skip, Replay
  to watch it again. It is an illustration, not a recording of how
  the model generated the answer (the answer arrives whole from serve
  0.3.4), and the panel's info note says so. The text left on screen
  is always exactly the model's answer.
- Chat knows the active file and selection. The file and selection are
  captured when you click, for files inside or outside the workspace,
  and a context chip always shows the file and lines that will be sent.
  With no file or no selection, Explain and Fix are turned off instead
  of sending an empty prompt.
- Three commands only: Explain selection, Fix selection, Insert at cursor.
- Diff preview with Accept/Reject. Accept is never automatic, one
  WorkspaceEdit, one undo step, and Accept is disabled if the file
  changed while ollada was working.
- Local Python checks before accepting, run on the spliced file.
- Watch-after diffusion replay for SDAR, real snapshots only. With no
  snapshots there is no Replay button at all.

## Mercury, the optional cloud model (0.1.8)

- Local ollada models stay the default. Mercury (`mercury-3`, Inception
  Labs) is the only cloud model, and it's off until you connect it.
- Only Inception's Mercury API, enforced three ways: the endpoint is fixed
  to `https://api.inceptionlabs.ai/v1` (no URL field; any other host or a
  non-https URL is refused in code), only `mercury-3` can be sent, and a key
  is saved only after Inception's own API accepts it and lists a Mercury
  model.
- Connect from Setup (Cloud model) or the command "Ollada: Connect Mercury".
  The key is typed into a VS Code password box, never into the panel, is
  kept in VS Code's secret storage (not settings), and never appears in
  error messages. "Ollada: Disconnect Mercury" deletes it and switches back
  to the last local model.
- Warnings: Setup always says that code sent to Mercury leaves the machine
  and is billed to the Inception account. Before the first send, a modal
  asks again (Send to Mercury / Always send to Mercury / cancel). The model
  menu groups models into "On this machine" and "Cloud (Inception)", the
  header dot turns periwinkle, and every cloud turn carries a "cloud" tag.
- Requests use Inception's OpenAI-compatible chat completions. Fix, Explain,
  Replace, Retry fix and chat use the same prompts as local models; Python
  checks still run locally; the syntax gate and Accept/Reject are the same.

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
  then there is no Watch diffusion button on any card, whatever the
  family, including every stock 0.3.4 response. Setup has one line
  saying replay needs a future ollada serve. Frames are never
  synthesized. The counter, when snapshots exist, is steps elapsed /
  total steps, never tokens.
- Fix prompt, verbatim from the Dell script tests: "Fix this code.
  Output ONLY the fixed code, no explanation, no markdown fences.
  Preserve the function name and signature, and do not change
  unrelated logic." Fences are stripped from replies anyway.
- Explain and Insert prompts are **proposed and untested**, unlike Fix
  which is proven. They are labelled as such in `src/prompts.ts`.
  Do not present Explain or Insert results as measured.
- Port rule: first reuse an ollada serve that already answers on
  11435 to 11444 (identified by `/api/version` plus ollada's `/health`
  shape, so an Ollama on a nearby port is not mistaken for it), and show
  "Using existing serve on 11437". Only if none answers, try 11435,
  then 11436, 11437, and so on, say which port in the UI, never kill
  the process holding a port. On the work laptop,
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
- A syntax error in the proposed file turns Accept / Insert off;
  Discard is the only action. Other findings warn but don't block.
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
- Insert, Phase 1: with code selected, the result replaces the
  selection (it never inserts a second copy above it). With nothing
  selected, it writes at the cursor. It does not read the code after
  the cursor. API-level fill-in-the-middle is Phase 2 only, and must
  never be called "true FIM" without that qualifier. Insert still
  shows wall-clock time in the meta row in a real build, even though
  the mockup example is illustrative and unmeasured.
- Theme and identity: the panel uses the Ollada website look by
  default (setting `ollada-code.appearance` = `brand`): navy surfaces,
  periwinkle accent, Geist and Geist Mono. `theme` switches surfaces,
  text, diff colours and fonts to the user's VS Code theme. The editor
  itself is never restyled. Six-dot Settling mark only (six #6C6FD8 circles). The
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
  `src/context.ts` (click-time editor snapshot, context chip),
  `src/proposals.ts` (one id per proposal, syntax gate),
  `src/python.ts` (which Python to check), `src/cacheScript.ts`
  (Downloaded check), `src/screen.ts`, and
  `python/checks.py` (stdlib only).
- Which Python: the `ollada-code.pythonPath` setting if set; otherwise
  the first of the Python extension's environment, the workspace
  `.venv`, a `.venv` one folder down (for example `ollada-cpu/.venv`
  when the workspace is the parent folder), and python on PATH that can
  import ollada. Setup shows the exact path it checked, and Change
  Python picks another one.
- Downloaded check: the same test ollada's `rm` command uses
  (`scan_cache_dir()` repos against each recipe's source), run from a
  temp script file. Setup shows the cache folder it scanned and, if the
  scan fails, the error. On failure it shows Download, never Downloaded.
- Checks run with the venv Python, exactly like the existing
  fix_file.py workflow, instead of reimplementing Python AST checks
  in TypeScript (which would risk diverging from the proven verifier).
- Serve starts as a child process of the extension, with an Ollada
  output channel, but only when no ollada serve already answers. If that start fails, the extension shows the
  exact external PowerShell command as a copyable fallback, for
  example: `<venv python> -m ollada.cli serve --host 127.0.0.1 --port 11437`.
  Download (pull) runs in a VS Code terminal named `Ollada: pull`,
  as in the spec.
- Fonts: Geist and Geist Mono variable woff2 files ship in
  `media/fonts/`, loaded locally (no network). They are licensed under
  the SIL Open Font License 1.1; the license ships beside them as
  `media/fonts/GEIST-LICENSE.txt`. The `theme` appearance uses the VS
  Code fonts instead.
- Replay snapshots: the extension sends `options.record_snapshots: true`
  on the first chat attempt, as proposed in spec 6.7, and retries once
  without options if serve rejects it. This is a proposal, not a
  shipped serve feature. Stock 0.3.4 returns no snapshots, so Replay
  stays disabled there, which is the correct behaviour.
- Chat lives in the side view (activity bar, Ollada), the only webview.
  0.1.3 opened a Beside editor panel, which took focus away from the
  editor, so the extension saw no active file. Commands from the
  palette snapshot the editor first, then reveal the view.

## Layout

- `package.json` — publisher OpenSourceRulesz, name ollada-code, 0.1.7.
- `media/fonts/` — Geist and Geist Mono woff2 plus their OFL license.
- `src/` — TypeScript source (see above).
- `python/checks.py` — bundled checker, stdlib only.
- `resources/icon.png` — 128x128 PNG six-dot icon, generated by
  `scripts/make_icon.py` from the logo.svg coordinates.
- `test/` — node:test tests for fit labels, port picking and serve
  reuse, waiting, replay, splice, context capture, proposals and the
  syntax gate (with the real `checks.py`), Python discovery, the panel
  layout, and the Downloaded check (with the real `scan_cache_dir`;
  set `OLLADA_TEST_PYTHON` to a Python with ollada installed). Panel
  behaviour tests load the real webview in jsdom (a dev-only
  dependency) and drive it with the extension's messages: tabs, turns,
  the result lifecycle, the reveal, Clear, the theme switch.
- `test-fixtures/` — checks fixtures and recreated fix fixtures.
  The fix fixtures are recreations from the briefing descriptions,
  not the original script-test files (see
  `test-fixtures/fix/README.md`).
- `ollada-code-0.1.7.vsix` — packaged build, if packaging succeeded.

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
correctness, checks, and the always-shown warning. Expect no Replay
button on stock 0.3.4 — that is correct, not a bug.
