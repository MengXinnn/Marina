import { describe, expect, it, vi } from 'vitest';
import {
  STARTING_CASH,
  applyAction,
  chooseBotAction,
  computeScores,
  createGame,
  getLegalActions,
  getPlayerView,
  type Action,
  type GameConfig,
  type GameState,
} from '@manila/engine';

vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
  setTimeout(() => cb(performance.now()), 0),
);

const { gameStats, LEDGER_KEYS } = await import('../src/game/stats');
const { useGame } = await import('../src/game/store');

const config: GameConfig = {
  players: [
    { name: '小红', color: 'red' },
    { name: '阿蓝', color: 'blue' },
    { name: '橙子', color: 'orange' },
    { name: '紫苏', color: 'purple' },
  ],
  seed: 21,
};

function botMove(state: GameState, random: () => number): Action {
  const me = 'playerId' in state.pending ? state.pending.playerId : '';
  return chooseBotAction(getPlayerView(state, me), getLegalActions(state, me), {
    level: 'normal',
    random,
  });
}

function playGame(): { final: GameState; actions: Action[] } {
  let state = createGame(config);
  const actions: Action[] = [];
  let i = 0;
  const random = () => ((i * 9301 + 49297) % 233280) / 233280;
  while (state.phase !== 'game-over' && i < 2000) {
    const action = botMove(state, random);
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(result.error.code);
    state = result.state;
    actions.push(action);
    i++;
  }
  return { final: state, actions };
}

describe('game statistics', () => {
  const { final, actions } = playGame();
  const stats = gameStats(final.config, actions)!;

  it('R9.2 charts every voyage and ends on the final fortunes', () => {
    expect(final.phase).toBe('game-over');
    expect(stats.voyageStarts).toHaveLength(final.voyage);
    expect(stats.fortunes).toHaveLength(final.voyage + 1);
    const last = stats.fortunes[stats.fortunes.length - 1]!;
    for (const s of computeScores(final)) expect(last[s.playerId]).toBe(s.total);
  });

  it('R8 books every peso: starting cash plus the ledger is the final cash', () => {
    for (const p of final.players) {
      const ledger = stats.ledgers[p.id]!;
      const sum = LEDGER_KEYS.reduce((n, k) => n + ledger[k], 0);
      expect(STARTING_CASH + sum).toBe(p.cash);
    }
  });

  it('returns null when the actions do not replay', () => {
    expect(gameStats(final.config, [actions[1]!])).toBeNull();
  });

  it('R1.6 replays a finished game from a chosen voyage and returns to the standings', async () => {
    vi.useFakeTimers();
    const game = () => useGame.getState();
    game().startGame(config);
    // Play the recorded game through the store so it records the same actions.
    for (const action of actions) {
      game().dispatch(action);
      game().skipAnimation();
      await vi.runAllTimersAsync();
    }
    expect(game().state.phase).toBe('game-over');
    expect(game().actions).toEqual(actions);

    game().startReplay(2);
    expect(game().replay?.index).toBe(stats.voyageStarts[1]);
    expect(game().state.voyage).toBe(2);
    game().dispatch(actions[0]!); // input is ignored during a replay
    expect(game().replay?.index).toBe(stats.voyageStarts[1]);

    for (let guard = 0; game().replay && guard < 5000; guard++) {
      game().skipAnimation();
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(game().replay).toBeNull();
    expect(game().state).toEqual(final);
    vi.useRealTimers();
  });
});
