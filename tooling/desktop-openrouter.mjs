import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { observationUsage } from './observation-usage.mjs';

const api = 'https://openrouter.ai/api/v1';
const jsonLimit = 24 * 1024 * 1024;
/** @typedef {(url:string,init:RequestInit)=>Promise<Response>} ProviderFetch */
/** @param {string} endpoint @param {string} key @param {unknown} body
 * @param {ProviderFetch} [fetcher] @param {AbortSignal} [signal]
 * @returns {Promise<any>} Provider JSON is validated at each consumer. */
export async function openRouterRequest(endpoint, key, body, fetcher = fetch, signal) {
  const response = await fetcher(`${api}/${endpoint}`, {
    method: body ? 'POST' : 'GET',
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180_000)]) : AbortSignal.timeout(180_000),
    redirect: 'error', credentials: 'omit', cache: 'no-store',
  });
  if (!response.ok) {
    await response.body?.cancel();
    // Never echo a provider body, key, submitted image, or OAuth callback.
    throw new Error(`OpenRouter HTTP ${response.status}. ${[401, 403].includes(response.status) ? 'Reconnect your account or check the API key.' : response.status === 402 ? 'Your account has insufficient credits.' : response.status === 429 ? 'Rate or spending limit reached.' : 'Check model capability and provider status.'} No automatic retry was made.`);
  }
  if (Number(response.headers.get('content-length')) > jsonLimit) { await response.body?.cancel(); throw new Error('OpenRouter response exceeds the size limit.'); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('OpenRouter returned an empty response.');
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > jsonLimit) { await reader.cancel(); throw new Error('OpenRouter response exceeds the size limit.'); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('OpenRouter returned invalid JSON.'); }
}

/** @param {string} key @param {ProviderFetch} [fetcher] */
export async function connectOpenRouter(key, fetcher = fetch) {
  if (typeof key !== 'string' || !key.trim() || key.length > 4096 || /\s/.test(key.trim())) throw new Error('Enter a valid OpenRouter API key.');
  key = key.trim();
  const account = await openRouterRequest('key', key, null, fetcher);
  if (!account?.data || typeof account.data.usage !== 'number') throw new Error('OpenRouter did not return account usage.');
  const catalog = await openRouterRequest('models', key, null, fetcher);
  if (!Array.isArray(catalog?.data)) throw new Error('OpenRouter did not return its model catalog.');
  /** @type {{id:string,name?:string,architecture?:{input_modalities?:string[],output_modalities?:string[]}}[]} */
  const entries = catalog.data;
  const models = entries.filter(m => m.architecture?.input_modalities?.includes('image') && m.architecture?.output_modalities?.includes('text'))
    .map(m => ({ id: m.id, name: m.name || m.id })).filter(m => typeof m.id === 'string').sort((a,b) => a.id.localeCompare(b.id));
  return { apiKey: key, models, usage: account.data.usage, remaining: typeof account.data.limit_remaining === 'number' ? account.data.limit_remaining : null };
}

/** Public-client PKCE; no application secret, hosted proxy or password capture.
 * Bind only loopback before handing the URL to the native system browser.
 * @param {(url:string)=>void} onAuthorize @param {ProviderFetch} [fetcher]
 * @param {AbortSignal} [signal] @param {number} [timeoutMs] */
export async function authorizeOpenRouter(onAuthorize, fetcher = fetch, signal, timeoutMs = 180_000) {
  const verifier = randomBytes(32).toString('base64url'), state = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  let finish = (/** @type {string} */ _code) => {}, fail = (/** @type {Error} */ _error) => {};
  const callback = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 5000 }, (req, res) => {
    let url;
    try { url = new URL(req.url || '/', 'http://127.0.0.1'); }
    catch { res.writeHead(400).end('Invalid authorization callback.'); return; }
    const supplied = url.searchParams.get('state') || '';
    const sameState = Buffer.byteLength(supplied) === Buffer.byteLength(state) && timingSafeEqual(Buffer.from(supplied), Buffer.from(state));
    if (req.method !== 'GET' || url.pathname !== '/auth/callback' || !sameState) { res.writeHead(400).end('Invalid authorization callback.'); return; }
    if (url.searchParams.has('error')) { res.writeHead(200).end('Authorization cancelled. You can return to Plan2World.'); fail(new Error('OpenRouter authorization was declined.')); return; }
    const code = url.searchParams.get('code');
    if (!code || code.length > 4096) { res.writeHead(400).end('Missing authorization code.'); return; }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }).end('Authorization received. Return to Plan2World to finish connecting.');
    finish(code);
  });
  await new Promise((resolve, reject) => { server.once('error', () => reject(new Error('Could not start the local authorization callback.'))); server.listen(0, '127.0.0.1', () => resolve(undefined)); });
  server.on('error', () => fail(new Error('The local authorization callback stopped.')));
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  const redirect = `http://127.0.0.1:${address.port}/auth/callback`;
  const url = new URL('https://openrouter.ai/auth');
  url.search = new URLSearchParams({ callback_url: redirect, code_challenge: challenge, code_challenge_method: 'S256', state, key_label: 'Plan2World' }).toString();
  const abort = () => fail(new Error('Account connection cancelled.'));
  const timer = setTimeout(() => fail(new Error('Account authorization timed out. Please connect again.')), timeoutMs);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) abort();
    onAuthorize(url.href);
    const code = await callback;
    const result = await openRouterRequest('auth/keys', '', { code, code_verifier: verifier, code_challenge_method: 'S256' }, fetcher, signal);
    if (typeof result?.key !== 'string' || !result.key) throw new Error('OpenRouter did not issue an API key.');
    return await connectOpenRouter(result.key, fetcher);
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
    server.closeAllConnections(); server.close();
  }
}

/** @param {{apiKey:string,model:string}} config @param {{dataUrl:string}} image
 * @param {string} prompt @param {ProviderFetch} [fetcher] */
export async function observeOpenRouter(config, image, prompt, fetcher = fetch, onResponse = async (/** @type {any} */ _response) => {}) {
  if (!config.apiKey || !config.model?.trim()) throw new Error('Connect OpenRouter and select a vision model first.');
  const result = await openRouterRequest('chat/completions', config.apiKey, {
    model: config.model.trim(), stream: false, response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: image.dataUrl } }, { type: 'text', text: prompt }] }],
  }, fetcher);
  const choice = result?.choices?.[0];
  const usage = observationUsage(result?.usage);
  await onResponse({ usage, content: typeof choice?.message?.content === 'string' ? choice.message.content : null,
    finishReason: ['stop','length','content_filter','error','tool_calls'].includes(choice?.finish_reason) ? choice.finish_reason : 'unknown' });
  if (choice?.finish_reason !== 'stop' || typeof choice?.message?.content !== 'string') throw new Error('OpenRouter did not complete the observation. Choose a vision model with sufficient output capacity.');
  try { return { value: JSON.parse(choice.message.content), cost: usage.cost, usage }; }
  catch { throw new Error('The model returned invalid observation JSON. No automatic retry was made.'); }
}
