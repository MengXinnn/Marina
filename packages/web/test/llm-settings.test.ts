import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Minimal Web Storage for node. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

vi.stubGlobal('localStorage', memoryStorage());
vi.stubGlobal('sessionStorage', memoryStorage());

const { loadLlmSettings, newProfile, presetFor, validateProfile, writeLlmSettings } =
  await import('../src/llm/settings');

describe('AI profiles', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('round-trips through localStorage', () => {
    const p = {
      ...newProfile('openai'),
      apiKey: 'sk-keep',
      temperature: 0.2,
      effort: 'low' as const,
    };
    expect(writeLlmSettings({ profiles: [p], showReasons: false })).toBe(true);
    const back = loadLlmSettings();
    expect(back.showReasons).toBe(false);
    expect(back.profiles).toEqual([p]);
  });

  it('keeps a key it may not remember out of localStorage', () => {
    const p = { ...newProfile('deepseek'), apiKey: 'sk-secret', rememberKey: false };
    writeLlmSettings({ profiles: [p], showReasons: true });
    expect(localStorage.getItem('manila.llm.v1')).not.toContain('sk-secret');
    expect(loadLlmSettings().profiles[0]!.apiKey).toBe('sk-secret'); // same browser session
    sessionStorage.clear(); // a new session
    expect(loadLlmSettings().profiles[0]!.apiKey).toBe('');
  });

  it('survives garbage in storage', () => {
    localStorage.setItem('manila.llm.v1', '{not json');
    expect(loadLlmSettings()).toEqual({ profiles: [], showReasons: true });
    localStorage.setItem('manila.llm.v1', JSON.stringify({ profiles: [{ nope: 1 }, 'x'] }));
    expect(loadLlmSettings().profiles).toEqual([]);
  });

  it('names new profiles after the preset without clashing', () => {
    const a = newProfile('deepseek');
    const b = newProfile('deepseek', [a.name]);
    expect(a.name).toBe('DeepSeek');
    expect(b.name).toBe('DeepSeek 2');
    expect(a.id).not.toBe(b.id);
    expect(presetFor(a)?.id).toBe('deepseek');
  });

  it('validates what would break a request', () => {
    const ok = newProfile('deepseek');
    expect(validateProfile(ok)).toEqual([]);
    const bad = {
      ...ok,
      name: ' ',
      baseUrl: 'ftp://x',
      model: '',
      temperature: 3,
      maxTokens: 1.5,
      timeoutSec: 1,
      extraBody: '[1]',
    };
    expect(validateProfile(bad)).toHaveLength(7);
    const twin = { ...ok, id: 'other' };
    expect(validateProfile(twin, [ok, twin])).toEqual(['配置名称重复']);
  });
});
