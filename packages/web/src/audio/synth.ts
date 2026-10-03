/**
 * Instrument voices synthesized with WebAudio — no sample files, so nothing to license.
 * Every voice takes an absolute start time and a destination node, and works on any
 * BaseAudioContext (the live AudioContext or an OfflineAudioContext for previews).
 */

export interface Out {
  ctx: BaseAudioContext;
  dest: AudioNode;
}

export const midiHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ───────────── shared buffers ─────────────

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Two seconds of white noise per context; voices play random slices of it. */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

const pluckCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/**
 * Karplus–Strong plucked string: a noise burst circulating through a damped delay line.
 * Sounds like a nylon guitar / bandurria — the rondalla of a colonial-era harbour town.
 */
function pluckBuffer(ctx: BaseAudioContext, midi: number, bright: number): AudioBuffer {
  let byNote = pluckCache.get(ctx);
  if (!byNote) pluckCache.set(ctx, (byNote = new Map()));
  const key = `${midi}:${bright}`;
  const cached = byNote.get(key);
  if (cached) return cached;

  const sr = ctx.sampleRate;
  const dur = midi < 50 ? 2.2 : 1.6;
  const out = ctx.createBuffer(1, Math.ceil(sr * dur), sr);
  const data = out.getChannelData(0);
  // The two-point average adds half a sample of delay.
  const period = Math.max(2, Math.round(sr / midiHz(midi) - 0.5));
  const line = new Float32Array(period);
  let lp = 0;
  for (let i = 0; i < period; i++) {
    // Low-passed excitation = softer pick.
    lp += bright * (Math.random() * 2 - 1 - lp);
    line[i] = lp;
  }
  // No DC offset: it would circulate as a thump under every note.
  let mean = 0;
  for (let i = 0; i < period; i++) mean += line[i]! / period;
  let peak = 1e-6;
  for (let i = 0; i < period; i++) peak = Math.max(peak, Math.abs((line[i]! -= mean)));
  for (let i = 0; i < period; i++) line[i]! /= peak;
  // Lower strings ring longer.
  const damping = midi < 50 ? 0.9985 : 0.9965;
  let idx = 0;
  for (let i = 0; i < data.length; i++) {
    const a = line[idx]!;
    const next = (idx + 1) % period;
    data[i] = a;
    line[idx] = damping * 0.5 * (a + line[next]!);
    idx = next;
  }
  byNote.set(key, out);
  return out;
}

const irCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Synthetic stereo impulse response: a warm wooden-room / open-harbour tail. */
export function reverbImpulse(ctx: BaseAudioContext, seconds = 2.2): AudioBuffer {
  let ir = irCache.get(ctx);
  if (ir) return ir;
  const sr = ctx.sampleRate;
  ir = ctx.createBuffer(2, Math.ceil(sr * seconds), sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / d.length;
      // Darker as it decays, like air absorbing the highs.
      const k = 0.9 - 0.75 * t;
      lp += k * (Math.random() * 2 - 1 - lp);
      d[i] = lp * (1 - t) ** 3.2;
    }
  }
  irCache.set(ctx, ir);
  return ir;
}

// ───────────── helpers ─────────────

function envGain(out: Out, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = out.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function panned(out: Out, pan: number): AudioNode {
  if (!pan) return out.dest;
  const p = out.ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(out.dest);
  return p;
}

function osc(out: Out, type: OscillatorType, freq: number, t: number, stop: number) {
  const o = out.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.start(t);
  o.stop(stop);
  return o;
}

// ───────────── voices ─────────────

/** Plucked string. `dur` is how long the note is held before it is damped. */
export function pluck(
  out: Out,
  t: number,
  midi: number,
  { vol = 0.5, dur = 1, bright = 0.6, pan = 0, tone = 4200 } = {},
): void {
  const buffer = pluckBuffer(out.ctx, midi, bright);
  const src = out.ctx.createBufferSource();
  src.buffer = buffer;
  const lp = out.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = tone;
  const g = out.ctx.createGain();
  const end = t + Math.min(dur, buffer.duration);
  g.gain.setValueAtTime(vol, t);
  g.gain.setValueAtTime(vol, Math.max(t, end - 0.06));
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.08);
  src.connect(lp).connect(g).connect(panned(out, pan));
  src.start(t);
  src.stop(end + 0.1);
}

