/**
 * Manila engine ⇄ web CONTRACT.
 *
 * ⚠️ Co-owned file (engine agent + web agent). Any change MUST:
 *   1. go through a PR labelled `contract`,
 *   2. bump CONTRACT_VERSION (semver: additive = minor, rename/remove = major),
 *   3. add an entry to docs/CONTRACT.md → "Changelog".
 *
 * Design rules:
 *   - Everything here is plain JSON-serialisable data (no classes, no Maps, no functions).
 *   - The engine is pure: applyAction never mutates its input state.
 *   - The web never re-implements rules. It renders `GameState`/`PlayerView`, sends `Action`s,
 *     and animates the `GameEvent`s returned by applyAction.
 *   - Rule references like (R4.2) point to docs/RULES.md.
 */

export const CONTRACT_VERSION = '0.2.0';

// ───────────────────────────── primitives ─────────────────────────────

export type Ware = 'ginseng' | 'nutmeg' | 'silk' | 'jade';
export type PlayerId = string;
/** Chosen to stay distinct from the ware colours (ginseng yellow, nutmeg brown, silk cyan, jade green). */
export type PlayerColor = 'red' | 'blue' | 'orange' | 'purple' | 'white';
export type DockSlot = 'A' | 'B' | 'C';
export type Dock = 'port' | 'shipyard';
export type PilotSize = 'small' | 'large';
export type PirateRole = 'captain' | 'crew';
/** Index of the sea route (lane) a punt sails on. Purely positional; all routes are identical. */
export type RouteIndex = 0 | 1 | 2;
export type MovementRound = 1 | 2 | 3;

// ───────────────────────────── config ─────────────────────────────

export interface PlayerSetup {
  name: string;
  color: PlayerColor;
}

export interface RuleOptions {
  /** Variant (R10): pirates may displace an accomplice when boarding a full punt. Default false. */
  pirateDisplace: boolean;
}

export interface GameConfig {
  /** 3–5 players, in clockwise seating order. players[0] is the "oldest player" who opens voyage 1's auction. */
  players: PlayerSetup[];
  /** RNG seed for share dealing + dice. Omit for deterministic seed 0.
   * Callers wanting fresh games generate a seed before calling the pure engine. */
  seed?: number;
  rules?: Partial<RuleOptions>;
  /** Test / demo hooks. Never used in normal play. */
  debug?: {
    /** Dice results consumed in order, one entry per roll-dice action. Falls back to RNG when exhausted. */
    dice?: Array<Partial<Record<Ware, number>>>;
    /** Override the initial share deal: playerIndex → wares. */
    deal?: Ware[][];
  };
}

// ───────────────────────────── state ─────────────────────────────

export interface ShareCard {
  /** Stable id, unique within a game (e.g. "jade-3"). */
  id: string;
  ware: Ware;
  /** Mortgaged ("encumbered") for a 12-peso loan (R8). */
  mortgaged: boolean;
}

export interface PlayerState {
  /** "p1".."p5", assigned by createGame in config.players order. */
  id: PlayerId;
  name: string;
  color: PlayerColor;
  cash: number;
  shares: ShareCard[];
  /** Accomplices owned for the whole game: 4 with 3 players, otherwise 3 (R1.3). */
  accomplices: number;
  /** Accomplices currently deployed this voyage. Available = accomplices - accomplicesPlaced. */
  accomplicesPlaced: number;
  /** True once the player has passed during placement this voyage (R5.2). */
  passedPlacement: boolean;
}

export interface SeatState {
  occupant: PlayerId | null;
  /** True if the occupant got here by pirate boarding (R6.2) — the web draws a pirate hat. */
  pirate: boolean;
  /** True if placed as a blind passenger (R5.6). */
  blindPassenger: boolean;
}

export type PuntStatus = 'sailing' | 'port' | 'shipyard';

