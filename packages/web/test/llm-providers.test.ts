import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmError, chat, chatEndpoint, listModels, modelsEndpoint } from '../src/llm/providers';
import { newProfile, type LlmProfile } from '../src/llm/settings';

function profile(patch: Partial<LlmProfile> = {}): LlmProfile {
  return { ...newProfile('deepseek'), apiKey: 'sk-1', ...patch };
}

const claude = (patch: Partial<LlmProfile> = {}) =>
  profile({
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-5-5',
    ...patch,
  });

function respond(body: unknown, status = 200) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const sent = (f: ReturnType<typeof respond>, i = 0) => ({
  url: f.mock.calls[i]![0],
  init: f.mock.calls[i]![1]!,
  body: JSON.parse(f.mock.calls[i]![1]!.body as string) as Record<string, unknown>,
  headers: f.mock.calls[i]![1]!.headers as Record<string, string>,
});

const messages = [
  { role: 'system' as const, content: 'rules' },
  { role: 'user' as const, content: 'your turn' },
];

afterEach(() => vi.unstubAllGlobals());

describe('endpoints', () => {
  it('accepts base URLs with or without the path suffix', () => {
    const o = (baseUrl: string) => chatEndpoint({ provider: 'openai', baseUrl });
    expect(o('https://api.deepseek.com/v1')).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(o('https://api.deepseek.com/v1/')).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(o('http://localhost:11434/v1/chat/completions')).toBe(
      'http://localhost:11434/v1/chat/completions',
    );
    const a = (baseUrl: string) => chatEndpoint({ provider: 'anthropic', baseUrl });
    expect(a('https://api.anthropic.com')).toBe('https://api.anthropic.com/v1/messages');
    expect(a('https://api.anthropic.com/v1')).toBe('https://api.anthropic.com/v1/messages');
    expect(a('https://proxy.example/v1/messages')).toBe('https://proxy.example/v1/messages');
    expect(modelsEndpoint({ provider: 'openai', baseUrl: 'https://x.dev/v1' })).toBe(
      'https://x.dev/v1/models',
    );
    expect(modelsEndpoint({ provider: 'anthropic', baseUrl: 'https://api.anthropic.com' })).toBe(
      'https://api.anthropic.com/v1/models',
    );
  });
});

