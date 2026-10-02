/**
 * Acceptance checklist for the engine agent — turn each `it.todo` into a real test.
 * Names cite docs/RULES.md so a failing test points straight at the rule.
 */
import { describe, it } from 'vitest';

describe('R1 setup', () => {
  it.todo('R1.1 creates p1..pN with 30 pesos each, in config order');
  it.todo('R1.2 deals 2 shares per player from a pool of 3 per ware; supply = 5 − dealt');
  it.todo('R1.3 gives 4 accomplices in a 3-player game, 3 otherwise');
  it.todo('R1.6 same seed + same actions ⇒ identical state (determinism)');
  it.todo('R1.6 debug.dice and debug.deal override the RNG');
});

describe('R3 auction', () => {
  it.todo('R3.1 voyage 1 is opened by players[0]; later voyages by the previous harbor master');
  it.todo('R3.2 bids must strictly increase; a passed player never bids again this voyage');
  it.todo('R3.3 maxBid = cash + 12 × unmortgaged shares');
  it.todo('R3.4 last remaining high bidder wins and pays (forced loans if needed)');
  it.todo('R3.4 nobody bids ⇒ previous harbor master keeps office for free (voyage 1: players[0])');
});

describe('R4 harbor master', () => {
  it.todo('R4.1 may buy one share at max(5, value); cannot buy from empty supply; may decline');
  it.todo('R4.3 rejects start positions outside 0..5, sums ≠ 9, duplicate wares');
  it.todo('R4.4 load-punts sets punts[route], unloadedWare and moves to placement');
});

describe('R5 placement & movement', () => {
  it.todo('R5.1 3 players: P P M P M P M; 4–5 players: P M P M P M');
  it.todo('R5.2 each round starts at the harbor master; passing is permanent for the voyage');
  it.todo('R5.3 punt placement takes the cheapest vacant seat; docked punts accept nobody');
  it.todo('R5.4 pirate placement fills captain first, then crew');
  it.todo('R5.5 insurance costs 0 and pays 10 immediately');
  it.todo('R5.6 blind passenger: any vacant non-insurance space for all remaining cash');
  it.todo('R5.7 roll-dice moves each punt by its own ware die');
  it.todo('R5.8 passing 13 docks at the next free port slot; surplus movement is lost');
  it.todo('R5.9 after round 3, punts on 0..12 go to shipyard A→B→C');
});

describe('R6 pirates', () => {
  it.todo('R6.1 only end-of-movement positions on 13 trigger pirates; empty pirate boat ⇒ nothing');
  it.todo('R6.2 after round 2 captain may board a vacant seat, then crew; crew is promoted');
  it.todo(
    'R6.3 after round 3 accomplices aboard go home, pirates split profit, captain picks port/shipyard',
  );
  it.todo('R6.3 punt on 13 after round 3 with empty pirate boat docks in port');
});

describe('R7 pilots', () => {
  it.todo('R7.1 pilots act before the third roll: small, then large; skipped when vacant');
  it.todo('R7.2 small pilot moves one punt ±1');
  it.todo('R7.3 large pilot moves one punt ±1/±2 or two different punts ±1');
  it.todo('R7.4 cannot move below 0 or move docked punts; pushing past 13 docks immediately');
});

describe('R8 money', () => {
  it.todo('R8.1 take-loan gives 12 and is allowed for any player at any time');
  it.todo('R8.2 repay-loan costs 15');
  it.todo('R8.3 forced loans mortgage the lowest-value share first');
  it.todo('R8.4 cargo, port and shipyard payouts follow the documented order');
  it.todo(
    'R8.5 insurance pays shipyard rewards after collecting its own profits; bank covers bankruptcy',
  );
});

describe('R9 market & end', () => {
  it.todo('R9.1 delivered wares rise one notch; capped at 30');
  it.todo(
    'R9.2 game ends after the voyage in which any ware hits 30; fortune counts all shares − 15/mortgage',
  );
  it.todo('R9.3 ties share the win');
  it.todo('R9.4 board resets between voyages');
});

describe('engine API invariants', () => {
  it.todo('applyAction never mutates its input state');
  it.todo(
    'actions from a player other than pending.playerId return not-your-turn (loans excepted)',
  );
  it.todo('getLegalActions only returns actions that applyAction accepts (fuzz: random playouts)');
  it.todo("getPlayerView hides other players' share wares");
  it.todo('every fixture in fixtures/*.json replays and matches its expectations');
});
