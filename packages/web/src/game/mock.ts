import {
  CONTRACT_VERSION,
  type GameState,
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
