import {
  DOCK_SLOTS,
  MAX_START_SPACE,
  START_SUM,
  WARES,
  sharePrice,
  targetCost,
  targetKey,
} from '../contract/constants';
import type {
  Action,
  GameState,
  PilotMove,
  PlacementTarget,
  PlayerState,
  PuntPlan,
} from '../contract/types';
import { canRepay, funds } from './state';

export interface PlacementChoice {
  target: PlacementTarget;
  seat: number | null;
  cost: number;
}

/** R5.3–R5.5 every empty target, including already-decided dock spaces. */
export function placements(state: GameState): PlacementChoice[] {
  const choices: PlacementChoice[] = [];
  const add = (target: PlacementTarget, seat: number | null = null) =>
    choices.push({ target, seat, cost: targetCost(target, seat ?? 0) });
  for (const punt of state.punts) {
    const seat = punt.seats.findIndex((s) => !s.occupant);
    if (punt.status === 'sailing' && seat >= 0) add({ kind: 'punt', ware: punt.ware }, seat);
  }
  for (const kind of ['port', 'shipyard'] as const) {
    for (const slot of DOCK_SLOTS) if (!state[kind][slot].occupant) add({ kind, slot });
  }
  if (!state.pirates.captain || !state.pirates.crew)
    add({ kind: 'pirate' }, state.pirates.captain ? 1 : 0);
  for (const size of ['small', 'large'] as const)
    if (!state.pilots[size]) add({ kind: 'pilot', size });
  if (!state.insurance) add({ kind: 'insurance' });
  return choices;
}

export function blindPassenger(state: GameState, p: PlayerState): boolean {
  const costs = placements(state)
    .filter((c) => c.target.kind !== 'insurance')
    .map((c) => c.cost);
  return costs.length > 0 && funds(p) < Math.min(...costs);
}

export function placementChoice(
  state: GameState,
  target: PlacementTarget,
): PlacementChoice | undefined {
  return placements(state).find((c) => targetKey(c.target) === targetKey(target));
}

/** R6.2/R10 vacancy priority is global across all eligible punts. */
export function boardingChoices(state: GameState, playerId: string): Action[] {
  const candidates = state.punts.filter((p) => p.status === 'sailing' && p.position === 13);
  const vacant = candidates.filter((p) => p.seats.some((s) => !s.occupant));
  if (vacant.length) return vacant.map((p) => ({ type: 'pirate-board', playerId, ware: p.ware }));
  if (!state.config.rules.pirateDisplace) return [];
  return candidates.flatMap((p) =>
    p.seats.flatMap((s, displaceSeat): Action[] =>
      s.occupant && !s.pirate
        ? [{ type: 'pirate-board', playerId, ware: p.ware, displaceSeat }]
        : [],
    ),
  );
}

export function pilotChoices(
  state: GameState,
  playerId: string,
  size: 'small' | 'large',
): Action[] {
  const result: Action[] = [{ type: 'pilot', playerId, moves: [] }];
  const singles: PilotMove[] = [];
  for (const punt of state.punts) {
    if (punt.status !== 'sailing') continue;
    for (const delta of [-2, -1, 1, 2] as const) {
      if ((size === 'small' && Math.abs(delta) > 1) || punt.position + delta < 0) continue;
      const move = { ware: punt.ware, delta };
      result.push({ type: 'pilot', playerId, moves: [move] });
      if (Math.abs(delta) === 1) singles.push(move);
    }
  }
  if (size === 'large') {
    // Both action encodings are legal; R5.8 docking remains in route order.
    for (const first of singles)
      for (const second of singles) {
        if (first.ware !== second.ware)
          result.push({ type: 'pilot', playerId, moves: [first, second] });
      }
  }
  return result;
}

export function legalActions(state: GameState, playerId: string): Action[] {
  const p = state.players.find((entry) => entry.id === playerId);
  if (!p || state.phase === 'game-over') return [];
  const actions: Action[] = [];
  // R8.1/R8.2 loans do not consume the pending decision.
  for (const s of p.shares) {
    if (!s.mortgaged) actions.push({ type: 'take-loan', playerId, shareId: s.id });
    else if (canRepay(state, p)) actions.push({ type: 'repay-loan', playerId, shareId: s.id });
  }
  const pending = state.pending;
  if (pending.type === 'game-over' || pending.playerId !== playerId) return actions;
  switch (pending.type) {
    case 'bid':
      actions.push({ type: 'pass-bid', playerId });
      for (let amount = (state.auction?.highBid?.amount ?? 0) + 1; amount <= funds(p); amount++)
        actions.push({ type: 'bid', playerId, amount });
      break;
    case 'buy-share':
      actions.push({ type: 'buy-share', playerId, ware: null });
      for (const ware of WARES)
        if (state.shareSupply[ware] > 0 && funds(p) >= sharePrice(state.market[ware]))
          actions.push({ type: 'buy-share', playerId, ware });
      break;
    case 'load-punts':
      for (const a of WARES)
        for (const b of WARES)
          for (const c of WARES) {
            if (new Set([a, b, c]).size !== 3) continue;
            for (let x = 0; x <= MAX_START_SPACE; x++)
              for (let y = 0; y <= MAX_START_SPACE; y++) {
                const z = START_SUM - x - y;
                if (z < 0 || z > MAX_START_SPACE) continue;
                const punts: [PuntPlan, PuntPlan, PuntPlan] = [
                  { ware: a, start: x },
                  { ware: b, start: y },
                  { ware: c, start: z },
                ];
                actions.push({ type: 'load-punts', playerId, punts });
              }
          }
      break;
    case 'place-accomplice':
      actions.push({ type: 'pass-placement', playerId });
      if (!p.passedPlacement && p.accomplicesPlaced < p.accomplices) {
        for (const choice of placements(state))
          if (choice.cost <= funds(p) || blindPassenger(state, p))
            actions.push({ type: 'place-accomplice', playerId, target: choice.target });
      }
      break;
    case 'roll-dice':
      actions.push({ type: 'roll-dice', playerId });
      break;
    case 'pirate-board':
      actions.push(
        { type: 'pirate-board', playerId, ware: null },
        ...boardingChoices(state, playerId),
      );
      break;
    case 'pilot':
      actions.push(...pilotChoices(state, playerId, pending.size));
      break;
    case 'plunder-destination':
      actions.push(
        { type: 'plunder-destination', playerId, destination: 'port' },
        { type: 'plunder-destination', playerId, destination: 'shipyard' },
      );
      break;
  }
  return actions;
}
