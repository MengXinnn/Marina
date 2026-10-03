import {
  DOCK_SLOTS,
  INSURANCE_PREMIUM,
  PORT_SLOTS,
  SHIPYARD_SLOTS,
  WARE_INFO,
  targetCost,
} from '../contract/constants';
import type { PlacementTarget, PlayerId, PlayerView } from '../contract/types';
import { fateOf, withPlacement } from './evaluate';
import { atLeast } from './probability';

/**
 * What a placement is worth in pesos, for the player choosing it — the numbers the web shows
 * next to a spot ("pay 3, get 15 with 42%"). Pure reads of a PlayerView; the dice odds assume
 * nobody else moves a punt (pilots) and no further accomplices join.
 */
export interface PlacementAdvice {
  /** Pesos paid now. A blind passenger pays all remaining cash instead of the price (R5.6). */
  cost: number;
  /** Pesos received at once, whatever the dice do (insurance premium, R5.5). */
  upfront: number;
  /** Pesos received if it works out: cargo share, berth reward or plunder share. 0 = none. */
  payout: number;
  /** Probability of `payout` on the current board; null when the spot pays nothing by itself. */
  chance: number | null;
  /** Worst-case bill the spot may bring (insurance repairs, R8.5). */
  liability: number;
  /** Expected net pesos: upfront + E[payout] − E[liability] − cost; null for pilots. */
  expected: number | null;
}

/** Seat a punt target would get: the cheapest vacant one (R5.3). */
function puntSeat(view: PlayerView, t: Extract<PlacementTarget, { kind: 'punt' }>): number {
  return view.punts.find((p) => p.ware === t.ware)?.seats.findIndex((s) => !s.occupant) ?? -1;
}

export function placementAdvice(
  view: PlayerView,
  me: PlayerId,
  t: PlacementTarget,
): PlacementAdvice {
  const printed = targetCost(t, Math.max(0, t.kind === 'punt' ? puntSeat(view, t) : 0));
  const cash = view.players.find((p) => p.id === me)?.cash ?? 0;
  const blind =
    view.pending.type === 'place-accomplice' &&
    view.pending.playerId === me &&
    view.pending.blindPassenger;
  // R5.6: a blind passenger pays everything they have (insurance stays free).
  const cost = blind && t.kind !== 'insurance' ? cash : printed;

  // Odds after the placement: an accomplice on the pirate ship turns space 13 into a plunder.
  const after = withPlacement(view, me, t);
  const fates = after.punts.map((p) => fateOf(after, p));
  // A plundered punt goes to port or shipyard at the captain's whim: count it half each way.
  const toPort = fates.map((f) => f.arrive + f.plunder / 2);
  const toYard = fates.map((f) => f.fail + f.plunder / 2);
  const result = (payout: number, chance: number | null, upfront = 0, liability = 0) => ({
    cost,
    upfront,
    payout,
    chance,
    liability,
    expected: upfront + payout * (chance ?? 0) - cost,
  });

  switch (t.kind) {
    case 'punt': {
      const i = after.punts.findIndex((p) => p.ware === t.ware);
      const aboard = after.punts[i]?.seats.filter((s) => s.occupant).length ?? 1;
      // R8.4: the accomplices aboard split the profit, rounded down.
      return result(Math.floor(WARE_INFO[t.ware].profit / Math.max(1, aboard)), fates[i]!.arrive);
    }
    case 'port':
    case 'shipyard': {
      // R5.8/R5.9: berths fill A → B → C, so berth k pays when at least k+1 punts get there.
      const k = DOCK_SLOTS.indexOf(t.slot);
      const table = t.kind === 'port' ? PORT_SLOTS : SHIPYARD_SLOTS;
      return result(table[t.slot].reward, atLeast(t.kind === 'port' ? toPort : toYard, k + 1));
    }
    case 'pirate': {
      const crew = [after.pirates.captain, after.pirates.crew].filter(Boolean).length;
      const captain = after.pirates.captain === me;
      // R6.3: pirates split the profit, rounded down; the captain keeps the remainder.
      const share = (profit: number) => Math.floor(profit / crew) + (captain ? profit % crew : 0);
      const shares = after.punts.map((p, i) =>
        fates[i]!.plunder > 0 ? share(WARE_INFO[p.ware].profit) : 0,
      );
      const any = 1 - fates.reduce((q, f) => q * (1 - f.plunder), 1);
      const ev = fates.reduce((s, f, i) => s + f.plunder * shares[i]!, 0);
      return { ...result(Math.max(0, ...shares), any), expected: ev - cost };
    }
    case 'insurance': {
      // R8.5: the agent pays every shipyard berth that fills, occupied or not.
      let liability = 0;
      let expectedBill = 0;
      DOCK_SLOTS.forEach((slot, k) => {
        if (k >= after.punts.filter((p) => p.status !== 'port').length) return;
        liability += SHIPYARD_SLOTS[slot].reward;
        expectedBill += atLeast(toYard, k + 1) * SHIPYARD_SLOTS[slot].reward;
      });
      return {
        ...result(0, null, INSURANCE_PREMIUM, liability),
        expected: INSURANCE_PREMIUM - expectedBill - cost,
      };
    }
    case 'pilot':
      // The pilot's value is whatever the moves it makes are worth to its owner.
      return { ...result(0, null), expected: null };
  }
}
