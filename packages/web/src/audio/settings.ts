/**
 * Player-facing sound settings (music and sound effects), persisted in localStorage.
 * Pure state + subscribe, so React can read it with useSyncExternalStore.
 */

export interface AudioSettings {
  /** Background music and harbour ambience. */
  music: boolean;
  /** Sound effects for game events and buttons. */
  sfx: boolean;
  /** 0..1 */
  musicVolume: number;
  /** 0..1 */
  sfxVolume: number;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  music: true,
  sfx: true,
  musicVolume: 0.6,
  sfxVolume: 0.8,
};

const KEY = 'manila.audio.v1';
/** Pre-music builds stored a single mute flag. */
const LEGACY_MUTE_KEY = 'manila.muted';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const clamp01 = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

/** Parse stored settings, falling back to defaults field by field. */
export function parseAudioSettings(raw: string | null, legacyMuted: string | null): AudioSettings {
  const d = DEFAULT_AUDIO_SETTINGS;
  if (raw) {
    try {
      const v = JSON.parse(raw) as Partial<AudioSettings>;
      return {
        music: typeof v.music === 'boolean' ? v.music : d.music,
        sfx: typeof v.sfx === 'boolean' ? v.sfx : d.sfx,
        musicVolume: clamp01(v.musicVolume, d.musicVolume),
        sfxVolume: clamp01(v.sfxVolume, d.sfxVolume),
      };
    } catch {
      // fall through to defaults
    }
  }
  return legacyMuted === '1' ? { ...d, music: false, sfx: false } : { ...d };
}

function load(): AudioSettings {
  const s = storage();
  try {
    return parseAudioSettings(s?.getItem(KEY) ?? null, s?.getItem(LEGACY_MUTE_KEY) ?? null);
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

let current = load();
const listeners = new Set<() => void>();

export function getAudioSettings(): AudioSettings {
  return current;
}

export function setAudioSettings(patch: Partial<AudioSettings>): void {
  current = { ...current, ...patch };
  try {
    storage()?.setItem(KEY, JSON.stringify(current));
  } catch {
    // best-effort
  }
  for (const l of listeners) l();
}

export function subscribeAudioSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
