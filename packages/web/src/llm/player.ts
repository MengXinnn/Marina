import type { Action, PlayerView } from '@manila/engine';
import { parseReply } from './parse';
import { buildSystemPrompt, buildTurnPrompt } from './prompt';
import { LlmError, chat, type ChatMessage, type ChatResult, type ChatUsage } from './providers';
import type { LlmProfile } from './settings';

/** A move chosen by a language model, already checked against the legal actions. */
export interface LlmDecision {
  action: Action;
  command: string;
  /** One public sentence from the model ('' when no call was needed). */
  reason: string;
  /** Requests sent for this decision (0 when only one move was possible). */
  calls: number;
  ms: number;
  usage: ChatUsage;
  /** The model's last raw reply, for the settings page's connection test. */
  raw: string;
}

export interface DecideOptions {
  profile: LlmProfile;
  /** getPlayerView(state, seat) — never the full state, so hidden shares stay hidden. */
  view: PlayerView;
  /** getLegalActions(state, seat). */
  legal: Action[];
  /** Recent public log lines, oldest first. */
  recent?: string[];
  signal?: AbortSignal;
}

/** Wait before retrying a busy service or a dropped connection. */
const RETRY_DELAY_MS = 1500;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new LlmError('aborted', '已取消'));
    });
  });
}

async function chatOnceMore(
  profile: LlmProfile,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<ChatResult & { calls: number }> {
  try {
    return { ...(await chat(profile, messages, signal)), calls: 1 };
  } catch (e) {
    if (!(e instanceof LlmError) || !e.retryable) throw e;
    await sleep(RETRY_DELAY_MS, signal);
    return { ...(await chat(profile, messages, signal)), calls: 2 };
  }
}

const add = (a?: number, b?: number) =>
  a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);

/**
 * Ask the model for the pending decision of `view.viewer`. One retry for a busy service, and one
 * follow-up when the reply is not a legal move; after that it throws an LlmError and the caller
 * lets the built-in computer play the turn.
 */
export async function decideWithLlm(opts: DecideOptions): Promise<LlmDecision> {
  const { profile, view, legal, recent, signal } = opts;
  const prompt = buildTurnPrompt(view, legal, recent);
  if (!prompt.options.length) throw new LlmError('invalid', '没有可选的合法动作');
  // A forced move (rolling the dice, a lone option) needs no model.
  if (prompt.options.length === 1) {
    const only = prompt.options[0]!;
    return {
      action: only.action,
      command: only.command,
      reason: '',
      calls: 0,
      ms: 0,
      usage: {},
      raw: '',
    };
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(profile.instructions) },
    { role: 'user', content: prompt.text },
  ];
  let calls = 0;
  let ms = 0;
  let usage: ChatUsage = {};
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await chatOnceMore(profile, messages, signal);
    calls += res.calls;
    ms += res.ms;
    usage = {
      input: add(usage.input, res.usage.input),
      output: add(usage.output, res.usage.output),
      cached: add(usage.cached, res.usage.cached),
    };
    const parsed = parseReply(res.text, prompt.options, prompt.listed);
    if (parsed.ok)
      return {
        action: parsed.option.action,
        command: parsed.option.command,
        reason: parsed.reason,
        calls,
        ms,
        usage,
        raw: res.text,
      };
    lastError = parsed.error;
    messages.push(
      { role: 'assistant', content: res.text },
      {
        role: 'user',
        content:
          `你的回复无法执行：${parsed.error}。` +
          (prompt.listed
            ? '请从上面的合法选项里选一个，照抄反引号里的指令。'
            : '请按上面说明的格式写 move。') +
          '只回复一个 JSON 对象：{"move": "<指令>", "reason": "<一句中文理由>"}',
      },
    );
  }
  throw new LlmError('invalid', `模型两次都没有给出合法指令（${lastError}）`);
}
