import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getLegalActions } from '../src/index';
import type { Action } from '../src/index';
import { actor, config, finalRoll, loaded, quietAction, step } from './helpers';

const invalid = (state: Parameters<typeof applyAction>[0], action: Action) =>
  expect(applyAction(state, action)).toMatchObject({ ok: false });

describe('R10 strong pirates', () => {
  function boarding() {
    const state = finalRoll();
    state.config.rules.pirateDisplace = true;
    state.movementRound = 1;
    state.placementRound = 3;
    state.pending = { type: 'roll-dice', playerId: 'p1', round: 2 };
    state.punts[0].position = 12;
    state.punts[0].seats.forEach((s) => {
      s.occupant = 'p3';
    });
    state.players[2].accomplicesPlaced = 3;
    state.players[0].accomplicesPlaced = state.players[1].accomplicesPlaced = 1;
    state.pirates = { captain: 'p1', crew: 'p2' };
    return state;
  }
  it('R10 defaults off and skips full punts without asking for a decision', () => {
    expect(createGame(config()).config.rules.pirateDisplace).toBe(false);
    const state = boarding();
    state.config.rules.pirateDisplace = false;
    expect(step(state, { type: 'roll-dice', playerId: 'p1' }).state.pending.type).toBe(
      'place-accomplice',
    );
  });
  it('R10 displaces a worker, returns it, and protects the freshly boarded captain', () => {
    let state = step(boarding(), { type: 'roll-dice', playerId: 'p1' }).state;
    expect(
      getLegalActions(state, 'p1').filter((a) => a.type === 'pirate-board' && a.ware !== null),
    ).toHaveLength(3);
    let result = step(state, {
      type: 'pirate-board',
      playerId: 'p1',
      ware: 'ginseng',
      displaceSeat: 1,
    });
    expect(result.events[0]).toMatchObject({ type: 'pirate-boarded', displaced: 'p3', seat: 1 });
    expect(result.state.players[2].accomplicesPlaced).toBe(2);
    state = result.state;
    invalid(state, { type: 'pirate-board', playerId: 'p2', ware: 'ginseng', displaceSeat: 1 });
    result = step(state, {
      type: 'pirate-board',
      playerId: 'p2',
      ware: 'ginseng',
      displaceSeat: 0,
    });
    expect(result.state.punts[0].seats[1].occupant).toBe('p1');
    expect(result.state.punts[0].seats[0].occupant).toBe('p2');
    expect(result.state.players[2].accomplicesPlaced).toBe(1);
  });
  it('R10 must fill a vacant seat on any eligible punt before displacing', () => {
    const state = boarding();
    state.punts[1].position = 12;
    const ready = step(state, { type: 'roll-dice', playerId: 'p1' }).state;
    expect(ready.pending).toMatchObject({ candidates: ['nutmeg'] });
    invalid(ready, { type: 'pirate-board', playerId: 'p1', ware: 'ginseng', displaceSeat: 0 });
    expect(
      step(ready, { type: 'pirate-board', playerId: 'p1', ware: 'nutmeg' }).state.punts[1].seats[0]
        .pirate,
    ).toBe(true);
  });
});

