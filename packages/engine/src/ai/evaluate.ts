import {
  DOCK_SLOTS,
  PORT_SLOTS,
  SHIPYARD_SLOTS,
  WARE_INFO,
  nextMarketValue,
} from '../contract/constants';
import type { PlayerId, PlayerView, PuntState, Ware } from '../contract/types';
import { atLeast, outlook } from './probability';

/**
 * Expected-value model used by the bots. It only reads a PlayerView, so a bot never sees
 * information its seat could not see at the table.
 */

/** How much a bot values one notch of market rise on a share it holds (paid only at game end). */
const SHARE_WEIGHT = 0.6;

export interface PuntFate {
  arrive: number;
  fail: number;
  /** Ends on 13 after the last roll while pirates are aboard the pirate ship (R6.3). */
  plunder: number;
}

export function rollsLeft(view: PlayerView): number {
  return 3 - view.movementRound;
}

export function piratesPresent(view: PlayerView): boolean {
  return view.pirates.captain !== null || view.pirates.crew !== null;
}

/** Probabilities for one punt; `position` overrides the displayed one (pilot what-ifs). */
export function fateOf(view: PlayerView, punt: PuntState, position = punt.position): PuntFate {
  if (punt.status === 'port') return { arrive: 1, fail: 0, plunder: 0 };
  if (punt.status === 'shipyard') return { arrive: 0, fail: 1, plunder: 0 };
  const o = outlook(position, rollsLeft(view));
  // R6.3: on 13 with an empty pirate ship the punt simply docks in port.
  return piratesPresent(view)
    ? { arrive: o.arrive, fail: o.fail, plunder: o.on13 }
    : { arrive: o.arrive + o.on13, fail: o.fail, plunder: 0 };
}

export function myShares(view: PlayerView, me: PlayerId, ware: Ware): number {
  return view.players.find((p) => p.id === me)?.shares.filter((s) => s.ware === ware).length ?? 0;
}

/**
 * Expected pesos (plus weighted share appreciation) `me` collects from the current voyage.
 * Already-paid amounts (seat costs, insurance premium) are sunk and not included.
 */
export function stakeValue(
  view: PlayerView,
  me: PlayerId,
  positions: Partial<Record<Ware, number>> = {},
): number {
  const fates = view.punts.map((p) => fateOf(view, p, positions[p.ware] ?? p.position));
  // A plundered punt goes to port or shipyard at the captain's whim: count it half each way.
  const toPort = fates.map((f) => f.arrive + f.plunder / 2);
  const toYard = fates.map((f) => f.fail + f.plunder / 2);
  let ev = 0;

  view.punts.forEach((p, i) => {
    const occupied = p.seats.filter((s) => s.occupant).length;
    const mine = p.seats.filter((s) => s.occupant === me).length;
    if (mine) ev += (fates[i]!.arrive * WARE_INFO[p.ware].profit * mine) / occupied;
    const held = myShares(view, me, p.ware);
    if (held) {
      const v = view.market[p.ware];
      ev += SHARE_WEIGHT * held * (nextMarketValue(v) - v) * toPort[i]!;
    }
  });

  DOCK_SLOTS.forEach((slot, k) => {
    if (view.port[slot].occupant === me) ev += atLeast(toPort, k + 1) * PORT_SLOTS[slot].reward;
    if (view.shipyard[slot].occupant === me)
      ev += atLeast(toYard, k + 1) * SHIPYARD_SLOTS[slot].reward;
    if (view.insurance === me) ev -= atLeast(toYard, k + 1) * SHIPYARD_SLOTS[slot].reward;
  });

  const pirates = [view.pirates.captain, view.pirates.crew].filter(Boolean);
  const myPirates = pirates.filter((id) => id === me).length;
  if (myPirates)
    view.punts.forEach((p, i) => {
      ev += (fates[i]!.plunder * WARE_INFO[p.ware].profit * myPirates) / pirates.length;
    });
  return ev;
}

/** JSON clone — PlayerView is plain data by contract. */
export function cloneView(view: PlayerView): PlayerView {
  return JSON.parse(JSON.stringify(view)) as PlayerView;
}
