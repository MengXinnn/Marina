import type { RngState } from './contract/types';

/** R1.6 mulberry32: only the caller's private working state is advanced. */
export function random(rng: RngState): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffle<T>(items: T[], rng: RngState): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random(rng) * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}
