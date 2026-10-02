import { CONTRACT_VERSION, type GameState } from '@manila/engine';

const KEY = 'manila.save.v1';

interface SaveFile {
  savedAt: string;
  state: GameState;
}

/** Saves are only reloaded when the contract's major version still matches. */
const major = (v: string) => v.split('.')[0];

export function writeSave(state: GameState): void {
  try {
    const file: SaveFile = { savedAt: new Date().toISOString(), state };
    localStorage.setItem(KEY, JSON.stringify(file));
  } catch {
    // storage full / disabled: saving is best-effort
  }
}

export function loadSave(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const file = JSON.parse(raw) as SaveFile;
    if (major(file.state.contractVersion) !== major(CONTRACT_VERSION)) return null;
    if (file.state.phase === 'game-over') return null;
    return file.state;
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