export interface PuntState {
  ware: Ware;
  route: RouteIndex;
  /** 0..13 while sailing. When docked, keeps the last on-route position (14 = passed the end). */
  position: number;
  status: PuntStatus;
  /** Dock slot once status is 'port' or 'shipyard'. */
  dock: DockSlot | null;
  /** Seats ordered by cost ascending (index 0 = cheapest). Costs: WARE_INFO[ware].seatCosts. */
  seats: SeatState[];
  /** True if this punt was plundered by pirates this voyage (R6.3). */
  plundered: boolean;
}

export interface DockSpace {
  /** Accomplice standing on this port/shipyard space. */
  occupant: PlayerId | null;
  /** Ware of the punt that landed in this slot, if any. */
  punt: Ware | null;
}

export interface AuctionState {
  highBid: { playerId: PlayerId; amount: number } | null;
  /** Players who have NOT passed yet, in turn order. */
  active: PlayerId[];
}

export type Phase =
  | 'auction' // 港务长竞拍 (R3)
  | 'harbor-master' // 港务长：买股票 → 装货与下水 (R4)
  | 'placement' // 派遣同伙 (R5)
  | 'movement' // 等待港务长掷骰 (R5.7)
  | 'pirates' // 海盗登船 / 劫掠去向 (R6)
  | 'pilots' // 领航员行动 (R7)
  | 'game-over';

/** Exactly one decision is pending at any time. The web shows UI for `pending.playerId`. */
export type PendingDecision =
  | { type: 'bid'; playerId: PlayerId; minBid: number; maxBid: number }
  | {
      type: 'buy-share';
      playerId: PlayerId;
      /** Price per ware = max(5, market value) (R4.1). Only wares still in supply are listed. */
      prices: Partial<Record<Ware, number>>;
    }
  | { type: 'load-punts'; playerId: PlayerId }
  | {
      type: 'place-accomplice';
      playerId: PlayerId;
      /** 1-based placement round within this voyage. */
      round: number;
      /** True if the player qualifies as a blind passenger (R5.6). */
      blindPassenger: boolean;
    }
  | { type: 'roll-dice'; playerId: PlayerId; round: MovementRound }
  | {
      type: 'pirate-board';
      playerId: PlayerId;
      role: PirateRole;
      /** Punts standing on 13 after movement round 2 that this pirate may board. */
      candidates: Ware[];
    }
  | { type: 'pilot'; playerId: PlayerId; size: PilotSize }
  | { type: 'plunder-destination'; playerId: PlayerId; ware: Ware }
  | { type: 'game-over' };

export interface RngState {
  seed: number;
  /** Opaque, engine-defined. Must be JSON-serialisable. */
  state: number;
  /** How many debug dice entries have been consumed. */
  debugDiceUsed: number;
}

export interface ScoreLine {
  playerId: PlayerId;
  cash: number;
  /** Sum of market value of ALL shares held, mortgaged or not (R9.2). */
  shareValue: number;
  /** 15 × mortgaged shares (R9.2). */
  mortgagePenalty: number;
  total: number;
}

export interface GameResult {
  scores: ScoreLine[];
  /** Highest total; several ids on a tie (R9.3). */
  winners: PlayerId[];
}

export interface GameState {
  contractVersion: string;
  config: GameConfig & { rules: RuleOptions };
  /** Clockwise seating order. */
  players: PlayerState[];
  /** 1-based voyage counter. */
  voyage: number;
  phase: Phase;
  harborMaster: PlayerId | null;
  /** Black market value per ware: one of MARKET_TRACK (0,5,10,20,30). */
  market: Record<Ware, number>;
  /** Shares still available beside the board, per ware. */
  shareSupply: Record<Ware, number>;
  auction: AuctionState | null;
  /** Empty until the harbor master loads; then exactly 3 punts (index = route). */
  punts: PuntState[];
  /** The ware left ashore this voyage. */
  unloadedWare: Ware | null;
  port: Record<DockSlot, DockSpace>;
  shipyard: Record<DockSlot, DockSpace>;
  pirates: Record<PirateRole, PlayerId | null>;
  pilots: Record<PilotSize, PlayerId | null>;
  insurance: PlayerId | null;
  /** Placement rounds completed this voyage. */
  placementRound: number;
  /** Movement rounds completed this voyage (0..3). */
  movementRound: 0 | MovementRound;
  /** Last dice roll this voyage, by ware. */
  lastRoll: Partial<Record<Ware, number>> | null;
  pending: PendingDecision;
  rng: RngState;
  /** Number of actions applied so far. Monotonic; handy as a React key / undo index. */
  turn: number;
  result: GameResult | null;
}