/** Soft wooden flute with breath noise and delayed vibrato. */
export function flute(
  out: Out,
  t: number,
  midi: number,
  { vol = 0.25, dur = 0.5, pan = 0 } = {},
): void {
  const f = midiHz(midi);
  const end = t + dur;
  const g = out.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.05);
  g.gain.setValueAtTime(vol * 0.85, Math.max(t + 0.05, end - 0.08));
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.12);
  const dest = panned(out, pan);
  g.connect(dest);

  const vib = osc(out, 'sine', 5.2, t, end + 0.15);
  const vibDepth = out.ctx.createGain();
  vibDepth.gain.setValueAtTime(0, t);
  vibDepth.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.35, dur));
  vib.connect(vibDepth);

  const body = osc(out, 'triangle', f, t, end + 0.15);
  const air = osc(out, 'sine', f * 2, t, end + 0.15);
  const airGain = out.ctx.createGain();
  airGain.gain.value = 0.18;
  vibDepth.connect(body.frequency);
  vibDepth.connect(air.frequency);
  body.connect(g);
  air.connect(airGain).connect(g);

  const breath = noiseSrc(out, t, dur + 0.15);
  const bp = out.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f * 2;
  bp.Q.value = 3;
  const bg = out.ctx.createGain();
  bg.gain.value = 0.12;
  breath.connect(bp).connect(bg).connect(g);
}

function noiseSrc(out: Out, t: number, dur: number): AudioBufferSourceNode {
  const src = out.ctx.createBufferSource();
  src.buffer = noiseBuffer(out.ctx);
  src.loop = true;
  src.start(t, rand(0, 1.5));
  src.stop(t + dur + 0.05);
  return src;
}

/** Filtered noise burst. */
export function noise(
  out: Out,
  t: number,
  {
    vol = 0.3,
    dur = 0.08,
    attack = 0.002,
    type = 'bandpass' as BiquadFilterType,
    freq = 2000,
    freqTo = 0,
    q = 1,
    pan = 0,
  } = {},
): void {
  const src = noiseSrc(out, t, attack + dur);
  const f = out.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + attack + dur);
  f.Q.value = q;
  src
    .connect(f)
    .connect(envGain(out, t, vol, attack, dur))
    .connect(panned(out, pan));
}

/** Pitched body with a falling pitch: drums, crates, cannon, wooden knocks. */
export function thump(
  out: Out,
  t: number,
  { freq = 120, freqTo = 50, vol = 0.6, dur = 0.2, type = 'sine' as OscillatorType, pan = 0 } = {},
): void {
  const o = osc(out, type, freq, t, t + dur + 0.05);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t + dur);
  o.connect(envGain(out, t, vol, 0.003, dur)).connect(panned(out, pan));
}

/** Short tuned wooden knock (marimba-like: fundamental + ~4th partial). */
export function wood(out: Out, t: number, midi: number, { vol = 0.4, dur = 0.12, pan = 0 } = {}) {
  const f = midiHz(midi);
  const dest = panned(out, pan);
  osc(out, 'sine', f, t, t + dur + 0.05)
    .connect(envGain(out, t, vol, 0.002, dur))
    .connect(dest);
  osc(out, 'sine', f * 3.93, t, t + dur * 0.4 + 0.05)
    .connect(envGain(out, t, vol * 0.35, 0.001, dur * 0.35))
    .connect(dest);
  noise(out, t, { vol: vol * 0.3, dur: 0.012, freq: f * 6, q: 2, pan });
}

