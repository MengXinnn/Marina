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
  type Ware,
} from '@manila/engine';
import { playStep } from '../audio/sfx';
import { describeEvent } from '../i18n/zh';
import { createMockState, mockDemoScript, mockView } from './mock';
import { patchDisplay } from './present';
import { clearSave, loadSave, writeSave } from './save';

export type EngineMode = 'live' | 'mock';
export type Screen = 'setup' | 'game';

export const DEFAULT_CONFIG: GameConfig = {
  players: [
    { name: '小红', color: 'red' },
    { name: '阿蓝', color: 'blue' },
    { name: '橙子', color: 'orange' },
    { name: '紫苏', color: 'purple' },
  ],
};

export interface Settings {
  /** Hotseat privacy: hide share wares until the acting player confirms they hold the device. */
  privacy: boolean;
  /** Animation speed multiplier. */
  speed: 1 | 2 | 4;
}

export interface LogLine {
  id: number;
  text: string;
}
export interface Floater {
  id: number;
  playerId: PlayerId;
  amount: number;
}
export interface DiceShow {
  id: number;
  values: Partial<Record<Ware, number>>;
}

interface GameStore {
  mode: EngineMode;
  screen: Screen;
  /** Engine truth. */
  state: GameState;
  /** What the board currently shows; lags behind `state` while events animate. */
  display: GameState;
  /** Previous states for undo (the engine is pure and the RNG lives in the state, so undo is safe). */
  history: GameState[];
  playing: boolean;
  skip: boolean;
  log: LogLine[];
  floaters: Floater[];
  dice: DiceShow | null;
  settings: Settings;
  /** Hotseat: the player who confirmed holding the device. */
  revealedFor: PlayerId | null;
  lastError: EngineError | null;
  notice: string | null;

  startGame(config: GameConfig): void;
  resumeSaved(): boolean;
  backToSetup(): void;
  dispatch(action: Action): void;
  undo(): void;
  reveal(): void;
  skipAnimation(): void;
  setSettings(patch: Partial<Settings>): void;
  notify(message: string | null): void;
  /** Mock mode only: preview another decision panel. */
  setMockPending(pending: PendingDecision): void;
  /** Mock mode only: play a scripted voyage to exercise the animation layer. */
  playMockDemo(): Promise<void>;
}

// ───────────── boot ─────────────

function boot(): { mode: EngineMode; state: GameState } {
  try {
    return { mode: 'live', state: createGame(DEFAULT_CONFIG) };
  } catch (e) {
    if (e instanceof NotImplementedError) return { mode: 'mock', state: createMockState() };
    throw e;
  }
}

const initial = boot();

// ───────────── animation timing ─────────────

/** Animation timings (ms at speed ×1). Scene components use the same values to stay in sync. */
export const ANIM_MS = {
  hop: 260,
  dice: 1500,
  dock: 650,
  place: 420,
  money: 260,
  market: 450,
  voyageEnd: 1100,
  plunder: 900,
  board: 600,
  load: 900,
  other: 160,
};

/** Consecutive punt moves play together; everything else plays one by one. */
function groupSteps(events: GameEvent[]): GameEvent[][] {
  const steps: GameEvent[][] = [];
  for (const e of events) {
    const last = steps[steps.length - 1];
    if (e.type === 'punt-moved' && last?.[0]?.type === 'punt-moved') last.push(e);
    else steps.push([e]);
  }
  return steps;
}

function stepDuration(step: GameEvent[]): number {
  const e = step[0]!;
  switch (e.type) {
    case 'punt-moved':
      return (
        Math.max(...step.map((m) => (m.type === 'punt-moved' ? Math.abs(m.to - m.from) : 0))) *
          ANIM_MS.hop +
        150
      );
    case 'dice-rolled':
      return ANIM_MS.dice;
    case 'punt-docked':
      return ANIM_MS.dock;
    case 'accomplice-placed':
      return ANIM_MS.place;
    case 'payout':
    case 'repair-paid':
    case 'loan-taken':
    case 'loan-repaid':
      return ANIM_MS.money;
    case 'market-rose':
      return ANIM_MS.market;
    case 'voyage-ended':
      return ANIM_MS.voyageEnd;
    case 'punt-plundered':
      return ANIM_MS.plunder;
    case 'pirate-boarded':
      return ANIM_MS.board;
    case 'punts-loaded':
      return ANIM_MS.load;
    default:
      return ANIM_MS.other;
  }
}

