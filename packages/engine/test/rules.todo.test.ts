/** Rule-numbered acceptance tests; fixtures and randomized invariants have their own files. */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  computeScores,
  createGame,
  getLegalActions,
  getPlayerView,
  replay,
  WARES,
} from '../src/index';
import type { Action, GameState } from '../src/index';
import {
  actor,
  config,
  decisionActions,
  elected,
  finalRoll,
  finish,
  loaded,
  place,
  plans,
  quietAction,
  step,
} from './helpers';
import { assertFixtures } from './scenarios';
import { runPlayouts } from './playouts';

const types = (result: ReturnType<typeof step>) => result.events.map((e) => e.type);
const rejected = (state: GameState, action: Action, code = 'illegal-action') =>
  expect(applyAction(state, action)).toMatchObject({ ok: false, error: { code } });

describe('R1 setup', () => {
  it('R1.1 creates p1..pN with 30 pesos each, in config order', () => {
    const state = createGame(config(5));
    expect(state.players.map((p) => [p.id, p.cash, p.name])).toEqual(
      config(5).players.map((p, i) => [`p${i + 1}`, 30, p.name]),
    );
    expect(Object.values(state.market)).toEqual([0, 0, 0, 0]);
  });
  it('R1.2 deals 2 shares per player from a pool of 3 per ware; supply = 5 − dealt', () => {
    for (let seed = 0; seed < 20; seed++) {
      const state = createGame({ ...config(5), seed });
      expect(state.players.every((p) => p.shares.length === 2)).toBe(true);
      for (const ware of WARES) {
        const count = state.players.flatMap((p) => p.shares).filter((s) => s.ware === ware).length;
        expect(count).toBeLessThanOrEqual(3);
        expect(state.shareSupply[ware]).toBe(5 - count);
      }
    }
  });
  it('R1.3 gives 4 accomplices in a 3-player game, 3 otherwise', () => {
    for (const n of [3, 4, 5])
      expect(createGame(config(n)).players.map((p) => p.accomplices)).toEqual(
        Array(n).fill(n === 3 ? 4 : 3),
      );
  });
  it('R1.6 same seed + same actions ⇒ identical state (determinism)', () => {
    expect(finish(createGame(config()))).toEqual(finish(createGame(config())));
    expect(finish(createGame(config(4)))).toEqual(finish(createGame(config(4))));
  });
  it('R1.6 debug.dice and debug.deal override the RNG', () => {
    const state = loaded(3, {
      deal: [
        ['jade', 'jade'],
        ['ginseng', 'silk'],
        ['nutmeg', 'silk'],
      ],
      dice: [{ ginseng: 6, nutmeg: 5, silk: 4 }],
    });
    expect(state.players[0].shares.map((s) => s.ware)).toEqual(['jade', 'jade']);
    const result = finish(state);
    expect(result.events.find((e) => e.type === 'dice-rolled')).toMatchObject({
      values: { ginseng: 6, nutmeg: 5, silk: 4 },
    });
    expect(result.state.rng.debugDiceUsed).toBe(1);
  });
});

