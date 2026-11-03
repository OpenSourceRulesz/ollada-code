import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { pickFirstFree, FIRST_PORT } from '../src/ports';

test('picks 11435 when free, skips Code.exe-held 11435/11436, never kills', () => {
  assert.equal(pickFirstFree(0, new Set()), FIRST_PORT);
  assert.equal(pickFirstFree(0, new Set([11435, 11436])), 11437);
  assert.equal(pickFirstFree(11437, new Set([11437])), 11438);
});

test('preferred port is honoured when free', () => {
  assert.equal(pickFirstFree(11440, new Set([11435])), 11440);
});

import * as http from 'http';
import { findOlladaServe, isOlladaHealth, parseVersion, probeOllada } from '../src/ports';

function serve(port: number, routes: Record<string, unknown>): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const body = routes[req.url ?? ''];
      if (body === undefined) { res.statusCode = 404; res.end('not found'); return; }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    });
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
const close = (s: http.Server) => new Promise<void>((r) => s.close(() => r()));

test('an ollada serve already on 11437 is found and reused, not reported as "another app"', async () => {
  const s = await serve(11437, { '/api/version': { version: '0.3.4' }, '/health': { status: 'ok', version: '0.3.4', loaded: null } });
  try {
    assert.equal(await probeOllada(11437), '0.3.4');
    const found = await findOlladaServe(11435, 11444);
    assert.deepEqual(found, { port: 11437, version: '0.3.4' });
  } finally { await close(s); }
});

test('something that only answers /api/version (an Ollama, say) is not treated as ollada', async () => {
  const s = await serve(11441, { '/api/version': { version: '0.12.0' } });
  try {
    assert.equal(await probeOllada(11441), undefined);
    assert.equal(await findOlladaServe(11441, 11441), undefined);
  } finally { await close(s); }
});

test('identity helpers', () => {
  assert.equal(parseVersion({ version: '0.3.4' }), '0.3.4');
  assert.equal(parseVersion({}), undefined);
  assert.equal(isOlladaHealth({ status: 'ok', version: '0.3.4' }, '0.3.4'), true);
  assert.equal(isOlladaHealth({ status: 'ok', version: '0.3.3' }, '0.3.4'), false);
});

test('findOlladaServe returns the first ollada port in order', async () => {
  const probe = async (p: number) => (p === 11437 || p === 11439 ? '0.3.4' : undefined);
  assert.deepEqual(await findOlladaServe(11435, 11440, probe), { port: 11437, version: '0.3.4' });
  assert.equal(await findOlladaServe(11435, 11436, probe), undefined);
});
