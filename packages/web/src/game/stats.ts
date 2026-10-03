import {
  applyAction,
  computeScores,
  createGame,
  type Action,
  type GameConfig,
  type GameEvent,
  type GameState,
  type PlayerId,
} from '@manila/engine';

/** Where a player's pesos came from and went, over the whole game. */
export interface Ledger {
  cargo: number;
  port: number;
  shipyard: number;
  plunder: number;
  /** Premiums collected minus repairs paid as insurance agent (R8.5). */
  insurance: number;
  /** Paid for the harbour master's office (R3.4). */
  auction: number;
  /** Paid for shares (R4.2). */
  shares: number;
  /** Paid for accomplice seats, pilots, pirates and blind passengers (R5). */
  placements: number;
  /** Loans received minus repayments (R8.1–R8.2). */
  loans: number;
}

export const LEDGER_KEYS = [
  'cargo',
  'port',
  'shipyard',
  'plunder',
  'insurance',
  'auction',
  'shares',
  'placements',
  'loans',
] as const satisfies ReadonlyArray<keyof Ledger>;

export interface GameStats {
  /** Fortune (R9.2) at the start (index 0) and after each finished voyage. */
  fortunes: Array<Record<PlayerId, number>>;
  ledgers: Record<PlayerId, Ledger>;
  /** Index into the action list where each voyage starts (voyage v at [v - 1]). */
  voyageStarts: number[];
}

const emptyLedger = (): Ledger => ({
  cargo: 0,
  port: 0,
  shipyard: 0,
  plunder: 0,
  insurance: 0,
  auction: 0,
  shares: 0,
  placements: 0,
  loans: 0,
});

const fortunes = (state: GameState): Record<PlayerId, number> =>
  Object.fromEntries(computeScores(state).map((s) => [s.playerId, s.total]));

function book(ledgers: Record<PlayerId, Ledger>, e: GameEvent): void {
  const add = (id: PlayerId | 'bank', key: keyof Ledger, amount: number) => {
    const l = id !== 'bank' ? ledgers[id] : undefined;
    if (l) l[key] += amount;
  };
  switch (e.type) {
    case 'payout': {
      if (e.source === e.playerId) return; // the insurer paying itself is a wash
      const key = e.reason === 'insurance-premium' ? 'insurance' : e.reason;
      add(e.playerId, key, e.amount);
      add(e.source, 'insurance', -e.amount);
      return;
    }
    case 'repair-paid':
      add(e.payer, 'insurance', -e.amount);
      return;
    case 'harbor-master-elected':
      add(e.playerId, 'auction', -e.price);
      return;
    case 'share-bought':
      add(e.playerId, 'shares', -e.price);
      return;
    case 'accomplice-placed':
      add(e.playerId, 'placements', -e.cost);
      return;
    case 'loan-taken':
      add(e.playerId, 'loans', e.amount);
      return;
    case 'loan-repaid':
      add(e.playerId, 'loans', -e.amount);
      return;
    default:
      return;
  }
}

/**
 * Replays the game from its config (the engine is deterministic, R1.6) to chart fortunes per
 * voyage and add up every payment by kind. Returns null if the actions do not replay, e.g. a
 * game resumed from an older save that did not record them.
 */
export function gameStats(config: GameConfig, actions: Action[]): GameStats | null {
  let state: GameState;
  try {
    state = createGame(config);
  } catch {
    return null;
  }
  const ledgers = Object.fromEntries(state.players.map((p) => [p.id, emptyLedger()]));
  const stats: GameStats = { fortunes: [fortunes(state)], ledgers, voyageStarts: [0] };
  for (let i = 0; i < actions.length; i++) {
    const result = applyAction(state, actions[i]!);
    if (!result.ok) return null;
    for (const e of result.events) book(ledgers, e);
    if (result.events.some((e) => e.type === 'voyage-ended'))
      stats.fortunes.push(fortunes(result.state));
    if (result.state.voyage !== state.voyage) stats.voyageStarts.push(i + 1);
    state = result.state;
  }
  return stats;
}

/** The state just before action `index` (0 = the game's start). */
export function stateAt(config: GameConfig, actions: Action[], index: number): GameState {
  let state = createGame(config);
  for (let i = 0; i < index; i++) {
    const result = applyAction(state, actions[i]!);
    if (!result.ok) break;
    state = result.state;
  }
  return state;
}
