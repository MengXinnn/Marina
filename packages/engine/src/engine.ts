import { INSURANCE_PREMIUM, WARE_INFO, WARES, sharePrice } from './contract/constants';
import type {
  Action,
  ActionResult,
  GameConfig,
  GameEvent,
  GameState,
  ManilaEngine,
  PlayerId,
  PlayerView,
  ReplayResult,
  RouteIndex,
  ScoreLine,
} from './contract/types';
import { initialState } from './setup';
import { blindPassenger, legalActions, placementChoice } from './rules/choices';
import {
  advanceSchedule,
  afterPilot,
  afterPlacement,
  afterPlunderDestination,
  dockPunt,
  movePunt,
  nextBid,
  offerBoarding,
  refreshPending,
  roll,
} from './rules/flow';
import { pay, payout, repayLoan, takeLoan } from './rules/money';
import { copy, emptySeat, player, scores } from './rules/state';
import { validateAction } from './rules/validation';

export function createGame(config: GameConfig): GameState {
  return initialState(config);
}

/** Only this private clone is mutated. Rejected actions never touch state or RNG. */
export function applyAction(input: GameState, inputAction: Action): ActionResult {
  const error = validateAction(input, inputAction);
  if (error) return { ok: false, error };
  const state = copy(input);
  const action = copy(inputAction);
  const events: GameEvent[] = [];
  const p = player(state, action.playerId);
  const pending = state.pending;
  switch (action.type) {
    case 'take-loan':
      takeLoan(p, action.shareId, false, events);
      break;
    case 'repay-loan':
      repayLoan(p, action.shareId, events);
      break;
    case 'bid':
      state.auction!.highBid = { playerId: p.id, amount: action.amount };
      events.push({ type: 'bid-placed', playerId: p.id, amount: action.amount });
      nextBid(state, p.id, events);
      break;
    case 'pass-bid':
      state.auction!.active = state.auction!.active.filter((id) => id !== p.id);
      events.push({ type: 'bid-passed', playerId: p.id });
      nextBid(state, p.id, events);
      break;
    case 'buy-share':
      if (action.ware) {
        const price = sharePrice(state.market[action.ware]);
        pay(state, p, price, events);
        // R4.1 the new share becomes collateral only after it is purchased.
        const serial = state.players.reduce((n, entry) => n + entry.shares.length, 0) + 1;
        p.shares.push({ id: `share-${serial}`, ware: action.ware, mortgaged: false });
        state.shareSupply[action.ware]--;
        events.push({ type: 'share-bought', playerId: p.id, ware: action.ware, price });
      } else events.push({ type: 'share-declined', playerId: p.id });
      state.pending = { type: 'load-punts', playerId: p.id };
      break;
    case 'load-punts':
      state.punts = action.punts.map((plan, route) => ({
        ware: plan.ware,
        route: route as RouteIndex,
        position: plan.start,
        status: 'sailing',
        dock: null,
        seats: WARE_INFO[plan.ware].seatCosts.map(emptySeat),
        plundered: false,
      }));
      state.unloadedWare = WARES.find((ware) => !action.punts.some((plan) => plan.ware === ware))!;
      events.push({
        type: 'punts-loaded',
        punts: action.punts.map((plan, route) => ({
          ware: plan.ware,
          route: route as RouteIndex,
          start: plan.start,
        })),
        unloaded: state.unloadedWare,
      });
      advanceSchedule(state, events);
      break;
    case 'place-accomplice': {
      const { target, seat, cost: printedCost } = placementChoice(state, action.target)!;
      const blind = target.kind !== 'insurance' && blindPassenger(state, p);
      const cost = blind ? p.cash : printedCost;
      pay(state, p, cost, events);
      p.accomplicesPlaced++;
      switch (target.kind) {
        case 'punt':
          state.punts.find((punt) => punt.ware === target.ware)!.seats[seat!] = {
            occupant: p.id,
            pirate: false,
            blindPassenger: blind,
          };
          break;
        case 'port':
        case 'shipyard':
          state[target.kind][target.slot].occupant = p.id;
          break;
        case 'pirate':
          state.pirates[seat === 0 ? 'captain' : 'crew'] = p.id;
          break;
        case 'pilot':
          state.pilots[target.size] = p.id;
          break;
        case 'insurance':
          state.insurance = p.id;
          break;
      }
      events.push({
        type: 'accomplice-placed',
        playerId: p.id,
        target,
        seat,
        cost,
        blindPassenger: blind,
      });
      if (target.kind === 'insurance')
        payout(
          state,
          { playerId: p.id, amount: INSURANCE_PREMIUM, reason: 'insurance-premium' },
          events,
        );
      afterPlacement(state, p.id, events);
      break;
    }
    case 'pass-placement':
      p.passedPlacement = true;
      events.push({ type: 'placement-passed', playerId: p.id });
      afterPlacement(state, p.id, events);
      break;
    case 'roll-dice':
      roll(state, events);
      break;
    case 'pirate-board': {
      if (pending.type !== 'pirate-board') throw new Error('Invalid boarding decision');
      const role = pending.role;
      let nextRole: 'captain' | 'crew' = 'crew';
      if (action.ware) {
        const punt = state.punts.find((boat) => boat.ware === action.ware)!;
        const seat = action.displaceSeat ?? punt.seats.findIndex((s) => !s.occupant);
        const displaced = punt.seats[seat].occupant;
        if (displaced) player(state, displaced).accomplicesPlaced--;
        punt.seats[seat] = { occupant: p.id, pirate: true, blindPassenger: false };
        state.pirates[role] = null;
        events.push({ type: 'pirate-boarded', playerId: p.id, ware: action.ware, seat, displaced });
        // R6.2 a second decision can have the same actor and captain role when the
        // player occupied both spaces. Occupancy, not player identity, drives order.
        if (role === 'captain' && state.pirates.crew) {
          state.pirates.captain = state.pirates.crew;
          state.pirates.crew = null;
          nextRole = 'captain';
          events.push({ type: 'pirate-promoted', playerId: state.pirates.captain });
        }
      } else events.push({ type: 'pirate-stayed', playerId: p.id });
      if (role === 'captain' && offerBoarding(state, nextRole)) break;
      advanceSchedule(state, events);
      break;
    }
    case 'pilot':
      if (pending.type !== 'pilot') throw new Error('Invalid pilot decision');
      events.push({ type: 'pilot-used', playerId: p.id, size: pending.size, moves: action.moves });
      for (const move of action.moves)
        movePunt(
          state.punts.find((punt) => punt.ware === move.ware)!,
          move.delta,
          'pilot',
          events,
        );
      for (const move of action.moves) {
        const punt = state.punts.find((boat) => boat.ware === move.ware)!;
        if (punt.position > 13) dockPunt(state, punt, 'port', events);
      }
      afterPilot(state, pending.size);
      break;
    case 'plunder-destination':
      if (pending.type !== 'plunder-destination') throw new Error('Invalid destination decision');
      dockPunt(
        state,
        state.punts.find((punt) => punt.ware === pending.ware)!,
        action.destination,
        events,
      );
      afterPlunderDestination(state, events);
      break;
  }
  state.turn++;
  refreshPending(state);
  // Events must not alias state: animation consumers may annotate their copies.
  return { ok: true, state, events: copy(events) };
}