// ───────────────────────────── actions ─────────────────────────────

export type PlacementTarget =
  /** Engine assigns the cheapest vacant seat (R5.3). */
  | { kind: 'punt'; ware: Ware }
  | { kind: 'port'; slot: DockSlot }
  | { kind: 'shipyard'; slot: DockSlot }
  /** Engine assigns captain if vacant, else crew (R5.4). */
  | { kind: 'pirate' }
  | { kind: 'pilot'; size: PilotSize }
  | { kind: 'insurance' };

export interface PuntPlan {
  ware: Ware;
  /** Start space 0..5; the three starts must sum to exactly 9 (R4.3). */
  start: number;
}

export interface PilotMove {
  ware: Ware;
  /** Small pilot: ±1. Large pilot: one punt ±1/±2, or two different punts ±1 each (R7). */
  delta: -2 | -1 | 1 | 2;
}

/** Every action names its actor; the engine rejects actions from anyone but pending.playerId
 *  (exception: take-loan / repay-loan may be sent by any player at any time before game over). */
export type Action =
  | { type: 'bid'; playerId: PlayerId; amount: number }
  | { type: 'pass-bid'; playerId: PlayerId }
  | { type: 'buy-share'; playerId: PlayerId; ware: Ware | null } // null = decline
  | { type: 'load-punts'; playerId: PlayerId; punts: [PuntPlan, PuntPlan, PuntPlan] } // index = route
  | { type: 'place-accomplice'; playerId: PlayerId; target: PlacementTarget }
  | { type: 'pass-placement'; playerId: PlayerId }
  | { type: 'roll-dice'; playerId: PlayerId }
  | {
      type: 'pirate-board';
      playerId: PlayerId;
      /** null = stay on the pirate ship. */
      ware: Ware | null;
      /** Variant only (R10): seat index of the accomplice to displace. */
      displaceSeat?: number;
    }
  | { type: 'pilot'; playerId: PlayerId; moves: PilotMove[] } // [] = do nothing
  | { type: 'plunder-destination'; playerId: PlayerId; destination: Dock }
  | { type: 'take-loan'; playerId: PlayerId; shareId: string }
  | { type: 'repay-loan'; playerId: PlayerId; shareId: string };

export type ActionType = Action['type'];

// ───────────────────────────── events ─────────────────────────────

export type PayoutReason = 'cargo' | 'port' | 'shipyard' | 'plunder' | 'insurance-premium';

/**
 * Events describe WHAT HAPPENED, in order, so the web can animate it.
 * The state returned alongside them is already final; events are for presentation only.
 */
