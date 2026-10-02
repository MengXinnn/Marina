/**
 * Board numbers from the original game (Zoch 2005). Co-owned with types.ts — see docs/RULES.md §1.
 * Pure data + tiny pure helpers only; no game logic here.
 */
import type { DockSlot, PilotSize, PlacementTarget, Ware } from './types';

export const WARES: readonly Ware[] = ['ginseng', 'nutmeg', 'silk', 'jade'];
export const DOCK_SLOTS: readonly DockSlot[] = ['A', 'B', 'C'];

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 5;

export const STARTING_CASH = 30;
export const STARTING_SHARES = 2;
export const SHARES_PER_WARE = 5;
/** The opening deal is drawn from a shuffled pool of 3 shares per ware (R1.2). */
export const DEAL_POOL_PER_WARE = 3;

/** Black market track. Values only ever step up one notch (R9.1). */
export const MARKET_TRACK = [0, 5, 10, 20, 30] as const;
export const GAME_END_VALUE = 30;
export const MIN_SHARE_PRICE = 5;

export const LOAN_AMOUNT = 12;
export const LOAN_REPAYMENT = 15;

/** Sea route spaces are numbered 0..13; moving past 13 means arriving in Manila (R5.8). */
export const LAST_SPACE = 13;
export const PIRATE_SPACE = 13;
export const MAX_START_SPACE = 5;
export const START_SUM = 9;

export interface WareInfo {
  /** Seat costs, cheapest first. Seats are always filled cheapest-first (R5.3). */
  seatCosts: readonly number[];
  /** Profit shared by the accomplices aboard if the punt reaches Manila / pirates if plundered. */
  profit: number;
}

export const WARE_INFO: Record<Ware, WareInfo> = {
  ginseng: { seatCosts: [1, 2, 3], profit: 18 },
  nutmeg: { seatCosts: [2, 3, 4], profit: 24 },
  silk: { seatCosts: [3, 4, 5], profit: 30 },
  jade: { seatCosts: [3, 4, 5, 5], profit: 36 },
};

export interface DockSlotInfo {
  cost: number;
  /** Paid if a punt lands in this slot. Port: by the bank. Shipyard: by the insurance agent (or bank). */
  reward: number;
}

export const PORT_SLOTS: Record<DockSlot, DockSlotInfo> = {
  A: { cost: 4, reward: 6 },
  B: { cost: 3, reward: 8 },
  C: { cost: 2, reward: 15 },
};

export const SHIPYARD_SLOTS: Record<DockSlot, DockSlotInfo> = {
  A: { cost: 4, reward: 6 },
  B: { cost: 3, reward: 8 },
  C: { cost: 2, reward: 15 },
};

export const PIRATE_COST = 5;
export const PILOT_COST: Record<PilotSize, number> = { small: 2, large: 5 };
/** The insurance agent pays nothing and immediately receives this premium (R5.5). */
export const INSURANCE_PREMIUM = 10;

/** Accomplices per player by player count (R1.3). */
export const ACCOMPLICES_BY_PLAYER_COUNT: Record<number, number> = { 3: 4, 4: 3, 5: 3 };

/** Voyage schedule after the harbor master is done: P = placement round, M = movement round (R5.1). */
export const VOYAGE_SCHEDULE: Record<number, readonly ('P' | 'M')[]> = {
  3: ['P', 'P', 'M', 'P', 'M', 'P', 'M'],
  4: ['P', 'M', 'P', 'M', 'P', 'M'],
  5: ['P', 'M', 'P', 'M', 'P', 'M'],
};

// ───────────── tiny pure helpers (safe for both sides to use) ─────────────

/** Share price for the harbor master (R4.1). */
export function sharePrice(marketValue: number): number {
  return Math.max(MIN_SHARE_PRICE, marketValue);
}

/** Next value on the black market track (capped at 30). */
export function nextMarketValue(value: number): number {
  const i = MARKET_TRACK.indexOf(value as (typeof MARKET_TRACK)[number]);
  if (i < 0) throw new Error(`Not a market track value: ${value}`);
  return MARKET_TRACK[Math.min(i + 1, MARKET_TRACK.length - 1)]!;
}

/** Stable string key for a placement target, e.g. "punt:jade", "port:A", "pirate", "insurance". */
export function targetKey(t: PlacementTarget): string {
  switch (t.kind) {
    case 'punt':
      return `punt:${t.ware}`;
    case 'port':
    case 'shipyard':
      return `${t.kind}:${t.slot}`;
    case 'pilot':
      return `pilot:${t.size}`;
    case 'pirate':
    case 'insurance':
      return t.kind;
  }
}

/**
 * Printed cost of a placement target. For punts pass the seat index (cheapest vacant seat).
 * Insurance costs 0 (and pays the premium). Blind passengers are handled by the engine (R5.6).
 */
export function targetCost(t: PlacementTarget, seat = 0): number {
  switch (t.kind) {
    case 'punt':
      return WARE_INFO[t.ware].seatCosts[seat] ?? NaN;
    case 'port':
      return PORT_SLOTS[t.slot].cost;
    case 'shipyard':
      return SHIPYARD_SLOTS[t.slot].cost;
    case 'pirate':
      return PIRATE_COST;
    case 'pilot':
      return PILOT_COST[t.size];
    case 'insurance':
      return 0;
  }
}
