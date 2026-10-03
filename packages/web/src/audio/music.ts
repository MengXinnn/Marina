import { audioContext, bus, onAudioUnlocked, rawBus } from './core';
import { BAR_SEC, CHORDS, STEP_SEC, buildPlan, type PlannedBar } from './score';
import { flute, gull, noise, noiseLoop, pluck, thump, type Out } from './synth';
import { subscribeAudioSettings } from './settings';

/**
 * Background music: a look-ahead scheduler that renders the habanera in score.ts bar by bar,
 * plus a sea-and-gulls ambience bed. Starts after the first user gesture.
 */

/** 0 = menu (strings only), 1 = in game (+ shaker), 2 = tense (+ full cajón). */
export type Intensity = 0 | 1 | 2;

const jitter = (sec: number) => (Math.random() * 2 - 1) * sec;

/** Schedule one bar of music starting at time `t`. Works on any context (offline previews too). */
export function scheduleBar(out: Out, bar: PlannedBar, t: number, intensity: Intensity): void {
  if (bar.rest) return;
  const chord = CHORDS[bar.chord];
  const at = (step: number) => t + step * STEP_SEC;
  const [root, fifth, third] = chord.bass;

  // Bass: the habanera "dum — da-dum dum".
  const bassOpts = { bright: 0.35, tone: 900, pan: -0.05 };
  if (bar.final) {
    pluck(out, at(0), root, { ...bassOpts, vol: 0.6, dur: BAR_SEC * 1.5 });
    pluck(out, at(0), root - 12, { ...bassOpts, vol: 0.35, dur: BAR_SEC * 1.5 });
  } else {
    pluck(out, at(0) + jitter(0.004), root, { ...bassOpts, vol: 0.55, dur: STEP_SEC * 3 });
    pluck(out, at(3) + jitter(0.004), fifth, { ...bassOpts, vol: 0.35, dur: STEP_SEC });
    pluck(out, at(4) + jitter(0.004), third, { ...bassOpts, vol: 0.45, dur: STEP_SEC * 2 });
    pluck(out, at(6) + jitter(0.004), fifth, { ...bassOpts, vol: 0.4, dur: STEP_SEC * 2 });
  }

  // Guitar: light strums off the beat, a full one on beat 2.
  const strum = (step: number, vol: number, dur: number, spread = 0.012) =>
    chord.voicing.forEach((m, i) =>
      pluck(out, at(step) + i * spread + jitter(0.003), m, {
        vol: vol * (0.9 + Math.random() * 0.2),
        dur,
        bright: 0.5,
        tone: 2800,
        pan: -0.25,
      }),
    );
  if (bar.final) {
    strum(0, 0.17, BAR_SEC * 1.5, 0.035);
  } else {
    strum(2, 0.09, STEP_SEC * 1.6);
    strum(4, 0.15, STEP_SEC * 1.8);
    strum(6, 0.1, STEP_SEC * 1.6);
  }

  // Lead.
  if (bar.melody && bar.lead) {
    let step = 0;
    for (const [midi, len] of bar.melody) {
      if (midi !== null) {
        const start = at(step) + jitter(0.006);
        const dur = len * STEP_SEC;
        if (bar.lead === 'flute') {
          flute(out, start, midi, { vol: 0.17, dur: dur * 0.95, pan: 0.15 });
        } else if (len >= 4) {
          // Rondalla tremolo on long notes.
          const n = len * 2;
          for (let k = 0; k < n; k++)
            pluck(out, start + (k * STEP_SEC) / 2, midi, {
              vol: (k % 2 ? 0.17 : 0.23) * (1 - (k / n) * 0.35),
              dur: STEP_SEC * 0.7,
              bright: 0.8,
              pan: 0.15,
            });
        } else {
          pluck(out, start, midi, { vol: 0.27, dur: dur + 0.12, bright: 0.8, pan: 0.15 });
        }
      }
      step += len;
    }
  }

  // Percussion.
  if (intensity >= 1) {
    for (let s = 0; s < 8; s++) {
      const accent = s === 0 || s === 4;
      noise(out, at(s) + jitter(0.003), {
        type: 'highpass',
        freq: 6500,
        dur: 0.03,
        vol: (accent ? 0.05 : 0.025) * (intensity === 2 ? 1.5 : 1),
        pan: 0.3,
      });
    }
    const drum = (step: number, vol: number) =>
      thump(out, at(step), { freq: 115, freqTo: 55, vol, dur: 0.18 });
    if (intensity === 2) {
      drum(0, 0.5);
      drum(3, 0.3);
      drum(4, 0.42);
      noise(out, at(6), { freq: 1800, q: 1.2, dur: 0.05, vol: 0.12 });
    } else {
      drum(0, 0.28);
      drum(4, 0.2);
    }
  }
}

