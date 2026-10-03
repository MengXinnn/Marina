import { create } from 'zustand';

/**
 * AI player profiles: which endpoint and model a language-model seat talks to.
 * Stored in this browser only (localStorage). API keys are plain text there unless the
 * profile opts out of remembering them, in which case they live in sessionStorage.
 */

export type LlmProvider = 'openai' | 'anthropic';
export type LlmEffort = 'low' | 'medium' | 'high';

export interface LlmProfile {
  id: string;
  name: string;
  /** Wire format: OpenAI-compatible Chat Completions, or the Anthropic Messages API. */
  provider: LlmProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Sent only when set: several reasoning models reject a custom temperature. */
  temperature?: number;
  /** OpenAI-compatible: sent only when set. Anthropic: required by the API, default below. */
  maxTokens?: number;
  /** Reasoning effort, sent only when set (OpenAI `reasoning_effort`, Anthropic `output_config.effort`). */
  effort?: LlmEffort;
  /** Seconds to wait for one reply before the built-in computer takes the turn. */
  timeoutSec: number;
  /** Extra request-body fields as a JSON object, merged last (provider-specific switches). */
  extraBody: string;
  /** Appended to the system prompt: play style, strategy hints. */
  instructions: string;
  /** Keep the key in localStorage; otherwise only for this browser session. */
  rememberKey: boolean;
}

export interface LlmSettings {
  profiles: LlmProfile[];
  /** Show each AI's one-line reason in the voyage log (public, like table talk). */
  showReasons: boolean;
}

export const ANTHROPIC_DEFAULT_MAX_TOKENS = 16000;
export const DEFAULT_TIMEOUT_SEC = 60;

export interface LlmPreset {
  id: string;
  label: string;
  provider: LlmProvider;
  baseUrl: string;
  /** Suggestions only; the model field is free text and "获取模型列表" asks the endpoint. */
  models: string[];
  /** Local servers usually need no key. */
  keyOptional?: boolean;
  note?: string;
}

export const PRESETS: LlmPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini', 'gpt-4o-mini'],
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-4-5', 'claude-fable-5-1'],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek 深度求索',
    provider: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    provider: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  },
  {
    id: 'qwen',
    label: '通义千问（阿里云百炼）',
    provider: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo'],
  },
  {
    id: 'moonshot',
    label: 'Moonshot Kimi',
    provider: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2-0905-preview', 'moonshot-v1-32k'],
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    provider: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4.5', 'glm-4.5-air', 'glm-4-flash'],
  },
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    provider: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    provider: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o-mini', 'deepseek/deepseek-chat', 'google/gemini-2.5-flash'],
  },
  {
    id: 'ollama',
    label: 'Ollama（本机）',
    provider: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    models: ['qwen2.5:7b', 'llama3.1:8b'],
    keyOptional: true,
    note: '需要用环境变量 OLLAMA_ORIGINS 允许本页面的来源（浏览器跨域）。',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio（本机）',
    provider: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    models: [],
    keyOptional: true,
    note: '在 LM Studio 的服务器设置里打开 CORS。',
  },
  {
    id: 'custom',
    label: '自定义（OpenAI 兼容）',
    provider: 'openai',
    baseUrl: '',
    models: [],
  },
];

export function presetById(id: string): LlmPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** The preset whose endpoint a profile uses, if any (drives model suggestions). */
export function presetFor(
  profile: Pick<LlmProfile, 'baseUrl' | 'provider'>,
): LlmPreset | undefined {
  const url = profile.baseUrl.trim().replace(/\/+$/, '');
  return PRESETS.find((p) => p.baseUrl && p.provider === profile.provider && p.baseUrl === url);
}

