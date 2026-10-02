import { DOCK_SLOTS, WARES, sharePrice } from '../contract/constants';
import type { Action, EngineError, GameState, PlacementTarget } from '../contract/types';
import { blindPassenger, boardingChoices, pilotChoices, placementChoice } from './choices';
import { canRepay, funds } from './state';

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const ware = (value: unknown): boolean => WARES.includes(value as never);
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);
const fields = (
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
): boolean =>
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every((key) => required.includes(key) || optional.includes(key));

function target(value: unknown): value is PlacementTarget {
  if (!object(value)) return false;
  switch (value.kind) {
    case 'punt':
      return fields(value, ['kind', 'ware']) && ware(value.ware);
    case 'port':
    case 'shipyard':
      return fields(value, ['kind', 'slot']) && DOCK_SLOTS.includes(value.slot as never);
    case 'pilot':
      return fields(value, ['kind', 'size']) && ['small', 'large'].includes(value.size as string);
    case 'pirate':
    case 'insurance':
      return fields(value, ['kind']);
    default:
      return false;
  }
}

/** Runtime inputs may originate in JSON/localStorage rather than TypeScript. */
export function validPayload(value: unknown): value is Action {
  if (!object(value) || typeof value.playerId !== 'string') return false;
  const base = ['type', 'playerId'];
  switch (value.type) {
    case 'bid':
      return fields(value, [...base, 'amount']) && integer(value.amount);
    case 'buy-share':
      return fields(value, [...base, 'ware']) && (value.ware === null || ware(value.ware));
    case 'load-punts':
      return (
        fields(value, [...base, 'punts']) &&
        Array.isArray(value.punts) &&
        value.punts.every(
          (p) => object(p) && fields(p, ['ware', 'start']) && ware(p.ware) && integer(p.start),
        )
      );
    case 'place-accomplice':
      return fields(value, [...base, 'target']) && target(value.target);
    case 'pirate-board':
      return (
        fields(value, [...base, 'ware'], ['displaceSeat']) &&
        (value.ware === null || ware(value.ware)) &&
        (value.displaceSeat === undefined || integer(value.displaceSeat))
      );
    case 'pilot':
      return (
        fields(value, [...base, 'moves']) &&
        Array.isArray(value.moves) &&
        value.moves.every(
          (m) => object(m) && fields(m, ['ware', 'delta']) && ware(m.ware) && integer(m.delta),
        )
      );
    case 'plunder-destination':
      return (
        fields(value, [...base, 'destination']) &&
        ['port', 'shipyard'].includes(value.destination as string)
      );
    case 'take-loan':
    case 'repay-loan':
      return fields(value, [...base, 'shareId']) && typeof value.shareId === 'string';
    case 'pass-bid':
    case 'pass-placement':
    case 'roll-dice':
      return fields(value, base);
    default:
      return false;
  }
}

const error = (code: EngineError['code'], message: string): EngineError => ({ code, message });

export function validateAction(state: GameState, action: Action): EngineError | null {
  if (state.phase === 'game-over') return error('game-over', 'The game has ended');
  if (!validPayload(action)) return error('invalid-payload', 'Malformed action payload');
  const p = state.players.find((entry) => entry.id === action.playerId);
  if (!p) return error('invalid-payload', 'Unknown player');
  const illegal = () => error('illegal-action', 'Action is not legal for this decision');
  const insufficient = () => error('insufficient-funds', 'Not enough cash or collateral');
  if (action.type === 'take-loan' || action.type === 'repay-loan') {
    const s = p.shares.find((card) => card.id === action.shareId);
    if (!s || s.mortgaged !== (action.type === 'repay-loan')) return illegal();
    return action.type === 'repay-loan' && !canRepay(state, p) ? insufficient() : null;
  }
  const pending = state.pending;
  if (pending.type === 'game-over') return error('game-over', 'The game has ended');
  if (pending.playerId !== p.id) return error('not-your-turn', 'Another player must decide');
  const expectedType =
    action.type === 'pass-bid'
      ? 'bid'
      : action.type === 'pass-placement'
        ? 'place-accomplice'
        : action.type;
  if (pending.type !== expectedType) return illegal();
  switch (action.type) {
    case 'bid':
      if (action.amount <= (state.auction?.highBid?.amount ?? 0)) return illegal();
      if (action.amount > funds(p)) return insufficient();
      break;
    case 'buy-share':
      if (action.ware !== null) {
        if (!state.shareSupply[action.ware]) return illegal();
        if (funds(p) < sharePrice(state.market[action.ware])) return insufficient();
      }
      break;
    case 'load-punts':
      if (
        action.punts.length !== 3 ||
        new Set(action.punts.map((plan) => plan.ware)).size !== 3 ||
        action.punts.some((plan) => plan.start < 0 || plan.start > 5) ||
        action.punts.reduce((n, plan) => n + plan.start, 0) !== 9
      )
        return illegal();
      break;
    case 'place-accomplice': {
      const choice = placementChoice(state, action.target);
      if (!choice || p.passedPlacement || p.accomplicesPlaced >= p.accomplices) return illegal();
      if (!blindPassenger(state, p) && choice.cost > funds(p)) return insufficient();
      break;
    }
    case 'pirate-board':
      if (action.ware === null) return action.displaceSeat === undefined ? null : illegal();
      if (
        !boardingChoices(state, p.id).some(
          (option) =>
            option.type === 'pirate-board' &&
            option.ware === action.ware &&
            option.displaceSeat === action.displaceSeat,
        )
      )
        return illegal();
      break;
    case 'pilot': {
      if (pending.type !== 'pilot') return illegal();
      const matches = pilotChoices(state, p.id, pending.size).some(
        (option) =>
          option.type === 'pilot' &&
          option.moves.length === action.moves.length &&
          option.moves.every(
            (m, i) => m.ware === action.moves[i].ware && m.delta === action.moves[i].delta,
          ),
      );
      if (!matches) return illegal();
      break;
    }
  }
  return null;
}