/** Metallic strike from inharmonic partials: coins, bells, blades. */
export function metal(
  out: Out,
  t: number,
  {
    freq = 2600,
    partials = [1, 1.43, 2.07, 2.76],
    vol = 0.2,
    dur = 0.25,
    pan = 0,
  }: { freq?: number; partials?: number[]; vol?: number; dur?: number; pan?: number } = {},
): void {
  const dest = panned(out, pan);
  partials.forEach((ratio, i) => {
    // Higher partials die away first.
    const d = dur / (1 + i * 0.5);
    osc(out, 'sine', freq * ratio, t, t + d + 0.05)
      .connect(envGain(out, t, vol / (1 + i * 0.6), 0.001, d))
      .connect(dest);
  });
}

/** Ship / church bell: hum, prime, minor-third tierce, quint, nominal. */
export function bell(out: Out, t: number, midi: number, { vol = 0.3, dur = 2.4, pan = 0 } = {}) {
  metal(out, t, {
    freq: midiHz(midi),
    partials: [0.5, 1, 1.19, 1.5, 2, 2.52, 3.01],
    vol,
    dur,
    pan,
  });
  noise(out, t, { vol: vol * 0.25, dur: 0.02, freq: midiHz(midi) * 4, q: 4, pan });
}

/** Brass-ish swell (two detuned saws through an opening low-pass). */
export function horn(
  out: Out,
  t: number,
  midi: number,
  { vol = 0.12, dur = 0.4, pan = 0, cutoff = 2400 } = {},
): void {
  const f = midiHz(midi);
  const end = t + dur;
  const lp = out.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(300, t);
  lp.frequency.linearRampToValueAtTime(cutoff, t + 0.06);
  lp.frequency.linearRampToValueAtTime(cutoff * 0.6, end);
  const g = out.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.04);
  g.gain.setValueAtTime(vol * 0.8, Math.max(t + 0.04, end - 0.05));
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.15);
  lp.connect(g).connect(panned(out, pan));
  for (const detune of [-6, 6]) {
    const o = osc(out, 'sawtooth', f, t, end + 0.2);
    o.detune.value = detune;
    o.connect(lp);
  }
}

/** Boatswain's pipe: a rising sine with fast vibrato. */
export function whistle(out: Out, t: number, { vol = 0.12, dur = 0.55, pan = 0 } = {}) {
  const o = osc(out, 'sine', 1700, t, t + dur + 0.05);
  o.frequency.linearRampToValueAtTime(2350, t + dur * 0.35);
  o.frequency.setValueAtTime(2350, t + dur * 0.8);
  o.frequency.linearRampToValueAtTime(2100, t + dur);
  const lfo = osc(out, 'sine', 14, t, t + dur + 0.05);
  const depth = out.ctx.createGain();
  depth.gain.value = 40;
  lfo.connect(depth).connect(o.frequency);
  const g = out.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.04);
  g.gain.setValueAtTime(vol, t + dur - 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(panned(out, pan));
}

/** Seagull cry: a few falling chirps. */
export function gull(out: Out, t: number, { vol = 0.05, pan = 0 } = {}) {
  const n = 2 + Math.floor(Math.random() * 3);
  const base = rand(1300, 1700);
  for (let i = 0; i < n; i++) {
    const at = t + i * rand(0.16, 0.24);
    const d = rand(0.12, 0.2);
    const o = osc(out, 'sawtooth', base * 1.5, at, at + d + 0.05);
    o.frequency.linearRampToValueAtTime(base * 1.7, at + d * 0.2);
    o.frequency.exponentialRampToValueAtTime(base * 0.9, at + d);
    const bp = out.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = base * 1.6;
    bp.Q.value = 6;
    o.connect(bp)
      .connect(envGain(out, at, vol, 0.02, d))
      .connect(panned(out, pan));
  }
}

/** An endless looping white-noise source, already started (for ambience beds). */
export function noiseLoop(ctx: BaseAudioContext): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  src.start(ctx.currentTime, rand(0, 1.5));
  return src;
}
