import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Action, GameState, PlayerId } from '@manila/engine';

/**
 * A two-seat fake engine: p1 (human) and p2 alternate a single "pass" decision.
 * Enough to exercise the store's bot driver, undo and partial-engine handling
 * before the real state machine lands.
 */
const fake = vi.hoisted(() => ({ applyThrows: false }));

vi.mock('@manila/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('@manila/engine')>();
  const make = (turn: number, actor: PlayerId) =>
    ({
      turn,
      phase: 'placement',
      players: [
        {
          id: 'p1',
          name: 'A',
          color: 'red',
          cash: 30,
          shares: [],
          accomplices: 3,
          accomplicesPlaced: 0,
          passedPlacement: false,
        },
        {
          id: 'p2',
          name: 'B',
          color: 'blue',
          cash: 30,
          shares: [],
          accomplices: 3,
          accomplicesPlaced: 0,
          passedPlacement: false,
        },
      ],
      pending: { type: 'place-accomplice', playerId: actor, round: 1, blindPassenger: false },
      punts: [],
    }) as unknown as GameState;
  const other = (id: string) => (id === 'p1' ? 'p2' : 'p1');
  return {
    ...real,
    createGame: () => make(0, 'p1'),
    getPlayerView: (state: GameState, viewer: PlayerId | null) => ({ ...state, viewer }),
    getLegalActions: (state: GameState, id: PlayerId): Action[] =>
      'playerId' in state.pending && state.pending.playerId === id
        ? [{ type: 'pass-placement', playerId: id }]
        : [],
    applyAction: (state: GameState, action: Action) => {
      if (fake.applyThrows) throw new real.NotImplementedError('applyAction');
      return { ok: true, state: make(state.turn + 1, other(action.playerId)), events: [] };
    },
  };
});

const { useGame } = await import('../src/game/store');

const humanPass: Action = { type: 'pass-placement', playerId: 'p1' };

describe('store: computer players', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fake.applyThrows = false;
    useGame.getState().startGame({ players: [] }, { p2: 'normal' });
  });

  it('boots in live mode when the read-side API works', () => {
    expect(useGame.getState().mode).toBe('live');
  });

  it('waits for the human, then lets the computer act on its own', async () => {
    vi.advanceTimersByTime(5000);
    expect(useGame.getState().state.turn).toBe(0); // p1 is human: nothing happens

    useGame.getState().dispatch(humanPass);
    await vi.waitFor(() => expect(useGame.getState().state.turn).toBe(1)); // now p2 (bot) to act
    vi.advanceTimersByTime(2000);
    await vi.waitFor(() => expect(useGame.getState().state.turn).toBe(2)); // bot passed, back to p1
    vi.advanceTimersByTime(5000);
    expect(useGame.getState().state.turn).toBe(2);
  });

  it('undo steps back over computer turns to the last human decision', async () => {
    useGame.getState().dispatch(humanPass);
    vi.advanceTimersByTime(2000);
    await vi.waitFor(() => expect(useGame.getState().state.turn).toBe(2));
    useGame.getState().undo();
    const s = useGame.getState().state;
    expect(s.turn).toBe(0);
    expect('playerId' in s.pending && s.pending.playerId).toBe('p1');
  });

  it('keeps running when the engine throws NotImplementedError mid-game', () => {
    fake.applyThrows = true;
    expect(() => useGame.getState().dispatch(humanPass)).not.toThrow();
    expect(useGame.getState().notice).toBe('engine-pending');
    expect(useGame.getState().state.turn).toBe(0);
  });
});
