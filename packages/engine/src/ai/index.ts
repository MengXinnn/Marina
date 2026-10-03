/**
 * Computer players.
 * Pure functions over the public contract: no engine internals, no Math.random().
 */
export {
  chooseBotAction,
  harborMasterValue,
  rankChoices,
  type BotLevel,
  type BotOptions,
} from './bot';
export { chooseHardAction, determinize, type HardBotOptions } from './hard';
export { outlook, atLeast, type PuntOutlook } from './probability';
export { placementAdvice, type PlacementAdvice } from './advice';
