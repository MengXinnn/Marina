import {
  ACCOMPLICES_BY_PLAYER_COUNT,
  DEAL_POOL_PER_WARE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SHARES_PER_WARE,
  STARTING_CASH,
  STARTING_SHARES,
  WARES,
} from './contract/constants';
import { CONTRACT_VERSION } from './contract/types';
import type { GameConfig, GameState, Ware } from './contract/types';
import { copy, emptyDocks, funds } from './rules/state';
import { shuffle } from './rng';

const isWare = (value: unknown): value is Ware => WARES.includes(value as Ware);

/** Validate once at the boundary; malformed debug data must not poison a later roll. */
function validate(config: GameConfig): void {
  if (
    !config ||
    !Array.isArray(config.players) ||
    config.players.length < MIN_PLAYERS ||
    config.players.length > MAX_PLAYERS
  )
    throw new Error('R1.1 requires 3–5 players');
  const colors = ['red', 'blue', 'orange', 'purple', 'white'];
  if (config.players.some((p) => !p || typeof p.name !== 'string' || !colors.includes(p.color)))
    throw new Error('Invalid player setup');
  if (config.seed !== undefined && !Number.isSafeInteger(config.seed))
    throw new Error('Seed must be a finite safe integer');
  if (
    config.rules?.pirateDisplace !== undefined &&
    typeof config.rules.pirateDisplace !== 'boolean'
  )
    throw new Error('pirateDisplace must be boolean');
  const deal = config.debug?.deal;
  if (deal !== undefined) {
    if (
      !Array.isArray(deal) ||
      deal.length !== config.players.length ||
      deal.some(
        (hand) =>
          !Array.isArray(hand) ||
          hand.length !== STARTING_SHARES ||
          hand.some((ware) => !isWare(ware)),
      )
    )
      throw new Error('debug.deal must contain two wares per player');
    if (WARES.some((ware) => deal.flat().filter((w) => w === ware).length > DEAL_POOL_PER_WARE))
      throw new Error('debug.deal exceeds the opening pool');
  }
  const dice = config.debug?.dice;
  if (
    dice !== undefined &&
    (!Array.isArray(dice) ||
      dice.some(
        (roll) =>
          !roll ||
          typeof roll !== 'object' ||
          Array.isArray(roll) ||
          Object.entries(roll).some(
            ([ware, n]) => !isWare(ware) || !Number.isInteger(n) || n < 1 || n > 6,
          ),
      ))
  )
    throw new Error('debug.dice must contain d6 results by ware');
}

/** R1 initialization. Kept separate from transitions so creation never needs hidden state. */
export function initialState(input: GameConfig): GameState {
  validate(input);
  const config = copy(input);
  // R1.6 / contract v0.2.0: entropy belongs to the caller; omitted seed means 0.
  const seed = (config.seed ?? 0) >>> 0;
  const rng = { seed, state: seed, debugDiceUsed: 0 };
  const pool = WARES.flatMap((ware) => Array<Ware>(DEAL_POOL_PER_WARE).fill(ware));
  if (!config.debug?.deal) shuffle(pool, rng);
  const shareSupply = {
    ginseng: SHARES_PER_WARE,
    nutmeg: SHARES_PER_WARE,
    silk: SHARES_PER_WARE,
    jade: SHARES_PER_WARE,
  };
  let serial = 0;
  const players = config.players.map((p, index) => ({
    ...p,
    id: `p${index + 1}`,
    cash: STARTING_CASH,
    shares: (
      config.debug?.deal?.[index] ??
      pool.slice(index * STARTING_SHARES, (index + 1) * STARTING_SHARES)
    ).map((ware) => {
      shareSupply[ware]--;
      // Opaque ids avoid leaking private wares in PlayerView (R1.2).
      return { id: `share-${++serial}`, ware, mortgaged: false };
    }),
    accomplices: ACCOMPLICES_BY_PLAYER_COUNT[config.players.length],
    accomplicesPlaced: 0,
    passedPlacement: false,
  }));
  return {
    contractVersion: CONTRACT_VERSION,
    config: { ...config, seed, rules: { pirateDisplace: false, ...config.rules } },
    players,
    voyage: 1,
    phase: 'auction',
    harborMaster: null,
    market: { ginseng: 0, nutmeg: 0, silk: 0, jade: 0 },
    shareSupply,
    auction: { highBid: null, active: players.map((p) => p.id) },
    punts: [],
    unloadedWare: null,
    port: emptyDocks(),
    shipyard: emptyDocks(),
    pirates: { captain: null, crew: null },
    pilots: { small: null, large: null },
    insurance: null,
    placementRound: 0,
    movementRound: 0,
    lastRoll: null,
    pending: { type: 'bid', playerId: players[0].id, minBid: 1, maxBid: funds(players[0]) },
    rng,
    turn: 0,
    result: null,
  };
}