export type GameEvent =
  | { type: 'voyage-started'; voyage: number }
  | { type: 'bid-placed'; playerId: PlayerId; amount: number }
  | { type: 'bid-passed'; playerId: PlayerId }
  /** price = 0 when the office was retained / assigned without bids (R3.4). */
  | { type: 'harbor-master-elected'; playerId: PlayerId; price: number }
  | { type: 'share-bought'; playerId: PlayerId; ware: Ware; price: number }
  | { type: 'share-declined'; playerId: PlayerId }
  /** forced = taken automatically to cover a mandatory payment (R8.3). */
  | { type: 'loan-taken'; playerId: PlayerId; shareId: string; amount: number; forced: boolean }
  | { type: 'loan-repaid'; playerId: PlayerId; shareId: string; amount: number }
  | {
      type: 'punts-loaded';
      punts: Array<{ ware: Ware; route: RouteIndex; start: number }>;
      unloaded: Ware;
    }
  | {
      type: 'accomplice-placed';
      playerId: PlayerId;
      target: PlacementTarget;
      /** Resolved seat for punt / pirate targets (pirate: 0 = captain, 1 = crew). */
      seat: number | null;
      /** Pesos paid (0 for insurance; all remaining cash for a blind passenger). */
      cost: number;
      blindPassenger: boolean;
    }
  | { type: 'placement-passed'; playerId: PlayerId }
  | { type: 'dice-rolled'; round: MovementRound; values: Partial<Record<Ware, number>> }
  | { type: 'punt-moved'; ware: Ware; from: number; to: number; cause: 'dice' | 'pilot' }
  | { type: 'punt-docked'; ware: Ware; dock: Dock; slot: DockSlot }
  | {
      type: 'pirate-boarded';
      playerId: PlayerId;
      ware: Ware;
      seat: number;
      displaced: PlayerId | null;
    }
  | { type: 'pirate-stayed'; playerId: PlayerId }
  /** Crew promoted to captain after the captain boarded (R6.2). */
  | { type: 'pirate-promoted'; playerId: PlayerId }
  /** All accomplices on the punt went home empty-handed. */
  | { type: 'punt-plundered'; ware: Ware; returned: PlayerId[] }
  | { type: 'pilot-used'; playerId: PlayerId; size: PilotSize; moves: PilotMove[] }
  | {
      type: 'payout';
      playerId: PlayerId;
      amount: number;
      /** Who paid: the harbor cash box or a player (the insurance agent). */
      source: 'bank' | PlayerId;
      reason: PayoutReason;
      ware?: Ware;
      slot?: DockSlot;
    }
  /** Insurance agent pays repair cost for a punt in the shipyard (R8.5). to='bank' when the slot is empty. */
  | {
      type: 'repair-paid';
      payer: PlayerId | 'bank';
      to: PlayerId | 'bank';
      amount: number;
      slot: DockSlot;
    }
  | { type: 'market-rose'; ware: Ware; from: number; to: number }
  | { type: 'voyage-ended'; voyage: number }
  | { type: 'game-ended'; result: GameResult };

export type GameEventType = GameEvent['type'];

// ───────────────────────────── API ─────────────────────────────

export type EngineErrorCode =
  'not-your-turn' | 'illegal-action' | 'insufficient-funds' | 'invalid-payload' | 'game-over';

export interface EngineError {
  code: EngineErrorCode;
  /** Human-readable, English, for logs / dev overlay. The web localises by `code`. */
  message: string;
}

export type ActionResult =
  { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: EngineError };

/** A share as seen by a given viewer: other players' share wares are hidden (ware = null). */
export interface VisibleShare {
  id: string;
  ware: Ware | null;
  mortgaged: boolean;
}

export interface PlayerViewEntry extends Omit<PlayerState, 'shares'> {
  shares: VisibleShare[];
}

/** Hidden-information-safe projection of GameState for one viewer (hotseat privacy). */
export interface PlayerView extends Omit<GameState, 'players' | 'rng' | 'config'> {
  /** null = public / spectator view (all share wares hidden). */
  viewer: PlayerId | null;
  players: PlayerViewEntry[];
  config: Omit<GameState['config'], 'debug' | 'seed'>;
}

export interface ReplayResult {
  state: GameState;
  /** Events grouped per applied action. */
  events: GameEvent[][];
}

/** Shared fixture format: packages/engine/fixtures/*.json. Engine tests replay these; the web can use them as demos. */
export interface Scenario {
  name: string;
  description?: string;
  config: GameConfig;
  actions: Action[];
  /** Deep-partial expectations checked against the final state. */
  expect?: Record<string, unknown>;
}

export interface ManilaEngine {
  createGame(config: GameConfig): GameState;
  applyAction(state: GameState, action: Action): ActionResult;
  /** All legal actions for `playerId` right now (loan actions included). */
  getLegalActions(state: GameState, playerId: PlayerId): Action[];
  getPlayerView(state: GameState, viewer: PlayerId | null): PlayerView;
  /** Fortune right now (R9.2). Valid at any time, final when phase = 'game-over'. */
  computeScores(state: GameState): ScoreLine[];
  /** createGame + applyAction for each action. Throws on the first illegal action. */
  replay(config: GameConfig, actions: Action[]): ReplayResult;
}
