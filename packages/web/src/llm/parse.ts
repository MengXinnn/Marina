import { WARES, type Action, type Ware } from '@manila/engine';
import { zh } from '../i18n/zh';
import type { LlmOption } from './prompt';

/**
 * Turns a model's reply into one of the legal options. Tolerant of the usual noise — code
 * fences, <think> blocks, Chinese ware names, an option number instead of the command — but it
 * never invents a move: whatever it returns is one of `options`.
 */

export type ParsedReply =
  { ok: true; option: LlmOption; reason: string } | { ok: false; error: string; reason: string };

/** Drops reasoning that some models (DeepSeek-R1, Qwen3 …) print before the answer. */
function stripThinking(text: string): string {
  return text
    .replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, '')
    .replace(/^[\s\S]*<\/(think|thinking|reasoning)>/i, '')
    .trim();
}

/** The last parseable JSON object in the text, if any. */
function findJson(text: string): Record<string, unknown> | null {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]!);
  const candidates = [...fenced, text];
  for (const candidate of candidates) {
    // Try each "{" as a start, last first: the answer usually comes after any preamble.
    const starts = [...candidate.matchAll(/\{/g)].map((m) => m.index!).reverse();
    for (const start of starts) {
      const end = candidate.lastIndexOf('}');
      for (let e = end; e > start; e = candidate.lastIndexOf('}', e - 1)) {
        try {
          const value = JSON.parse(candidate.slice(start, e + 1)) as unknown;
          if (value && typeof value === 'object' && !Array.isArray(value))
            return value as Record<string, unknown>;
        } catch {
          // keep looking
        }
      }
    }
  }
  return null;
}

const WARE_ALIASES: Array<[RegExp, Ware]> = [
  ...WARES.map((w): [RegExp, Ware] => [new RegExp(zh.ware[w], 'g'), w]),
  [/人蔘/g, 'ginseng'],
  [/豆蔻/g, 'nutmeg'],
  [/玉石|翡翠/g, 'jade'],
];

/** Lower-case, ASCII, single-spaced; Chinese ware names mapped to their ids. */
export function normalizeCommand(raw: string): string {
  let s = raw.normalize('NFKC'); // full-width → ASCII (＋, ＠, digits, letters)
  for (const [re, ware] of WARE_ALIASES) s = s.replace(re, ` ${ware} `);
  return s
    .toLowerCase()
    .replace(/[`"'“”‘’。，、；：,.;:!！?？()（）[\]【】]/g, ' ')
    .replace(/\s*@\s*/g, '@')
    .replace(/([+-])\s+(\d)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameLoad(a: Action, wanted: Map<Ware, number>): boolean {
  return (
    a.type === 'load-punts' &&
    a.punts.length === wanted.size &&
    a.punts.every((p) => wanted.get(p.ware) === p.start)
  );
}

/** Commands that are not a verbatim option but still name exactly one of them. */
function matchLoose(norm: string, options: LlmOption[]): LlmOption | null {
  const kind = options[0]?.action.type;
  // load: any order of "ware@start" (also "ware 3" / "ware:3").
  if (options.some((o) => o.action.type === 'load-punts')) {
    const pairs = [...norm.matchAll(/\b(ginseng|nutmeg|silk|jade)\s*[@:=]?\s*(\d)\b/g)];
    if (pairs.length === 3) {
      const wanted = new Map(pairs.map((m) => [m[1] as Ware, Number(m[2])]));
      return options.find((o) => sameLoad(o.action, wanted)) ?? null;
    }
  }
  // bid: "bid 7", "出价 7", or a bare number during an auction.
  if (options.some((o) => o.action.type === 'bid' || o.action.type === 'pass-bid')) {
    const m = /^(?:bid|出价)?\s*(\d+)$/.exec(norm) ?? /\bbid\s*(\d+)\b/.exec(norm);
    if (m) return options.find((o) => o.command === `bid ${Number(m[1])}`) ?? null;
    if (/^(pass|放弃|不出价|弃权)/.test(norm))
      return options.find((o) => o.command === 'pass') ?? null;
  }
  // pilot: moves in any order.
  if (kind === 'pilot') {
    const moves = [...norm.matchAll(/\b(ginseng|nutmeg|silk|jade)\s*([+-]\d)\b/g)]
      .map((m) => ({ ware: m[1] as Ware, delta: Number(m[2]) }))
      .sort((a, b) => WARES.indexOf(a.ware) - WARES.indexOf(b.ware));
    if (moves.length) {
      const command = `pilot ${moves.map((m) => `${m.ware} ${m.delta > 0 ? '+' : ''}${m.delta}`).join(' ')}`;
      return options.find((o) => o.command === command) ?? null;
    }
  }
  // Exactly one option's command appears inside the text, as whole words.
  const hits = options.filter((o) =>
    new RegExp(`(^|\\s)${normalizeCommand(o.command).replace(/[+]/g, '\\+')}($|\\s)`).test(norm),
  );
  if (hits.length === 1) return hits[0]!;
  // Prefer the longest command when one contains another ("board silk seat 2" ⊃ "board silk").
  if (hits.length > 1) {
    const longest = hits.reduce((a, b) => (b.command.length > a.command.length ? b : a));
    if (hits.every((h) => longest.command.startsWith(h.command))) return longest;
  }
  return null;
}

export function parseReply(text: string, options: LlmOption[], listed = true): ParsedReply {
  const body = stripThinking(text);
  const json = findJson(body);
  const reasonRaw = json?.reason ?? json?.理由 ?? json?.explanation;
  const reason =
    typeof reasonRaw === 'string' ? reasonRaw.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  const moveRaw = json ? (json.move ?? json.action ?? json.command ?? json.choice) : undefined;

  let candidate: string;
  if (typeof moveRaw === 'number') candidate = String(moveRaw);
  else if (typeof moveRaw === 'string') candidate = moveRaw;
  else if (json) return { ok: false, error: '回复的 JSON 里没有 move 字段', reason };
  else {
    // No JSON at all: take the reply itself (first non-empty line) as the command.
    candidate = body.split('\n').find((l) => l.trim()) ?? '';
  }
  if (!candidate.trim()) return { ok: false, error: '回复是空的', reason };

  const norm = normalizeCommand(candidate);
  // An option number (only offered when the options were listed).
  const index = /^(?:#|no\.?|选项|第)?\s*(\d+)\s*(?:号|项)?$/.exec(norm);
  if (listed && index) {
    const option = options[Number(index[1]) - 1];
    if (option) return { ok: true, option, reason };
  }
  const exact = options.find((o) => normalizeCommand(o.command) === norm);
  if (exact) return { ok: true, option: exact, reason };
  const loose = matchLoose(norm, options);
  if (loose) return { ok: true, option: loose, reason };
  return { ok: false, error: `「${candidate.slice(0, 60)}」不是合法指令`, reason };
}
