import { describe, expect, it } from 'vitest';
import type { Action, PendingDecision } from '@manila/engine';
import { boardingOptions } from '../src/game/choices';

const pending: Extract<PendingDecision, { type: 'pirate-board' }> = {
  type: 'pirate-board',
  playerId: 'p1',
  role: 'captain',
  candidates: ['silk'],
};

describe('boardingOptions', () => {
  it('R10 keeps displaceSeat from the engine legal actions', () => {
    const legal: Action[] = [
      { type: 'take-loan', playerId: 'p1', shareId: 'share-1' },
      { type: 'pirate-board', playerId: 'p1', ware: null },
      { type: 'pirate-board', playerId: 'p1', ware: 'silk', displaceSeat: 0 },
      { type: 'pirate-board', playerId: 'p1', ware: 'silk', displaceSeat: 2 },
    ];
    expect(boardingOptions(pending, legal)).toEqual([
      { type: 'pirate-board', playerId: 'p1', ware: 'silk', displaceSeat: 0 },
      { type: 'pirate-board', playerId: 'p1', ware: 'silk', displaceSeat: 2 },
    ]);
  });

  it('R6.2 falls back to the pending candidates when no legal actions are known (mock)', () => {
    expect(boardingOptions(pending, [])).toEqual([
      { type: 'pirate-board', playerId: 'p1', ware: 'silk' },
    ]);
  });
});
