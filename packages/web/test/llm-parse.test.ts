import { describe, expect, it } from 'vitest';
import type { Action } from '@manila/engine';
import { parseReply } from '../src/llm/parse';
import type { LlmOption } from '../src/llm/prompt';

/** The parser keys some leniency off the action type; the rest of the action is irrelevant here. */
const typeOf = (command: string): Action['type'] =>
  command.startsWith('bid')
    ? 'bid'
    : command.startsWith('pilot')
      ? 'pilot'
      : command.startsWith('board') || command === 'stay'
        ? 'pirate-board'
        : command.startsWith('place')
          ? 'place-accomplice'
          : 'pass-placement';

const opt = (command: string, type: Action['type'] = typeOf(command)): LlmOption => ({
  command,
  label: command,
  action: { type, playerId: 'p1' } as unknown as Action,
});

const placement = [
  opt('pass'),
  opt('place punt silk'),
  opt('place port C'),
  opt('place pirate'),
  opt('place insurance'),
];

const pick = (text: string, options = placement, listed = true) => {
  const r = parseReply(text, options, listed);
  return r.ok ? r.option.command : `ERR ${r.error}`;
};

describe('parseReply', () => {
  it('reads the JSON answer and its reason', () => {
    const r = parseReply('{"move": "place port C", "reason": "港口 C 收益高"}', placement);
    expect(r.ok && r.option.command).toBe('place port C');
    expect(r.reason).toBe('港口 C 收益高');
  });

  it('ignores code fences, preambles and reasoning blocks', () => {
    expect(pick('```json\n{"move": "place pirate"}\n```')).toBe('place pirate');
    expect(pick('<think>港口还是海盗？{"move":"pass"}</think>\n{"move": "place pirate"}')).toBe(
      'place pirate',
    );
    expect(pick('好的，我的选择是：{"move": "place insurance", "reason": "白拿 10"}')).toBe(
      'place insurance',
    );
  });

  it('reads an answer that stops before the closing brace', () => {
    // Seen from deepseek-flash: the reason survives too.
    const r = parseReply('{"move": "place insurance", "reason": "免费先拿10块"', placement);
    expect(r.ok && r.option.command).toBe('place insurance');
    expect(r.reason).toBe('免费先拿10块');
    expect(parseReply('{"move": "place pirate", "reason": "守株待兔', placement).reason).toBe(
      '守株待兔',
    );
  });

  it('is forgiving about case, Chinese ware names and full-width characters', () => {
    expect(pick('{"move": "PLACE PORT c"}')).toBe('place port C');
    expect(pick('{"move": "place punt 丝绸"}')).toBe('place punt silk');
    expect(pick('{"move": "`place　punt　silk`"}')).toBe('place punt silk');
  });

  it('accepts an option number when the options were listed', () => {
    expect(pick('{"move": 3}')).toBe('place port C');
    expect(pick('{"move": "2"}')).toBe('place punt silk');
    expect(pick('{"move": 9}')).toMatch(/^ERR/);
  });

  it('takes a bare command when there is no JSON', () => {
    expect(pick('place pirate')).toBe('place pirate');
    expect(pick('我选 place port C，因为便宜')).toBe('place port C');
  });

  it('never invents a move', () => {
    expect(pick('{"move": "place port A"}')).toMatch(/^ERR/);
    expect(pick('{"reason": "忘了写 move"}')).toMatch(/没有 move/);
    expect(pick('')).toMatch(/^ERR/);
    // Ambiguous: two commands mentioned.
    expect(pick('place pirate or place insurance')).toMatch(/^ERR/);
  });

  it('understands bids as numbers', () => {
    const bids = [opt('pass', 'pass-bid'), opt('bid 3'), opt('bid 4'), opt('bid 5')];
    expect(pick('{"move": "bid 4"}', bids, false)).toBe('bid 4');
    expect(pick('{"move": 5}', bids, false)).toBe('bid 5');
    expect(pick('{"move": "出价 3"}', bids, false)).toBe('bid 3');
    expect(pick('{"move": "放弃"}', bids, false)).toBe('pass');
    expect(pick('{"move": "bid 9"}', bids, false)).toMatch(/^ERR/);
  });

  it('prefers the specific command when one contains another', () => {
    const board = [opt('stay'), opt('board silk'), opt('board silk seat 2')];
    expect(pick('{"move": "board silk seat 2"}', board)).toBe('board silk seat 2');
    expect(pick('I will board silk seat 2 now', board)).toBe('board silk seat 2');
  });

  it('reads pilot moves in any order', () => {
    const pilot = [opt('pilot none'), opt('pilot ginseng +1 jade -1'), opt('pilot jade +2')];
    expect(pick('{"move": "pilot jade -1 ginseng +1"}', pilot)).toBe('pilot ginseng +1 jade -1');
    expect(pick('{"move": "pilot 玉器 ＋2"}', pilot)).toBe('pilot jade +2');
  });
});
