import {
  CONTRACT_VERSION,
  type GameEvent,
  type GameState,
  type PendingDecision,
  type PlayerId,
  type PlayerView,
  type SeatState,
  type Ware,
  WARE_INFO,
} from '@manila/engine';

/**
 * Hand-made snapshot used while the engine is still stubbed (mock mode).
 * Voyage 3, second placement round of a 4-player game: one movement round done.
 * This file must never contain rules logic — it is a static picture of a legal state.
 */

const seats = (ware: Ware, occupants: Array<PlayerId | null>, pirateSeat = -1): SeatState[] =>
  WARE_INFO[ware].seatCosts.map((_, i) => ({
    occupant: occupants[i] ?? null,
    pirate: i === pirateSeat,
    blindPassenger: false,
  }));

export function createMockState(): GameState {
  return {
    contractVersion: CONTRACT_VERSION,
    config: {
      players: [
        { name: '小红', color: 'red' },
        { name: '阿蓝', color: 'blue' },
        { name: '橙子', color: 'orange' },
        { name: '紫苏', color: 'purple' },
      ],
      seed: 42,
      rules: { pirateDisplace: false },
    },
    players: [
      {
        id: 'p1',
        name: '小红',
        color: 'red',
        cash: 41,
        shares: [
          { id: 'jade-1', ware: 'jade', mortgaged: false },
          { id: 'silk-2', ware: 'silk', mortgaged: true },
        ],
        accomplices: 3,
        accomplicesPlaced: 1,
        passedPlacement: false,
      },
      {
        id: 'p2',
        name: '阿蓝',
        color: 'blue',
        cash: 18,
        shares: [
          { id: 'ginseng-1', ware: 'ginseng', mortgaged: false },
          { id: 'jade-2', ware: 'jade', mortgaged: false },
          { id: 'nutmeg-4', ware: 'nutmeg', mortgaged: false },
        ],
        accomplices: 3,
        accomplicesPlaced: 2,
        passedPlacement: false,
      },
      {
        id: 'p3',
        name: '橙子',
        color: 'orange',
        cash: 27,
        shares: [
          { id: 'silk-1', ware: 'silk', mortgaged: false },
          { id: 'silk-3', ware: 'silk', mortgaged: false },
        ],
        accomplices: 3,
        accomplicesPlaced: 1,
        passedPlacement: false,
      },
      {
        id: 'p4',
        name: '紫苏',
        color: 'purple',
        cash: 22,
        shares: [
          { id: 'nutmeg-1', ware: 'nutmeg', mortgaged: false },
          { id: 'ginseng-2', ware: 'ginseng', mortgaged: false },
        ],
        accomplices: 3,
        accomplicesPlaced: 1,
        passedPlacement: false,
      },
    ],
    voyage: 3,
    phase: 'placement',
    harborMaster: 'p2',
    market: { ginseng: 5, nutmeg: 10, silk: 0, jade: 5 },
    shareSupply: { ginseng: 3, nutmeg: 3, silk: 2, jade: 3 },
    auction: null,
    punts: [
      {
        ware: 'jade',
        route: 0,
        position: 7,
        status: 'sailing',
        dock: null,
        seats: seats('jade', ['p3']),
        plundered: false,
      },
      {
        ware: 'silk',
        route: 1,
        position: 6,
        status: 'sailing',
        dock: null,
        seats: seats('silk', ['p2']),
        plundered: false,
      },
      {
        ware: 'ginseng',
        route: 2,
        position: 10,
        status: 'sailing',
        dock: null,
        seats: seats('ginseng', []),
        plundered: false,
      },
    ],
    unloadedWare: 'nutmeg',
    port: {
      A: { occupant: 'p2', punt: null },
      B: { occupant: null, punt: null },
      C: { occupant: null, punt: null },
    },
    shipyard: {
      A: { occupant: null, punt: null },
      B: { occupant: null, punt: null },
      C: { occupant: null, punt: null },
    },
    pirates: { captain: 'p4', crew: null },
    pilots: { small: null, large: null },
    insurance: 'p1',
    placementRound: 1,
    movementRound: 1,
    lastRoll: { jade: 5, silk: 3, ginseng: 6 },
    pending: { type: 'place-accomplice', playerId: 'p3', round: 2, blindPassenger: false },
    rng: { seed: 42, state: 42, debugDiceUsed: 0 },
    turn: 23,
    result: null,
  };
}