function moneyFloaters(e: GameEvent): Array<{ playerId: PlayerId; amount: number }> {
  switch (e.type) {
    case 'payout':
      return [
        { playerId: e.playerId, amount: e.amount },
        ...(e.source !== 'bank' ? [{ playerId: e.source, amount: -e.amount }] : []),
      ];
    case 'repair-paid':
      return [
        ...(e.payer !== 'bank' ? [{ playerId: e.payer, amount: -e.amount }] : []),
        ...(e.to !== 'bank' ? [{ playerId: e.to, amount: e.amount }] : []),
      ];
    case 'accomplice-placed':
      return e.cost ? [{ playerId: e.playerId, amount: -e.cost }] : [];
    case 'harbor-master-elected':
      return e.price ? [{ playerId: e.playerId, amount: -e.price }] : [];
    case 'share-bought':
      return [{ playerId: e.playerId, amount: -e.price }];
    case 'loan-taken':
      return [{ playerId: e.playerId, amount: e.amount }];
    case 'loan-repaid':
      return [{ playerId: e.playerId, amount: -e.amount }];
    default:
      return [];
  }
}

let nextId = 1;
let runToken = 0;

function wait(ms: number, cancelled: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (cancelled() || performance.now() - start >= ms) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// ───────────── store ─────────────

export const useGame = create<GameStore>((set, get) => {
  const nameOf = (id: string) =>
    get().display.players.find((p) => p.id === id)?.name ??
    get().state.players.find((p) => p.id === id)?.name ??
    id;

  /** Play events on top of the current display, then snap to the engine's final state. */
  async function animate(events: GameEvent[], finalState: GameState): Promise<void> {
    const token = ++runToken;
    const cancelled = () => token !== runToken || get().skip;
    set({ playing: true, skip: false });
    let display = get().display;
    for (const step of groupSteps(events)) {
      const lines: LogLine[] = [];
      const floaters: Floater[] = [];
      let dice = get().dice;
      for (const e of step) {
        display = patchDisplay(display, e);
        const text = describeEvent(e, nameOf);
        if (text) lines.push({ id: nextId++, text });
        for (const f of moneyFloaters(e)) floaters.push({ id: nextId++, ...f });
        if (e.type === 'dice-rolled') dice = { id: nextId++, values: e.values };
      }
      set((s) => ({
        display,
        dice,
        log: [...s.log, ...lines].slice(-80),
        floaters: cancelled() ? s.floaters : [...s.floaters, ...floaters],
      }));
      if (floaters.length) {
        const ids = new Set(floaters.map((f) => f.id));
        setTimeout(
          () => set((s) => ({ floaters: s.floaters.filter((f) => !ids.has(f.id)) })),
          1600,
        );
      }
      if (!cancelled()) {
        const speed = get().settings.speed;
        playStep(step, ANIM_MS.hop / speed);
        await wait(stepDuration(step) / speed, cancelled);
      }
    }
    if (token !== runToken) return;
    set({ display: finalState, playing: false, skip: false, dice: null });
  }

  return {
    mode: initial.mode,
    screen: 'setup',
    state: initial.state,
    display: initial.state,
    history: [],
    playing: false,
    skip: false,
    log: [],
    floaters: [],
    dice: null,
    settings: { privacy: true, speed: 1 },
    revealedFor: null,
    lastError: null,
    notice: null,

    startGame(config) {
      runToken++;
      const { mode } = get();
      // The engine is pure (no hidden entropy), so a fresh game needs a seed from us.
      const seed = config.seed ?? Math.floor(Math.random() * 2 ** 31);
      const state = mode === 'live' ? createGame({ ...config, seed }) : createMockState();
      set({
        screen: 'game',
        state,
        display: state,
        history: [],
        playing: false,
        dice: null,
        floaters: [],
        log: [{ id: nextId++, text: '—— 新游戏开始 ——' }],
        revealedFor: null,
        notice: mode === 'mock' ? 'mock' : null,
      });
      if (mode === 'live') writeSave(state);
    },

    resumeSaved() {
      const saved = get().mode === 'live' ? loadSave() : null;
      if (!saved) return false;
      runToken++;
      set({
        screen: 'game',
        state: saved,
        display: saved,
        history: [],
        playing: false,
        log: [{ id: nextId++, text: '—— 继续上局 ——' }],
        revealedFor: null,
      });
      return true;
    },

    backToSetup() {
      runToken++;
      set({ screen: 'setup', playing: false, dice: null });
    },

    dispatch(action) {
      const { mode, state, history, playing } = get();
      if (playing) return;
      if (mode === 'mock') {
        set({ notice: 'engine-pending' });
        return;
      }
      const result = applyAction(state, action);
      if (!result.ok) {
        set({ lastError: result.error, notice: result.error.code });
        return;
      }
      set({ state: result.state, history: [...history, state], lastError: null });
      if (result.state.phase === 'game-over') clearSave();
      else writeSave(result.state);
      void animate(result.events, result.state);
    },

    undo() {
      const { history, playing } = get();
      const prev = history[history.length - 1];
      if (!prev || playing) return;
      runToken++;
      set({ state: prev, display: prev, history: history.slice(0, -1), dice: null });
      writeSave(prev);
    },

    reveal() {
      const p = get().display.pending;
      if ('playerId' in p) set({ revealedFor: p.playerId });
    },

    skipAnimation() {
      if (get().playing) set({ skip: true });
    },

    setSettings(patch) {
      set((s) => ({ settings: { ...s.settings, ...patch } }));
    },

    notify(message) {
      set({ notice: message });
    },

    setMockPending(pending) {
      if (get().mode !== 'mock' || get().playing) return;
      set((s) => {
        const state = { ...s.state, pending, turn: s.state.turn + 1 };
        return { state, display: state };
      });
    },

    async playMockDemo() {
      if (get().mode !== 'mock' || get().playing) return;
      const start = createMockState();
      set({ state: start, display: start, revealedFor: null, dice: null });
      for (const { events, pending, pauseMs } of mockDemoScript()) {
        let next = get().display;
        for (const e of events) next = patchDisplay(next, e);
        next = { ...next, pending, turn: next.turn + 1 };
        set({ state: next });
        await animate(events, next);
        await wait(pauseMs / get().settings.speed, () => false);
      }
    },
  };
});

// ───────────── selectors ─────────────

/** The player who must act in the displayed state. */
export function actorOf(state: GameState): PlayerId | null {
  return 'playerId' in state.pending ? state.pending.playerId : null;
}

/** Whose private info may be shown right now. */
export function useViewer(): PlayerId | null {
  const display = useGame((s) => s.display);
  const privacy = useGame((s) => s.settings.privacy);
  const revealedFor = useGame((s) => s.revealedFor);
  const actor = actorOf(display);
  if (!privacy) return actor;
  return actor && actor === revealedFor ? actor : null;
}

/** The hotseat curtain is up when the acting player has not yet confirmed they hold the device. */
export function useCurtain(): PlayerId | null {
  const screen = useGame((s) => s.screen);
  const playing = useGame((s) => s.playing);
  const display = useGame((s) => s.display);
  const privacy = useGame((s) => s.settings.privacy);
  const revealedFor = useGame((s) => s.revealedFor);
  const actor = actorOf(display);
  if (screen !== 'game' || playing || !privacy || !actor) return null;
  return actor === revealedFor ? null : actor;
}

export function useView(): PlayerView {
  const mode = useGame((s) => s.mode);
  const display = useGame((s) => s.display);
  const viewer = useViewer();
  return useMemo(
    () => (mode === 'live' ? getPlayerView(display, viewer) : mockView(display, viewer)),
    [mode, display, viewer],
  );
}

/** Legal actions of the acting player in the engine state (empty in mock mode). */
export function legalActionsFor(state: GameState, mode: EngineMode): Action[] {
  const actor = actorOf(state);
  if (mode === 'mock' || !actor) return [];
  return getLegalActions(state, actor);
}
