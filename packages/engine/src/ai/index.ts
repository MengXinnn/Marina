/**
 * Computer players.
 * Pure functions over the public contract: no engine internals, no Math.random().
 */
export { chooseBotAction, type BotLevel, type BotOptions } from './bot';
export { outlook, atLeast, type PuntOutlook } from './probability';
export { placementAdvice, type PlacementAdvice } from './advice';