describe('rule boundary regressions', () => {
  it('R3.3/R8.2 repayment cannot make an outstanding winning bid insolvent', () => {
    let state = createGame(config());
    state = step(state, { type: 'bid', playerId: 'p1', amount: 54 }).state;
    const shareId = state.players[0].shares[0].id;
    state = step(state, { type: 'take-loan', playerId: 'p1', shareId }).state;
    expect(applyAction(state, { type: 'repay-loan', playerId: 'p1', shareId })).toMatchObject({
      ok: false,
      error: { code: 'insufficient-funds' },
    });
    expect(getLegalActions(state, 'p1').some((a) => a.type === 'repay-loan')).toBe(false);
    state = step(state, { type: 'pass-bid', playerId: 'p2' }).state;
    state = step(state, { type: 'pass-bid', playerId: 'p3' }).state;
    expect(state.players[0].cash).toBe(0);
  });

  it('R8.5 self-insurance costs net zero, emits both events, and never takes a loan', () => {
    const state = finalRoll({ ginseng: 1, nutmeg: 6, silk: 6 });
    state.punts[1].position = state.punts[2].position = 10;
    state.insurance = state.shipyard.A.occupant = 'p1';
    state.players[0].cash = 0;
    const result = step(state, { type: 'roll-dice', playerId: 'p1' });
    expect(result.state.players[0].cash).toBe(0);
    expect(result.events.filter((e) => e.type === 'loan-taken')).toEqual([]);
    expect(result.events).toContainEqual({
      type: 'payout',
      source: 'p1',
      playerId: 'p1',
      amount: 6,
      reason: 'shipyard',
      slot: 'A',
    });
    expect(result.events).toContainEqual({
      type: 'repair-paid',
      payer: 'p1',
      to: 'p1',
      amount: 6,
      slot: 'A',
    });
  });

  it('R5.8/R7.1 early arrivals neither move again nor allow pilots to act when all arrived', () => {
    let state = loaded(4, { dice: Array(3).fill({ ginseng: 6, nutmeg: 6, silk: 6 }) });
    state = step(state, {
      type: 'place-accomplice',
      playerId: 'p1',
      target: { kind: 'pilot', size: 'small' },
    }).state;
    state = step(state, {
      type: 'place-accomplice',
      playerId: 'p2',
      target: { kind: 'pilot', size: 'large' },
    }).state;
    while (state.movementRound !== 2) state = step(state, quietAction(state)).state;
    expect(state.punts.every((p) => p.status === 'port')).toBe(true);
    expect(state.pending).toMatchObject({ type: 'roll-dice', round: 3 });
    const result = step(state, { type: 'roll-dice', playerId: 'p1' });
    expect(result.events.filter((e) => e.type === 'punt-moved' || e.type === 'pilot-used')).toEqual(
      [],
    );
  });

  it('R5.4 can still invest in a port space after a punt has docked there', () => {
    const state = loaded();
    state.punts[0].status = 'port';
    state.punts[0].dock = 'A';
    state.port.A.punt = 'ginseng';
    const action: Action = {
      type: 'place-accomplice',
      playerId: 'p1',
      target: { kind: 'port', slot: 'A' },
    };
    expect(getLegalActions(state, actor(state))).toContainEqual(action);
    expect(step(state, action).state.port.A.occupant).toBe('p1');
  });

  it('R8.3 equal-value collateral uses lexicographic share ids, independent of hand order', () => {
    const state = loaded();
    state.players[0].cash = 0;
    state.players[0].shares.reverse();
    const result = step(state, {
      type: 'place-accomplice',
      playerId: 'p1',
      target: { kind: 'pilot', size: 'large' },
    });
    expect(result.events[0]).toMatchObject({
      type: 'loan-taken',
      shareId: 'share-1',
      forced: true,
    });
  });

  it('R1.6 partial debug dice fall back to RNG and stop consuming at exhaustion', () => {
    const state = finalRoll({ ginseng: 6 });
    state.movementRound = 0;
    state.placementRound = 2;
    state.pending = { type: 'roll-dice', playerId: 'p1', round: 1 };
    const result = step(state, { type: 'roll-dice', playerId: 'p1' });
    expect(result.state.lastRoll?.ginseng).toBe(6);
    expect(result.state.rng.state).not.toBe(state.rng.state);
    expect(result.state.rng.debugDiceUsed).toBe(1);
    expect(step(state, { type: 'roll-dice', playerId: 'p1' })).toEqual(result);
  });

  it('R1 pure boundaries reject malformed JSON and detach event/view/config objects', () => {
    const state = loaded();
    const before = JSON.stringify(state);
    for (const bad of [
      null,
      {},
      { type: 'pilot', playerId: 'p1', moves: null },
      { type: 'bid', playerId: 'p1', amount: NaN },
      { type: 'place-accomplice', playerId: 'p1', target: { kind: 'port', slot: 'D' } },
    ]) {
      expect(applyAction(state, bad as Action)).toMatchObject({
        ok: false,
        error: { code: 'invalid-payload' },
      });
    }
    expect(JSON.stringify(state)).toBe(before);
    const result = step(state, {
      type: 'place-accomplice',
      playerId: 'p1',
      target: { kind: 'punt', ware: 'ginseng' },
    });
    result.state.players[0].shares[0].ware = 'jade';
    expect(JSON.stringify(state)).toBe(before);
  });
});
