import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { authorizeOpenRouter, connectOpenRouter, observeOpenRouter } from '../tooling/desktop-openrouter.mjs';

const key = 'fixture-only-key';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const models = { data: [
  { id: 'vision/b', name: 'Vision', architecture: { input_modalities: ['text','image'], output_modalities: ['text'] } },
  { id: 'text/a', architecture: { input_modalities: ['text'], output_modalities: ['text'] } },
  { id: 'image/a', architecture: { input_modalities: ['image'], output_modalities: ['image'] } },
] };
describe('native desktop OpenRouter account boundary', () => {
  it('verifies the key without paid inference, filters vision models and projects only key usage metadata', async () => {
    const fetcher = vi.fn(async (url: string) => url.endsWith('/key') ? json({ data: { usage: 3, limit_remaining: 7, label: key } }) : json(models));
    const account = await connectOpenRouter(key, fetcher);
    expect(account).toEqual({ apiKey: key, models: [{ id: 'vision/b', name: 'Vision' }], usage: 3, remaining: 7 });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['https://openrouter.ai/api/v1/key','https://openrouter.ai/api/v1/models']);
  });
  it('keeps absent key limits unspecified instead of presenting them as the account credit balance', async () => {
    const account = await connectOpenRouter(key, async (url: string) => url.endsWith('/key') ? json({ data: { usage: 0, limit_remaining: null } }) : json(models));
    expect(account.remaining).toBeNull();
  });
  it('binds PKCE to a loopback/state-checked single-use callback before exchanging the code', async () => {
    let resolveUrl!: (value: string) => void;
    const opened = new Promise<string>(resolve => { resolveUrl = resolve; });
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/keys')) {
        const body = JSON.parse(init.body as string);
        const auth = new URL(await opened);
        expect(body).toMatchObject({ code: 'accepted-fixture-code', code_challenge_method: 'S256' });
        expect(createHash('sha256').update(body.code_verifier).digest('base64url')).toBe(auth.searchParams.get('code_challenge'));
        expect(init.redirect).toBe('error');
        return json({ key });
      }
      return url.endsWith('/key') ? json({ data: { usage: 0 } }) : json(models);
    });
    const pending = authorizeOpenRouter(resolveUrl, fetcher);
    const url = new URL(await opened), callback = new URL(url.searchParams.get('callback_url')!);
    expect(url.origin).toBe('https://openrouter.ai'); expect(callback.hostname).toBe('127.0.0.1');
    callback.search = new URLSearchParams({ state: 'wrong', code: 'ignored' }).toString();
    expect((await fetch(callback)).status).toBe(400);
    callback.searchParams.set('state', '中'.repeat(43));
    expect((await fetch(callback)).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    callback.search = new URLSearchParams({ state: url.searchParams.get('state')!, code: 'accepted-fixture-code' }).toString();
    expect((await fetch(callback)).status).toBe(200);
    expect((await pending).apiKey).toBe(key);
    expect(fetcher).toHaveBeenCalledTimes(3);
    await expect(fetch(callback)).rejects.toThrow();
  });
  it('honors denied authorization without exchanging or replacing an existing account', async () => {
    let resolveUrl!: (value: string) => void;
    const opened = new Promise<string>(resolve => { resolveUrl = resolve; });
    const fetcher = vi.fn();
    const pending = authorizeOpenRouter(resolveUrl, fetcher);
    const rejection = expect(pending).rejects.toThrow('declined');
    const url = new URL(await opened), callback = new URL(url.searchParams.get('callback_url')!);
    callback.search = new URLSearchParams({ state: url.searchParams.get('state')!, error: 'access_denied' }).toString();
    await fetch(callback); await rejection;
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('cancels a pending listener without network inference', async () => {
    const controller = new AbortController(); const fetcher = vi.fn();
    let resolveUrl!: (value: string) => void;
    const opened = new Promise<string>(resolve => { resolveUrl = resolve; });
    const pending = authorizeOpenRouter(resolveUrl, fetcher, controller.signal);
    const rejection = expect(pending).rejects.toThrow('cancelled');
    await opened; controller.abort(); await rejection;
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([401,402,429,500])('redacts HTTP %s provider bodies and makes no automatic retry', async status => {
    const fetcher = vi.fn(async () => json({ error: key },status));
    const error = await connectOpenRouter(key,fetcher).catch((e: Error) => e);
    if (!(error instanceof Error)) throw new Error('Expected provider rejection');
    expect(error.message).toContain(`HTTP ${status}`); expect(error.message).not.toContain(key);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('sends only one explicit image observation to the fixed provider, with model JSON and provider cost', async () => {
    const fetcher = vi.fn(async () => json({ choices: [{ finish_reason: 'stop', message: { content: '{"observed":true}' } }], usage: { cost: .002 } }));
    expect(await observeOpenRouter({ apiKey:key,model:'vision/b' },{ dataUrl:'data:image/png;base64,aA==' },'Observe',fetcher)).toMatchObject({ value: { observed:true }, cost: .002, usage:{inputTokens:null,outputTokens:null,totalTokens:null} });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init).toMatchObject({ redirect:'error',credentials:'omit',cache:'no-store' });
    expect(JSON.parse(init.body as string)).toMatchObject({ model:'vision/b',stream:false,response_format:{type:'json_object'},messages:[{content:[{type:'image_url',image_url:{url:'data:image/png;base64,aA=='}},{type:'text',text:'Observe'}]}] });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects truncated or invalid paid outputs without attempting repair or retry', async () => {
    const fetcher = vi.fn(async () => json({ choices:[{finish_reason:'length',message:{content:key}}] }));
    await expect(observeOpenRouter({apiKey:key,model:'vision/b'},{dataUrl:'data:image/png;base64,aA=='},'Observe',fetcher)).rejects.toThrow('did not complete');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