function newId(): string {
  // crypto.randomUUID is missing outside secure contexts (e.g. the dev server opened over LAN).
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newProfile(presetId = 'deepseek', taken: string[] = []): LlmProfile {
  const preset = presetById(presetId) ?? PRESETS[0]!;
  const base = preset.label.split(/[（ ]/)[0]!;
  let name = base;
  for (let n = 2; taken.includes(name); n++) name = `${base} ${n}`;
  return {
    id: newId(),
    name,
    provider: preset.provider,
    baseUrl: preset.baseUrl,
    apiKey: '',
    model: preset.models[0] ?? '',
    timeoutSec: DEFAULT_TIMEOUT_SEC,
    extraBody: '',
    instructions: '',
    rememberKey: true,
  };
}

export function copyProfile(p: LlmProfile, taken: string[]): LlmProfile {
  let name = `${p.name} 副本`;
  for (let n = 2; taken.includes(name); n++) name = `${p.name} 副本 ${n}`;
  return { ...p, id: newId(), name };
}

/** Human-readable problems with a profile, in form order; empty when it can be saved. */
export function validateProfile(p: LlmProfile, others: LlmProfile[] = []): string[] {
  const errors: string[] = [];
  if (!p.name.trim()) errors.push('请填写配置名称');
  else if (others.some((o) => o.id !== p.id && o.name.trim() === p.name.trim()))
    errors.push('配置名称重复');
  try {
    const url = new URL(p.baseUrl.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
  } catch {
    errors.push('接口地址需要是 http:// 或 https:// 开头的网址');
  }
  if (!p.model.trim()) errors.push('请填写模型名称');
  if (p.temperature !== undefined && !(p.temperature >= 0 && p.temperature <= 2))
    errors.push('温度需要在 0 到 2 之间');
  if (p.maxTokens !== undefined && !(Number.isInteger(p.maxTokens) && p.maxTokens >= 16))
    errors.push('最大输出 tokens 需要是不小于 16 的整数');
  if (!(p.timeoutSec >= 5 && p.timeoutSec <= 600)) errors.push('超时需要在 5 到 600 秒之间');
  if (p.extraBody.trim()) {
    try {
      const v = JSON.parse(p.extraBody) as unknown;
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    } catch {
      errors.push('附加请求参数需要是一个 JSON 对象，例如 {"top_p": 0.9}');
    }
  }
  return errors;
}

// ───────────── persistence ─────────────

const KEY = 'manila.llm.v1';
const SESSION_KEYS = 'manila.llm.keys.v1';

const DEFAULT_SETTINGS: LlmSettings = { profiles: [], showReasons: true };

function storage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** Rebuild a profile from untrusted JSON so later code can rely on every field. */
function readProfile(raw: unknown, sessionKeys: Record<string, string>): LlmProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  if (!id) return null;
  const rememberKey = r.rememberKey !== false;
  const effort =
    r.effort === 'low' || r.effort === 'medium' || r.effort === 'high' ? r.effort : undefined;
  return {
    id,
    name: str(r.name, 'AI'),
    provider: r.provider === 'anthropic' ? 'anthropic' : 'openai',
    baseUrl: str(r.baseUrl),
    apiKey: rememberKey ? str(r.apiKey) : (sessionKeys[id] ?? ''),
    model: str(r.model),
    temperature: num(r.temperature),
    maxTokens: num(r.maxTokens),
    effort,
    timeoutSec: num(r.timeoutSec) ?? DEFAULT_TIMEOUT_SEC,
    extraBody: str(r.extraBody),
    instructions: str(r.instructions),
    rememberKey,
  };
}

export function loadLlmSettings(): LlmSettings {
  try {
    const raw = storage('local')?.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const file = JSON.parse(raw) as Partial<Record<keyof LlmSettings, unknown>>;
    const sessionKeys = JSON.parse(storage('session')?.getItem(SESSION_KEYS) ?? '{}') as Record<
      string,
      string
    >;
    const profiles = Array.isArray(file.profiles)
      ? file.profiles.flatMap((p) => readProfile(p, sessionKeys) ?? [])
      : [];
    return { profiles, showReasons: file.showReasons !== false };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Returns false when the browser refused to store the settings (private mode, quota). */
export function writeLlmSettings(settings: LlmSettings): boolean {
  const sessionKeys: Record<string, string> = {};
  const profiles = settings.profiles.map((p) => {
    if (p.rememberKey) return p;
    if (p.apiKey) sessionKeys[p.id] = p.apiKey;
    return { ...p, apiKey: '' };
  });
  try {
    storage('local')!.setItem(KEY, JSON.stringify({ ...settings, profiles }));
  } catch {
    return false;
  }
  try {
    storage('session')?.setItem(SESSION_KEYS, JSON.stringify(sessionKeys));
  } catch {
    // keys simply won't survive a reload
  }
  return true;
}

interface LlmSettingsStore {
  settings: LlmSettings;
  /** Bumped on every save so running games can retry seats that failed before. */
  revision: number;
  save(settings: LlmSettings): boolean;
}

export const useLlmSettings = create<LlmSettingsStore>((set) => ({
  settings: loadLlmSettings(),
  revision: 0,
  save(settings) {
    const ok = writeLlmSettings(settings);
    set((s) => ({ settings, revision: s.revision + 1 }));
    return ok;
  },
}));

export function findProfile(id: string): LlmProfile | undefined {
  return useLlmSettings.getState().settings.profiles.find((p) => p.id === id);
}
