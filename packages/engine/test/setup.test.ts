import { describe, expect, it } from 'vitest';
import type { GameConfig } from '../src/index';
import { initialState } from '../src/setup';
import { random } from '../src/rng';
import { copy, scores } from '../src/rules/state';

const config: GameConfig = {
  players: [
    { name: 'A', color: 'red' },
    { name: 'B', color: 'blue' },
    { name: 'C', color: 'orange' },
  ],
  seed: 123,
};

describe('R1 deterministic setup foundation', () => {
  it('R1.1–R1.4 deals from the 12-card pool with opaque stable ids', () => {
    const before = copy(config);
    const state = initialState(config);
    expect(config).toEqual(before);
    expect(state.players.map((p) => [p.id, p.cash, p.accomplices, p.shares.length])).toEqual([
      ['p1', 30, 4, 2],
      ['p2', 30, 4, 2],
      ['p3', 30, 4, 2],
    ]);
    expect(new Set(state.players.flatMap((p) => p.shares.map((s) => s.id))).size).toBe(6);
    for (const [ware, supply] of Object.entries(state.shareSupply)) {
      expect(supply).toBe(
        5 - state.players.flatMap((p) => p.shares).filter((s) => s.ware === ware).length,
      );
      expect(supply).toBeGreaterThanOrEqual(2);
    }
    expect(Object.values(state.market)).toEqual([0, 0, 0, 0]);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('R1.6 seed and serialized RNG restore the same continuation', () => {
    expect(initialState(config)).toEqual(initialState(config));
    expect(initialState({ ...config, seed: 124 }).players).not.toEqual(
      initialState(config).players,
    );
    const rng = initialState(config).rng;
    for (let i = 0; i < 10; i++) random(rng);
    const restored = copy(rng);
    expect(Array.from({ length: 20 }, () => random(rng))).toEqual(
      Array.from({ length: 20 }, () => random(restored)),
    );
    expect(rng).toEqual(restored);
  });

  it('R1.6 debug deal is copied and invalid configurations fail early', () => {
    const debug: GameConfig = {
      ...config,
      debug: {
        deal: [
          ['jade', 'jade'],
          ['silk', 'nutmeg'],
          ['ginseng', 'jade'],
        ],
      },
    };
    expect(initialState(debug).players[0].shares.map((s) => s.ware)).toEqual(['jade', 'jade']);
    expect(() => initialState({ ...config, players: [] })).toThrow();
    expect(() => initialState({ ...config, seed: NaN })).toThrow();
    expect(() =>
      initialState({
        ...debug,
        debug: {
          deal: [
            ['jade', 'jade'],
            ['jade', 'jade'],
            ['jade', 'jade'],
          ],
        },
      }),
    ).toThrow();
    expect(() => initialState({ ...config, debug: { dice: [{ jade: 7 }] } })).toThrow();
  });

  it('R9.2 counts all shares and subtracts the repayment debt', () => {
    const state = initialState(config);
    state.market = { ginseng: 5, nutmeg: 5, silk: 5, jade: 5 };
    state.players[0].shares[0].mortgaged = true;
    expect(scores(state)[0]).toEqual({
      playerId: 'p1',
      cash: 30,
      shareValue: 10,
      mortgagePenalty: 15,
      total: 25,
    });
  });
});
