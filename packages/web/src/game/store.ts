import { useMemo } from 'react';
import { create } from 'zustand';
import {
  NotImplementedError,
  applyAction,
  createGame,
  getLegalActions,
  getPlayerView,
  type Action,
  type EngineError,
  type GameConfig,
  type GameEvent,
  type GameState,
  type PendingDecision,
  type PlayerId,
  type PlayerView,
} from '@manila/engine';
import { createMockState, mockView } from './mock';

export type EngineMode = 'live' | 'mock';

export const DEFAULT_CONFIG: GameConfig = {
  players: [
    { name: '小红', color: 'red' },
    { name: '阿蓝', color: 'blue' },
    { name: '橙子', color: 'orange' },
    { name: '紫苏', color: 'purple' },
  ],
};

/** Try the real engine; stay in mock mode while its functions are still stubs. */
function boot(): { mode: EngineMode; state: GameState } {
  try {
    return { mode: 'live', state: createGame(DEFAULT_CONFIG) };
  } catch (e) {
    if (e instanceof NotImplementedError) return { mode: 'mock', state: createMockState() };
    throw e;
  }
}

interface GameStore {
  mode: EngineMode;
  state: GameState;
  /** Previous states for undo (engine is pure, so this is all undo needs). */
  history: GameState[];
  /** Events of the last applied action, consumed by the animation layer. */
  events: GameEvent[];
  lastError: EngineError | null;
  /** Short-lived message for the toast. */
  notice: string | null;
  dispatch(action: Action): void;
  undo(): void;
  notify(message: string | null): void;
  /** Mock mode only: preview another decision panel. */
  setMockPending(pending: PendingDecision): void;
}

const initial = boot();

export const useGame = create<GameStore>((set, get) => ({
  mode: initial.mode,
  state: initial.state,
  history: [],
  events: [],
  lastError: null,
  notice: initial.mode === 'mock' ? 'mock' : null,
  dispatch(action) {
    const { mode, state, history } = get();
    if (mode === 'mock') {
      set({ notice: 'engine-pending' });
      return;
    }
    const result = applyAction(state, action);
    if (!result.ok) {
      set({ lastError: result.error, notice: result.error.code });
      return;
    }
    set({
      state: result.state,
      history: [...history, state],
      events: result.events,
      lastError: null,
    });
  },
  undo() {
    const { history } = get();
    const prev = history[history.length - 1];
    if (prev) set({ state: prev, history: history.slice(0, -1), events: [] });
  },
  notify(message) {
    set({ notice: message });
  },
  setMockPending(pending) {
    if (get().mode !== 'mock') return;
    set((s) => ({ state: { ...s.state, pending, turn: s.state.turn + 1 } }));
  },
}));

/** The player whose private info is shown: hotseat shows the player who must act. */
export function viewerOf(state: GameState): PlayerId | null {
  return 'playerId' in state.pending ? state.pending.playerId : null;
}

export function useView(): PlayerView {
  const mode = useGame((s) => s.mode);
  const state = useGame((s) => s.state);
  return useMemo(() => {
    const viewer = viewerOf(state);
    return mode === 'live' ? getPlayerView(state, viewer) : mockView(state, viewer);
  }, [mode, state]);
}

/** Legal actions of the acting player (empty in mock mode). */
export function legalActionsFor(state: GameState, mode: EngineMode): Action[] {
  const viewer = viewerOf(state);
  if (mode === 'mock' || !viewer) return [];
  return getLegalActions(state, viewer);
}
