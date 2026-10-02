import { describe, expect, it } from 'vitest';
import {
  CONTRACT_VERSION,
  MARKET_TRACK,
  PORT_SLOTS,
  SHIPYARD_SLOTS,
  WARE_INFO,
  WARES,
  nextMarketValue,
  sharePrice,
  targetCost,
  targetKey,
} from '../src/index';

describe('contract constants (docs/RULES.md)', () => {
  it('exposes a semver contract version', () => {
    expect(CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('has the four wares with the printed seats and profits (R5.3)', () => {
    expect(WARES).toEqual(['ginseng', 'nutmeg', 'silk', 'jade']);
    expect(WARE_INFO.ginseng).toEqual({ seatCosts: [1, 2, 3], profit: 18 });
    expect(WARE_INFO.nutmeg).toEqual({ seatCosts: [2, 3, 4], profit: 24 });
    expect(WARE_INFO.silk).toEqual({ seatCosts: [3, 4, 5], profit: 30 });
    expect(WARE_INFO.jade).toEqual({ seatCosts: [3, 4, 5, 5], profit: 36 });
  });

  it('cargo profit always splits evenly among any number of seated accomplices', () => {
    for (const ware of WARES) {
      const { seatCosts, profit } = WARE_INFO[ware];
      for (let n = 1; n <= seatCosts.length; n++) expect(profit % n).toBe(0);
    }
  });

  it('port and shipyard slots cost 4/3/2 and pay 6/8/15 (R5.4)', () => {
    for (const slots of [PORT_SLOTS, SHIPYARD_SLOTS]) {
      expect(slots).toEqual({
        A: { cost: 4, reward: 6 },
        B: { cost: 3, reward: 8 },
        C: { cost: 2, reward: 15 },
      });
    }
  });

  it('steps the black market track and caps at 30 (R9.1)', () => {
    expect(MARKET_TRACK).toEqual([0, 5, 10, 20, 30]);
    expect(nextMarketValue(0)).toBe(5);
    expect(nextMarketValue(10)).toBe(20);
    expect(nextMarketValue(30)).toBe(30);
    expect(() => nextMarketValue(7)).toThrow();
  });

  it('prices shares at max(5, market value) (R4.1)', () => {
    expect(sharePrice(0)).toBe(5);
    expect(sharePrice(5)).toBe(5);
    expect(sharePrice(20)).toBe(20);
  });

  it('builds stable target keys and printed costs', () => {
    expect(targetKey({ kind: 'punt', ware: 'jade' })).toBe('punt:jade');
    expect(targetKey({ kind: 'shipyard', slot: 'B' })).toBe('shipyard:B');
    expect(targetKey({ kind: 'pirate' })).toBe('pirate');
    expect(targetCost({ kind: 'punt', ware: 'jade' }, 3)).toBe(5);
    expect(targetCost({ kind: 'pilot', size: 'large' })).toBe(5);
    expect(targetCost({ kind: 'insurance' })).toBe(0);
  });
});
