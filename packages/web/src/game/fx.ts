import type { GameEvent, GameState } from '@manila/engine';

/**
 * Presentation-only broadcast of each animated step, so effects (particles, banners, camera
 * shake) can react to engine events without the director knowing about them.
 */
export interface FxStep {
  events: GameEvent[];
  /** Displayed state before / after this step was patched in. */
  before: GameState;
  after: GameState;
  /** Animation speed multiplier at the moment the step starts. */
  speed: number;
}

type Listener = (step: FxStep) => void;
const listeners = new Set<Listener>();

export function onFxStep(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitFxStep(step: FxStep): void {
  for (const fn of listeners) fn(step);
}
