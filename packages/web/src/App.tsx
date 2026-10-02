import { useGame } from './game/store';
import { GameCanvas } from './scene/GameCanvas';
import { Hud } from './ui/Hud';
import { SetupScreen } from './ui/SetupScreen';

export function App() {
  const screen = useGame((s) => s.screen);
  return (
    <>
      <GameCanvas />
      {screen === 'setup' ? <SetupScreen /> : <Hud />}
    </>
  );
}
