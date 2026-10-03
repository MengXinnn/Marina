import { describe, expect, it, vi } from 'vitest';
import {
  chooseBotAction,
  getLegalActions,
  getPlayerView,
  type Action,
  type GameState,
} from '@manila/engine';

/** Undo through the real engine and the real store, all seats human. */

vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
});
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
  setTimeout(() => cb(performance.now()), 0),
);

const { useGame, soleHuman } = await import('../src/game/store');
const game = () => useGame.getState();
const actor = (s: GameState) => ('playerId' in s.pending ? s.pending.playerId : null);

const config = {
  players: [
    { name: '小红', color: 'red' as const },
    { name: '阿蓝', color: 'blue' as const },
    { name: '橙子', color: 'orange' as const },
  ],
  seed: 11,
};

/** Play one move the way a sensible human would, and wait for the board to settle. */
async function play(): Promise<Action> {
  const s = game().state;
  const me = actor(s)!;
  const action = chooseBotAction(getPlayerView(s, me), getLegalActions(s, me), {
    level: 'normal',
    random: () => 0.5,
  });
  game().dispatch(action);
  game().skipAnimation();
  await vi.waitFor(() => expect(game().playing).toBe(false));
  return action;
}

describe('store: undo', () => {
  it('R1.6/R5.7 undo never steps back over a dice roll', async () => {
    game().startGame(config);
    let rolled = false;
    for (let i = 0; i < 200 && !rolled; i++) {
      const before = game().history.length;
      const action = await play();
      if (action.type === 'roll-dice') {
        rolled = true;
        // Rolling again from an earlier state would give the same dice.
        expect(game().history).toEqual([]);
      } else {
        expect(game().history.length).toBe(before + 1);
      }
    }
    expect(rolled).toBe(true);

    // Undo still works for decisions made after the roll.
    const afterRoll = game().state;
    await play();
    game().undo();
    expect(game().state).toBe(afterRoll);
    expect(game().history).toEqual([]);
  });
});

describe('store: hotseat privacy', () => {
  it('treats a lone human among computers as the only viewer', () => {
    game().startGame(config, { p2: 'normal', p3: 'easy' });
    expect(soleHuman(game().state, game().bots)).toBe('p1');
    game().startGame(config, { p3: 'normal' });
    expect(soleHuman(game().state, game().bots)).toBeNull();
    game().startGame(config, { p1: 'normal', p2: 'normal', p3: 'normal' });
    expect(soleHuman(game().state, game().bots)).toBeNull();
  });
});

describe('store: hard computer seats', () => {
  it('R1.6 hard seats play legal moves on their own (inline when no Worker exists)', async () => {
    vi.useFakeTimers();
    game().startGame(config, { p1: 'hard', p2: 'hard', p3: 'hard' });
    for (let i = 0; i < 400 && game().state.turn < 6; i++) {
      game().skipAnimation();
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(game().state.turn).toBeGreaterThanOrEqual(6);
    expect(game().botStalled).toBeNull();
    vi.useRealTimers();
  });
});
