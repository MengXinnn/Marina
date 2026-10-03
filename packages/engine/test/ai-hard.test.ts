import { describe, expect, it } from 'vitest';
import {
  SHARES_PER_WARE,
  WARES,
  applyAction,
  chooseBotAction,
  chooseHardAction,
  createGame,
  determinize,
  getLegalActions,
  getPlayerView,
  type GameState,
} from '../src/index';

function lcg(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const actor = (s: GameState) => ('playerId' in s.pending ? s.pending.playerId : '');

/** A 4-player game advanced `steps` actions by normal bots. */
function midGame(seed: number, steps: number): GameState {
  let state = createGame({
    players: (['red', 'blue', 'orange', 'purple'] as const).map((color, i) => ({
      name: `P${i}`,
      color,
    })),
    seed,
  });
  const random = lcg(seed);
  for (let i = 0; i < steps && state.phase !== 'game-over'; i++) {
    const me = actor(state);
    const action = chooseBotAction(getPlayerView(state, me), getLegalActions(state, me), {
      level: 'normal',
      random,
    });
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(result.error.code);
    state = result.state;
  }
  return state;
}

describe('hard computer player', () => {
  it('R1.2 imagines hidden shares only from the shares it cannot see', () => {
    const state = midGame(3, 20);
    const me = actor(state);
    const world = determinize(getPlayerView(state, me), 99);
    // Its own hand and everything public are untouched.
    expect(world.players.find((p) => p.id === me)!.shares).toEqual(
      state.players.find((p) => p.id === me)!.shares,
    );
    expect(world.punts).toEqual(state.punts);
    expect(world.market).toEqual(state.market);
    // Every ware still adds up to SHARES_PER_WARE, and each opponent keeps their share count.
    for (const w of WARES) {
      const held = world.players.flatMap((p) => p.shares).filter((s) => s.ware === w).length;
      expect(held + world.shareSupply[w]).toBe(SHARES_PER_WARE);
    }
    for (const p of state.players)
      expect(world.players.find((q) => q.id === p.id)!.shares).toHaveLength(p.shares.length);
  });

  it('R1.6 only ever returns a legal action, deterministically for a given random source', () => {
    for (const [seed, steps] of [
      [1, 0],
      [2, 9],
      [4, 14],
      [5, 25],
      [6, 40],
    ] as const) {
      const state = midGame(seed, steps);
      const me = actor(state);
      const view = getPlayerView(state, me);
      const legal = getLegalActions(state, me);
      const options = { random: lcg(seed), rollouts: 4 };
      const action = chooseHardAction(view, legal, options);
      expect(legal).toContainEqual(action);
      expect(chooseHardAction(view, legal, { random: lcg(seed), rollouts: 4 })).toEqual(action);
    }
  });
});
