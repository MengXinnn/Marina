import {
  DOCK_SLOTS,
  GAME_END_VALUE,
  LAST_SPACE,
  VOYAGE_SCHEDULE,
  WARES,
  WARE_INFO,
  nextMarketValue,
  sharePrice,
} from '../contract/constants';
import type {
  Dock,
  GameEvent,
  GameState,
  MovementRound,
  PirateRole,
  PuntState,
} from '../contract/types';
import { random } from '../rng';
import { blindPassenger, boardingChoices, placements } from './choices';
import { pay, payout, settleMoney } from './money';
import { clockwise, emptyDocks, emptySeat, funds, player, scores } from './state';

export function refreshPending(state: GameState): void {
  const pending = state.pending;
  if (pending.type === 'bid') {
    pending.minBid = (state.auction?.highBid?.amount ?? 0) + 1;
    pending.maxBid = funds(player(state, pending.playerId));
  } else if (pending.type === 'place-accomplice') {
    pending.blindPassenger = blindPassenger(state, player(state, pending.playerId));
  }
}

export function nextBid(state: GameState, actor: string, events: GameEvent[]): void {
  const auction = state.auction!;
  const winner = auction.highBid;
  // R3.4 only the last remaining high bidder wins. With no bids even the last
  // active player must be allowed to pass before the incumbent retains office.
  if (
    (winner && auction.active.length === 1 && auction.active[0] === winner.playerId) ||
    auction.active.length === 0
  ) {
    const id = winner?.playerId ?? state.harborMaster ?? state.players[0].id;
    const price = winner?.amount ?? 0;
    pay(state, player(state, id), price, events);
    state.harborMaster = id;
    state.auction = null;
    state.phase = 'harbor-master';
    const prices: Partial<Record<(typeof WARES)[number], number>> = {};
    for (const ware of WARES)
      if (state.shareSupply[ware] > 0) prices[ware] = sharePrice(state.market[ware]);
    state.pending = { type: 'buy-share', playerId: id, prices };
    events.push({ type: 'harbor-master-elected', playerId: id, price });
    return;
  }
  const next =
    clockwise(state, actor)
      .slice(1)
      .find((id) => auction.active.includes(id)) ?? actor;
  state.pending = { type: 'bid', playerId: next, minBid: 0, maxBid: 0 };
  refreshPending(state);
}

function eligible(state: GameState, id: string): boolean {
  const p = player(state, id);
  return !p.passedPlacement && p.accomplicesPlaced < p.accomplices && placements(state).length > 0;
}

function offerPlacement(state: GameState, ids: string[]): boolean {
  const id = ids.find((candidate) => eligible(state, candidate));
  if (!id) return false;
  state.phase = 'placement';
  state.pending = {
    type: 'place-accomplice',
    playerId: id,
    round: state.placementRound + 1,
    blindPassenger: blindPassenger(state, player(state, id)),
  };
  return true;
}

export function afterPlacement(state: GameState, actor: string, events: GameEvent[]): void {
  const order = clockwise(state, state.harborMaster!);
  if (offerPlacement(state, order.slice(order.indexOf(actor) + 1))) return;
  state.placementRound++;
  advanceSchedule(state, events);
}

/** R2/R5.1 skip every automatic step in this same transition. */
export function advanceSchedule(state: GameState, events: GameEvent[]): void {
  const schedule = VOYAGE_SCHEDULE[state.players.length];
  while (state.placementRound + state.movementRound < schedule.length) {
    if (schedule[state.placementRound + state.movementRound] === 'P') {
      if (offerPlacement(state, clockwise(state, state.harborMaster!))) return;
      state.placementRound++;
      continue;
    }
    if (state.movementRound === 2 && offerPilot(state, 'small')) return;
    offerRoll(state);
    return;
  }
  finishVoyage(state, events);
}

function offerRoll(state: GameState): void {
  state.phase = 'movement';
  state.pending = {
    type: 'roll-dice',
    playerId: state.harborMaster!,
    round: (state.movementRound + 1) as MovementRound,
  };
}

function offerPilot(state: GameState, from: 'small' | 'large'): boolean {
  if (!state.punts.some((p) => p.status === 'sailing')) return false;
  for (const size of from === 'small' ? (['small', 'large'] as const) : (['large'] as const)) {
    const id = state.pilots[size];
    if (!id) continue;
    state.phase = 'pilots';
    state.pending = { type: 'pilot', playerId: id, size };
    return true;
  }
  return false;
}

export function afterPilot(state: GameState, size: 'small' | 'large'): void {
  if (size === 'small' && offerPilot(state, 'large')) return;
  offerRoll(state);
}

export function dockPunt(state: GameState, punt: PuntState, dock: Dock, events: GameEvent[]): void {
  const slot = DOCK_SLOTS.find((s) => !state[dock][s].punt);
  if (!slot) throw new Error('No free dock');
  punt.status = dock;
  punt.dock = slot;
  state[dock][slot].punt = punt.ware;
  events.push({ type: 'punt-docked', ware: punt.ware, dock, slot });
}

export function movePunt(
  punt: PuntState,
  delta: number,
  cause: 'dice' | 'pilot',
  events: GameEvent[],
): void {
  const from = punt.position;
  punt.position = Math.min(LAST_SPACE + 1, from + delta);
  events.push({ type: 'punt-moved', ware: punt.ware, from, to: punt.position, cause });
}

