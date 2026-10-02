/**
 * Computer players — OWNED BY THE WEB AGENT (Claude), see AGENTS.md.
 * Pure functions over the public contract: no engine internals, no Math.random().
 */
export { chooseBotAction, type BotLevel, type BotOptions } from './bot';
export { outlook, atLeast, type PuntOutlook } from './probability';
