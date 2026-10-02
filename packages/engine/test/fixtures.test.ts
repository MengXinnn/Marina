import { describe, expect, it } from 'vitest';
import { createGame, replay } from '../src/index';
import { fixtures } from './scenarios';

describe('R2/R6/R7/R8 shared animation fixtures', () => {
  for (const fixture of fixtures)
    it(fixture.name, () => {
      const { state, events } = replay(fixture.config, fixture.actions);
      const flat = events.flat();
      // Reconstruct presentation cash exclusively from events. Every transfer
      // applies its full debit and credit once, as the web's reducer does.
      const cash = Object.fromEntries(
        createGame(fixture.config).players.map((p) => [p.id, p.cash]),
      );
      const transfer = (from: string, to: string, amount: number) => {
        if (from !== 'bank') cash[from] -= amount;
        if (to !== 'bank') cash[to] += amount;
      };
      for (const event of flat) {
        switch (event.type) {
          case 'loan-taken':
            transfer('bank', event.playerId, event.amount);
            break;
          case 'loan-repaid':
            transfer(event.playerId, 'bank', event.amount);
            break;
          case 'harbor-master-elected':
          case 'share-bought':
            transfer(event.playerId, 'bank', event.price);
            break;
          case 'accomplice-placed':
            transfer(event.playerId, 'bank', event.cost);
            break;
          case 'payout':
            transfer(event.source, event.playerId, event.amount);
            break;
          case 'repair-paid':
            transfer(event.payer, event.to, event.amount);
            break;
        }
        expect(Object.values(cash).every((amount) => amount >= 0)).toBe(true);
      }
      expect(cash).toEqual(Object.fromEntries(state.players.map((p) => [p.id, p.cash])));
      expect(flat.some((e) => e.type === 'voyage-ended')).toBe(true);
      if (fixture.name === 'pirate-boarding-and-plunder') {
        expect(flat.some((e) => e.type === 'pirate-boarded')).toBe(true);
        expect(flat.some((e) => e.type === 'pirate-promoted')).toBe(true);
        expect(flat.some((e) => e.type === 'punt-plundered')).toBe(true);
      }
      if (fixture.name === 'pilots-push-past-13') {
        expect(
          flat.flatMap((e) => (e.type === 'punt-moved' && e.cause === 'pilot' ? [e.to] : [])),
        ).toEqual([14, 14]);
        expect(
          events
            .at(-1)
            ?.filter((e) => e.type === 'punt-moved')
            .map((e) => e.ware),
        ).toEqual(['silk']);
      }
      if (fixture.name === 'insurance-bankruptcy') {
        expect(flat).toContainEqual({
          type: 'payout',
          source: 'bank',
          playerId: 'p2',
          reason: 'shipyard',
          amount: 5,
          slot: 'C',
        });
        expect(flat.filter((e) => e.type === 'loan-taken' && e.forced)).toHaveLength(2);
      }
    });
});