describe('R3 auction', () => {
  it('R3.1 voyage 1 is opened by players[0]; later voyages by the previous harbor master', () => {
    let state = createGame(config());
    expect(actor(state)).toBe('p1');
    state = step(state, { type: 'pass-bid', playerId: 'p1' }).state;
    state = step(state, { type: 'bid', playerId: 'p2', amount: 1 }).state;
    state = step(state, { type: 'pass-bid', playerId: 'p3' }).state;
    const result = finish(state).state;
    expect(result.pending).toMatchObject({ type: 'bid', playerId: 'p2' });
    expect(result.harborMaster).toBe('p2');
  });
  it('R3.2 bids must strictly increase; a passed player never bids again this voyage', () => {
    let state = step(createGame(config()), { type: 'bid', playerId: 'p1', amount: 3 }).state;
    rejected(state, { type: 'bid', playerId: 'p2', amount: 3 });
    state = step(state, { type: 'pass-bid', playerId: 'p2' }).state;
    state = step(state, { type: 'bid', playerId: 'p3', amount: 4 }).state;
    expect(actor(state)).toBe('p1');
    expect(getLegalActions(state, 'p2').some((a) => a.type === 'bid')).toBe(false);
  });
  it('R3.3 maxBid = cash + 12 × unmortgaged shares', () => {
    let state = createGame(config());
    expect(state.pending).toMatchObject({ minBid: 1, maxBid: 54 });
    state = step(state, {
      type: 'take-loan',
      playerId: 'p1',
      shareId: state.players[0].shares[0].id,
    }).state;
    expect(state.pending).toMatchObject({ maxBid: 54 });
    state.players[0].cash = 0;
    state.players[0].shares.forEach((s) => {
      s.mortgaged = true;
    });
    expect(decisionActions(state)).toEqual([{ type: 'pass-bid', playerId: 'p1' }]);
  });
  it('R3.4 last remaining high bidder wins and pays (forced loans if needed)', () => {
    let state = step(createGame(config()), { type: 'bid', playerId: 'p1', amount: 43 }).state;
    state = step(state, { type: 'pass-bid', playerId: 'p2' }).state;
    const result = step(state, { type: 'pass-bid', playerId: 'p3' });
    expect(types(result)).toEqual([
      'bid-passed',
      'loan-taken',
      'loan-taken',
      'harbor-master-elected',
    ]);
    expect(result.state.players[0].cash).toBe(11);
    expect(result.state.pending.type).toBe('buy-share');
  });
  it('R3.4 nobody bids ⇒ previous harbor master keeps office for free (voyage 1: players[0])', () => {
    expect(elected().harborMaster).toBe('p1');
    let state = createGame(config());
    state.harborMaster = 'p3';
    while (state.phase === 'auction') state = step(state, quietAction(state)).state;
    expect(state.harborMaster).toBe('p3');
    expect(state.players.map((p) => p.cash)).toEqual([30, 30, 30]);
  });
});

describe('R4 harbor master', () => {
  it('R4.1 may buy one share at max(5, value); cannot buy from empty supply; may decline', () => {
    const state = elected();
    const supply = state.shareSupply.jade;
    const result = step(state, { type: 'buy-share', playerId: 'p1', ware: 'jade' });
    expect(result.state.players[0].cash).toBe(25);
    expect(result.state.shareSupply.jade).toBe(supply - 1);
    rejected(result.state, { type: 'buy-share', playerId: 'p1', ware: 'jade' });
    state.shareSupply.jade = 0;
    rejected(state, { type: 'buy-share', playerId: 'p1', ware: 'jade' });
    expect(step(state, { type: 'buy-share', playerId: 'p1', ware: null }).state.pending.type).toBe(
      'load-punts',
    );
    state.market.silk = 20;
    state.players[0].cash = 10;
    const financed = step(state, { type: 'buy-share', playerId: 'p1', ware: 'silk' });
    expect(types(financed)).toEqual(['loan-taken', 'share-bought']);
    expect(financed.state.players[0].cash).toBe(2);
  });
  it('R4.3 rejects start positions outside 0..5, sums ≠ 9, duplicate wares', () => {
    const state = step(elected(), { type: 'buy-share', playerId: 'p1', ware: null }).state;
    for (const bad of [
      [6, 2, 1],
      [-1, 5, 5],
      [2, 2, 2],
    ])
      rejected(state, {
        type: 'load-punts',
        playerId: 'p1',
        punts: plans.map((p, i) => ({ ...p, start: bad[i] })) as typeof plans,
      });
    rejected(state, { type: 'load-punts', playerId: 'p1', punts: [plans[0], plans[0], plans[2]] });
    rejected(
      state,
      {
        type: 'load-punts',
        playerId: 'p1',
        punts: [{ ...plans[0], route: 0 }, { ...plans[1], route: 0 }, plans[2]],
      } as unknown as Action,
      'invalid-payload',
    );
  });
  it('R4.4 load-punts sets punts[route], unloadedWare and moves to placement', () => {
    const state = loaded();
    expect(state.punts.map((p) => [p.route, p.ware, p.position])).toEqual([
      [0, 'ginseng', 3],
      [1, 'nutmeg', 3],
      [2, 'silk', 3],
    ]);
    expect(state.unloadedWare).toBe('jade');
    expect(state.pending).toMatchObject({ type: 'place-accomplice', round: 1, playerId: 'p1' });
  });
});

