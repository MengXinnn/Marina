import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '@manila/engine';

/**
 * Language-model seats driven through the real engine and the real store, with fetch faked.
 * p1 opens the first auction (R3.1), so a p1 AI seat acts as soon as the game starts.
 */

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
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
  setTimeout(() => cb(performance.now()), 0),
);

const { useGame, LLM_MAX_FAILURES } = await import('../src/game/store');
const { newProfile, useLlmSettings } = await import('../src/llm/settings');

const profile = { ...newProfile('deepseek'), apiKey: 'sk-test' };
const config = {
  players: [
    { name: '小红', color: 'red' as const },
    { name: '阿蓝', color: 'blue' as const },
    { name: '橙子', color: 'orange' as const },
  ],
  seed: 5,
};

type Reply = (prompt: string, signal: AbortSignal) => Promise<Response> | Response;
let reply: Reply;
const prompts: string[] = [];

const answer = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }));

const hang: Reply = (_p, signal) =>
  new Promise((_, reject) =>
    signal.addEventListener('abort', () => reject(new DOMException('', 'AbortError'))),
  );

const actor = (s: GameState) => ('playerId' in s.pending ? s.pending.playerId : null);
const game = () => useGame.getState();

beforeEach(() => {
  prompts.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { messages: Array<{ content: string }> };
      prompts.push(body.messages.at(-1)!.content);
      return reply(prompts.at(-1)!, init.signal!);
    }),
  );
  useLlmSettings.getState().save({ profiles: [profile], showReasons: true });
  game().setSettings({ speed: 4 });
});

afterEach(() => game().backToSetup());

describe('store: language-model seats', () => {
  it('plays the move the model picks and logs its reason', async () => {
    reply = () => answer('{"move": "bid 2", "reason": "便宜试试"}');
    game().startGame(config, { p1: { llm: profile.id } });
    await vi.waitFor(() =>
      expect(game().state.auction?.highBid).toEqual({ playerId: 'p1', amount: 2 }),
    );
    expect(prompts[0]).toContain('你是 小红（p1）');
    expect(game().log.map((l) => l.text)).toContain('小红：「便宜试试」');
    expect(game().llmStats.p1).toMatchObject({ decisions: 1, fallbacks: 0, streak: 0 });
    // p2 is human: nothing else is asked.
    await vi.waitFor(() => expect(game().playing).toBe(false));
    expect(prompts).toHaveLength(1);
  });

  it('lets the built-in computer move after two unusable replies', async () => {
    reply = () => answer('嗯……我想想');
    game().startGame(config, { p1: { llm: profile.id } });
    await vi.waitFor(() => expect(game().state.turn).toBe(1));
    expect(prompts).toHaveLength(2); // the first try plus one correction
    expect(prompts[1]).toContain('无法执行');
    expect(game().llmStats.p1).toMatchObject({ decisions: 0, fallbacks: 1, streak: 1 });
    expect(game().log.some((l) => l.text.includes('由内置电脑代走'))).toBe(true);
    expect(game().notice).toContain('内置电脑代走');
  });

  it(`hands a seat to the built-in computer after ${LLM_MAX_FAILURES} failures in a row`, async () => {
    reply = () => new Response('{"error":{"message":"bad key"}}', { status: 401 });
    const seats = { p1: { llm: profile.id }, p2: { llm: profile.id }, p3: { llm: profile.id } };
    game().startGame(config, seats);
    await vi.waitFor(() => expect(game().llmStats.p1?.streak).toBe(LLM_MAX_FAILURES), {
      timeout: 15000,
    });
    const asked = prompts.filter((p) => p.includes('你是 小红（p1）')).length;
    expect(asked).toBe(LLM_MAX_FAILURES);
    // Later p1 decisions go straight to the built-in computer…
    const turn = game().state.turn;
    await vi.waitFor(() => expect(game().state.turn).toBeGreaterThan(turn + 6), { timeout: 15000 });
    expect(prompts.filter((p) => p.includes('你是 小红（p1）')).length).toBe(asked);
    // …until the AI settings are saved again.
    reply = () => answer('{"move": "pass"}');
    game().retryLlmSeats();
    expect(game().llmStats.p1?.streak).toBe(0);
  }, 40000);

  it('stops waiting when the humans take over', async () => {
    reply = hang;
    game().startGame(config, { p1: { llm: profile.id } });
    await vi.waitFor(() => expect(game().llmThinking?.playerId).toBe('p1'));
    game().llmTakeOver();
    await vi.waitFor(() => expect(game().state.turn).toBe(1));
    expect(game().llmThinking).toBeNull();
    expect(game().llmStats.p1).toMatchObject({ fallbacks: 1, streak: 0 });
    expect(game().notice).toBeNull();
  });

  it('cancels the request on undo', async () => {
    reply = hang;
    game().startGame(config, { p2: { llm: profile.id } });
    game().dispatch({ type: 'bid', playerId: 'p1', amount: 1 });
    // The request starts while the bid animates.
    await vi.waitFor(() => expect(prompts).toHaveLength(1));
    const signal = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal!;
    await vi.waitFor(() => expect(game().playing).toBe(false));
    game().undo();
    expect(signal.aborted).toBe(true);
    expect(actor(game().state)).toBe('p1');
    expect(game().llmThinking).toBeNull();
  });

  it('falls back when the seat points at a deleted profile', async () => {
    game().startGame(config, { p1: { llm: 'gone' } });
    await vi.waitFor(() => expect(game().state.turn).toBe(1));
    expect(prompts).toHaveLength(0);
    expect(game().llmStats.p1?.fallbacks).toBe(1);
  });
});
