import { expect } from 'vitest';
import { applyAction, createGame, getLegalActions, replay, WARES } from '../src/index';
import type { Action, GameEvent, GameState } from '../src/index';
import { actor, config, step } from './helpers';

function cashDelta(events: GameEvent[]): number {
  return events.reduce((sum, e) => {
    switch (e.type) {
      case 'loan-taken':
        return sum + e.amount;
      case 'loan-repaid':
        return sum - e.amount;
      case 'harbor-master-elected':
      case 'share-bought':
        return sum - e.price;
      case 'accomplice-placed':
        return sum - e.cost;
      case 'payout':
        return sum + (e.source === 'bank' ? e.amount : 0);
      case 'repair-paid':
        return sum - (e.payer !== 'bank' && e.to === 'bank' ? e.amount : 0);
      default:
        return sum;
    }
  }, 0);
}

function invariants(state: GameState): void {
  expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  for (const p of state.players) {
    expect(p.cash).toBeGreaterThanOrEqual(0);
    expect(Number.isSafeInteger(p.cash)).toBe(true);
    expect(p.accomplicesPlaced).toBeGreaterThanOrEqual(0);
    expect(p.accomplicesPlaced).toBeLessThanOrEqual(p.accomplices);
    const seated = state.punts
      .flatMap((punt) => punt.seats)
      .filter((s) => s.occupant === p.id).length;
    const onBoard =
      [...Object.values(state.port), ...Object.values(state.shipyard)].filter(
        (s) => s.occupant === p.id,
      ).length +
      [...Object.values(state.pirates), ...Object.values(state.pilots), state.insurance].filter(
        (id) => id === p.id,
      ).length;
    expect(p.accomplicesPlaced).toBe(seated + onBoard);
  }
  for (const ware of WARES)
    expect(
      state.shareSupply[ware] +
        state.players.flatMap((p) => p.shares).filter((s) => s.ware === ware).length,
    ).toBe(5);
  expect(new Set(state.players.flatMap((p) => p.shares.map((s) => s.id))).size).toBe(
    state.players.reduce((n, p) => n + p.shares.length, 0),
  );
}

/** Reproducible test-side policy RNG is separate from the engine's RNG. */
export function runPlayouts(seeds: number[], exhaustive = false): void {
  for (const count of [3, 4, 5])
    for (const seed of seeds) {
      const cfg = { ...config(count), seed, rules: { pirateDisplace: seed % 2 === 1 } };
      let state = createGame(cfg);
      let policy = seed + 1;
      const random = () => {
        policy = (Math.imul(policy, 1664525) + 1013904223) >>> 0;
        return policy / 4294967296;
      };
      const actions: Action[] = [];
      const events: GameEvent[][] = [];
      for (let i = 0; state.phase !== 'game-over'; i++) {
        if (i >= 3000)
          throw new Error(
            `Game stalled: seed=${seed}, players=${count}, pending=${JSON.stringify(state.pending)}`,
          );
        const before = JSON.stringify(state);
        const legal = getLegalActions(state, actor(state));
        expect(legal.length).toBeGreaterThan(0);
        if (exhaustive)
          for (const action of legal)
            expect(applyAction(state, action).ok, JSON.stringify(action)).toBe(true);
        const financial = state.players.flatMap((p) =>
          getLegalActions(state, p.id).filter((a) => ['take-loan', 'repay-loan'].includes(a.type)),
        );
        const progress = legal.filter((a) => !['take-loan', 'repay-loan'].includes(a.type));
        // Financial actions are legal but can loop indefinitely; sample them while
        // ensuring most steps consume a game decision.
        const candidates = financial.length && random() < 0.15 ? financial : progress;
        const action = candidates[Math.floor(random() * candidates.length)];
        const result = step(state, action);
        expect(JSON.stringify(state)).toBe(before);
        const cash = (s: GameState) => s.players.reduce((n, p) => n + p.cash, 0);
        expect(cash(result.state) - cash(state), `seed ${seed} action ${i}`).toBe(
          cashDelta(result.events),
        );
        state = JSON.parse(JSON.stringify(result.state)) as GameState;
        invariants(state);
        actions.push(action);
        events.push(result.events);
      }
      expect(state.result?.winners.length).toBeGreaterThan(0);
      expect(replay(cfg, actions)).toEqual({ state, events });
    }
}
