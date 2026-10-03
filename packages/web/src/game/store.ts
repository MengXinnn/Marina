import { useMemo } from 'react';
import { create } from 'zustand';
import {
  NotImplementedError,
  applyAction,
  chooseBotAction,
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
import { decideWithLlm, type LlmDecision } from '../llm/player';
import { LlmError } from '../llm/providers';
import { findProfile, useLlmSettings } from '../llm/settings';
import { emitFxStep } from './fx';
import { createMockState, mockDemoScript, mockView } from './mock';
import { patchDisplay } from './present';
import { clearSave, loadSave, writeSave } from './save';
import { isLlmSeat, type BotSeats } from './seats';

export type { BotSeats, ComputerSeat, LlmSeat } from './seats';

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

/** How long a computer player "thinks" before acting (ms at speed ×1). */
const BOT_THINK_MS = 750;

/** Consecutive failures after which a language-model seat is handed to the built-in computer. */
export const LLM_MAX_FAILURES = 3;

/** Public log lines (oldest first) handed to language-model seats as recent history. */
const LLM_HISTORY_LINES = 16;

/** How one language-model seat has been doing this game. */
export interface LlmSeatStats {
  /** Moves the model chose. */
  decisions: number;
  /** Moves the built-in computer played instead (failure, timeout, or nobody wanted to wait). */
  fallbacks: number;
  /** Consecutive failures; at LLM_MAX_FAILURES the seat stops asking the model. */
  streak: number;
  calls: number;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  lastError: string | null;
}

/** The language-model seat whose reply the table is waiting for. */
export interface LlmThinking {
  playerId: PlayerId;
  /** Date.now() when the request went out (it may start while the previous move animates). */
  startedAt: number;
  /** Profile name and model, for the waiting banner. */
  label: string;
}

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
  bots: BotSeats;
  /** A computer seat that could not act this turn; humans may act for it until the turn advances. */
  botStalled: PlayerId | null;
  /** Set while a language-model seat is waiting for its reply. */
  llmThinking: LlmThinking | null;
  llmStats: Partial<Record<PlayerId, LlmSeatStats>>;
  /** Public history (log lines plus AI table talk) for language-model prompts. */
  table: string[];
  lastError: EngineError | null;
  notice: string | null;

  startGame(config: GameConfig, bots?: BotSeats): void;
  resumeSaved(): boolean;
  backToSetup(): void;
  dispatch(action: Action): void;
  undo(): void;
  reveal(): void;
  skipAnimation(): void;
  setSettings(patch: Partial<Settings>): void;
  notify(message: string | null): void;
  /** Stop waiting for the language model; the built-in computer plays this move. */
  llmTakeOver(): void;
  /** After the AI settings change: give suspended language-model seats another chance. */
  retryLlmSeats(): void;
  /** Mock mode only: preview another decision panel. */
  setMockPending(pending: PendingDecision): void;
  /** Mock mode only: play a scripted voyage to exercise the animation layer. */
  playMockDemo(): Promise<void>;
}

// ───────────── boot ─────────────

