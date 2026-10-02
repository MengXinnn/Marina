import { useEffect } from 'react';
import { unlockAudio } from './audio/sfx';
import { useGame } from './game/store';
import { GameCanvas } from './scene/GameCanvas';
import { Hud } from './ui/Hud';
import { SetupScreen } from './ui/SetupScreen';

export function App() {
  const screen = useGame((s) => s.screen);
  // Browsers only allow audio after a user gesture.
  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio);
    return () => window.removeEventListener('pointerdown', unlockAudio);
  }, []);
  return (
    <>
      <GameCanvas />
      {screen === 'setup' ? <SetupScreen /> : <Hud />}
    </>
  );
}