describe('R5 placement & movement', () => {
  it('R5.1 3 players: P P M P M P M; 4–5 players: P M P M P M', () => {
    for (const count of [3, 4, 5]) {
      let state = loaded(count, { dice: Array(3).fill({ ginseng: 1, nutmeg: 1, silk: 1 }) });
      const rounds: string[] = [];
      for (let i = 0; state.voyage === 1; i++) {
        expect(i).toBeLessThan(50);
        if (state.pending.type === 'place-accomplice') {
          if (actor(state) === 'p1') rounds.push('P');
          const action =
            decisionActions(state).find(
              (a) => a.type === 'place-accomplice' && a.target.kind === 'punt',
            ) ?? decisionActions(state).find((a) => a.type === 'place-accomplice')!;
          state = step(state, action).state;
        } else {
          if (state.pending.type === 'roll-dice') rounds.push('M');
          state = step(state, quietAction(state)).state;
        }
      }
      expect(rounds.join('')).toBe(count === 3 ? 'PPMPMPM' : 'PMPMPM');
    }
  });
  it('R5.2 each round starts at the harbor master; passing is permanent for the voyage', () => {
    let state = loaded();
    state = step(state, { type: 'pass-placement', playerId: 'p1' }).state;
    state = place(state, { kind: 'punt', ware: 'ginseng' });
    state = place(state, { kind: 'punt', ware: 'ginseng' });
    expect(state.pending).toMatchObject({ round: 2, playerId: 'p2' });
    expect(state.players[0].passedPlacement).toBe(true);
    expect(getLegalActions(state, 'p1').every((a) => a.type === 'take-loan')).toBe(true);
  });
  it('R5.3 punt placement takes the cheapest vacant seat; docked punts accept nobody', () => {
    let state = place(loaded(), { kind: 'punt', ware: 'ginseng' });
    const result = step(state, {
      type: 'place-accomplice',
      playerId: 'p2',
      target: { kind: 'punt', ware: 'ginseng' },
    });
    expect(result.events[0]).toMatchObject({ seat: 1, cost: 2 });
    state = result.state;
    state.punts[0].status = 'port';
    rejected(state, {
      type: 'place-accomplice',
      playerId: 'p3',
      target: { kind: 'punt', ware: 'ginseng' },
    });
    expect(
      decisionActions(state)
        .filter((a) => a.type === 'place-accomplice')
        .some((a) => a.target.kind === 'punt' && a.target.ware === 'ginseng'),
    ).toBe(false);
  });
  it('R5.4 pirate placement fills captain first, then crew', () => {
    let state = place(loaded(), { kind: 'pirate' });
    expect(state.pirates).toEqual({ captain: 'p1', crew: null });
    state = place(state, { kind: 'pirate' });
    expect(state.pirates).toEqual({ captain: 'p1', crew: 'p2' });
    rejected(state, { type: 'place-accomplice', playerId: 'p3', target: { kind: 'pirate' } });
  });
  it('R5.5 insurance costs 0 and pays 10 immediately', () => {
    const result = step(loaded(), {
      type: 'place-accomplice',
      playerId: 'p1',
      target: { kind: 'insurance' },
    });
    expect(types(result)).toEqual(['accomplice-placed', 'payout']);
    expect(result.events[1]).toMatchObject({
      reason: 'insurance-premium',
      amount: 10,
      source: 'bank',
    });
    expect(result.state.players[0].cash).toBe(40);
  });
  it('R5.6 blind passenger: any vacant non-insurance space for all remaining cash', () => {
    const state = loaded();
    state.players[0].cash = 0;
    state.players[0].shares.forEach((s) => {
      s.mortgaged = true;
    });
    const actions = decisionActions(state).filter((a) => a.type === 'place-accomplice');
    expect(actions).toHaveLength(13);
    for (const action of actions) {
      const result = step(state, action);
      expect(result.events[0]).toMatchObject({
        cost: 0,
        blindPassenger: action.target.kind !== 'insurance',
      });
    }
    // Equality is not blind; only targets affordable by normal financing remain.
    state.players[0].cash = 1;
    expect(decisionActions(state).filter((a) => a.type === 'place-accomplice')).toHaveLength(2);
  });
  it('R5.7 roll-dice moves each punt by its own ware die', () => {
    const state = finalRoll({ ginseng: 1, nutmeg: 2, silk: 3 });
    state.movementRound = 0;
    state.placementRound = 2;
    state.pending = { type: 'roll-dice', playerId: 'p1', round: 1 };
    const result = step(state, { type: 'roll-dice', playerId: 'p1' });
    expect(result.state.punts.map((p) => p.position)).toEqual([4, 5, 6]);
    expect(types(result)).toEqual(['dice-rolled', 'punt-moved', 'punt-moved', 'punt-moved']);
  });
  it('R5.8 passing 13 docks at the next free port slot; surplus movement is lost', () => {
    const state = finalRoll({ ginseng: 6, nutmeg: 6, silk: 6 });
    state.punts.forEach((p) => {
      p.position = 12;
    });
    state.market.ginseng = 20;
    const result = step(state, { type: 'roll-dice', playerId: 'p1' });
    expect(result.state.punts.map((p) => [p.position, p.dock])).toEqual([
      [14, 'A'],
      [14, 'B'],
      [14, 'C'],
    ]);
    expect(types(result).slice(0, 7)).toEqual([
      'dice-rolled',
      'punt-moved',
      'punt-moved',
      'punt-moved',
      'punt-docked',
      'punt-docked',
      'punt-docked',
    ]);
  });
  it('R5.9 after round 3, punts on 0..12 go to shipyard A→B→C', () => {
    const result = step(finalRoll(), { type: 'roll-dice', playerId: 'p1' });
    expect(result.events.filter((e) => e.type === 'punt-docked')).toEqual([
      { type: 'punt-docked', ware: 'ginseng', dock: 'shipyard', slot: 'A' },
      { type: 'punt-docked', ware: 'nutmeg', dock: 'shipyard', slot: 'B' },
      { type: 'punt-docked', ware: 'silk', dock: 'shipyard', slot: 'C' },
    ]);
    expect(result.state.voyage).toBe(2);
  });
});

