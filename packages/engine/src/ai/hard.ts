import { SHARES_PER_WARE, WARES, nextMarketValue } from '../contract/constants';
import type { Action, GameState, PlayerId, PlayerView, Ware } from '../contract/types';
import { applyAction, computeScores, getLegalActions, getPlayerView } from '../engine';
import { chooseBotAction, rankChoices } from './bot';

/**
 * "Hard" computer player: flat Monte-Carlo search on top of the normal bot.
 *
 * For each of the few moves the normal bot likes best, it imagines the rest of the voyage many
 * times: the other players' hidden shares are dealt at random from the shares it cannot account
 * for (it never peeks), the dice are rolled from a fresh seed, and everyone, itself included,
 * plays on as a normal bot. It keeps the move whose voyages ended best for it relative to the
 * table. The same imagined deals and dice are used for every move it compares, so the
 * comparison is fair even with few samples.
 *
 * Like the other bots it reads only `getPlayerView` + `getLegalActions` and uses no
 * Math.random(): all chance comes from the injected `random`.
 */
export interface HardBotOptions {
  random: () => number;
  /** Imagined voyages per candidate move. */
  rollouts?: number;
  /** Most moves compared per decision (the normal bot's favourites). */
  candidates?: number;
  /** Credit for a share's next market rise when scoring an imagined voyage (0–1). A voyage is
   * a short horizon; without it shares look like pure cost until the market moves. */
  futureShareWeight?: number;
}

const DEFAULT_ROLLOUTS = 24;
const DEFAULT_CANDIDATES = 6;
const DEFAULT_FUTURE_SHARE_WEIGHT = 1;
/** Safety net: a voyage is ~30–60 actions. */
const MAX_ROLLOUT_STEPS = 400;

/** mulberry32, seeded per imagined voyage so every candidate faces the same luck. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A full game state consistent with what `view` shows: hidden shares are dealt from the
 * shares not in the supply and not visible (R1.2), and dice come from `seed` (R1.6).
 */
export function determinize(view: PlayerView, seed: number): GameState {
  const random = prng(seed);
  const unseen: Ware[] = [];
  for (const w of WARES) {
    const seen = view.players.reduce((n, p) => n + p.shares.filter((s) => s.ware === w).length, 0);
    for (let i = SHARES_PER_WARE - view.shareSupply[w] - seen; i > 0; i--) unseen.push(w);
  }
  for (let i = unseen.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [unseen[i], unseen[j]] = [unseen[j]!, unseen[i]!];
  }
  const { viewer: _viewer, players, config, ...rest } = view;
  return {
    ...(JSON.parse(JSON.stringify(rest)) as Omit<PlayerView, 'viewer' | 'players' | 'config'>),
    config: { ...config, seed },
    players: players.map((p) => ({
      ...p,
      shares: p.shares.map((s) => ({
        ...s,
        ware: s.ware ?? unseen.pop() ?? WARES[Math.floor(random() * WARES.length)]!,
      })),
    })),
    rng: { seed, state: seed, debugDiceUsed: 0 },
  };
}

/** My fortune (R9.2, plus credit for share rises still to come) minus the table's average. */
function outcome(state: GameState, me: PlayerId, futureShareWeight: number): number {
  const fortune = (id: PlayerId, total: number) => {
    if (state.phase === 'game-over') return total;
    const shares = state.players.find((p) => p.id === id)?.shares ?? [];
    const rise = shares.reduce(
      (n, s) => n + nextMarketValue(state.market[s.ware]) - state.market[s.ware],
      0,
    );
    return total + futureShareWeight * rise;
  };
  const scores = computeScores(state).map((s) => ({
    id: s.playerId,
    v: fortune(s.playerId, s.total),
  }));
  const mine = scores.find((s) => s.id === me)?.v ?? 0;
  const others = scores.filter((s) => s.id !== me);
  return mine - others.reduce((n, s) => n + s.v, 0) / Math.max(1, others.length);
}

function rollout(
  start: GameState,
  first: Action,
  me: PlayerId,
  random: () => number,
  futureShareWeight: number,
): number {
  let result = applyAction(start, first);
  if (!result.ok) return -Infinity;
  let state = result.state;
  for (let i = 0; i < MAX_ROLLOUT_STEPS; i++) {
    if (state.phase === 'game-over' || state.voyage !== start.voyage) break;
    const pending = state.pending;
    if (!('playerId' in pending)) break;
    const actor = pending.playerId;
    const action = chooseBotAction(getPlayerView(state, actor), getLegalActions(state, actor), {
      level: 'normal',
      random,
    });
    result = applyAction(state, action);
    if (!result.ok) break;
    state = result.state;
  }
  return outcome(state, me, futureShareWeight);
}

/** The moves worth simulating: the normal bot's favourites (for an auction: pass or bid low). */
function candidatesFor(view: PlayerView, legal: Action[], max: number): Action[] {
  const ranked = rankChoices(view, legal);
  if (view.pending.type === 'bid') {
    const pass = ranked.find((a) => a.type === 'pass-bid');
    const bids = ranked.filter((a): a is Extract<Action, { type: 'bid' }> => a.type === 'bid');
    const lowest = bids[0];
    const jump = lowest && bids.find((b) => b.amount === lowest.amount + 3);
    const list: Array<Action | undefined> = [pass, lowest, jump];
    return list.filter((a): a is Action => a !== undefined);
  }
  const top = ranked.slice(0, max);
  // Always weigh doing nothing against the favourites.
  const quiet = ranked.find(
    (a) =>
      a.type === 'pass-placement' ||
      (a.type === 'buy-share' && a.ware === null) ||
      (a.type === 'pilot' && a.moves.length === 0) ||
      (a.type === 'pirate-board' && a.ware === null),
  );
  if (quiet && !top.includes(quiet)) top.push(quiet);
  return top;
}

export function chooseHardAction(
  view: PlayerView,
  legal: Action[],
  options: HardBotOptions,
): Action {
  const pending = view.pending;
  if (!('playerId' in pending)) throw new Error('chooseHardAction: no decision is pending');
  const me = pending.playerId;
  const candidates = candidatesFor(view, legal, options.candidates ?? DEFAULT_CANDIDATES);
  if (candidates.length <= 1) {
    return (
      candidates[0] ?? chooseBotAction(view, legal, { level: 'normal', random: options.random })
    );
  }
  const totals = candidates.map(() => 0);
  const rollouts = options.rollouts ?? DEFAULT_ROLLOUTS;
  const weight = options.futureShareWeight ?? DEFAULT_FUTURE_SHARE_WEIGHT;
  for (let i = 0; i < rollouts; i++) {
    const seed = Math.floor(options.random() * 2 ** 32);
    const world = determinize(view, seed);
    candidates.forEach((a, c) => {
      totals[c]! += rollout(world, a, me, prng(seed ^ 0x9e3779b9), weight);
    });
  }
  let best = 0;
  for (let c = 1; c < candidates.length; c++) if (totals[c]! > totals[best]!) best = c;
  return candidates[best]!;
}
