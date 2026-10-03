import {
  INSURANCE_PREMIUM,
  VOYAGE_SCHEDULE,
  WARE_INFO,
  WARES,
  nextMarketValue,
  sharePrice,
  targetCost,
} from '../contract/constants';
import type {
  Action,
  PilotMove,
  PlacementTarget,
  PlayerId,
  PlayerView,
  Ware,
} from '../contract/types';
import { cloneView, myShares, rollsLeft, stakeValue, withPlacement } from './evaluate';
import { chooseHardAction } from './hard';
import { outlook } from './probability';

/** easy: a beginner who sometimes guesses; normal: expected-value heuristics; hard: Monte-Carlo
 * search over the rest of the voyage on top of the normal bot (see hard.ts; slower). */
export type BotLevel = 'easy' | 'normal' | 'hard';

export interface BotOptions {
  level: BotLevel;
  /** Uniform [0, 1). Injected so the engine package never touches Math.random(). */
  random: () => number;
}

type Of<T extends Action['type']> = Extract<Action, { type: T }>;

/** Share of an easy bot's decisions made at random, like a beginner who sometimes guesses. */
export const EASY_RANDOM_RATE = 0.25;

/**
 * Pick an action for the player whose turn it is.
 * `view` must be getPlayerView(state, botId) and `legal` getLegalActions(state, botId):
 * the bot only scores what the engine allows and only reads what its seat may see.
 */
export function chooseBotAction(view: PlayerView, legal: Action[], options: BotOptions): Action {
  const pending = view.pending;
  if (!('playerId' in pending)) throw new Error('chooseBotAction: no decision is pending');
  // Loans are taken automatically by the engine when needed (R8.3); bots never volunteer.
  const choices = legal.filter((a) => a.type !== 'take-loan' && a.type !== 'repay-loan');
  if (choices.length === 0) {
    if (legal[0]) return legal[0];
    throw new Error('chooseBotAction: no legal action');
  }
  if (choices.length === 1) return choices[0]!;
  if (options.level === 'hard') return chooseHardAction(view, legal, { random: options.random });

  if (options.level === 'easy' && options.random() < EASY_RANDOM_RATE) return easyPick(choices, options.random);

  const me = pending.playerId;
  const noise = () => (options.random() - 0.5) * 0.4;
  const best = (scored: Array<[Action, number]>) =>
    scored.reduce((a, b) => (b[1] > a[1] ? b : a))[0];

  switch (pending.type) {
    case 'bid':
      return decideBid(view, me, choices, noise);
    case 'buy-share':
      return best(choices.map((a) => [a, scoreBuy(view, me, a as Of<'buy-share'>) + noise()]));
    case 'load-punts':
      return best(choices.map((a) => [a, scoreLoad(view, me, a as Of<'load-punts'>) + noise()]));
    case 'place-accomplice':
      return decidePlacement(view, me, choices, noise);
    case 'pirate-board':
      return best(choices.map((a) => [a, scoreBoard(view, me, a as Of<'pirate-board'>) + noise()]));
    case 'pilot':
      return best(choices.map((a) => [a, scorePilot(view, me, a as Of<'pilot'>) + noise()]));
    case 'plunder-destination':
      return best(
        choices.map((a) => [a, scorePlunder(view, me, a as Of<'plunder-destination'>) + noise()]),
      );
    default:
      return choices[0]!;
  }
}

/**
 * The normal bot's opinion of every choice, best first, without noise. The hard bot uses it
 * to pick which few moves are worth simulating. Bids are ranked lowest first.
 */
export function rankChoices(view: PlayerView, legal: Action[]): Action[] {
  const pending = view.pending;
  if (!('playerId' in pending)) return [];
  const me = pending.playerId;
  const choices = legal.filter((a) => a.type !== 'take-loan' && a.type !== 'repay-loan');
  const score = (a: Action): number => {
    switch (a.type) {
      case 'bid':
        return -a.amount;
      case 'pass-bid':
        return -Infinity;
      case 'buy-share':
        return scoreBuy(view, me, a);
      case 'load-punts':
        return scoreLoad(view, me, a);
      case 'place-accomplice':
        return placementValue(view, me, a.target);
      case 'pass-placement':
        return 0.4;
      case 'pirate-board':
        return scoreBoard(view, me, a);
      case 'pilot':
        return scorePilot(view, me, a);
      case 'plunder-destination':
        return scorePlunder(view, me, a);
      default:
        return 0;
    }
  };
  return choices
    .map((a) => [a, score(a)] as const)
    .sort((x, y) => y[1] - x[1])
    .map(([a]) => a);
}

