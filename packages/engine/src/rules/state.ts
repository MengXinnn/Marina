import { DOCK_SLOTS, LOAN_AMOUNT } from '../contract/constants';
import type {
  DockSlot,
  DockSpace,
  GameState,
  PlayerState,
  ScoreLine,
  SeatState,
} from '../contract/types';

/** JSON-only copies also detach action/config/event payloads from caller-owned objects. */
export function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function emptyDocks(): Record<DockSlot, DockSpace> {
  return Object.fromEntries(
    DOCK_SLOTS.map((slot) => [slot, { occupant: null, punt: null }]),
  ) as Record<DockSlot, DockSpace>;
}

export function emptySeat(): SeatState {
  return { occupant: null, pirate: false, blindPassenger: false };
}

export function player(state: GameState, id: string): PlayerState {
  const found = state.players.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown player: ${id}`);
  return found;
}

export function funds(p: PlayerState): number {
  return p.cash + LOAN_AMOUNT * p.shares.filter((s) => !s.mortgaged).length;
}

export function clockwise(state: GameState, first: string): string[] {
  const ids = state.players.map((p) => p.id);
  const index = ids.indexOf(first);
  return [...ids.slice(index), ...ids.slice(0, index)];
}

/** R9.2 all shares count, including mortgaged ones. */
export function scores(state: GameState): ScoreLine[] {
  return state.players.map((p) => {
    const shareValue = p.shares.reduce((n, s) => n + state.market[s.ware], 0);
    const mortgagePenalty = 15 * p.shares.filter((s) => s.mortgaged).length;
    return {
      playerId: p.id,
      cash: p.cash,
      shareValue,
      mortgagePenalty,
      total: p.cash + shareValue - mortgagePenalty,
    };
  });
}
