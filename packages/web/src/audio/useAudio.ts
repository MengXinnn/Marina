import { useEffect, useSyncExternalStore } from 'react';
import { actorOf, useGame } from '../game/store';
import { unlockAudio } from './core';
import { setMusicIntensity, type Intensity } from './music';
import { getAudioSettings, subscribeAudioSettings, type AudioSettings } from './settings';
import { sfx } from './sfx';
import type { GameState } from '@manila/engine';

export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(subscribeAudioSettings, getAudioSettings);
}

/** Tense moments get the full percussion: the last roll, and pirates deciding. */
function intensityFor(screen: 'setup' | 'game', state: GameState): Intensity {
  if (screen === 'setup') return 0;
  const p = state.pending;
  if (p.type === 'pirate-board' || p.type === 'plunder-destination') return 2;
  if (p.type === 'roll-dice' && p.round === 3) return 2;
  return 1;
}

/** Wires audio to the app: unlock on first gesture, button clicks, music mood, turn chime. */
export function useGameAudio(): void {
  useEffect(() => {
    // Browsers only allow audio after a user gesture.
    const unlock = () => unlockAudio();
    const click = (e: PointerEvent) => {
      const b = (e.target as Element | null)?.closest?.('button');
      if (b && !(b as HTMLButtonElement).disabled) sfx.click();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', click);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('pointerdown', click);
    };
  }, []);

  useEffect(() => {
    let lastActor: string | null = null;
    const sync = () => {
      const { screen, state, playing, bots } = useGame.getState();
      setMusicIntensity(intensityFor(screen, state));
      if (screen !== 'game' || playing) return;
      const actor = actorOf(state);
      // Chime when the decision passes to a different human (hotseat hand-off).
      if (actor && actor !== lastActor && !bots[actor]) sfx.turn();
      lastActor = actor;
    };
    sync();
    return useGame.subscribe(sync);
  }, []);
}
