import { applyAction, createGame, getLegalActions } from '../src/index';
import type {
  Action,
  GameConfig,
  GameEvent,
  GameState,
  PlacementTarget,
  PlayerColor,
  PuntPlan,
  Ware,
} from '../src/index';

export function config(count = 3, dice?: GameConfig['debug']): GameConfig {
  const colors: PlayerColor[] = ['red', 'blue', 'orange', 'purple', 'white'];
  return {
    players: colors.slice(0, count).map((color, i) => ({ name: `Player ${i + 1}`, color })),
    seed: 7,
    ...(dice ? { debug: dice } : {}),
  };
}

export const plans: [PuntPlan, PuntPlan, PuntPlan] = [
  { ware: 'ginseng', start: 3 },
  { ware: 'nutmeg', start: 3 },
  { ware: 'silk', start: 3 },
];

export function step(state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${JSON.stringify(action)}: ${JSON.stringify(result.error)}`);
  return result;
}

export function actor(state: GameState): string {
  if (state.pending.type === 'game-over') throw new Error('Game over');
  return state.pending.playerId;
}

export function elected(count = 3, debug?: GameConfig['debug']): GameState {
  let state = createGame(config(count, debug));
  while (state.pending.type === 'bid')
    state = step(state, { type: 'pass-bid', playerId: actor(state) }).state;
  return state;
}

export function loaded(count = 3, debug?: GameConfig['debug']): GameState {
  let state = elected(count, debug);
  state = step(state, { type: 'buy-share', playerId: actor(state), ware: null }).state;
  return step(state, { type: 'load-punts', playerId: actor(state), punts: plans }).state;
}

/** A focused state at the last roll. Board entries are installed by each test. */
export function finalRoll(
  values: Partial<Record<Ware, number>> = { ginseng: 1, nutmeg: 1, silk: 1 },
): GameState {
  const state = loaded(3, { dice: [values] });
  state.placementRound = 4;
  state.movementRound = 2;
  state.phase = 'movement';
  state.pending = { type: 'roll-dice', playerId: 'p1', round: 3 };
  return state;
}

export function place(state: GameState, target: PlacementTarget): GameState {
  return step(state, { type: 'place-accomplice', playerId: actor(state), target }).state;
}

export function quietAction(state: GameState): Action {
  const playerId = actor(state);
  switch (state.pending.type) {
    case 'bid':
      return { type: 'pass-bid', playerId };
    case 'buy-share':
      return { type: 'buy-share', playerId, ware: null };
    case 'load-punts':
      return { type: 'load-punts', playerId, punts: plans };
    case 'place-accomplice':
      return { type: 'pass-placement', playerId };
    case 'roll-dice':
      return { type: 'roll-dice', playerId };
    case 'pirate-board':
      return { type: 'pirate-board', playerId, ware: null };
    case 'pilot':
      return { type: 'pilot', playerId, moves: [] };
    case 'plunder-destination':
      return { type: 'plunder-destination', playerId, destination: 'port' };
    default:
      throw new Error('No quiet action');
  }
}

export function finish(state: GameState): { state: GameState; events: GameEvent[] } {
  const voyage = state.voyage;
  const events: GameEvent[] = [];
  for (let i = 0; state.voyage === voyage && state.phase !== 'game-over'; i++) {
    if (i > 100) throw new Error('Voyage stalled');
    const result = step(state, quietAction(state));
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

export function decisionActions(state: GameState): Action[] {
  return getLegalActions(state, actor(state)).filter(
    (a) => !['take-loan', 'repay-loan'].includes(a.type),
  );
}
