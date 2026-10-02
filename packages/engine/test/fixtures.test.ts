import { describe, expect, it } from 'vitest';
import { replay } from '../src/index';
import { fixtures } from './scenarios';

describe('R2/R6/R7/R8 shared animation fixtures', () => {
  for (const fixture of fixtures)
    it(fixture.name, () => {
      const { events } = replay(fixture.config, fixture.actions);
      const flat = events.flat();
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
          type: 'repair-paid',
          payer: 'bank',
          to: 'p2',
          amount: 5,
          slot: 'C',
        });
        expect(flat.filter((e) => e.type === 'loan-taken' && e.forced)).toHaveLength(2);
      }
    });
});
