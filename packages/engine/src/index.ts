/**
 * Public entry of @manila/engine. The web imports ONLY from here.
 * contract/* is co-owned; everything else under src/ is owned by the engine agent.
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
