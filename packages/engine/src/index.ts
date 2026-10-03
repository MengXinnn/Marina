/**
 * Public entry of @manila/engine. The web imports ONLY from here.
 * contract/* is the engine ⇄ web contract; changes follow the contract process in AGENTS.md.
 */
export * from './contract/types';
export * from './contract/constants';
export { NotImplementedError } from './errors';
export {
  createGame,
  applyAction,
  getLegalActions,
  getPlayerView,
  computeScores,
  replay,
  engine,
} from './engine';
// Computer players.
export * from './ai';
