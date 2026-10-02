import {
  LOAN_AMOUNT,
  LOAN_REPAYMENT,
  PORT_SLOTS,
  SHIPYARD_SLOTS,
  DOCK_SLOTS,
  WARE_INFO,
} from '../contract/constants';
import type { GameEvent, GameState, PlayerState } from '../contract/types';
import { player } from './state';

type Payout = Extract<GameEvent, { type: 'payout' }>;

export function takeLoan(
  p: PlayerState,
  shareId: string,
  forced: boolean,
  events: GameEvent[],
): void {
  p.shares.find((s) => s.id === shareId)!.mortgaged = true;
  p.cash += LOAN_AMOUNT;
  events.push({ type: 'loan-taken', playerId: p.id, shareId, amount: LOAN_AMOUNT, forced });
}

export function repayLoan(p: PlayerState, shareId: string, events: GameEvent[]): void {
  p.shares.find((s) => s.id === shareId)!.mortgaged = false;
  p.cash -= LOAN_REPAYMENT;
  events.push({ type: 'loan-repaid', playerId: p.id, shareId, amount: LOAN_REPAYMENT });
}

/** R8.3 deterministic collateral order; never borrows more than necessary. */
export function finance(
  state: GameState,
  p: PlayerState,
  amount: number,
  events: GameEvent[],
): void {
  const shares = p.shares
    .filter((s) => !s.mortgaged)
    .sort(
      (a, b) =>
        state.market[a.ware] - state.market[b.ware] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  for (const share of shares) {
    if (p.cash >= amount) break;
    takeLoan(p, share.id, true, events);
  }
}

export function pay(state: GameState, p: PlayerState, amount: number, events: GameEvent[]): void {
  finance(state, p, amount, events);
  if (p.cash < amount) throw new Error('Payment was not validated');
  p.cash -= amount;
}

export function payout(
  state: GameState,
  event: Omit<Payout, 'type' | 'source'>,
  events: GameEvent[],
): void {
  player(state, event.playerId).cash += event.amount;
  events.push({ type: 'payout', source: 'bank', ...event });
}

/** R8.4 cargo then port, with one event per accomplice. */
export function settleMoney(state: GameState, events: GameEvent[]): void {
  for (const punt of state.punts) {
    if (punt.status !== 'port' || punt.plundered) continue;
    const occupants = punt.seats.flatMap((s) => (s.occupant ? [s.occupant] : []));
    for (const playerId of occupants) {
      payout(
        state,
        {
          playerId,
          amount: Math.floor(WARE_INFO[punt.ware].profit / occupants.length),
          reason: 'cargo',
          ware: punt.ware,
        },
        events,
      );
    }
  }
  for (const slot of DOCK_SLOTS) {
    const space = state.port[slot];
    if (space.punt && space.occupant) {
      payout(
        state,
        { playerId: space.occupant, amount: PORT_SLOTS[slot].reward, reason: 'port', slot },
        events,
      );
    }
  }

  // R8.5 collect all own profits before repairs. A payment to oneself is net zero,
  // even if cash is zero; it never forces a loan or creates bank subsidy.
  // Each funding leg emits exactly one transfer: payout to a player, otherwise
  // repair-paid to the bank. Emitting both would double-charge event consumers.
  const repairs: GameEvent[] = [];
  for (const slot of DOCK_SLOTS) {
    const space = state.shipyard[slot];
    if (!space.punt) continue;
    const amount = SHIPYARD_SLOTS[slot].reward;
    const to = space.occupant ?? 'bank';
    const insurer = state.insurance ? player(state, state.insurance) : null;
    if (insurer && to === insurer.id) {
      events.push({
        type: 'payout',
        playerId: to,
        amount,
        source: insurer.id,
        reason: 'shipyard',
        slot,
      });
      continue;
    }
    if (insurer) finance(state, insurer, amount, events);
    const paid = insurer ? Math.min(insurer.cash, amount) : 0;
    if (insurer) insurer.cash -= paid;
    for (const [payer, portion] of [
      [insurer?.id ?? 'bank', paid],
      ['bank', amount - paid],
    ] as const) {
      if (!portion) continue;
      if (space.occupant) {
        player(state, space.occupant).cash += portion;
        events.push({
          type: 'payout',
          playerId: space.occupant,
          source: payer,
          amount: portion,
          reason: 'shipyard',
          slot,
        });
      } else {
        repairs.push({ type: 'repair-paid', payer, to, amount: portion, slot });
      }
    }
  }
  // CONTRACT: all shipyard payouts precede repair animations.
  events.push(...repairs);
}