/** Presentation-only redaction for mock mode (the real engine provides getPlayerView). */
export function mockView(state: GameState, viewer: PlayerId | null): PlayerView {
  const { rng: _rng, config, ...rest } = state;
  return {
    ...rest,
    config: { players: config.players, rules: config.rules },
    viewer,
    players: state.players.map((p) => ({
      ...p,
      shares: p.shares.map((s) => ({ ...s, ware: p.id === viewer ? s.ware : null })),
    })),
  };
}

export interface DemoStep {
  events: GameEvent[];
  pending: PendingDecision;
  pauseMs: number;
}

/**
 * A scripted end of voyage 3 (from the mock snapshot) that exercises every animation:
 * placement, a movement round, the final roll with docking, plunder, payouts, insurance,
 * market rise. Event payloads are hand-written; nothing here is computed from rules.
 */
export function mockDemoScript(): DemoStep[] {
  return [
    {
      events: [
        {
          type: 'accomplice-placed',
          playerId: 'p3',
          target: { kind: 'punt', ware: 'jade' },
          seat: 1,
          cost: 4,
          blindPassenger: false,
        },
        {
          type: 'accomplice-placed',
          playerId: 'p4',
          target: { kind: 'shipyard', slot: 'A' },
          seat: null,
          cost: 4,
          blindPassenger: false,
        },
        {
          type: 'accomplice-placed',
          playerId: 'p1',
          target: { kind: 'punt', ware: 'ginseng' },
          seat: 0,
          cost: 1,
          blindPassenger: false,
        },
      ],
      pending: { type: 'roll-dice', playerId: 'p2', round: 2 },
      pauseMs: 500,
    },
    {
      events: [
        { type: 'dice-rolled', round: 2, values: { jade: 3, silk: 6, ginseng: 4 } },
        { type: 'punt-moved', ware: 'jade', from: 7, to: 10, cause: 'dice' },
        { type: 'punt-moved', ware: 'silk', from: 6, to: 12, cause: 'dice' },
        { type: 'punt-moved', ware: 'ginseng', from: 10, to: 14, cause: 'dice' },
        { type: 'punt-docked', ware: 'ginseng', dock: 'port', slot: 'A' },
      ],
      pending: { type: 'roll-dice', playerId: 'p2', round: 3 },
      pauseMs: 700,
    },
    {
      events: [
        { type: 'dice-rolled', round: 3, values: { jade: 5, silk: 1 } },
        { type: 'punt-moved', ware: 'jade', from: 10, to: 15, cause: 'dice' },
        { type: 'punt-moved', ware: 'silk', from: 12, to: 13, cause: 'dice' },
        { type: 'punt-docked', ware: 'jade', dock: 'port', slot: 'B' },
        { type: 'punt-plundered', ware: 'silk', returned: ['p2'] },
        {
          type: 'payout',
          playerId: 'p4',
          amount: 30,
          source: 'bank',
          reason: 'plunder',
          ware: 'silk',
        },
        { type: 'punt-docked', ware: 'silk', dock: 'shipyard', slot: 'A' },
        {
          type: 'payout',
          playerId: 'p1',
          amount: 18,
          source: 'bank',
          reason: 'cargo',
          ware: 'ginseng',
        },
        {
          type: 'payout',
          playerId: 'p3',
          amount: 36,
          source: 'bank',
          reason: 'cargo',
          ware: 'jade',
        },
        { type: 'payout', playerId: 'p2', amount: 6, source: 'bank', reason: 'port', slot: 'A' },
        { type: 'repair-paid', payer: 'p1', to: 'p4', amount: 6, slot: 'A' },
        { type: 'market-rose', ware: 'ginseng', from: 5, to: 10 },
        { type: 'market-rose', ware: 'jade', from: 5, to: 10 },
        { type: 'voyage-ended', voyage: 3 },
      ],
      pending: { type: 'bid', playerId: 'p2', minBid: 1, maxBid: 54 },
      pauseMs: 0,
    },
  ];
}
