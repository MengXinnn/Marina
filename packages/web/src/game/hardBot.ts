import { chooseBotAction, type Action, type PlayerView } from '@manila/engine';
import type { HardReply, HardRequest } from './hardWorker';

/**
 * The hard computer player simulates the rest of the voyage many times (a few hundred ms), so
 * it thinks in a Web Worker. Where workers are unavailable (tests, old browsers) it runs inline.
 */
let worker: Worker | null | undefined;
let nextId = 0;
const waiting = new Map<number, (action: Action | null) => void>();

function hardWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker =
      typeof Worker === 'undefined'
        ? null
        : new Worker(new URL('./hardWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  worker?.addEventListener('message', (e: MessageEvent<HardReply>) => {
    waiting.get(e.data.id)?.(e.data.action);
    waiting.delete(e.data.id);
  });
  worker?.addEventListener('error', () => {
    // A broken worker: answer everyone inline from now on.
    worker?.terminate();
    worker = null;
    for (const resolve of waiting.values()) resolve(null);
    waiting.clear();
  });
  return worker;
}

const inline = (view: PlayerView, legal: Action[]) =>
  chooseBotAction(view, legal, { level: 'hard', random: Math.random });

export function chooseHardMove(view: PlayerView, legal: Action[]): Promise<Action> {
  const w = hardWorker();
  if (!w) return Promise.resolve(inline(view, legal));
  return new Promise((resolve) => {
    const id = nextId++;
    waiting.set(id, (action) => resolve(action ?? inline(view, legal)));
    const request: HardRequest = { id, view, legal };
    w.postMessage(request);
  });
}