describe('OpenAI-compatible chat', () => {
  it('sends a plain chat completion and reads the answer', async () => {
    const f = respond({
      choices: [{ message: { content: '{"move":"pass"}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 5 },
    });
    const res = await chat(profile(), messages);
    expect(res.text).toBe('{"move":"pass"}');
    expect(res.usage).toMatchObject({ input: 100, output: 5 });
    const req = sent(f);
    expect(req.url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(req.headers.authorization).toBe('Bearer sk-1');
    expect(req.body).toEqual({
      model: 'deepseek-flash',
      messages,
      stream: false,
      thinking: { type: 'disabled' }, // new DeepSeek profiles answer without thinking
    });
  });

  it('switches thinking off only where the preset knows how, and only when asked', async () => {
    const f = respond({ choices: [{ message: { content: 'x' } }] });
    await chat(profile({ noThinking: false }), messages);
    expect(sent(f).body).not.toHaveProperty('thinking');
    await chat(profile({ baseUrl: 'https://proxy.example/v1', noThinking: true }), messages);
    expect(sent(f, 1).body).not.toHaveProperty('thinking');
    // Extra body fields still win, e.g. to turn thinking back on per request.
    await chat(profile({ extraBody: '{"thinking":{"type":"enabled"}}' }), messages);
    expect(sent(f, 2).body.thinking).toEqual({ type: 'enabled' });
  });

  it('only sends optional knobs that are set, and merges extra body fields last', async () => {
    const f = respond({ choices: [{ message: { content: 'x' } }] });
    await chat(
      profile({ temperature: 0.3, maxTokens: 512, effort: 'low', extraBody: '{"top_p":0.9}' }),
      messages,
    );
    expect(sent(f).body).toMatchObject({
      temperature: 0.3,
      max_tokens: 512,
      reasoning_effort: 'low',
      top_p: 0.9,
    });
  });

  it('sends no Authorization header without a key (local servers)', async () => {
    const f = respond({ choices: [{ message: { content: 'x' } }] });
    await chat(profile({ apiKey: '', baseUrl: 'http://localhost:11434/v1' }), messages);
    expect(sent(f).headers.authorization).toBeUndefined();
  });

  it('explains HTTP errors with the provider message', async () => {
    respond({ error: { message: 'Invalid API key' } }, 401);
    const err = await chat(profile(), messages).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).kind).toBe('http');
    expect((err as LlmError).retryable).toBe(false);
    expect((err as LlmError).message).toContain('401');
    expect((err as LlmError).message).toContain('Invalid API key');
  });

  it('marks busy services and dropped connections as retryable', async () => {
    respond('overloaded', 503);
    expect(((await chat(profile(), messages).catch((e) => e)) as LlmError).retryable).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = (await chat(profile(), messages).catch((e) => e)) as LlmError;
    expect(err.kind).toBe('network');
    expect(err.message).toContain('CORS');
  });

  it('reports an empty or truncated reply', async () => {
    respond({ choices: [{ message: { content: '' }, finish_reason: 'length' }] });
    const err = (await chat(profile(), messages).catch((e) => e)) as LlmError;
    expect(err.kind).toBe('empty');
    expect(err.message).toContain('最大输出');
  });

  it('times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) =>
            init.signal!.addEventListener('abort', () =>
              reject(new DOMException('', 'AbortError')),
            ),
          ),
      ),
    );
    const err = (await chat(profile({ timeoutSec: 0.05 }), messages).catch((e) => e)) as LlmError;
    expect(err.kind).toBe('timeout');
  });

  it('distinguishes the caller cancelling from a timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) =>
            init.signal!.addEventListener('abort', () =>
              reject(new DOMException('', 'AbortError')),
            ),
          ),
      ),
    );
    const ctrl = new AbortController();
    const pending = chat(profile(), messages, ctrl.signal).catch((e) => e);
    ctrl.abort();
    expect(((await pending) as LlmError).kind).toBe('aborted');
  });
});

describe('Anthropic Messages API', () => {
  it('sends the browser-access header, a cacheable system block and a default max_tokens', async () => {
    const f = respond({
      content: [
        { type: 'thinking', thinking: '' },
        { type: 'text', text: '{"move":"roll"}' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 900, output_tokens: 12, cache_read_input_tokens: 800 },
    });
    const res = await chat(claude(), messages);
    expect(res.text).toBe('{"move":"roll"}');
    expect(res.usage).toEqual({ input: 900, output: 12, cached: 800 });
    const req = sent(f);
    expect(req.url).toBe('https://api.anthropic.com/v1/messages');
    expect(req.headers).toMatchObject({
      'x-api-key': 'sk-1',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    expect(req.body).toEqual({
      model: 'claude-sonnet-5-5',
      max_tokens: 16000,
      system: [{ type: 'text', text: 'rules', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'your turn' }],
    });
  });

  it('maps effort to output_config and never sends temperature unless set', async () => {
    const f = respond({ content: [{ type: 'text', text: 'x' }] });
    await chat(claude({ effort: 'low' }), messages);
    expect(sent(f).body.output_config).toEqual({ effort: 'low' });
    expect(sent(f).body).not.toHaveProperty('temperature');
  });

  it('treats a refusal as a failure', async () => {
    respond({ content: [], stop_reason: 'refusal' });
    expect(((await chat(claude(), messages).catch((e) => e)) as LlmError).kind).toBe('refusal');
  });

  it('requires a key', async () => {
    const err = (await chat(claude({ apiKey: '' }), messages).catch((e) => e)) as LlmError;
    expect(err.kind).toBe('config');
  });
});

describe('listModels', () => {
  it('reads OpenAI / Anthropic lists and Ollama-style lists', async () => {
    respond({ data: [{ id: 'b-model' }, { id: 'a-model' }, { id: 'a-model' }] });
    expect(await listModels(profile())).toEqual(['a-model', 'b-model']);
    respond({ models: [{ name: 'qwen2.5:7b' }] });
    expect(await listModels(profile())).toEqual(['qwen2.5:7b']);
  });
});