function easyPick(choices: Action[], random: () => number): Action {
  // Keep easy bots from bidding wildly: only consider the minimum bid or passing.
  const bids = choices.filter((a): a is Of<'bid'> => a.type === 'bid');
  if (bids.length) {
    const minBid = bids.reduce((a, b) => (b.amount < a.amount ? b : a));
    const pass = choices.find((a) => a.type === 'pass-bid');
    return random() < 0.4 && pass ? pass : minBid;
  }
  return choices[Math.floor(random() * choices.length)]!;
}

// ───────────── auction ─────────────

/** Rough worth of the harbour master's office to `me`, in pesos (what a normal bot bids up to). */
export function harborMasterValue(view: PlayerView, me: PlayerId): number {
  const owned = WARES.filter((w) => myShares(view, me, w) > 0).length;
  const bestBuy = Math.max(
    0,
    ...WARES.filter((w) => view.shareSupply[w] > 0).map(
      (w) => nextMarketValue(view.market[w]) - sharePrice(view.market[w]),
    ),
  );
  // first pick of the cheapest good seat + choosing which wares sail + share purchase option
  return 3 + 1.5 * owned + 0.5 * bestBuy;
}

function decideBid(view: PlayerView, me: PlayerId, choices: Action[], noise: () => number): Action {
  const pass = choices.find((a) => a.type === 'pass-bid');
  const bids = choices.filter((a): a is Of<'bid'> => a.type === 'bid');
  if (!bids.length) return pass ?? choices[0]!;
  const lowest = bids.reduce((a, b) => (b.amount < a.amount ? b : a));
  const cash = view.players.find((p) => p.id === me)?.cash ?? 0;
  const limit = harborMasterValue(view, me) + noise() * 5;
  // Avoid bids that would force a loan (R8.3).
  if (lowest.amount <= limit && lowest.amount <= cash - 4) return lowest;
  return pass ?? lowest;
}

// ───────────── harbour master ─────────────

function scoreBuy(view: PlayerView, me: PlayerId, a: Of<'buy-share'>): number {
  if (!a.ware) return 0;
  const v = view.market[a.ware];
  const price = sharePrice(v);
  const cash = view.players.find((p) => p.id === me)?.cash ?? 0;
  if (cash - price < 10) return -1;
  return nextMarketValue(v) - price + 1.5 * myShares(view, me, a.ware) - 1;
}

function scoreLoad(view: PlayerView, me: PlayerId, a: Of<'load-punts'>): number {
  let score = 0;
  let bestSeat = 0;
  for (const { ware, start } of a.punts) {
    const o = outlook(start, 3);
    const v = view.market[ware];
    score += myShares(view, me, ware) * (nextMarketValue(v) - v) * o.arrive;
    // As harbour master we place first: value the best seat the plan creates.
    bestSeat = Math.max(
      bestSeat,
      (o.arrive * WARE_INFO[ware].profit) / 2 - WARE_INFO[ware].seatCosts[0]!,
    );
  }
  return score + 0.5 * bestSeat;
}

// ───────────── placement ─────────────

function placementRoundsLeft(view: PlayerView): number {
  if (view.pending.type !== 'place-accomplice') return 0;
  const total = (VOYAGE_SCHEDULE[view.players.length] ?? []).filter((s) => s === 'P').length;
  return Math.max(0, total - view.pending.round);
}

function placementCost(view: PlayerView, me: PlayerId, t: PlacementTarget): number {
  const seat =
    t.kind === 'punt'
      ? (view.punts.find((p) => p.ware === t.ware)?.seats.findIndex((s) => !s.occupant) ?? 0)
      : 0;
  const cost = targetCost(t, Math.max(0, seat));
  const cash = view.players.find((p) => p.id === me)?.cash ?? 0;
  // R5.6 blind passenger pays all remaining cash instead of the printed price.
  return view.pending.type === 'place-accomplice' && view.pending.blindPassenger
    ? Math.min(cost, cash)
    : cost;
}

/** Best stake gain a pilot of `size` could achieve right now (used to value the pilot seat). */
function pilotGain(view: PlayerView, me: PlayerId, size: 'small' | 'large'): number {
  const base = stakeValue(view, me);
  let best = 0;
  for (const moves of pilotMoveSets(view, size))
    best = Math.max(best, stakeValue(view, me, apply(view, moves)) - base);
  // Before the last placement round the punts still move, so the gain is uncertain.
  return rollsLeft(view) <= 1 ? best : best * 0.5;
}

