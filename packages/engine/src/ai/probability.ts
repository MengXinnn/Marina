import { LAST_SPACE } from '../contract/constants';

/** Where a sailing punt ends up after its remaining rolls (one d6 per roll). */
export interface PuntOutlook {
  /** Passed space 13 → reaches Manila. */
  arrive: number;
  /** Ends exactly on space 13 (pirate territory). */
  on13: number;
  /** Ends on 0..12 → shipyard. */
  fail: number;
}

const ARRIVED: Readonly<PuntOutlook> = Object.freeze({ arrive: 1, on13: 0, fail: 0 });
const cache = new Map<string, Readonly<PuntOutlook>>();

/**
 * Exact distribution by dynamic programming over positions 0..13 with an absorbing
 * "arrived" state (surplus movement is lost, R5.8). `rolls` = movement rounds still to come.
 */
export function outlook(position: number, rolls: number): Readonly<PuntOutlook> {
  if (position > LAST_SPACE) return ARRIVED;
  const key = `${position}:${rolls}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let dist = new Array<number>(LAST_SPACE + 1).fill(0);
  dist[Math.max(0, position)] = 1;
  let arrived = 0;
  for (let r = 0; r < rolls; r++) {
    const next = new Array<number>(LAST_SPACE + 1).fill(0);
    for (let p = 0; p <= LAST_SPACE; p++) {
      const prob = dist[p]!;
      if (!prob) continue;
      for (let d = 1; d <= 6; d++) {
        const q = p + d;
        if (q > LAST_SPACE) arrived += prob / 6;
        else next[q]! += prob / 6;
      }
    }
    dist = next;
  }
  const on13 = dist[LAST_SPACE]!;
  // Frozen: results are cached and shared, so callers must not be able to mutate them.
  const result = Object.freeze({ arrive: arrived, on13, fail: Math.max(0, 1 - arrived - on13) });
  cache.set(key, result);
  return result;
}

/** P(at least k successes) for independent events with the given probabilities (Poisson binomial). */
export function atLeast(probabilities: number[], k: number): number {
  let dist = [1];
  for (const p of probabilities) {
    const next = new Array<number>(dist.length + 1).fill(0);
    dist.forEach((q, n) => {
      next[n]! += q * (1 - p);
      next[n + 1]! += q * p;
    });
    dist = next;
  }
  return dist.slice(k).reduce((a, b) => a + b, 0);
}
