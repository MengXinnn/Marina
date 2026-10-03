import { getAudioSettings, subscribeAudioSettings } from './settings';
import { reverbImpulse, type Out } from './synth';

/**
 * The live audio graph. Created lazily on the first user gesture, as browsers require.
 *
 *   music voices ─ musicBus ─ duck ─┐
 *   ambience ───── ambienceBus ─────┼─ master ─ compressor ─ speakers
 *   sfx voices ─── sfxBus ──────────┘     ▲
 *        (musicBus, sfxBus) ─ sends ─ reverb
 */

interface Graph {
  ctx: AudioContext;
  music: GainNode;
  duck: GainNode;
  ambience: GainNode;
  sfx: GainNode;
}

let graph: Graph | null = null;
const unlockListeners = new Set<() => void>();

const MUSIC_LEVEL = 0.8;
const AMBIENCE_LEVEL = 0.5;
const SFX_LEVEL = 0.9;

function build(): Graph | null {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;
  comp.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(comp);

  const reverb = ctx.createConvolver();
  reverb.buffer = reverbImpulse(ctx);
  const reverbOut = ctx.createGain();
  reverbOut.gain.value = 0.5;
  reverb.connect(reverbOut).connect(master);

  const duck = ctx.createGain();
  duck.connect(master);
  const music = ctx.createGain();
  music.connect(duck);
  const musicSend = ctx.createGain();
  musicSend.gain.value = 0.35;
  music.connect(musicSend).connect(reverb);

  const ambience = ctx.createGain();
  ambience.connect(master);

  const sfx = ctx.createGain();
  sfx.connect(master);
  const sfxSend = ctx.createGain();
  sfxSend.gain.value = 0.22;
  sfx.connect(sfxSend).connect(reverb);

  const g = { ctx, music, duck, ambience, sfx };
  applyLevels(g, true);
  return g;
}

function applyLevels(g: Graph, immediate = false): void {
  const s = getAudioSettings();
  const t = g.ctx.currentTime;
  const set = (node: GainNode, v: number) => {
    node.gain.cancelScheduledValues(t);
    if (immediate) node.gain.setValueAtTime(v, t);
    else node.gain.setTargetAtTime(v, t, 0.08);
  };
  // Perceived loudness is roughly quadratic in slider position.
  set(g.music, s.music ? MUSIC_LEVEL * s.musicVolume ** 2 : 0);
  set(g.ambience, s.music ? AMBIENCE_LEVEL * s.musicVolume ** 2 : 0);
  set(g.sfx, s.sfx ? SFX_LEVEL * s.sfxVolume ** 2 : 0);
}

subscribeAudioSettings(() => {
  if (graph) applyLevels(graph);
});

/** Call from a user gesture so later sounds are allowed to play. */
export function unlockAudio(): void {
  if (!graph) {
    graph = build();
    if (!graph) return;
    // Don't play to a hidden tab (also saves battery on phones).
    document.addEventListener('visibilitychange', () => {
      if (!graph) return;
      if (document.hidden) void graph.ctx.suspend();
      else void graph.ctx.resume().then(notifyUnlocked);
    });
  }
  if (graph.ctx.state === 'suspended' && !document.hidden) {
    void graph.ctx.resume().then(notifyUnlocked);
  } else {
    notifyUnlocked();
  }
}

function notifyUnlocked(): void {
  unlockListeners.forEach((l) => l());
}

/** Runs every time audio becomes playable (first gesture, or a later gesture after a block). */
export function onAudioUnlocked(listener: () => void): () => void {
  unlockListeners.add(listener);
  return () => unlockListeners.delete(listener);
}

export function audioRunning(): boolean {
  return graph?.ctx.state === 'running';
}

export function audioContext(): AudioContext | null {
  return graph?.ctx ?? null;
}

export type Bus = 'music' | 'ambience' | 'sfx';

/** Output for voices on one bus, or null when that bus is silent or audio isn't unlocked. */
export function bus(name: Bus): Out | null {
  if (!graph || graph.ctx.state !== 'running') return null;
  const s = getAudioSettings();
  if (name === 'sfx' ? !s.sfx : !s.music) return null;
  return { ctx: graph.ctx, dest: graph[name] };
}

/** A bus's node regardless of settings (for always-on sources whose level the bus controls). */
export function rawBus(name: Bus): GainNode | null {
  return graph?.[name] ?? null;
}

/** Briefly lower the music under a big sound effect. */
export function duckMusic(depth = 0.35, holdSec = 0.8): void {
  if (!graph) return;
  const p = graph.duck.gain;
  const t = graph.ctx.currentTime;
  p.cancelScheduledValues(t);
  p.setValueAtTime(p.value, t);
  p.linearRampToValueAtTime(depth, t + 0.08);
  p.setValueAtTime(depth, t + 0.08 + holdSec);
  p.linearRampToValueAtTime(1, t + 0.08 + holdSec + 1.2);
}