describe('R6 pirates', () => {
  it('R6.1 only end-of-movement positions on 13 trigger pirates; empty pirate boat ⇒ nothing', () => {
    const state = finalRoll();
    state.movementRound = 0;
    state.placementRound = 2;
    state.pending = { type: 'roll-dice', playerId: 'p1', round: 1 };
    state.punts[0].position = 12;
    state.pirates.captain = 'p2';
    expect(step(state, { type: 'roll-dice', playerId: 'p1' }).state.phase).toBe('placement');
    state.movementRound = 1;
    state.placementRound = 3;
    state.pending.round = 2;
    state.pirates.captain = null;
    expect(step(state, { type: 'roll-dice', playerId: 'p1' }).state.phase).toBe('placement');
  });
  it('R6.2 after round 2 captain may board a vacant seat, then crew; crew is promoted', () => {
    const state = finalRoll();
    state.movementRound = 1;
    state.placementRound = 3;
    state.pending = { type: 'roll-dice', playerId: 'p1', round: 2 };
    state.punts[0].position = 12;
    state.pirates = { captain: 'p2', crew: 'p2' };
    state.players[1].accomplicesPlaced = 2;
    let result = step(state, { type: 'roll-dice', playerId: 'p1' });
    expect(result.state.pending).toMatchObject({
      type: 'pirate-board',
      role: 'captain',
      playerId: 'p2',
      candidates: ['ginseng'],
    });
    result = step(result.state, { type: 'pirate-board', playerId: 'p2', ware: 'ginseng' });
    expect(types(result)).toEqual(['pirate-boarded', 'pirate-promoted']);
    expect(result.state.pending).toMatchObject({ role: 'captain', playerId: 'p2' });
    result = step(result.state, { type: 'pirate-board', playerId: 'p2', ware: 'ginseng' });
    expect(
      result.state.punts[0].seats.slice(0, 2).every((s) => s.pirate && s.occupant === 'p2'),
    ).toBe(true);
    expect(result.state.players[1].accomplicesPlaced).toBe(2);
    expect(result.state.pirates).toEqual({ captain: null, crew: null });
    expect(result.state.phase).toBe('placement');
  });
  it('R6.3 after round 3 accomplices aboard go home, pirates split profit, captain picks port/shipyard', () => {
    const state = finalRoll();
    state.punts[0].position = state.punts[1].position = 12;
    state.punts[0].seats[0] = { occupant: 'p3', pirate: true, blindPassenger: false };
    state.players[2].accomplicesPlaced = 1;
    state.pirates = { captain: 'p1', crew: 'p2' };
    let result = step(state, { type: 'roll-dice', playerId: 'p1' });
    expect(result.events.filter((e) => e.type === 'payout').map((e) => e.amount)).toEqual([
      9, 9, 12, 12,
    ]);
    expect(result.state.players[2].accomplicesPlaced).toBe(0);
    const eventTypes = types(result);
    expect(eventTypes.lastIndexOf('punt-plundered')).toBeLessThan(eventTypes.indexOf('payout'));
    expect(result.state.pending).toMatchObject({
      type: 'plunder-destination',
      ware: 'ginseng',
      playerId: 'p1',
    });
    result = step(result.state, {
      type: 'plunder-destination',
      playerId: 'p1',
      destination: 'port',
    });
    expect(result.state.pending).toMatchObject({ ware: 'nutmeg' });
    result = step(result.state, {
      type: 'plunder-destination',
      playerId: 'p1',
      destination: 'shipyard',
    });
    expect(result.state.market).toMatchObject({ ginseng: 5, nutmeg: 0 });
    expect(result.events.some((e) => e.type === 'payout' && e.reason === 'cargo')).toBe(false);
  });
  it('R6.3 punt on 13 after round 3 with empty pirate boat docks in port', () => {
    const state = finalRoll();
    state.punts[0].position = 12;
    expect(step(state, { type: 'roll-dice', playerId: 'p1' }).state.market.ginseng).toBe(5);
  });
});

