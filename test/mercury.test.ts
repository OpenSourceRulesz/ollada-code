import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { chatBody, checkKey, isMercuryModel, mercuryChat, mercuryError, mercuryUrl, parseChat, redact } from '../src/mercury';
import type { FetchLike } from '../src/mercury';

type Call = { url: string; method?: string; headers?: Record<string, string>; body?: string };
function fakeFetch(routes: Record<string, { status: number; body: unknown }>, calls: Call[] = []): FetchLike {
  return async (url, init) => {
    calls.push({ url, method: init?.method, headers: init?.headers, body: init?.body });
    const key = `${init?.method ?? 'GET'} ${new URL(url).pathname}`;
    const r = routes[key] ?? { status: 404, body: { error: 'not found' } };
    return { status: r.status, ok: r.status >= 200 && r.status < 300, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) };
  };
}
const KEY = 'sk_test_1234567890abcdef';

test('only Inception’s Mercury API: fixed https host, fixed paths', () => {
  assert.equal(mercuryUrl('/chat/completions'), 'https://api.inceptionlabs.ai/v1/chat/completions');
  assert.equal(mercuryUrl('/models'), 'https://api.inceptionlabs.ai/v1/models');
});

test('only Mercury models can be sent', () => {
  assert.equal(isMercuryModel('mercury-3'), true);
  for (const other of ['gpt-4o', 'claude-3', 'sdar:4b', 'mercury-3x', '', undefined]) { assert.equal(isMercuryModel(other as string), false); }
  assert.throws(() => chatBody('gpt-4o', 'hi'), /Only Mercury models/);
  assert.deepEqual(chatBody('mercury-3', 'hi'), { model: 'mercury-3', messages: [{ role: 'user', content: 'hi' }] });
});

test('chat: sends to Inception with a bearer key and returns the answer text', async () => {
  const calls: Call[] = [];
  const f = fakeFetch({ 'POST /v1/chat/completions': { status: 200, body: { choices: [{ message: { role: 'assistant', content: 'result = cmath.sqrt(-1)' } }] } } }, calls);
  const text = await mercuryChat(f, KEY, 'mercury-3', 'Fix this code.');
  assert.equal(text, 'result = cmath.sqrt(-1)');
  assert.equal(calls[0].url, 'https://api.inceptionlabs.ai/v1/chat/completions');
  assert.equal(calls[0].headers?.Authorization, `Bearer ${KEY}`);
  assert.equal(JSON.parse(calls[0].body ?? '{}').model, 'mercury-3');
});

test('errors are specific and never contain the key', async () => {
  const f = fakeFetch({ 'POST /v1/chat/completions': { status: 401, body: { error: { message: `bad key ${KEY}` } } } });
  await assert.rejects(mercuryChat(f, KEY, 'mercury-3', 'x'), /Mercury rejected the API key/);
  const msg = mercuryError(400, JSON.stringify({ error: { message: `invalid request for ${KEY}` } }), KEY);
  assert.ok(!msg.includes(KEY));
  assert.match(msg, /\[key hidden\]/);
  assert.match(mercuryError(429, ''), /rate limit or quota/);
  assert.match(mercuryError(402, ''), /billing/);
  assert.equal(redact('a KEY b', 'KEY'), 'a [key hidden] b');
  assert.throws(() => parseChat('{"choices":[]}'), /no answer text/);
});

test('checkKey: saves only keys Inception accepts and that offer Mercury', async () => {
  assert.equal((await checkKey(fakeFetch({ 'GET /v1/models': { status: 200, body: { data: [{ id: 'mercury-3' }, { id: 'mercury-edit-2' }] } } }), KEY)).ok, true);
  const rejected = await checkKey(fakeFetch({ 'GET /v1/models': { status: 401, body: {} } }), KEY);
  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /rejected this key/);
  const noMercury = await checkKey(fakeFetch({ 'GET /v1/models': { status: 200, body: { data: [{ id: 'gpt-4o' }] } } }), KEY);
  assert.equal(noMercury.ok, false, 'a key that lists no Mercury model is refused');
  assert.equal((await checkKey(fakeFetch({}), 'short')).ok, false);
  // /models not available: one tiny chat to mercury-3 decides
  const viaChat = await checkKey(fakeFetch({ 'GET /v1/models': { status: 404, body: {} }, 'POST /v1/chat/completions': { status: 200, body: { choices: [{ message: { content: 'OK' } }] } } }), KEY);
  assert.equal(viaChat.ok, true);
  const offline: FetchLike = async () => { throw new TypeError('fetch failed'); };
  assert.match((await checkKey(offline, KEY)).message, /Couldn’t reach Inception/);
});
