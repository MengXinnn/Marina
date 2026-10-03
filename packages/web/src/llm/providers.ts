import { ANTHROPIC_DEFAULT_MAX_TOKENS, type LlmProfile } from './settings';

/**
 * Minimal HTTP clients for the two wire formats an AI profile can speak. Plain fetch from the
 * browser, no SDK: the requests go straight to the endpoint the player configured.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatUsage {
  input?: number;
  output?: number;
  cached?: number;
}

export interface ChatResult {
  text: string;
  ms: number;
  usage: ChatUsage;
}

export type LlmErrorKind =
  'network' | 'http' | 'timeout' | 'aborted' | 'empty' | 'refusal' | 'invalid' | 'config';

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }

  /** Worth one more try: the service was busy or the connection dropped. */
  get retryable(): boolean {
    return (
      this.kind === 'network' ||
      (this.kind === 'http' && (this.status === 429 || (this.status ?? 0) >= 500))
    );
  }
}

const trimSlash = (url: string) => url.trim().replace(/\/+$/, '');

/** Accepts a base URL with or without the version / path suffix. */
export function chatEndpoint(p: Pick<LlmProfile, 'provider' | 'baseUrl'>): string {
  const base = trimSlash(p.baseUrl);
  if (p.provider === 'anthropic') {
    if (/\/messages$/.test(base)) return base;
    return /\/v\d+$/.test(base) ? `${base}/messages` : `${base}/v1/messages`;
  }
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
}

export function modelsEndpoint(p: Pick<LlmProfile, 'provider' | 'baseUrl'>): string {
  const chat = chatEndpoint(p);
  return p.provider === 'anthropic'
    ? chat.replace(/\/messages$/, '/models')
    : chat.replace(/\/chat\/completions$/, '/models');
}

function headers(p: LlmProfile): Record<string, string> {
  const key = p.apiKey.trim();
  if (p.provider === 'anthropic')
    return {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      // Required for calls made directly from a web page (CORS).
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  return { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) };
}

function extraBody(p: LlmProfile): Record<string, unknown> {
  if (!p.extraBody.trim()) return {};
  try {
    const v = JSON.parse(p.extraBody) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // validated on save; ignore if hand-edited
  }
  throw new LlmError('config', '附加请求参数不是有效的 JSON 对象');
}

function requestBody(p: LlmProfile, messages: ChatMessage[]): Record<string, unknown> {
  const optional: Record<string, unknown> = {};
  if (p.temperature !== undefined) optional.temperature = p.temperature;
  if (p.provider === 'anthropic') {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    if (p.effort) optional.output_config = { effort: p.effort };
    return {
      model: p.model.trim(),
      max_tokens: p.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
      // The rules text is identical on every turn: mark it cacheable (ignored when too short).
      ...(system
        ? { system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] }
        : {}),
      messages: messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content })),
      ...optional,
      ...extraBody(p),
    };
  }
  if (p.maxTokens !== undefined) optional.max_tokens = p.maxTokens;
  if (p.effort) optional.reasoning_effort = p.effort;
  return { model: p.model.trim(), messages, stream: false, ...optional, ...extraBody(p) };
}

