/**
 * Engine implementation — OWNED BY THE ENGINE AGENT (ChatGPT / Codex).
 *
 * These are placeholder stubs with the exact contract signatures. Replace the bodies;
 * keep the exported names and types (they implement `ManilaEngine` from contract/types.ts).
 * Feel free to split the logic into more modules under src/ (rules/, rng.ts, ai/ …).
 */
import type {
  Action,
  ActionResult,
  GameConfig,
  GameState,
  ManilaEngine,
  PlayerId,
  PlayerView,
  ReplayResult,
  ScoreLine,
} from './contract/types';
import { NotImplementedError } from './errors';

export function createGame(_config: GameConfig): GameState {
  throw new NotImplementedError('createGame');
}

export function applyAction(_state: GameState, _action: Action): ActionResult {
  throw new NotImplementedError('applyAction');
}

export function getLegalActions(_state: GameState, _playerId: PlayerId): Action[] {
  throw new NotImplementedError('getLegalActions');
}

export function getPlayerView(_state: GameState, _viewer: PlayerId | null): PlayerView {
  throw new NotImplementedError('getPlayerView');
}

export function computeScores(_state: GameState): ScoreLine[] {
  throw new NotImplementedError('computeScores');
}

export function replay(_config: GameConfig, _actions: Action[]): ReplayResult {
  throw new NotImplementedError('replay');
}

/** Compile-time check that the exports above satisfy the contract. */
export const engine: ManilaEngine = {
  createGame,
  applyAction,
  getLegalActions,
  getPlayerView,
  computeScores,
  replay,
};
