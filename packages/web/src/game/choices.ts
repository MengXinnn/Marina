import type { Action, PendingDecision } from '@manila/engine';

export type BoardAction = Extract<Action, { type: 'pirate-board' }>;

/**
 * Boarding buttons for the human pirate. Built from the engine's legal actions so that
 * R10 displacement options keep their `displaceSeat` (the engine rejects them without it);
 * falls back to the pending candidates in mock mode, where no legal actions exist.
 */
export function boardingOptions(
  pending: Extract<PendingDecision, { type: 'pirate-board' }>,
  legal: Action[],
): BoardAction[] {
  const fromEngine = legal.filter(
    (a): a is BoardAction => a.type === 'pirate-board' && a.ware !== null,
  );
  if (fromEngine.length) return fromEngine;
  return pending.candidates.map((ware) => ({
    type: 'pirate-board',
    playerId: pending.playerId,
    ware,
  }));
}