describe('R7 pilots', () => {
  const pilots = () => {
    const state = finalRoll();
    state.phase = 'pilots';
    state.pending = { type: 'pilot', playerId: 'p2', size: 'small' };
    state.pilots = { small: 'p2', large: 'p3' };
    return state;
  };
  it('R7.1 pilots act before the third roll: small, then large; skipped when vacant', () => {
    let state = loaded(3, { dice: Array(3).fill({ ginseng: 1, nutmeg: 1, silk: 1 }) });
    state = place(state, { kind: 'pilot', size: 'small' });
    state = place(state, { kind: 'pilot', size: 'large' });
    while (state.pending.type !== 'pilot') state = step(state, quietAction(state)).state;
    expect(state.movementRound).toBe(2);
    expect(state.pending).toMatchObject({ size: 'small', playerId: 'p1' });
    state = step(state, quietAction(state)).state;
    expect(state.pending).toMatchObject({ size: 'large', playerId: 'p2' });
    state = step(state, quietAction(state)).state;
    expect(state.pending).toMatchObject({ type: 'roll-dice', round: 3 });
    expect(finish(loaded()).events.filter((e) => e.type === 'pilot-used')).toHaveLength(0);
  });
  it('R7.2 small pilot moves one punt ±1', () => {
    for (const delta of [-1, 1] as const)
      expect(
        step(pilots(), { type: 'pilot', playerId: 'p2', moves: [{ ware: 'ginseng', delta }] }).state
          .punts[0].position,
      ).toBe(3 + delta);
    rejected(pilots(), { type: 'pilot', playerId: 'p2', moves: [{ ware: 'ginseng', delta: 2 }] });
  });
  it('R7.3 large pilot moves one punt ±1/±2 or two different punts ±1', () => {
    const state = step(pilots(), { type: 'pilot', playerId: 'p2', moves: [] }).state;
    for (const delta of [-2, -1, 1, 2] as const)
      expect(
        step(state, { type: 'pilot', playerId: 'p3', moves: [{ ware: 'ginseng', delta }] }).state
          .punts[0].position,
      ).toBe(3 + delta);
    expect(
      step(state, {
        type: 'pilot',
        playerId: 'p3',
        moves: [
          { ware: 'ginseng', delta: 1 },
          { ware: 'silk', delta: -1 },
        ],
      }).state.punts.map((p) => p.position),
    ).toEqual([4, 3, 2]);
    rejected(state, {
      type: 'pilot',
      playerId: 'p3',
      moves: [
        { ware: 'ginseng', delta: 1 },
        { ware: 'ginseng', delta: 1 },
      ],
    });
    rejected(state, {
      type: 'pilot',
      playerId: 'p3',
      moves: [
        { ware: 'ginseng', delta: 2 },
        { ware: 'silk', delta: 1 },
      ],
    });
  });
  it('R7.4 cannot move below 0 or move docked punts; pushing past 13 docks immediately', () => {
    const state = pilots();
    state.punts[0].position = 0;
    rejected(state, { type: 'pilot', playerId: 'p2', moves: [{ ware: 'ginseng', delta: -1 }] });
    state.punts[0].position = 12;
    state.pirates.captain = 'p1';
    let result = step(state, {
      type: 'pilot',
      playerId: 'p2',
      moves: [{ ware: 'ginseng', delta: 1 }],
    });
    expect(result.state.pending.type).toBe('pilot');
    expect(result.events.some((e) => e.type.startsWith('pirate'))).toBe(false);
    result = step(result.state, {
      type: 'pilot',
      playerId: 'p3',
      moves: [{ ware: 'ginseng', delta: 2 }],
    });
    expect(result.state.punts[0]).toMatchObject({ position: 14, status: 'port', dock: 'A' });
    expect(types(result)).toEqual(['pilot-used', 'punt-moved', 'punt-docked']);
    state.punts[0].status = 'port';
    rejected(state, { type: 'pilot', playerId: 'p2', moves: [{ ware: 'ginseng', delta: 1 }] });
  });
});

