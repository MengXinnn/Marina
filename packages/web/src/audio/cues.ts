import type { GameEvent } from '@manila/engine';

/** Named sound effects. Pure mapping from engine events, so it can be tested without audio. */
export type CueName =
  | 'dice'
  | 'oar'
  | 'arrive'
  | 'shipyard'
  | 'load'
  | 'place'
  | 'pass'
  | 'bid'
  | 'gavel'
  | 'share'
  | 'coins'
  | 'coinsOut'
  | 'cutlass'
  | 'cannon'
  | 'whistle'
  | 'rise'
  | 'bell'
  | 'cadence'
  | 'fanfare';

export interface Cue {
  name: CueName;
  /** Seconds after the step starts. */
  at: number;
  /** Cue-specific size: number of coins, market price step, … */
  arg?: number;
}

/** How many coins clink for a sum of pesos (1–5). */
export const coinCount = (pesos: number) => Math.max(1, Math.min(5, Math.ceil(pesos / 8)));

/**
 * Sounds for one animation step. Steps are single events except consecutive punt moves,
 * which play together; each space a punt advances gets one oar stroke, `hopSec` apart.
 */
export function cuesForStep(step: GameEvent[], hopSec: number): Cue[] {
  const e = step[0];
  if (!e) return [];
  const one = (name: CueName, arg?: number): Cue[] => [{ name, at: 0, arg }];
  switch (e.type) {
    case 'voyage-started':
      return one('bell');
    case 'bid-placed':
      return one('bid');
    case 'bid-passed':
    case 'share-declined':
    case 'placement-passed':
    case 'pirate-stayed':
      return one('pass');
    case 'harbor-master-elected':
      return one('gavel');
    case 'share-bought':
      return one('share');
    case 'loan-taken':
      return one('coins', coinCount(e.amount));
    case 'loan-repaid':
    case 'repair-paid':
      return one('coinsOut', coinCount(e.amount));
    case 'payout':
      return one('coins', coinCount(e.amount));
    case 'punts-loaded':
      return one('load');
    case 'accomplice-placed':
    case 'pirate-promoted':
      return one('place');
    case 'dice-rolled':
      return one('dice');
    case 'punt-moved': {
      const spaces = Math.max(
        ...step.map((m) => (m.type === 'punt-moved' ? Math.abs(m.to - m.from) : 0)),
      );
      return Array.from({ length: spaces }, (_, i) => ({ name: 'oar' as const, at: i * hopSec }));
    }
    case 'punt-docked':
      return one(e.dock === 'port' ? 'arrive' : 'shipyard');
    case 'pirate-boarded':
      return one('cutlass');
    case 'punt-plundered':
      return one('cannon');
    case 'pilot-used':
      return one('whistle');
    case 'market-rose':
      return one('rise', e.to);
    case 'voyage-ended':
      return one('cadence');
    case 'game-ended':
      return one('fanfare');
  }
}
