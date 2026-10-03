import { describe, expect, it } from 'vitest';
import {
  CONTRACT_VERSION,
  WARE_INFO,
  atLeast,
  chooseBotAction,
  outlook,
  type Action,
  type PendingDecision,
  type PlayerView,
  type PuntState,
  type Ware,
} from '../src/index';

/** Deterministic [0,1) source for the bots. */
function lcg(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

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

const emptyDocks = () => ({
  A: { occupant: null, punt: null },
  B: { occupant: null, punt: null },
  C: { occupant: null, punt: null },
});

/** Minimal 4-player view of p1 in mid-voyage; override what each test needs. */
function view(overrides: Partial<PlayerView> & { pending: PendingDecision }): PlayerView {
  const players = ['p1', 'p2', 'p3', 'p4'].map((id) => ({
    id,
    name: id,
    color: 'red' as const,
    cash: 30,
    shares: id === 'p1' ? [{ id: 'share-1', ware: 'ginseng' as Ware, mortgaged: false }] : [],
    accomplices: 3,
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
    market: { ginseng: 5, nutmeg: 0, silk: 0, jade: 0 },
    shareSupply: { ginseng: 2, nutmeg: 3, silk: 3, jade: 3 },
    auction: null,
    punts: [punt('ginseng', 0, 4), punt('silk', 1, 3), punt('jade', 2, 2)],
    unloadedWare: 'nutmeg',
    port: emptyDocks(),
    shipyard: emptyDocks(),
    pirates: { captain: null, crew: null },
    pilots: { small: null, large: null },
    insurance: null,
    placementRound: 0,
    movementRound: 0,
    lastRoll: null,
    turn: 0,
    result: null,
    ...overrides,
  };
}

const place = (target: Extract<Action, { type: 'place-accomplice' }>['target']): Action => ({
  type: 'place-accomplice',
  playerId: 'p1',
  target,
});
const PASS: Action = { type: 'pass-placement', playerId: 'p1' };
const bot = (v: PlayerView, legal: Action[], seed = 7) =>
  chooseBotAction(v, legal, { level: 'normal', random: lcg(seed) });

describe('ai/probability', () => {
  it('R5.7/R5.8 matches hand-computed single-roll outcomes', () => {
    expect(outlook(12, 1).arrive).toBeCloseTo(5 / 6);
    expect(outlook(12, 1).on13).toBeCloseTo(1 / 6);
    expect(outlook(7, 1)).toEqual({ arrive: 0, on13: 1 / 6, fail: 5 / 6 });
    expect(outlook(13, 0)).toEqual({ arrive: 0, on13: 1, fail: 0 });
    expect(outlook(14, 2).arrive).toBe(1);
  });

  it('R5.8 agrees with brute-force enumeration over three dice (surplus is lost)', () => {
    for (const start of [0, 2, 5]) {
      let arrive = 0;
      let on13 = 0;
      for (let a = 1; a <= 6; a++)
        for (let b = 1; b <= 6; b++)
          for (let c = 1; c <= 6; c++) {
            let p = start;
            for (const d of [a, b, c]) if (p <= 13) p += d;
            if (p > 13) arrive++;
            else if (p === 13) on13++;
          }
      expect(outlook(start, 3).arrive).toBeCloseTo(arrive / 216, 10);
      expect(outlook(start, 3).on13).toBeCloseTo(on13 / 216, 10);
    }
  });

  it('R5.4/R5.8 computes Poisson-binomial tails for port and shipyard slots', () => {
    expect(atLeast([0.5, 0.5], 1)).toBeCloseTo(0.75);
    expect(atLeast([0.5, 0.5], 2)).toBeCloseTo(0.25);
    expect(atLeast([1, 0, 1], 3)).toBe(0);
  });
});

describe('ai/chooseBotAction', () => {
  const placing: PendingDecision = {
    type: 'place-accomplice',
    playerId: 'p1',
    round: 3,
    blindPassenger: false,
  };

  it('R5.2 only ever returns one of the legal actions it was given', () => {
    const legal = [place({ kind: 'insurance' }), place({ kind: 'punt', ware: 'jade' }), PASS];
    for (let seed = 1; seed < 30; seed++) {
      expect(legal).toContainEqual(bot(view({ pending: placing }), legal, seed));
      expect(legal).toContainEqual(
        chooseBotAction(view({ pending: placing }), legal, { level: 'easy', random: lcg(seed) }),
      );
    }
  });

  it('R1.6 is deterministic for a given random source', () => {
    const legal = [place({ kind: 'insurance' }), place({ kind: 'punt', ware: 'silk' }), PASS];
    expect(bot(view({ pending: placing }), legal, 3)).toEqual(
      bot(view({ pending: placing }), legal, 3),
    );
  });

  it('R5.3 takes a cheap seat on a punt that is almost home', () => {
    const v = view({
      pending: placing,
      movementRound: 2,
      punts: [punt('ginseng', 0, 12), punt('silk', 1, 3), punt('jade', 2, 2)],
    });
    const legal = [
      place({ kind: 'punt', ware: 'ginseng' }),
      place({ kind: 'punt', ware: 'jade' }),
      place({ kind: 'insurance' }),
      PASS,
    ];
    expect(bot(v, legal)).toEqual(place({ kind: 'punt', ware: 'ginseng' }));
  });

  it('R5.5/R8.5 collects the insurance premium when no punt can fail any more', () => {
    const docked = (p: PuntState, slot: 'A' | 'B' | 'C'): PuntState => ({
      ...p,
      status: 'port',
      dock: slot,
    });
    const v = view({
      pending: placing,
      movementRound: 2,
      punts: [
        docked(punt('ginseng', 0, 14), 'A'),
        docked(punt('silk', 1, 14), 'B'),
        docked(punt('jade', 2, 14), 'C'),
      ],
    });
    const legal = [place({ kind: 'insurance' }), place({ kind: 'shipyard', slot: 'A' }), PASS];
    expect(bot(v, legal)).toEqual(place({ kind: 'insurance' }));
  });

  it('R5.2/R8.3 passes instead of volunteering a loan or a losing placement', () => {
    const v = view({
      pending: placing,
      movementRound: 2,
      punts: [punt('ginseng', 0, 1), punt('silk', 1, 1), punt('jade', 2, 1)],
    });
    const loan: Action = { type: 'take-loan', playerId: 'p1', shareId: 'share-1' };
    expect(bot(v, [loan, place({ kind: 'port', slot: 'A' }), PASS])).toEqual(PASS);
  });

  it('R6.2 boards a punt waiting on 13 after the second roll', () => {
    const v = view({
      pending: { type: 'pirate-board', playerId: 'p1', role: 'captain', candidates: ['jade'] },
      phase: 'pirates',
      movementRound: 2,
      pirates: { captain: 'p1', crew: null },
      punts: [punt('ginseng', 0, 9), punt('silk', 1, 8), punt('jade', 2, 13, ['p2'])],
    });
    const legal: Action[] = [
      { type: 'pirate-board', playerId: 'p1', ware: 'jade' },
      { type: 'pirate-board', playerId: 'p1', ware: null },
    ];
    expect(bot(v, legal)).toEqual(legal[0]);
  });

  it('R10 uses the strong-pirate variant to displace onto a full punt', () => {
    const v = view({
      pending: { type: 'pirate-board', playerId: 'p1', role: 'captain', candidates: ['silk'] },
      phase: 'pirates',
      movementRound: 2,
      config: { players: [], rules: { pirateDisplace: true } },
      pirates: { captain: 'p1', crew: null },
      punts: [punt('ginseng', 0, 9), punt('silk', 1, 13, ['p2', 'p3', 'p4']), punt('jade', 2, 6)],
    });
    const legal: Action[] = [
      { type: 'pirate-board', playerId: 'p1', ware: 'silk', displaceSeat: 2 },
      { type: 'pirate-board', playerId: 'p1', ware: null },
    ];
    expect(bot(v, legal)).toEqual(legal[0]);
  });

  it('R1.6 returns cached outlooks that callers cannot corrupt', () => {
    const o = outlook(9, 2);
    expect(Object.isFrozen(o)).toBe(true);
    expect(() => {
      (o as { arrive: number }).arrive = 99;
    }).toThrow();
    expect(outlook(9, 2).arrive).toBeLessThan(1);
  });

  it('R7.3 uses the large pilot to push its own punt past 13', () => {
    const v = view({
      pending: { type: 'pilot', playerId: 'p1', size: 'large' },
      phase: 'pilots',
      movementRound: 2,
      pirates: { captain: 'p3', crew: null },
      punts: [punt('ginseng', 0, 12, ['p1']), punt('silk', 1, 8), punt('jade', 2, 6)],
    });
    const legal: Action[] = [
      { type: 'pilot', playerId: 'p1', moves: [] },
      { type: 'pilot', playerId: 'p1', moves: [{ ware: 'ginseng', delta: 2 }] },
      { type: 'pilot', playerId: 'p1', moves: [{ ware: 'ginseng', delta: -1 }] },
    ];
    expect(bot(v, legal)).toEqual(legal[1]);
  });

  it('R3.2/R3.3 bids cheaply for the office but does not overpay', () => {
    const auction = (minBid: number): PlayerView =>
      view({
        pending: { type: 'bid', playerId: 'p1', minBid, maxBid: 42 },
        phase: 'auction',
        punts: [],
      });
    const legalFrom = (minBid: number): Action[] => [
      { type: 'pass-bid', playerId: 'p1' },
      ...Array.from({ length: 42 - minBid + 1 }, (_, i) => ({
        type: 'bid' as const,
        playerId: 'p1',
        amount: minBid + i,
      })),
    ];
    expect(bot(auction(1), legalFrom(1))).toEqual({ type: 'bid', playerId: 'p1', amount: 1 });
    expect(bot(auction(25), legalFrom(25))).toEqual({ type: 'pass-bid', playerId: 'p1' });
  });
});