function boot(): { mode: EngineMode; state: GameState } {
  try {
    const state = createGame(DEFAULT_CONFIG);
    // A partially implemented engine must not crash the UI: the read side has to work too.
    getPlayerView(state, null);
    const actor = actorOf(state);
    if (actor) getLegalActions(state, actor);
    return { mode: 'live', state };
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
      const before = display;
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
        emitFxStep({ events: step, before, after: display, speed });
        await wait(stepDuration(step) / speed, cancelled);
      }
    }
    if (token !== runToken) return;
    set({ display: finalState, playing: false, skip: false, dice: null });
    scheduleBot();
  }

  let botTimer: ReturnType<typeof setTimeout> | null = null;

  /** If a computer player must act next, let it act after a short "thinking" pause. */
  function scheduleBot(): void {
    if (botTimer) clearTimeout(botTimer);
    botTimer = null;
    const { mode, screen, playing, state, bots, settings } = get();
    const actor = actorOf(state);
    if (mode !== 'live' || screen !== 'game' || playing || !actor) return;
    const seat = bots[actor];
    if (!seat) return;
    const turn = state.turn;
    if (isLlmSeat(seat) && !llmSuspended(actor)) {
      void runLlmTurn(actor, turn);
      return;
    }
    // A suspended language-model seat is played by the built-in computer at normal level.
    const level = isLlmSeat(seat) ? 'normal' : seat;
    botTimer = setTimeout(() => {
      const s = get();
      if (s.state.turn !== turn || s.playing || s.screen !== 'game') return;
      builtInMove(actor, turn, level);
    }, BOT_THINK_MS / settings.speed);
  }

  /** The heuristic bot plays `actor`'s pending decision right now. */
  function builtInMove(actor: PlayerId, turn: number, level: 'easy' | 'normal'): void {
    const s = get();
    try {
      const action = chooseBotAction(
        getPlayerView(s.state, actor),
        getLegalActions(s.state, actor),
        { level, random: Math.random },
      );
      s.dispatch(action);
    } catch (e) {
      if (!(e instanceof NotImplementedError)) console.error(e);
    }
    // The engine refused or the bot failed: hand this decision to the humans instead of
    // leaving the seat "thinking" forever. Automation resumes once the turn advances.
    if (get().state.turn === turn) set({ botStalled: actor, notice: 'bot-stalled' });
  }

  // ───────────── language-model seats ─────────────

  type LlmOutcome =
    { ok: true; decision: LlmDecision } | { ok: false; error: string; takenOver: boolean };

  interface LlmJob {
    turn: number;
    actor: PlayerId;
    startedAt: number;
    label: string;
    ctrl: AbortController;
    /** The humans stopped waiting: the built-in computer plays this move. */
    takenOver: boolean;
    /** Replaced by a new game, an undo or a newer decision: drop the outcome. */
    cancelled: boolean;
    promise: Promise<LlmOutcome>;
  }

  /** The one request in flight. It starts as soon as the engine names an AI seat, so the
   *  model thinks while the previous move is still animating. */
  let llmJob: LlmJob | null = null;

  function llmSuspended(actor: PlayerId): boolean {
    return (get().llmStats[actor]?.streak ?? 0) >= LLM_MAX_FAILURES;
  }

  function cancelLlm(): void {
    if (llmJob) {
      llmJob.cancelled = true;
      llmJob.ctrl.abort();
    }
    llmJob = null;
    if (get().llmThinking) set({ llmThinking: null });
  }

  /** Start (or reuse) the request for the current decision if an AI seat must make it. */
  function startLlmJob(): LlmJob | null {
    const { mode, screen, state, bots } = get();
    const actor = actorOf(state);
    if (mode !== 'live' || screen !== 'game' || !actor) return null;
    const seat = bots[actor];
    if (!isLlmSeat(seat) || llmSuspended(actor)) return null;
    if (llmJob && llmJob.turn === state.turn && llmJob.actor === actor) return llmJob;
    cancelLlm();
    const profile = findProfile(seat.llm);
    if (!profile) return null;
    const job: LlmJob = {
      turn: state.turn,
      actor,
      startedAt: Date.now(),
      label: `${profile.name} · ${profile.model}`,
      ctrl: new AbortController(),
      takenOver: false,
      cancelled: false,
      promise: Promise.resolve(null as never),
    };
    job.promise = decideWithLlm({
      profile,
      view: getPlayerView(state, actor),
      legal: getLegalActions(state, actor),
      recent: get().table.slice(-LLM_HISTORY_LINES),
      signal: job.ctrl.signal,
    }).then(
      (decision): LlmOutcome => ({ ok: true, decision }),
      (e: unknown): LlmOutcome => ({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        takenOver: job.takenOver || (e instanceof LlmError && e.kind === 'aborted'),
      }),
    );
    llmJob = job;
    return job;
  }

  function bumpStats(actor: PlayerId, patch: (s: LlmSeatStats) => Partial<LlmSeatStats>): void {
    set((st) => {
      const prev: LlmSeatStats = st.llmStats[actor] ?? {
        decisions: 0,
        fallbacks: 0,
        streak: 0,
        calls: 0,
        ms: 0,
        inputTokens: 0,
        outputTokens: 0,
        lastError: null,
      };
      return { llmStats: { ...st.llmStats, [actor]: { ...prev, ...patch(prev) } } };
    });
  }

  /** Add a line to the visible log; `tell` also adds it to the history the models read. */
  function say(text: string, tell: boolean): void {
    set((st) => ({
      log: [...st.log, { id: nextId++, text }].slice(-80),
      table: tell ? [...st.table, text].slice(-40) : st.table,
    }));
  }

  async function runLlmTurn(actor: PlayerId, turn: number): Promise<void> {
    const job = startLlmJob();
    if (!job) {
      llmFallback(actor, turn, '找不到这个座位的 AI 配置（可能已被删除）', true);
      return;
    }
    set({ llmThinking: { playerId: actor, startedAt: job.startedAt, label: job.label } });
    const outcome = await job.promise;
    if (job.cancelled) return;
    llmJob = null;
    set({ llmThinking: null });
    const s = get();
    // Something else moved the game on while we waited.
    if (s.state.turn !== turn || s.screen !== 'game' || s.mode !== 'live' || s.playing) return;
    if (!outcome.ok) {
      llmFallback(
        actor,
        turn,
        outcome.takenOver ? '没有等它回复' : outcome.error,
        !outcome.takenOver,
      );
      return;
    }
    const d = outcome.decision;
    bumpStats(actor, (st) => ({
      decisions: st.decisions + 1,
      streak: 0,
      calls: st.calls + d.calls,
      ms: st.ms + d.ms,
      inputTokens: st.inputTokens + (d.usage.input ?? 0),
      outputTokens: st.outputTokens + (d.usage.output ?? 0),
      lastError: null,
    }));
    if (d.reason && useLlmSettings.getState().settings.showReasons)
      say(`${nameOf(actor)}：「${d.reason}」`, true);
    s.dispatch(d.action);
    if (get().state.turn === turn) llmFallback(actor, turn, '规则引擎拒绝了 AI 的选择', true);
  }

  /** The model could not decide: the built-in computer plays the move instead. */
  function llmFallback(actor: PlayerId, turn: number, why: string, failed: boolean): void {
    if (get().state.turn !== turn) return;
    const name = nameOf(actor);
    bumpStats(actor, (st) => ({
      fallbacks: st.fallbacks + 1,
      streak: failed ? st.streak + 1 : st.streak,
      lastError: failed ? why : st.lastError,
    }));
    say(`${name}（AI）这一步由内置电脑代走：${why}`, false);
    const suspended = failed && llmSuspended(actor);
    set({
      notice: suspended
        ? `${name} 的 AI 连续 ${LLM_MAX_FAILURES} 次失败，改由内置电脑接管；保存 AI 设置后重新启用`
        : failed
          ? `${name} 的 AI 没能给出决定，已由内置电脑代走（原因见航海日志）`
          : null,
    });
    builtInMove(actor, turn, 'normal');
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
    bots: {},
    botStalled: null,
    llmThinking: null,
    llmStats: {},
    table: [],
    lastError: null,
    notice: null,

    startGame(config, bots = {}) {
      runToken++;
      cancelLlm();
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
        // Bots only act through the real engine; in mock mode they would just "think" forever.
        bots: mode === 'live' ? bots : {},
        botStalled: null,
        llmStats: {},
        table: [],
        notice: mode === 'mock' ? 'mock' : null,
      });
      if (mode === 'live') writeSave(state, bots);
      scheduleBot();
    },

    resumeSaved() {
      const saved = get().mode === 'live' ? loadSave() : null;
      if (!saved) return false;
      runToken++;
      cancelLlm();
      set({
        screen: 'game',
        state: saved.state,
        display: saved.state,
        history: [],
        playing: false,
        log: [{ id: nextId++, text: '—— 继续上局 ——' }],
        revealedFor: null,
        bots: saved.bots,
        botStalled: null,
        llmStats: {},
        table: [],
      });
      scheduleBot();
      return true;
    },

    backToSetup() {
      runToken++;
      if (botTimer) clearTimeout(botTimer);
      cancelLlm();
      set({ screen: 'setup', playing: false, dice: null });
    },

    dispatch(action) {
      const { mode, state, history, playing } = get();
      if (playing) return;
      if (mode === 'mock') {
        set({ notice: 'engine-pending' });
        return;
      }
      let result: ReturnType<typeof applyAction>;
      try {
        result = applyAction(state, action);
      } catch (e) {
        // Engine still partially stubbed: keep the game alive and say so.
        if (e instanceof NotImplementedError) {
          set({ notice: 'engine-pending' });
          return;
        }
        throw e;
      }
      if (!result.ok) {
        set({ lastError: result.error, notice: result.error.code });
        return;
      }
      const name = (id: string) => result.state.players.find((p) => p.id === id)?.name ?? id;
      const told = result.events.flatMap((e) => describeEvent(e, name) ?? []);
      set((s) => ({
        state: result.state,
        history: [...history, state],
        lastError: null,
        botStalled: null,
        table: [...s.table, ...told].slice(-40),
      }));
      if (result.state.phase === 'game-over') clearSave();
      else writeSave(result.state, get().bots);
      // Let an AI seat that acts next start thinking while this move animates.
      startLlmJob();
      void animate(result.events, result.state);
    },

    undo() {
      const { history, playing, bots } = get();
      if (playing || history.length === 0) return;
      // Step back over computer turns to the last decision a human made.
      let i = history.length - 1;
      while (i > 0 && bots[actorOf(history[i]!) ?? ''] !== undefined) i--;
      const prev = history[i]!;
      if (bots[actorOf(prev) ?? ''] !== undefined) return;
      runToken++;
      if (botTimer) clearTimeout(botTimer);
      cancelLlm();
      set({
        state: prev,
        display: prev,
        history: history.slice(0, i),
        dice: null,
        botStalled: null,
        // The models' history would describe moves that no longer happened.
        table: [],
      });
      writeSave(prev, bots);
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

    llmTakeOver() {
      if (!llmJob) return;
      llmJob.takenOver = true;
      llmJob.ctrl.abort();
    },

    retryLlmSeats() {
      set((s) => ({
        llmStats: Object.fromEntries(
          Object.entries(s.llmStats).map(([id, st]) => [id, st && { ...st, streak: 0 }]),
        ),
      }));
      // A seat that was waiting on a stale profile picks up the new settings.
      const { state, bots, playing, llmThinking } = get();
      const actor = actorOf(state);
      if (actor && isLlmSeat(bots[actor]) && !playing && !llmThinking) scheduleBot();
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

/** True while a computer seat is acting on its own (not stalled). */
export function useBotActing(actor: PlayerId | null): boolean {
  const bots = useGame((s) => s.bots);
  const stalled = useGame((s) => s.botStalled);
  return !!actor && !!bots[actor] && stalled !== actor;
}

/** Whose private info may be shown right now. */
export function useViewer(): PlayerId | null {
  const display = useGame((s) => s.display);
  const privacy = useGame((s) => s.settings.privacy);
  const revealedFor = useGame((s) => s.revealedFor);
  const bots = useGame((s) => s.bots);
  const actor = actorOf(display);
  // Never reveal a computer player's hand to the humans at the table.
  if (actor && bots[actor]) return null;
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
  const bots = useGame((s) => s.bots);
  const actor = actorOf(display);
  if (screen !== 'game' || playing || !privacy || !actor || bots[actor]) return null;
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
