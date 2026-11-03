// Downloaded check: which shelf models are already in the Hugging Face cache.
//
// Same test as ollada's own `rm` command (cli.py): scan_cache_dir() repos
// matched against each recipe's source. 0.1.3 ran this as a multi-line
// `python -c` argument and swallowed every error, so on the Dell it
// failed silently and every cached model showed Download. 0.1.4 writes
// the script to a temp file, reports the cache folder it scanned and any
// error, and the panel shows both. On any failure the UI still falls back
// to Download: it never claims Downloaded without a successful scan.
export const CACHE_SCRIPT = [
  'import json',
  'out = {"ok": False, "cache_dir": None, "cached": [], "error": None, "missing_cache": False}',
  'try:',
  '    from huggingface_hub import constants',
  '    out["cache_dir"] = str(constants.HF_HUB_CACHE)',
  '    from huggingface_hub import scan_cache_dir',
  '    from ollada.recipes import load_catalog',
  '    try:',
  '        repos = {r.repo_id for r in scan_cache_dir().repos}',
  '    except Exception as exc:',
  '        if type(exc).__name__ == "CacheNotFound":',
  '            repos = set()',
  '            out["missing_cache"] = True',
  '        else:',
  '            raise',
  '    out["cached"] = [rec.name for rec in load_catalog() if rec.source in repos]',
  '    out["ok"] = True',
  'except Exception as exc:',
  '    out["error"] = type(exc).__name__ + ": " + str(exc)',
  'print(json.dumps(out))',
].join('\n');

export interface CacheResult { ok: boolean; cacheDir?: string; cached: Set<string>; error?: string; missingCache: boolean; }

export function parseCacheResult(stdout: string, stderr = ''): CacheResult {
  const line = stdout.trim().split(/\r?\n/).pop() || '';
  try {
    const j = JSON.parse(line) as { ok?: boolean; cache_dir?: string | null; cached?: string[]; error?: string | null; missing_cache?: boolean };
    return {
      ok: !!j.ok,
      cacheDir: j.cache_dir ?? undefined,
      cached: new Set(j.ok && Array.isArray(j.cached) ? j.cached : []),
      error: j.error ?? undefined,
      missingCache: !!j.missing_cache,
    };
  } catch {
    const detail = (stderr || stdout).trim().split(/\r?\n/).pop() || 'no output';
    return { ok: false, cached: new Set(), error: `the cache check didn’t run (${detail})`, missingCache: false };
  }
}
