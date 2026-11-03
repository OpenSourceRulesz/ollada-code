// Port picking, spec 5.1 / 6.2.
// Try 11435, then 11436, 11437, and so on. Never kill the process
// holding a port (on the work laptop, Code.exe itself holds 11435
// and 11436 LISTENING). The pure function below is what unit tests
// cover; probePort does the real socket check.
import * as net from 'net';

export const FIRST_PORT = 11435;
export const MAX_PORT = 11460;

/** First candidate at or after `preferred` that is not in `inUse`. */
export function pickFirstFree(preferred: number, inUse: ReadonlySet<number>): number {
  let port = preferred > 0 ? preferred : FIRST_PORT;
  if (port < FIRST_PORT) { port = FIRST_PORT; }
  while (inUse.has(port) && port < MAX_PORT) { port++; }
  return port;
}

/** True if something is listening on 127.0.0.1:port (so it is taken). */
export function portInUse(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (value: boolean) => {
      if (done) { return; }
      done = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, '127.0.0.1', () => finish(true));
  });
}

/** First free port from 11435 upward (or from `preferred` if set). */
export async function pickPort(preferred: number): Promise<{ port: number; skipped: number[] }> {
  const skipped: number[] = [];
  let port = preferred > 0 ? preferred : FIRST_PORT;
  while (port <= MAX_PORT) {
    if (await portInUse(port)) { skipped.push(port); port++; continue; }
    return { port, skipped };
  }
  throw new Error(`No free port found between ${FIRST_PORT} and ${MAX_PORT}`);
}

/**
 * Identify an ollada serve on a port. 0.1.4 dogfood fix: a serve the user
 * started by hand on 11437 was reported as "in use by another app" and the
 * extension offered a second serve on 11438. A port counts as ollada when
 * GET /api/version returns a version string and GET /health returns
 * ollada's own shape ({"status": "ok", "version": ...}); an Ollama on the
 * same range answers /api/version too, but has no such /health.
 */
export function isOlladaHealth(body: unknown, version: string): boolean {
  if (!body || typeof body !== 'object') { return false; }
  const b = body as { status?: unknown; version?: unknown };
  return b.status === 'ok' && b.version === version;
}

export function parseVersion(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') { return undefined; }
  const v = (body as { version?: unknown }).version;
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

async function getJson(port: number, pathName: string, timeoutMs: number): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${port}${pathName}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) { return undefined; }
  try { return await res.json(); } catch { return undefined; }
}

/** The ollada version answering on 127.0.0.1:port, or undefined if it is not an ollada serve. */
export async function probeOllada(port: number, timeoutMs = 800): Promise<string | undefined> {
  try {
    const version = parseVersion(await getJson(port, '/api/version', timeoutMs));
    if (!version) { return undefined; }
    return isOlladaHealth(await getJson(port, '/health', timeoutMs), version) ? version : undefined;
  } catch {
    return undefined;
  }
}

/** First port in [start, end] that answers as ollada, probed in parallel. */
export async function findOlladaServe(
  start: number,
  end: number,
  probe: (port: number) => Promise<string | undefined> = probeOllada,
): Promise<{ port: number; version: string } | undefined> {
  const ports: number[] = [];
  for (let p = start; p <= end; p++) { ports.push(p); }
  const versions = await Promise.all(ports.map((p) => probe(p)));
  for (let i = 0; i < ports.length; i++) {
    const v = versions[i];
    if (v) { return { port: ports[i], version: v }; }
  }
  return undefined;
}