describe('R8 money', () => {
  it('R8.1 take-loan gives 12 and is allowed for any player at any time', () => {
    const state = loaded();
    const result = step(state, {
      type: 'take-loan',
      playerId: 'p3',
      shareId: state.players[2].shares[0].id,
    });
    expect(result.state.players[2].cash).toBe(42);
    expect(result.state.pending).toEqual(state.pending);
    expect(result.events[0]).toMatchObject({ forced: false, amount: 12 });
    rejected(result.state, {
      type: 'take-loan',
      playerId: 'p3',
      shareId: state.players[2].shares[0].id,
    });
  });
  it('R8.2 repay-loan costs 15', () => {
    let state = loaded();
    const shareId = state.players[1].shares[0].id;
    state = step(state, { type: 'take-loan', playerId: 'p2', shareId }).state;
    const result = step(state, { type: 'repay-loan', playerId: 'p2', shareId });
    expect(result.state.players[1].cash).toBe(27);
    expect(result.state.players[1].shares[0].mortgaged).toBe(false);
    state.players[1].cash = 14;
    rejected(state, { type: 'repay-loan', playerId: 'p2', shareId }, 'insufficient-funds');
  });
  it('R8.3 forced loans mortgage the lowest-value share first', () => {
    const state = elected(3, {
      deal: [
        ['jade', 'ginseng'],
        ['silk', 'nutmeg'],
        ['silk', 'nutmeg'],
      ],
    });
    state.market.jade = 20;
    state.players[0].cash = 0;
    const result = step(state, { type: 'buy-share', playerId: 'p1', ware: 'jade' });
    expect(result.events.filter((e) => e.type === 'loan-taken').map((e) => e.shareId)).toEqual([
      'share-2',
      'share-1',
    ]);
    expect(result.state.players[0].cash).toBe(4);
  });
  it('R8.4 cargo, port and shipyard payouts follow the documented order', () => {
    const state = finalRoll({ ginseng: 6, nutmeg: 1, silk: 1 });
    state.punts[0].position = 10;
    state.punts[0].seats[0].occupant = 'p1';
    state.port.A.occupant = 'p2';
    state.shipyard.A.occupant = 'p3';
    const result = step(state, { type: 'roll-dice', playerId: 'p1' });
    expect(
      result.events.filter((e) => e.type === 'payout').map((e) => [e.reason, e.amount]),
    ).toEqual([
      ['cargo', 18],
      ['port', 6],
      ['shipyard', 6],
    ]);
    const order = types(result);
    expect(order.lastIndexOf('payout')).toBeLessThan(order.indexOf('repair-paid'));
    expect(order.lastIndexOf('repair-paid')).toBeLessThan(order.indexOf('market-rose'));
    expect(order.slice(-2)).toEqual(['voyage-ended', 'voyage-started']);
  });
  it('R8.5 insurance pays shipyard rewards after collecting its own profits; bank covers bankruptcy', () => {
    const state = finalRoll();
    state.insurance = 'p1';
    state.players[0].cash = 0;
    state.shipyard.C.occupant = 'p2';
    const result = step(state, { type: 'roll-dice', playerId: 'p1' });
    expect(result.state.players[0].cash).toBe(0);
    expect(result.state.players[0].shares.every((s) => s.mortgaged)).toBe(true);
    expect(result.state.players[1].cash).toBe(45);
    expect(
      result.events.filter((e) => e.type === 'repair-paid').map((e) => [e.payer, e.to, e.amount]),
    ).toEqual([
      ['p1', 'bank', 6],
      ['p1', 'bank', 8],
    ]);
    expect(
      result.events.filter((e) => e.type === 'payout').map((e) => [e.source, e.playerId, e.amount]),
    ).toEqual([
      ['p1', 'p2', 10],
      ['bank', 'p2', 5],
    ]);
    const profitable = finalRoll({ ginseng: 6, nutmeg: 1, silk: 1 });
    profitable.punts[0].position = 10;
    profitable.punts[0].seats[0].occupant = 'p1';
    profitable.insurance = 'p1';
    profitable.players[0].cash = 0;
    const paid = step(profitable, { type: 'roll-dice', playerId: 'p1' });
    expect(paid.state.players[0].cash).toBe(4);
    expect(paid.events.some((e) => e.type === 'loan-taken')).toBe(false);
  });
});

