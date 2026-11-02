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
