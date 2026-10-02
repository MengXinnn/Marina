import type { GameEvent } from '@manila/engine';

/**
 * Tiny procedural chiptune sound effects (WebAudio, no asset files).
 * The AudioContext is created lazily on the first user gesture, as browsers require.
 */

const MUTE_KEY = 'manila.muted';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // best-effort
  }
  if (master) master.gain.value = value ? 0 : 0.18;
}

/** Call from a user gesture (pointerdown) so later sounds are allowed to play. */
export function unlockAudio(): void {
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.18;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function ready(): AudioContext | null {
  return ctx && master && !muted && ctx.state === 'running' ? ctx : null;
}

function tone(
  freq: number,
  {
    at = 0,
    dur = 0.12,
    type = 'square' as OscillatorType,
    vol = 0.5,
    slideTo,
  }: { at?: number; dur?: number; type?: OscillatorType; vol?: number; slideTo?: number } = {},
): void {
  const c = ready();
  if (!c || !master) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise({ at = 0, dur = 0.05, vol = 0.4, freq = 2400 } = {}): void {
  const c = ready();
  if (!c || !master) return;
  const t = c.currentTime + at;
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
}

const NOTE = (semitones: number) => 440 * 2 ** (semitones / 12);

export const sfx = {
  click: () => tone(NOTE(7), { dur: 0.04, vol: 0.25 }),
  dice: () => {
    for (let i = 0; i < 7; i++)
      noise({ at: i * 0.09 + Math.random() * 0.03, dur: 0.04, freq: 1800 + Math.random() * 1600 });
  },
  hop: (at = 0) => tone(NOTE(-5), { at, dur: 0.1, type: 'sine', vol: 0.35, slideTo: NOTE(-14) }),
  dock: () => {
    tone(NOTE(-21), { dur: 0.18, type: 'triangle', vol: 0.6 });
    noise({ dur: 0.08, vol: 0.25, freq: 500 });
  },
  place: () => tone(NOTE(3), { dur: 0.08, type: 'triangle', vol: 0.45, slideTo: NOTE(-2) }),
  gain: () => {
    tone(NOTE(12), { dur: 0.07, vol: 0.3 });
    tone(NOTE(19), { at: 0.07, dur: 0.12, vol: 0.3 });
  },
  loss: () => {
    tone(NOTE(7), { dur: 0.07, vol: 0.25 });
    tone(NOTE(2), { at: 0.07, dur: 0.1, vol: 0.25 });
  },
  plunder: () => {
    [0, -3, -7, -12].forEach((n, i) =>
      tone(NOTE(n), { at: i * 0.09, dur: 0.12, type: 'sawtooth', vol: 0.3 }),
    );
    noise({ at: 0.36, dur: 0.25, vol: 0.3, freq: 800 });
  },
  rise: () => [0, 4, 7, 12].forEach((n, i) => tone(NOTE(n), { at: i * 0.06, dur: 0.1, vol: 0.25 })),
  fanfare: () =>
    [0, 4, 7, 12, 7, 12].forEach((n, i) => tone(NOTE(n), { at: i * 0.1, dur: 0.14, vol: 0.28 })),
};

/** Sound for one animation step (first event decides; punt moves hop once per space). */
export function playStep(step: GameEvent[], hopMs: number): void {
  const e = step[0];
  if (!e) return;
  switch (e.type) {
    case 'dice-rolled':
      return sfx.dice();
    case 'punt-moved': {
      const spaces = Math.max(
        ...step.map((m) => (m.type === 'punt-moved' ? Math.abs(m.to - m.from) : 0)),
      );
      for (let i = 0; i < spaces; i++) sfx.hop((i * hopMs) / 1000);
      return;
    }
    case 'punt-docked':
      return sfx.dock();
    case 'accomplice-placed':
    case 'pirate-boarded':
      return sfx.place();
    case 'payout':
    case 'loan-taken':
      return sfx.gain();
    case 'repair-paid':
    case 'loan-repaid':
    case 'share-bought':
    case 'harbor-master-elected':
      return sfx.loss();
    case 'punt-plundered':
      return sfx.plunder();
    case 'market-rose':
      return sfx.rise();
    case 'voyage-ended':
    case 'game-ended':
      return sfx.fanfare();
    default:
      return;
  }
}
