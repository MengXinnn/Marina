import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  getLegalActions,
  getPlayerView,
  placementAdvice,
  type Action,
  type GameState,
  type PendingDecision,
} from '@manila/engine';
import { parseReply } from '../src/llm/parse';
import { buildSystemPrompt, buildTurnPrompt, commandOf } from '../src/llm/prompt';

/** Small deterministic PRNG for picking moves (the engine's own RNG stays untouched). */
function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const names = ['A', 'B', 'C', 'D', 'E'];
const colors = ['red', 'blue', 'orange', 'purple', 'white'] as const;

/** Every decision of a few random games, as the acting seat sees it. */
function decisions(seed: number, players: number, limit = 400) {
  const random = mulberry(seed);
  let state: GameState = createGame({
    players: names.slice(0, players).map((name, i) => ({ name, color: colors[i]! })),
    seed,
  });
  const out: Array<{ state: GameState; legal: Action[] }> = [];
  for (let i = 0; i < limit && state.phase !== 'game-over'; i++) {
    const actor = (state.pending as Extract<PendingDecision, { playerId: string }>).playerId;
    const legal = getLegalActions(state, actor);
    out.push({ state, legal });
    const moves = legal.filter((a) => a.type !== 'take-loan' && a.type !== 'repay-loan');
    const r = applyAction(state, moves[Math.floor(random() * moves.length)]!);
    if (!r.ok) throw new Error(r.error.message);
    state = r.state;
  }
  return out;
}

/** Equal up to the encodings the engine treats as the same move. */
function canonical(a: Action): string {
  return commandOf(a) ?? JSON.stringify(a);
}

describe('llm prompt ⇄ reply', () => {
  const samples = [3, 4, 5].flatMap((n) => [1, 2].flatMap((seed) => decisions(seed * 10 + n, n)));

  it('covers every kind of decision', () => {
    const kinds = new Set(samples.map((s) => s.state.pending.type));
    for (const k of ['bid', 'buy-share', 'load-punts', 'place-accomplice', 'roll-dice', 'pilot'])
      expect(kinds).toContain(k);
  });

  it('gives every legal move a unique command that parses back to that move', () => {
    for (const { state, legal } of samples) {
      const actor = (state.pending as { playerId: string }).playerId;
      const view = getPlayerView(state, actor);
      const prompt = buildTurnPrompt(view, legal);
      const commands = prompt.options.map((o) => o.command);
      expect(new Set(commands).size).toBe(commands.length);
      for (const action of legal) {
        if (action.type === 'take-loan' || action.type === 'repay-loan') continue;
        const reply = JSON.stringify({ move: commandOf(action), reason: '测试' });
        const parsed = parseReply(reply, prompt.options, prompt.listed);
        expect(parsed.ok, `${commandOf(action)} in ${state.pending.type}`).toBe(true);
        if (parsed.ok) expect(canonical(parsed.option.action)).toBe(canonical(action));
      }
      // Listed decisions show every command; templated ones explain the format.
      if (prompt.listed) for (const c of commands) expect(prompt.text).toContain(`\`${c}\``);
      else expect(prompt.text).toMatch(/`(pass|load [^`]+)`/);
    }
  });

  it("never shows other players' share wares", () => {
    for (const { state, legal } of samples.slice(0, 80)) {
      const actor = (state.pending as { playerId: string }).playerId;
      const text = buildTurnPrompt(getPlayerView(state, actor), legal).text;
      for (const p of state.players) {
        if (p.id === actor) continue;
        const line = text.split('\n').find((l) => l.startsWith(`- ${p.name}（${p.id}）`))!;
        expect(line).toContain('种类保密');
        expect(line).not.toMatch(/ginseng|nutmeg|silk|jade/);
      }
    }
  });

  it('prices placements with the same expected value as the hover cards', () => {
    const placements = samples.filter((s) => s.state.pending.type === 'place-accomplice');
    expect(placements.length).toBeGreaterThan(0);
    for (const { state, legal } of placements.slice(0, 20)) {
      const actor = (state.pending as { playerId: string }).playerId;
      const view = getPlayerView(state, actor);
      const { options } = buildTurnPrompt(view, legal);
      for (const o of options) {
        if (o.action.type !== 'place-accomplice') continue;
        const { expected } = placementAdvice(view, actor, o.action.target);
        if (expected === null) expect(o.label).not.toContain('期望');
        else expect(o.label).toContain(`期望现金净收益 `);
        if (expected !== null && expected > 0) expect(o.label).toContain(`+${expected.toFixed(1)}`);
      }
    }
  });

  it('accepts a load plan in any route order and with Chinese ware names', () => {
    const s = samples.find((x) => x.state.pending.type === 'load-punts')!;
    const actor = (s.state.pending as { playerId: string }).playerId;
    const prompt = buildTurnPrompt(getPlayerView(s.state, actor), s.legal);
    const parsed = parseReply('{"move": "load 玉器@4 人参@2 丝绸@3"}', prompt.options, false);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.option.command).toBe('load ginseng@2 silk@3 jade@4');
    expect(parseReply('{"move": "load jade@5 silk@5 ginseng@5"}', prompt.options, false).ok).toBe(
      false,
    );
  });

  it('builds the rules digest with the custom play style', () => {
    const text = buildSystemPrompt('多冒险，喜欢当海盗');
    expect(text).toContain('"move"');
    expect(text).toContain('多冒险，喜欢当海盗');
  });
});
