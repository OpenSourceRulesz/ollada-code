// Mercury (Inception Labs) as the one optional cloud model, 0.1.8.
//
// Only Mercury, enforced three ways:
// 1. The endpoint is fixed to Inception's API. There is no URL field, and
//    mercuryUrl() refuses any other host or a non-https scheme.
// 2. Only models on MERCURY_MODELS can be sent.
// 3. A key is saved only after Inception's own API accepts it and lists a
//    Mercury model (checkKey), so a key for another provider is rejected.
//
// The key lives in VS Code's SecretStorage, never in settings, and is never
// put in an error message (redact). Code sent to Mercury leaves the machine;
// the extension warns before the first send (see extension.ts).
// API shape: OpenAI-compatible chat completions at
// https://api.inceptionlabs.ai/v1/chat/completions, model "mercury-2".

export const MERCURY_HOST = 'api.inceptionlabs.ai';
export const MERCURY_BASE = 'https://api.inceptionlabs.ai/v1';
export const MERCURY_MODELS: readonly string[] = ['mercury-2'];
export const MERCURY_SECRET = 'ollada-code.mercury.apiKey';
export const MERCURY_CONSENT = 'ollada-code.mercury.alwaysSend';

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ status: number; ok: boolean; text(): Promise<string> }>;

export function isMercuryModel(name: string | undefined): boolean {
  return !!name && MERCURY_MODELS.includes(name);
}

/** The only URLs the extension will call for Mercury. Anything else throws. */
export function mercuryUrl(pathName: '/chat/completions' | '/models'): string {
  const url = new URL(MERCURY_BASE + pathName);
  if (url.protocol !== 'https:' || url.hostname !== MERCURY_HOST) {
    throw new Error('ollada-code only connects to Inception’s Mercury API.');
  }
  return url.toString();
}

export function redact(text: string, key: string | undefined): string {
  if (!key) { return text; }
  return text.split(key).join('[key hidden]');
}

export function chatBody(model: string, prompt: string): { model: string; messages: Array<{ role: string; content: string }> } {
  if (!isMercuryModel(model)) { throw new Error(`Only Mercury models can be sent to Inception (got ${model}).`); }
  return { model, messages: [{ role: 'user', content: prompt }] };
}

export function parseChat(raw: string): string {
  let j: unknown;
  try { j = JSON.parse(raw); } catch { throw new Error('Mercury returned a response that isn’t JSON.'); }
  const content = (j as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
  if (typeof content !== 'string') { throw new Error('Mercury returned no answer text.'); }
  return content;
}

/** Plain, specific error text for a failed Mercury call. Never includes the key. */
export function mercuryError(status: number, raw: string, key?: string): string {
  if (status === 401 || status === 403) { return 'Mercury rejected the API key. Reconnect it in Setup.'; }
  if (status === 402) { return 'Inception says this account needs billing set up or more credit.'; }
  if (status === 429) { return 'Mercury’s rate limit or quota was reached. Try again in a moment, or switch to a local model.'; }
  if (status >= 500) { return `Mercury had a server error (${status}). Try again, or switch to a local model.`; }
  let detail = raw;
  try {
    const j = JSON.parse(raw) as { error?: { message?: unknown } | string; detail?: unknown };
    detail = typeof j.error === 'string' ? j.error : String((j.error as { message?: unknown } | undefined)?.message ?? j.detail ?? raw);
  } catch { /* keep raw */ }
  return redact(`Mercury error ${status}: ${detail}`.slice(0, 300), key);
}

function auth(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

export async function mercuryChat(fetchImpl: FetchLike, key: string, model: string, prompt: string, signal?: AbortSignal): Promise<string> {
  const body = JSON.stringify(chatBody(model, prompt));
  let res;
  try {
    res = await fetchImpl(mercuryUrl('/chat/completions'), { method: 'POST', headers: auth(key), body, signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') { throw err; }
    throw new Error('Couldn’t reach Mercury. Check your internet connection, or switch to a local model.');
  }
  const raw = await res.text();
  if (!res.ok) { throw new Error(mercuryError(res.status, raw, key)); }
  return parseChat(raw);
}

/**
 * Accept a key only if Inception's API accepts it and offers a Mercury model.
 * GET /v1/models first; if that route isn't available (404/405), one tiny
 * chat request to mercury-2 decides instead.
 */
export async function checkKey(fetchImpl: FetchLike, key: string): Promise<{ ok: boolean; message: string }> {
  const trimmed = key.trim();
  if (trimmed.length < 8 || /\s/.test(trimmed)) { return { ok: false, message: 'That doesn’t look like an API key.' }; }
  let res;
  try {
    res = await fetchImpl(mercuryUrl('/models'), { method: 'GET', headers: auth(trimmed) });
  } catch {
    return { ok: false, message: 'Couldn’t reach Inception to check the key. Check your internet connection and try again.' };
  }
  const raw = await res.text();
  if (res.status === 401 || res.status === 403) { return { ok: false, message: 'Inception rejected this key. Copy it again from the Inception dashboard.' }; }
  if (res.ok) {
    let ids: string[] = [];
    try { ids = ((JSON.parse(raw) as { data?: Array<{ id?: unknown }> }).data ?? []).map((m) => String(m.id ?? '')); } catch { /* not a list */ }
    if (ids.length > 0 && !ids.some((id) => id.toLowerCase().includes('mercury'))) {
      return { ok: false, message: 'This key works, but Inception didn’t offer a Mercury model for it.' };
    }
    return { ok: true, message: 'Mercury is connected.' };
  }
  if (res.status === 404 || res.status === 405) {
    try {
      await mercuryChat(fetchImpl, trimmed, MERCURY_MODELS[0], 'Reply with OK.');
      return { ok: true, message: 'Mercury is connected.' };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Inception didn’t accept this key.' };
    }
  }
  return { ok: false, message: mercuryError(res.status, raw, trimmed) };
}