/** Pulls the provider's own error text out of an error response (both formats use error.message). */
function errorText(body: string): string {
  try {
    const json = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    const msg =
      typeof json.error === 'string' ? json.error : (json.error?.message ?? json.message ?? '');
    if (msg) return msg.slice(0, 300);
  } catch {
    // not JSON
  }
  return body.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function httpHint(status: number): string {
  if (status === 401 || status === 403) return '（API Key 无效或没有权限）';
  if (status === 404) return '（接口地址或模型名称不对）';
  if (status === 429) return '（请求太频繁或额度用完）';
  if (status >= 500) return '（服务暂时不可用）';
  return '';
}

/**
 * fetch with a timeout, linked to the caller's abort signal. Maps every failure to an LlmError
 * with a message a player can act on.
 */
async function request(
  url: string,
  init: RequestInit,
  timeoutSec: number,
  signal?: AbortSignal,
): Promise<{ json: unknown; ms: number }> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutSec * 1000);
  const onAbort = () => ctrl.abort();
  if (signal?.aborted) ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  const start = performance.now();
  try {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: ctrl.signal });
    } catch (e) {
      if (timedOut) throw new LlmError('timeout', `等待超过 ${timeoutSec} 秒没有回复`);
      if (signal?.aborted) throw new LlmError('aborted', '已取消');
      throw new LlmError(
        'network',
        `连不上 ${new URL(url).host}：地址写错、服务没启动，或该服务不允许网页直接访问（跨域 CORS）` +
          (e instanceof Error && e.message ? `。${e.message}` : ''),
      );
    }
    const body = await res.text().catch((e: unknown) => {
      if (timedOut) throw new LlmError('timeout', `等待超过 ${timeoutSec} 秒没有回复`);
      if (signal?.aborted) throw new LlmError('aborted', '已取消');
      throw new LlmError('network', `读取回复失败：${e instanceof Error ? e.message : String(e)}`);
    });
    if (!res.ok)
      throw new LlmError(
        'http',
        `HTTP ${res.status}${httpHint(res.status)}：${errorText(body) || res.statusText}`,
        res.status,
      );
    try {
      return { json: JSON.parse(body) as unknown, ms: performance.now() - start };
    } catch {
      throw new LlmError('invalid', `接口返回的不是 JSON：${body.slice(0, 120)}`);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

interface OpenAiResponse {
  choices?: Array<{
    message?: { content?: string | Array<{ type?: string; text?: string }> | null };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
}

function readOpenAi(json: OpenAiResponse): { text: string; usage: ChatUsage } {
  const choice = json.choices?.[0];
  const content = choice?.message?.content;
  const text = Array.isArray(content)
    ? content.map((part) => part.text ?? '').join('')
    : (content ?? '');
  if (!text.trim())
    throw new LlmError(
      'empty',
      choice?.finish_reason === 'length'
        ? '回复被截断（最大输出 tokens 太小）'
        : '模型返回了空回复',
    );
  return {
    text,
    usage: {
      input: json.usage?.prompt_tokens,
      output: json.usage?.completion_tokens,
      cached: json.usage?.prompt_tokens_details?.cached_tokens,
    },
  };
}

function readAnthropic(json: AnthropicResponse): { text: string; usage: ChatUsage } {
  if (json.stop_reason === 'refusal') throw new LlmError('refusal', '模型拒绝回答这一步');
  // Thinking blocks come first on reasoning models; only the text blocks carry the answer.
  const text = (json.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
  if (!text.trim())
    throw new LlmError(
      'empty',
      json.stop_reason === 'max_tokens' ? '回复被截断（最大输出 tokens 太小）' : '模型返回了空回复',
    );
  return {
    text,
    usage: {
      input: json.usage?.input_tokens,
      output: json.usage?.output_tokens,
      cached: json.usage?.cache_read_input_tokens,
    },
  };
}

function checkProfile(p: LlmProfile): void {
  if (!p.baseUrl.trim()) throw new LlmError('config', '没有填写接口地址');
  if (!p.model.trim()) throw new LlmError('config', '没有填写模型名称');
  if (p.provider === 'anthropic' && !p.apiKey.trim())
    throw new LlmError('config', 'Anthropic 接口需要 API Key');
}

/** One chat turn. Throws LlmError. */
export async function chat(
  profile: LlmProfile,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<ChatResult> {
  checkProfile(profile);
  const { json, ms } = await request(
    chatEndpoint(profile),
    {
      method: 'POST',
      headers: headers(profile),
      body: JSON.stringify(requestBody(profile, messages)),
    },
    profile.timeoutSec,
    signal,
  );
  const { text, usage } =
    profile.provider === 'anthropic'
      ? readAnthropic(json as AnthropicResponse)
      : readOpenAi(json as OpenAiResponse);
  return { text, ms, usage };
}

/** Model ids the endpoint offers (GET /models). Throws LlmError. */
export async function listModels(profile: LlmProfile, signal?: AbortSignal): Promise<string[]> {
  if (!profile.baseUrl.trim()) throw new LlmError('config', '没有填写接口地址');
  const { json } = await request(
    modelsEndpoint(profile),
    { method: 'GET', headers: headers(profile) },
    Math.min(profile.timeoutSec, 30),
    signal,
  );
  // OpenAI / Anthropic: { data: [{ id }] }. Ollama's native API: { models: [{ name }] }.
  const j = json as {
    data?: Array<{ id?: string }>;
    models?: Array<{ name?: string; id?: string }>;
  };
  const ids = [
    ...(j.data ?? []).map((m) => m.id),
    ...(j.models ?? []).map((m) => m.id ?? m.name),
  ].filter((id): id is string => typeof id === 'string' && id.length > 0);
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}