// ───────────── live player ─────────────

const PLAN = buildPlan();
const FIRST_REST = PLAN.findIndex((b) => b.rest);
const LOOKAHEAD_SEC = 0.6;

let timer: ReturnType<typeof setInterval> | null = null;
let nextTime = 0;
let index = 0;
let intensity: Intensity = 0;

function tick(): void {
  const ctx = audioContext();
  const out = bus('music');
  if (!ctx || !out) return stopMusic();
  // A throttled background tab may have fallen behind: skip ahead instead of bunching notes.
  if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
  while (nextTime < ctx.currentTime + LOOKAHEAD_SEC) {
    scheduleBar(out, PLAN[index]!, nextTime, intensity);
    nextTime += BAR_SEC;
    index = (index + 1) % PLAN.length;
  }
}

function startMusic(): void {
  const ctx = audioContext();
  if (timer || !ctx || !bus('music')) return;
  nextTime = ctx.currentTime + 0.1;
  timer = setInterval(tick, 100);
  tick();
}

function stopMusic(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export function setMusicIntensity(level: Intensity): void {
  intensity = level;
}

/** Game over: let the fanfare speak, then a stretch of quiet sea before the tune returns. */
export function musicToRest(): void {
  if (!PLAN[index]?.rest) index = FIRST_REST;
}

// ───────────── ambience ─────────────

let ambienceStarted = false;
let gullTimer: ReturnType<typeof setTimeout> | null = null;

function lfo(ctx: BaseAudioContext, hz: number, depth: number, target: AudioParam): void {
  const o = ctx.createOscillator();
  o.frequency.value = hz;
  const g = ctx.createGain();
  g.gain.value = depth;
  o.connect(g).connect(target);
  o.start();
}

function startAmbience(): void {
  const ctx = audioContext();
  const dest = rawBus('ambience');
  if (ambienceStarted || !ctx || !dest) return;
  ambienceStarted = true;

  // Deep swell of waves on the shore.
  const deepLp = ctx.createBiquadFilter();
  deepLp.type = 'lowpass';
  deepLp.frequency.value = 360;
  const deep = ctx.createGain();
  deep.gain.value = 0.22;
  lfo(ctx, 0.11, 0.16, deep.gain);
  noiseLoop(ctx).connect(deepLp).connect(deep).connect(dest);

  // Brighter wash drifting left and right.
  const washBp = ctx.createBiquadFilter();
  washBp.type = 'bandpass';
  washBp.frequency.value = 1100;
  washBp.Q.value = 0.6;
  lfo(ctx, 0.05, 350, washBp.frequency);
  const wash = ctx.createGain();
  wash.gain.value = 0.035;
  lfo(ctx, 0.07, 0.03, wash.gain);
  const pan = ctx.createStereoPanner();
  lfo(ctx, 0.03, 0.5, pan.pan);
  noiseLoop(ctx).connect(washBp).connect(wash).connect(pan).connect(dest);

  const scheduleGull = () => {
    gullTimer = setTimeout(
      () => {
        const out = bus('ambience');
        if (out && !document.hidden)
          gull(out, out.ctx.currentTime + 0.05, { pan: Math.random() * 1.4 - 0.7 });
        scheduleGull();
      },
      9000 + Math.random() * 16000,
    );
  };
  if (!gullTimer) scheduleGull();
}

onAudioUnlocked(() => {
  startAmbience();
  startMusic();
});
subscribeAudioSettings(startMusic);
