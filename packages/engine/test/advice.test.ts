import { describe, expect, it } from 'vitest';
import {
  CONTRACT_VERSION,
  INSURANCE_PREMIUM,
  WARE_INFO,
  outlook,
  placementAdvice,
  type PlayerView,
  type PuntState,
  type Ware,
} from '../src/index';

function punt(ware: Ware, route: 0 | 1 | 2, position: number, occupants: string[] = []): PuntState {
  return {
    ware,
    route,
    position,
    status: 'sailing',
    dock: null,
    seats: WARE_INFO[ware].seatCosts.map((_, i) => ({
      occupant: occupants[i] ?? null,
      pirate: false,
      blindPassenger: false,
    })),
    plundered: false,
  };
}

const docks = () => ({
  A: { occupant: null, punt: null },
  B: { occupant: null, punt: null },
  C: { occupant: null, punt: null },
});

function view(overrides: Partial<PlayerView> = {}): PlayerView {
  const players = ['p1', 'p2', 'p3'].map((id) => ({
    id,
    name: id,
    color: 'red' as const,
    cash: id === 'p1' ? 3 : 30,
    shares: [],
    accomplices: 4,
    accomplicesPlaced: 0,
    passedPlacement: false,
  }));
  return {
    contractVersion: CONTRACT_VERSION,
    config: {
      players: players.map((p) => ({ name: p.name, color: p.color })),
      rules: { pirateDisplace: false },
    },
    viewer: 'p1',
    players,
    voyage: 1,
    phase: 'placement',
    harborMaster: 'p2',
    market: { ginseng: 0, nutmeg: 0, silk: 0, jade: 0 },
    shareSupply: { ginseng: 5, nutmeg: 5, silk: 5, jade: 5 },
    auction: null,
    punts: [punt('ginseng', 0, 12, ['p2']), punt('silk', 1, 7), punt('jade', 2, 13)],
    unloadedWare: 'nutmeg',
    port: docks(),
    shipyard: docks(),
    pirates: { captain: null, crew: null },
    pilots: { small: null, large: null },
    insurance: null,
    placementRound: 2,
    movementRound: 2,
    lastRoll: null,
    pending: { type: 'place-accomplice', playerId: 'p1', round: 3, blindPassenger: false },
    turn: 0,
    result: null,
    ...overrides,
  };
}

describe('ai/advice placementAdvice', () => {
  it('R5.3/R8.4 punt seat: cheapest vacant price, profit split with those aboard', () => {
    const a = placementAdvice(view(), 'p1', { kind: 'punt', ware: 'ginseng' });
    expect(a.cost).toBe(WARE_INFO.ginseng.seatCosts[1]);
    expect(a.payout).toBe(9); // 18 split between p2 and p1
    expect(a.chance).toBeCloseTo(outlook(12, 1).arrive + outlook(12, 1).on13); // no pirates
    expect(a.expected).toBeCloseTo(a.payout * a.chance! - a.cost);
  });

  it('R6.3 pirate: space 13 becomes plunder once the ship is manned', () => {
    const a = placementAdvice(view(), 'p1', { kind: 'pirate' });
    expect(a.cost).toBe(5);
    // One roll left: ginseng (12) and silk (7) each end on 13 one time in six; jade sails past.
    expect(a.payout).toBe(WARE_INFO.silk.profit);
    expect(a.chance).toBeCloseTo(1 - (5 / 6) ** 2);
    expect(a.expected).toBeCloseTo((WARE_INFO.ginseng.profit + WARE_INFO.silk.profit) / 6 - 5);
  });

  it('R5.8 port berth C pays only when three punts arrive', () => {
    const a = placementAdvice(view(), 'p1', { kind: 'port', slot: 'C' });
    expect(a.cost).toBe(2);
    expect(a.payout).toBe(15);
    // Ginseng and jade arrive anyway (no pirates); silk needs a 6 to reach 13.
    expect(a.chance).toBeCloseTo(1 / 6);
  });

  it('R5.5/R8.5 insurance: premium now, expected repair bill subtracted', () => {
    const a = placementAdvice(view(), 'p1', { kind: 'insurance' });
    expect(a.cost).toBe(0);
    expect(a.upfront).toBe(INSURANCE_PREMIUM);
    expect(a.liability).toBe(6 + 8 + 15);
    // Only silk can fail (5 in 6), filling berth A (6).
    expect(a.expected).toBeCloseTo(INSURANCE_PREMIUM - (5 / 6) * 6);
  });

  it('R5.6 blind passenger pays all remaining cash', () => {
    const v = view({
      pending: { type: 'place-accomplice', playerId: 'p1', round: 3, blindPassenger: true },
    });
    expect(placementAdvice(v, 'p1', { kind: 'pirate' }).cost).toBe(3);
    expect(placementAdvice(v, 'p1', { kind: 'insurance' }).cost).toBe(0);
  });

  it('pilot has no payout of its own', () => {
    const a = placementAdvice(view(), 'p1', { kind: 'pilot', size: 'large' });
    expect(a).toMatchObject({ cost: 5, payout: 0, chance: null, expected: null });
  });
});
