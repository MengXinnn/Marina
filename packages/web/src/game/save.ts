import { CONTRACT_VERSION, type GameState } from '@manila/engine';
import { sanitizeSeats, type BotSeats } from './seats';

const KEY = 'manila.save.v1';

interface SaveFile {
  savedAt: string;
  state: GameState;
  /** Seats played by the computer (web-only setting, not part of the engine state). */
  bots?: BotSeats;
}

export interface Saved {
  state: GameState;
  bots: BotSeats;
}

/** Saves are only reloaded when the contract's major version still matches. */
const major = (v: string) => v.split('.')[0];

export function writeSave(state: GameState, bots: Saved['bots'] = {}): void {
  try {
    const file: SaveFile = { savedAt: new Date().toISOString(), state, bots };
    localStorage.setItem(KEY, JSON.stringify(file));
  } catch {
    // storage full / disabled: saving is best-effort
  }
}

export function loadSave(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const file = JSON.parse(raw) as SaveFile;
    if (major(file.state.contractVersion) !== major(CONTRACT_VERSION)) return null;
    if (file.state.phase === 'game-over') return null;
    return { state: file.state, bots: sanitizeSeats(file.bots) };
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  return loadSave() !== null;
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