export function offerBoarding(state: GameState, role: PirateRole): boolean {
  const playerId = state.pirates[role];
  if (!playerId) return false;
  const options = boardingChoices(state, playerId);
  if (!options.length) return false;
  state.phase = 'pirates';
  state.pending = {
    type: 'pirate-board',
    playerId,
    role,
    candidates: [
      ...new Set(options.flatMap((a) => (a.type === 'pirate-board' && a.ware ? [a.ware] : []))),
    ],
  };
  return true;
}

/** R5.7 each loaded ware gets a die, including docked punts; only sailing punts move. */
export function roll(state: GameState, events: GameEvent[]): void {
  const round = (state.movementRound + 1) as MovementRound;
  const debug = state.config.debug?.dice?.[state.rng.debugDiceUsed];
  if (debug) state.rng.debugDiceUsed++;
  const values: Partial<Record<(typeof WARES)[number], number>> = {};
  for (const punt of state.punts)
    values[punt.ware] = debug?.[punt.ware] ?? Math.floor(random(state.rng) * 6) + 1;
  state.lastRoll = values;
  state.movementRound = round;
  events.push({ type: 'dice-rolled', round, values });
  // CONTRACT: finish all movement events before any docking events.
  for (const punt of state.punts)
    if (punt.status === 'sailing') movePunt(punt, values[punt.ware]!, 'dice', events);
  for (const punt of state.punts)
    if (punt.status === 'sailing' && punt.position > LAST_SPACE)
      dockPunt(state, punt, 'port', events);
  if (round === 2 && offerBoarding(state, 'captain')) return;
  if (round < 3) {
    advanceSchedule(state, events);
    return;
  }
  // R5.9/R6.3【裁定】natural failures enter the yard in route order before the captain
  // chooses destinations, so a plundered punt sent to the yard takes the next free slot.
  for (const punt of state.punts)
    if (punt.status === 'sailing' && punt.position < LAST_SPACE)
      dockPunt(state, punt, 'shipyard', events);
  const victims = state.punts.filter((p) => p.status === 'sailing');
  if (!state.pirates.captain) {
    // R6.3 with no pirates the final space counts as an arrival.
    for (const punt of victims) dockPunt(state, punt, 'port', events);
  } else {
    for (const punt of victims) {
      const returned = punt.seats.flatMap((s) => (s.occupant ? [s.occupant] : []));
      for (const id of returned) player(state, id).accomplicesPlaced--;
      punt.seats = punt.seats.map(emptySeat);
      punt.plundered = true;
      events.push({ type: 'punt-plundered', ware: punt.ware, returned });
    }
    // CONTRACT: all plunder events precede the first plunder payout.
    const pirates = [state.pirates.captain, state.pirates.crew].filter(
      (id): id is string => id !== null,
    );
    for (const punt of victims)
      pirates.forEach((playerId, i) => {
        const profit = WARE_INFO[punt.ware].profit;
        payout(
          state,
          {
            playerId,
            amount: Math.floor(profit / pirates.length) + (i === 0 ? profit % pirates.length : 0),
            reason: 'plunder',
            ware: punt.ware,
          },
          events,
        );
      });
  }
  afterPlunderDestination(state, events);
}

export function afterPlunderDestination(state: GameState, events: GameEvent[]): void {
  const next = state.punts.find((p) => p.status === 'sailing' && p.plundered);
  if (next) {
    state.phase = 'pirates';
    state.pending = {
      type: 'plunder-destination',
      playerId: state.pirates.captain!,
      ware: next.ware,
    };
    return;
  }
  finishVoyage(state, events);
}

function finishVoyage(state: GameState, events: GameEvent[]): void {
  settleMoney(state, events);
  // R9.1 each delivered ware rises once, only after all money has settled.
  for (const punt of state.punts)
    if (punt.status === 'port') {
      const from = state.market[punt.ware];
      const to = nextMarketValue(from);
      state.market[punt.ware] = to;
      if (to !== from) events.push({ type: 'market-rose', ware: punt.ware, from, to });
    }
  events.push({ type: 'voyage-ended', voyage: state.voyage });
  if (Object.values(state.market).some((value) => value >= GAME_END_VALUE)) {
    const lines = scores(state);
    const max = Math.max(...lines.map((line) => line.total));
    state.result = {
      scores: lines,
      winners: lines.filter((line) => line.total === max).map((line) => line.playerId),
    };
    state.phase = 'game-over';
    state.pending = { type: 'game-over' };
    events.push({ type: 'game-ended', result: state.result });
    return;
  }
  // R9.4 reset the board but keep cash, shares, market, RNG and the incumbent.
  state.voyage++;
  state.phase = 'auction';
  state.punts = [];
  state.port = emptyDocks();
  state.shipyard = emptyDocks();
  state.pirates = { captain: null, crew: null };
  state.pilots = { small: null, large: null };
  state.insurance = null;
  state.unloadedWare = null;
  state.lastRoll = null;
  state.placementRound = 0;
  state.movementRound = 0;
  for (const p of state.players) {
    p.accomplicesPlaced = 0;
    p.passedPlacement = false;
  }
  state.auction = { highBid: null, active: clockwise(state, state.harborMaster!) };
  state.pending = {
    type: 'bid',
    playerId: state.harborMaster!,
    minBid: 1,
    maxBid: funds(player(state, state.harborMaster!)),
  };
  events.push({ type: 'voyage-started', voyage: state.voyage });
}