function pilotMoveSets(view: PlayerView, size: 'small' | 'large'): PilotMove[][] {
  const wares = view.punts.filter((p) => p.status === 'sailing').map((p) => p.ware);
  const singles = (deltas: PilotMove['delta'][]) =>
    wares.flatMap((ware) => deltas.map((delta) => [{ ware, delta }]));
  if (size === 'small') return singles([-1, 1]);
  const pairs: PilotMove[][] = [];
  for (let i = 0; i < wares.length; i++)
    for (let j = i + 1; j < wares.length; j++)
      for (const a of [-1, 1] as const)
        for (const b of [-1, 1] as const)
          pairs.push([
            { ware: wares[i]!, delta: a },
            { ware: wares[j]!, delta: b },
          ]);
  return [...singles([-2, -1, 1, 2]), ...pairs];
}

function apply(view: PlayerView, moves: PilotMove[]): Partial<Record<Ware, number>> {
  const positions: Partial<Record<Ware, number>> = {};
  for (const m of moves) {
    const p = view.punts.find((x) => x.ware === m.ware);
    if (p) positions[m.ware] = Math.max(0, (positions[m.ware] ?? p.position) + m.delta);
  }
  return positions;
}

function placementValue(view: PlayerView, me: PlayerId, t: PlacementTarget): number {
  const cost = placementCost(view, me, t);
  if (t.kind === 'pilot') return pilotGain(view, me, t.size) - cost;
  const gain = stakeValue(withPlacement(view, me, t), me) - stakeValue(view, me);
  const premium = t.kind === 'insurance' ? INSURANCE_PREMIUM : 0;
  // Later accomplices may still crowd a punt and dilute our share.
  const punt = t.kind === 'punt' ? view.punts.find((p) => p.ware === t.ware) : undefined;
  const freeAfter = punt ? punt.seats.filter((s) => !s.occupant).length - 1 : 0;
  const dilution = freeAfter > 0 && placementRoundsLeft(view) > 0 ? 0.8 : 1;
  return gain * dilution + premium - cost;
}

function decidePlacement(
  view: PlayerView,
  me: PlayerId,
  choices: Action[],
  noise: () => number,
): Action {
  const pass = choices.find((a) => a.type === 'pass-placement');
  let best: Action | undefined;
  let bestScore = 0.4; // passing is worth keeping the accomplice and the cash
  for (const a of choices) {
    if (a.type !== 'place-accomplice') continue;
    const score = placementValue(view, me, a.target) + noise();
    if (score > bestScore) {
      best = a;
      bestScore = score;
    }
  }
  return best ?? pass ?? choices[0]!;
}

// ───────────── pirates, pilots, plunder ─────────────

function scoreBoard(view: PlayerView, me: PlayerId, a: Of<'pirate-board'>): number {
  if (!a.ware) return stakeValue(view, me);
  const v = cloneView(view);
  const seats = v.punts.find((p) => p.ware === a.ware)?.seats ?? [];
  // R10 variant: the engine names the seat to take over; otherwise the cheapest vacant one.
  const seat =
    a.displaceSeat !== undefined ? seats[a.displaceSeat] : seats.find((s) => !s.occupant);
  if (!seat) return -Infinity;
  Object.assign(seat, { occupant: me, pirate: true, blindPassenger: false });
  // R6.2: leaving the pirate ship; the crew is promoted when the captain boards.
  if (v.pirates.captain === me) v.pirates = { captain: v.pirates.crew, crew: null };
  else if (v.pirates.crew === me) v.pirates.crew = null;
  return stakeValue(v, me);
}

function scorePilot(view: PlayerView, me: PlayerId, a: Of<'pilot'>): number {
  return stakeValue(view, me, apply(view, a.moves)) + (a.moves.length ? 0 : 0.05);
}

function scorePlunder(view: PlayerView, me: PlayerId, a: Of<'plunder-destination'>): number {
  if (view.pending.type !== 'plunder-destination') return 0;
  const ware = view.pending.ware;
  const v = cloneView(view);
  const punt = v.punts.find((p) => p.ware === ware);
  if (!punt) return 0;
  const slot = (['A', 'B', 'C'] as const).find((s) => !v[a.destination][s].punt) ?? 'C';
  Object.assign(punt, { status: a.destination, dock: slot });
  v[a.destination][slot].punt = ware;
  return stakeValue(v, me);
}
