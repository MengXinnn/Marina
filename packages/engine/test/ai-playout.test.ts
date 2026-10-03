import { describe, expect, it } from 'vitest';
import {
  applyAction,
  chooseBotAction,
  createGame,
  getLegalActions,
  getPlayerView,
  type BotLevel,
  type GameState,
  type PlayerColor,
} from '../src/index';

/** Deterministic [0,1) source for the bots (separate from the engine RNG). */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const COLORS: PlayerColor[] = ['red', 'blue', 'orange', 'purple', 'white'];
const MAX_ACTIONS = 5000;

/** Play one whole game with computer players only, through the public engine API. */
function playout(levels: BotLevel[], seed: number): GameState {
  let state = createGame({
    players: levels.map((_, i) => ({ name: `bot${i + 1}`, color: COLORS[i]! })),
    seed,
  });
  const random = lcg(seed * 7919 + levels.length);
  for (let n = 0; n < MAX_ACTIONS && state.phase !== 'game-over'; n++) {
    const pending = state.pending;
    if (!('playerId' in pending)) break;
    const bot = pending.playerId;
    const level = levels[Number(bot.slice(1)) - 1]!;
    const action = chooseBotAction(getPlayerView(state, bot), getLegalActions(state, bot), {
      level,
      random,
    });
    const result = applyAction(state, action);
    if (!result.ok)
      throw new Error(`seed ${seed}: ${result.error.code} for ${JSON.stringify(action)}`);
    state = result.state;
  }
  return state;
}

describe('ai/playout against the real engine', () => {
  it('R9.2 computer players finish complete 3–5 player games with only legal actions', () => {
    for (const count of [3, 4, 5])
      for (let seed = 1; seed <= 20; seed++) {
        const levels = Array.from({ length: count }, (_, i): BotLevel =>
          i % 2 ? 'easy' : 'normal',
        );
        const end = playout(levels, seed);
        expect(end.phase, `seed ${seed}, ${count} players`).toBe('game-over');
        expect(end.result?.winners.length).toBeGreaterThan(0);
        for (const p of end.players) expect(p.cash).toBeGreaterThanOrEqual(0);
      }
  }, 30_000); // 60 full games: allow slower CI runners

  it('R9.3 normal bots outscore easy bots over many seeded games', () => {
    let normalWins = 0;
    let easyWins = 0;
    for (let seed = 1; seed <= 60; seed++) {
      // Alternate seating so neither level always opens the first auction.
      const levels: BotLevel[] =
        seed % 2 ? ['normal', 'easy', 'normal', 'easy'] : ['easy', 'normal', 'easy', 'normal'];
      const end = playout(levels, seed);
      for (const id of end.result!.winners) {
        if (levels[Number(id.slice(1)) - 1] === 'normal') normalWins++;
        else easyWins++;
      }
    }
    expect(normalWins).toBeGreaterThan(easyWins);
  }, 30_000);
});
