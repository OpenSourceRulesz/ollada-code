import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as childProcess from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CACHE_SCRIPT, parseCacheResult } from '../src/cacheScript';

// Needs a Python with ollada (and so huggingface_hub) installed, like the
// user's venv. Point OLLADA_TEST_PYTHON at it; the test is skipped
// otherwise, never faked.
const PY = process.env.OLLADA_TEST_PYTHON || '';
const hasOllada = !!PY && childProcess.spawnSync(PY, ['-c', 'import ollada, huggingface_hub']).status === 0;

/** A real Hugging Face hub cache layout (blobs, refs/main, snapshots/<commit>/), with plain files as on Windows without symlinks. */
function fakeCache(root: string, repos: string[]): void {
  for (const repo of repos) {
    const dir = path.join(root, 'models--' + repo.replace('/', '--'));
    const commit = crypto.createHash('sha1').update(repo).digest('hex');
    const blob = crypto.createHash('sha256').update(repo).digest('hex');
    fs.mkdirSync(path.join(dir, 'blobs'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'refs'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'snapshots', commit), { recursive: true });
    fs.writeFileSync(path.join(dir, 'blobs', blob), '{"model_type":"x"}');
    fs.writeFileSync(path.join(dir, 'refs', 'main'), commit);
    fs.writeFileSync(path.join(dir, 'snapshots', commit, 'config.json'), '{"model_type":"x"}');
  }
}

function runScript(python: string, env: NodeJS.ProcessEnv) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ollada-cache-test-'));
  const file = path.join(dir, 'cache_check.py');
  fs.writeFileSync(file, CACHE_SCRIPT);
  const r = childProcess.spawnSync(python, [file], { env: { ...process.env, ...env }, encoding: 'utf-8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return parseCacheResult(r.stdout ?? '', r.stderr ?? '');
}

test('real scan_cache_dir: sdar:1.7b, sdar:4b and nemotron:3b cached show as Downloaded', { skip: !hasOllada && 'set OLLADA_TEST_PYTHON to a Python with ollada installed' }, () => {
  const hub = fs.mkdtempSync(path.join(os.tmpdir(), 'ollada-hub-'));
  fakeCache(hub, ['JetLM/SDAR-1.7B-Chat', 'JetLM/SDAR-4B-Chat', 'nvidia/Nemotron-Labs-Diffusion-3B']);
  const r = runScript(PY, { HF_HUB_CACHE: hub });
  fs.rmSync(hub, { recursive: true, force: true });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.cacheDir, hub, 'reports the folder it scanned');
  assert.deepEqual([...r.cached].sort(), ['nemotron:3b', 'sdar:1.7b', 'sdar:4b']);
});

test('real scan_cache_dir: no cache folder means nothing cached, and it says where it looked', { skip: !hasOllada && 'set OLLADA_TEST_PYTHON to a Python with ollada installed' }, () => {
  const missing = path.join(os.tmpdir(), 'ollada-no-such-hub-' + process.pid);
  const r = runScript(PY, { HF_HUB_CACHE: missing });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.missingCache, true);
  assert.equal(r.cached.size, 0);
});

test('a Python without ollada never claims Downloaded, and reports why', () => {
  const plain = process.platform === 'win32' ? 'python' : 'python3';
  const has = childProcess.spawnSync(plain, ['-c', 'import ollada']).status === 0;
  if (has) { return; }
  const r = runScript(plain, {});
  assert.equal(r.ok, false);
  assert.equal(r.cached.size, 0);
  assert.match(r.error ?? '', /ModuleNotFoundError|ImportError|didn’t run/);
});

test('garbage output never claims Downloaded', () => {
  const r = parseCacheResult('Traceback (most recent call last):\n  boom', '');
  assert.equal(r.ok, false);
  assert.equal(r.cached.size, 0);
});