export function getLegalActions(state: GameState, playerId: PlayerId): Action[] {
  return legalActions(state, playerId);
}

/** R1.2 omit RNG, debug and seed; opaque IDs never encode a private ware. */
export function getPlayerView(state: GameState, viewer: PlayerId | null): PlayerView {
  const { rng: _rng, config, players, ...publicState } = state;
  const view: PlayerView = {
    ...publicState,
    viewer,
    config: { players: config.players, rules: config.rules },
    players: players.map((p) => ({
      ...p,
      shares: p.shares.map((s) => ({ ...s, ware: p.id === viewer ? s.ware : null })),
    })),
  };
  return copy(view);
}

export function computeScores(state: GameState): ScoreLine[] {
  return scores(state);
}

export function replay(config: GameConfig, actions: Action[]): ReplayResult {
  let state = createGame(config);
  const events: GameEvent[][] = [];
  actions.forEach((action, index) => {
    const result = applyAction(state, action);
    if (!result.ok)
      throw new Error(
        `Replay action ${index} (${action.type}): ${result.error.code}: ${result.error.message}`,
      );
    state = result.state;
    events.push(result.events);
  });
  return { state, events };
}

export const engine: ManilaEngine = {
  createGame,
  applyAction,
  getLegalActions,
  getPlayerView,
  computeScores,
  replay,
};
