import { WARE_INFO, type GameEvent, type GameState, type PlayerState } from '@manila/engine';

/**
 * Presentation reducer: replays an event's *payload* onto the currently displayed state so the
 * board can show intermediate moments (boats arriving before the next voyage resets the board).
 *
 * This is NOT rules logic — it never decides anything, it only copies facts the engine already
 * reported (positions, docks, amounts). After the last event the display snaps to the engine's
 * real state, so any field not patched here is corrected automatically.
 */
export function patchDisplay(prev: GameState, e: GameEvent): GameState {
  const s = structuredClone(prev);
  const player = (id: string): PlayerState | undefined => s.players.find((p) => p.id === id);
  const punt = (ware: string) => s.punts.find((p) => p.ware === ware);

  switch (e.type) {
    case 'bid-placed':
      s.auction = {
        active: s.auction?.active ?? [],
        highBid: { playerId: e.playerId, amount: e.amount },
      };
      break;
    case 'bid-passed':
      if (s.auction) s.auction.active = s.auction.active.filter((id) => id !== e.playerId);
      break;
    case 'harbor-master-elected': {
      s.harborMaster = e.playerId;
      const p = player(e.playerId);
      if (p) p.cash -= e.price;
      break;
    }
    case 'share-bought': {
      const p = player(e.playerId);
      if (p) {
        p.cash -= e.price;
        p.shares.push({ id: `${e.ware}-bought-${s.turn}`, ware: e.ware, mortgaged: false });
      }
      s.shareSupply[e.ware] -= 1;
      break;
    }
    case 'loan-taken':
    case 'loan-repaid': {
      const p = player(e.playerId);
      const share = p?.shares.find((x) => x.id === e.shareId);
      if (p) p.cash += e.type === 'loan-taken' ? e.amount : -e.amount;
      if (share) share.mortgaged = e.type === 'loan-taken';
      break;
    }
    case 'punts-loaded':
      s.unloadedWare = e.unloaded;
      s.punts = e.punts.map((p) => ({
        ware: p.ware,
        route: p.route,
        position: p.start,
        status: 'sailing',
        dock: null,
        seats: WARE_INFO[p.ware].seatCosts.map(() => ({
          occupant: null,
          pirate: false,
          blindPassenger: false,
        })),
        plundered: false,
      }));
      break;
    case 'accomplice-placed': {
      const p = player(e.playerId);
      if (p) {
        p.cash -= e.cost;
        p.accomplicesPlaced += 1;
      }
      const t = e.target;
      if (t.kind === 'punt') {
        const seat = punt(t.ware)?.seats[e.seat ?? 0];
        if (seat) Object.assign(seat, { occupant: e.playerId, blindPassenger: e.blindPassenger });
      } else if (t.kind === 'port' || t.kind === 'shipyard')
        s[t.kind][t.slot].occupant = e.playerId;
      else if (t.kind === 'pirate') s.pirates[e.seat === 1 ? 'crew' : 'captain'] = e.playerId;
      else if (t.kind === 'pilot') s.pilots[t.size] = e.playerId;
      else s.insurance = e.playerId;
      break;
    }
    case 'placement-passed': {
      const p = player(e.playerId);
      if (p) p.passedPlacement = true;
      break;
    }
    case 'dice-rolled':
      s.lastRoll = e.values;
      s.movementRound = e.round;
      break;
    case 'punt-moved': {
      const p = punt(e.ware);
      if (p) p.position = e.to;
      break;
    }
    case 'punt-docked': {
      const p = punt(e.ware);
      if (p) {
        p.status = e.dock;
        p.dock = e.slot;
      }
      s[e.dock][e.slot].punt = e.ware;
      break;
    }
    case 'pirate-boarded': {
      const seat = punt(e.ware)?.seats[e.seat];
      if (seat) Object.assign(seat, { occupant: e.playerId, pirate: true, blindPassenger: false });
      if (s.pirates.captain === e.playerId) s.pirates.captain = null;
      else if (s.pirates.crew === e.playerId) s.pirates.crew = null;
      break;
    }
    case 'pirate-promoted':
      s.pirates = { captain: e.playerId, crew: null };
      break;
    case 'punt-plundered': {
      const p = punt(e.ware);
      if (p) {
        p.plundered = true;
        p.seats.forEach((seat) => Object.assign(seat, { occupant: null, pirate: false }));
      }
      break;
    }
    case 'payout': {
      const to = player(e.playerId);
      if (to) to.cash += e.amount;
      if (e.source !== 'bank') {
        const from = player(e.source);
        if (from) from.cash -= e.amount;
      }
      break;
    }
    case 'repair-paid': {
      if (e.payer !== 'bank') {
        const from = player(e.payer);
        if (from) from.cash -= e.amount;
      }
      if (e.to !== 'bank') {
        const to = player(e.to);
        if (to) to.cash += e.amount;
      }
      break;
    }
    case 'market-rose':
      s.market[e.ware] = e.to;
      break;
    case 'voyage-started':
    case 'voyage-ended':
    case 'pirate-stayed':
    case 'pilot-used':
    case 'share-declined':
    case 'game-ended':
      break;
  }
  return s;
}