describe('R9 market & end', () => {
  it('R9.1 delivered wares rise one notch; capped at 30', () => {
    const state = finalRoll({ ginseng: 6, nutmeg: 6, silk: 6 });
    state.punts.forEach((p) => {
      p.position = 10;
    });
    state.market = { ginseng: 20, nutmeg: 20, silk: 30, jade: 0 };
    const result = step(state, { type: 'roll-dice', playerId: 'p1' });
    expect(result.state.market).toEqual({ ginseng: 30, nutmeg: 30, silk: 30, jade: 0 });
  });
  it('R9.2 game ends after the voyage in which any ware hits 30; fortune counts all shares − 15/mortgage', () => {
    const state = finalRoll({ ginseng: 6, nutmeg: 1, silk: 1 });
    state.punts[0].position = 10;
    state.market.ginseng = 20;
    state.players[0].shares[0].mortgaged = true;
    const result = step(state, { type: 'roll-dice', playerId: 'p1' });
    expect(result.state.phase).toBe('game-over');
    expect(result.state.result?.scores).toEqual(computeScores(result.state));
    const p = result.state.players[0];
    expect(computeScores(result.state)[0].total).toBe(
      p.cash + p.shares.reduce((n, s) => n + result.state.market[s.ware], 0) - 15,
    );
    expect(types(result).slice(-2)).toEqual(['voyage-ended', 'game-ended']);
    expect(getLegalActions(result.state, 'p1')).toEqual([]);
    rejected(
      result.state,
      { type: 'take-loan', playerId: 'p1', shareId: p.shares[1].id },
      'game-over',
    );
  });
  it('R9.3 ties share the win', () => {
    const state = finalRoll();
    state.market.jade = 30;
    state.players.forEach((p) => {
      p.cash = 90 - p.shares.filter((s) => s.ware === 'jade').length * 30;
    });
    const result = step(state, { type: 'roll-dice', playerId: 'p1' });
    expect(result.state.result?.winners).toEqual(['p1', 'p2', 'p3']);
  });
  it('R9.4 board resets between voyages', () => {
    const result = finish(place(loaded(), { kind: 'insurance' })).state;
    expect(result.voyage).toBe(2);
    expect(result.punts).toEqual([]);
    expect(result.pirates).toEqual({ captain: null, crew: null });
    expect(result.pilots).toEqual({ small: null, large: null });
    expect(result.insurance).toBeNull();
    expect(result.lastRoll).toBeNull();
    expect(result.placementRound + result.movementRound).toBe(0);
    expect(result.players.every((p) => !p.accomplicesPlaced && !p.passedPlacement)).toBe(true);
  });
});

