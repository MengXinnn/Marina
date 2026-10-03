import type { GameEvent } from '@manila/engine';
import { bus, duckMusic } from './core';
import { cuesForStep, type CueName } from './cues';
import { musicToRest } from './music';
import { bell, horn, metal, noise, pluck, thump, whistle, wood, type Out } from './synth';

/**
 * Sound effects, synthesized live: wooden pieces, coins, harbour bells, oars and cannon.
 * Each cue takes the sfx bus output and an absolute start time.
 */

const r = (a: number, b: number) => a + Math.random() * (b - a);

function coins(o: Out, t: number, n: number, pitch = 1) {
  for (let i = 0; i < n; i++) {
    const at = t + i * r(0.045, 0.075);
    metal(o, at, { freq: r(2900, 3500) * pitch, vol: 0.09, dur: r(0.18, 0.3), pan: r(-0.3, 0.3) });
    noise(o, at, { freq: 6000, q: 1.5, dur: 0.01, vol: 0.08 });
  }
}

const CUES: Record<CueName, (o: Out, t: number, arg: number) => void> = {
  dice(o, t) {
    // Two wooden dice tumbling in a cup, then settling on the board.
    let at = t;
    for (let i = 0; i < 10; i++) {
      wood(o, at, r(84, 92), { vol: 0.16, dur: 0.04, pan: r(-0.4, 0.4) });
      at += r(0.05, 0.09);
    }
    at += 0.15;
    for (const gap of [0.16, 0.11, 0.08, 0.06]) {
      wood(o, at, r(80, 86), { vol: 0.24, dur: 0.06, pan: r(-0.2, 0.2) });
      at += gap;
    }
  },
  oar(o, t) {
    // Paddle stroke and water slosh.
    noise(o, t, { type: 'lowpass', freq: 500, freqTo: 1400, attack: 0.05, dur: 0.22, vol: 0.18 });
    noise(o, t + 0.06, { freq: 900, q: 0.8, dur: 0.12, vol: 0.06, pan: r(-0.3, 0.3) });
  },
  arrive(o, t) {
    // Hull meets the jetty, then the harbour bell rings twice.
    thump(o, t, { freq: 90, freqTo: 45, vol: 0.5, dur: 0.25 });
    noise(o, t, { type: 'lowpass', freq: 600, dur: 0.15, vol: 0.15 });
    bell(o, t + 0.18, 84, { vol: 0.12, dur: 1.6, pan: 0.2 });
    bell(o, t + 0.5, 84, { vol: 0.09, dur: 1.6, pan: 0.2 });
  },
  shipyard(o, t) {
    // Dragged up the slipway, then the carpenters' hammers.
    noise(o, t, { type: 'lowpass', freq: 300, freqTo: 900, attack: 0.08, dur: 0.3, vol: 0.18 });
    for (const d of [0.32, 0.5]) {
      wood(o, t + d, 64, { vol: 0.3, dur: 0.08 });
      metal(o, t + d, { freq: 1900, vol: 0.05, dur: 0.12 });
    }
  },
  load(o, t) {
    // Three crates swung aboard.
    [0, 0.22, 0.44].forEach((d, i) => {
      thump(o, t + d, { freq: 140 - i * 10, freqTo: 70, vol: 0.4, dur: 0.12, pan: (i - 1) * 0.35 });
      noise(o, t + d, { type: 'lowpass', freq: 1200, dur: 0.05, vol: 0.12 });
    });
  },
  place(o, t) {
    wood(o, t, r(74, 78), { vol: 0.32, dur: 0.09 });
  },
  pass(o, t) {
    wood(o, t, 62, { vol: 0.14, dur: 0.07 });
  },
  bid(o, t) {
    wood(o, t, 79, { vol: 0.22, dur: 0.06 });
    coins(o, t + 0.04, 1);
  },
  gavel(o, t) {
    // Sold! Two gavel knocks and a short flourish.
    wood(o, t, 67, { vol: 0.42, dur: 0.1 });
    wood(o, t + 0.18, 67, { vol: 0.5, dur: 0.12 });
    [74, 78, 81].forEach((m, i) => pluck(o, t + 0.36 + i * 0.07, m, { vol: 0.22, dur: 0.5 }));
  },
  share(o, t) {
    // Paper certificate rustle and a rubber stamp.
    for (let i = 0; i < 5; i++)
      noise(o, t + i * r(0.025, 0.045), { freq: r(2500, 4500), q: 1.2, dur: 0.035, vol: 0.06 });
    thump(o, t + 0.22, { freq: 180, freqTo: 90, vol: 0.32, dur: 0.07 });
    coins(o, t + 0.3, 1, 0.85);
  },
  coins(o, t, n) {
    coins(o, t, n);
  },
  coinsOut(o, t, n) {
    coins(o, t, n, 0.72);
  },
  cutlass(o, t) {
    // Blade drawn, boots on deck.
    noise(o, t, { type: 'highpass', freq: 3000, freqTo: 9000, attack: 0.02, dur: 0.3, vol: 0.1 });
    metal(o, t + 0.05, { freq: 3100, partials: [1, 1.52, 2.3, 3.1], vol: 0.06, dur: 0.5 });
    thump(o, t + 0.32, { freq: 110, freqTo: 60, vol: 0.4, dur: 0.12 });
  },
  cannon(o, t) {
    duckMusic(0.3, 1);
    thump(o, t, { freq: 70, freqTo: 28, vol: 0.9, dur: 0.9 });
    noise(o, t, { type: 'lowpass', freq: 1800, freqTo: 120, dur: 1.1, vol: 0.5 });
    // Pirates' laugh-like descending minor figure.
    [69, 66, 62, 57].forEach((m, i) =>
      horn(o, t + 0.45 + i * 0.13, m - 12, { vol: 0.07, dur: 0.16, cutoff: 1400 }),
    );
  },
  whistle(o, t) {
    whistle(o, t);
  },
  rise(o, t, price) {
    // Rising marimba run; higher for higher market prices.
    const top = 72 + Math.min(12, Math.max(0, price) * 2);
    [top - 7, top - 3, top].forEach((m, i) => wood(o, t + i * 0.07, m, { vol: 0.25, dur: 0.18 }));
  },
  bell(o, t) {
    // "Two bells": a new voyage is called.
    duckMusic(0.5, 0.8);
    bell(o, t, 76, { vol: 0.2, dur: 2.6 });
    bell(o, t + 0.42, 76, { vol: 0.17, dur: 2.6 });
  },
  cadence(o, t) {
    // Voyage settled: a plucked D-minor cadence.
    [57, 61, 64, 67].forEach((m, i) => pluck(o, t + i * 0.06, m, { vol: 0.18, dur: 0.5 }));
    [50, 57, 62, 65, 69].forEach((m, i) =>
      pluck(o, t + 0.45 + i * 0.03, m, { vol: 0.2, dur: 1.2 }),
    );
  },
  fanfare(o, t) {
    musicToRest();
    duckMusic(0.15, 3.5);
    const notes: Array<[number, number, number]> = [
      // [midi, start beat, length beats] — D major brass call.
      [62, 0, 0.5],
      [66, 0.5, 0.5],
      [69, 1, 0.5],
      [74, 1.5, 1.5],
      [69, 3, 0.5],
      [74, 3.5, 2.5],
    ];
    const beat = 0.22;
    for (const [m, s, l] of notes) {
      horn(o, t + s * beat, m, { vol: 0.1, dur: l * beat });
      horn(o, t + s * beat, m - 12, { vol: 0.06, dur: l * beat, cutoff: 1200 });
    }
    thump(o, t + 3.5 * beat, { freq: 90, freqTo: 40, vol: 0.5, dur: 0.6 });
    [50, 57, 62, 66, 69, 74].forEach((m, i) =>
      pluck(o, t + 3.5 * beat + i * 0.025, m, { vol: 0.16, dur: 1.6 }),
    );
  },
};

/** Render a cue onto any output (the live sfx bus, or an offline context for previews). */
export function renderCue(o: Out, name: CueName, t: number, arg = 0): void {
  CUES[name](o, t, arg);
}

function play(name: CueName, at = 0, arg = 0): void {
  const o = bus('sfx');
  if (o) CUES[name](o, o.ctx.currentTime + 0.01 + at, arg);
}

/** Sound for one animation step. */
export function playStep(step: GameEvent[], hopMs: number): void {
  for (const c of cuesForStep(step, hopMs / 1000)) play(c.name, c.at, c.arg);
}

export const sfx = {
  /** UI button press. */
  click: () => {
    const o = bus('sfx');
    if (o) wood(o, o.ctx.currentTime + 0.005, 81, { vol: 0.12, dur: 0.04 });
  },
  /** A human player's turn begins (hotseat hand-off). */
  turn: () => {
    const o = bus('sfx');
    if (!o) return;
    const t = o.ctx.currentTime + 0.01;
    bell(o, t, 88, { vol: 0.06, dur: 1 });
    bell(o, t + 0.14, 93, { vol: 0.05, dur: 1.2 });
  },
};