describe('engine API invariants', () => {
  it('applyAction never mutates its input state', () => {
    const state = loaded();
    const before = JSON.stringify(state);
    const action: Action = {
      type: 'place-accomplice',
      playerId: 'p1',
      target: { kind: 'insurance' },
    };
    step(state, action);
    expect(JSON.stringify(state)).toBe(before);
    expect(action.target).toEqual({ kind: 'insurance' });
    rejected(state, { type: 'bid', playerId: 'p1', amount: 100 });
    expect(JSON.stringify(state)).toBe(before);
  });
  it('actions from a player other than pending.playerId return not-your-turn (loans excepted)', () => {
    rejected(loaded(), { type: 'pass-placement', playerId: 'p2' }, 'not-your-turn');
  });
  it('getLegalActions only returns actions that applyAction accepts (fuzz: random playouts)', () =>
    runPlayouts([1, 7, 19], true));
  it("getPlayerView hides other players' share wares", () => {
    const state = createGame(config());
    const view = getPlayerView(state, 'p2');
    expect(
      view.players[0].shares.every((s) => s.ware === null && !WARES.some((w) => s.id.includes(w))),
    ).toBe(true);
    expect(view.players[1].shares).toEqual(state.players[1].shares);
    expect(view).not.toHaveProperty('rng');
    expect(view.config).not.toHaveProperty('seed');
    expect(view.config).not.toHaveProperty('debug');
    expect(
      getPlayerView(state, null).players.every((p) => p.shares.every((s) => s.ware === null)),
    ).toBe(true);
    view.players[1].cash = 0;
    expect(state.players[1].cash).toBe(30);
  });
  it('every fixture in fixtures/*.json replays and matches its expectations', assertFixtures);
  it('R1.6 replay reports the first illegal action index', () => {
    expect(() => replay(config(), [{ type: 'pass-bid', playerId: 'p2' }])).toThrow(
      'Replay action 0',
    );
  });
});
