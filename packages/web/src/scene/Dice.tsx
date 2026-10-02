import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { WARES, type Ware } from '@manila/engine';
import { useGame } from '../game/store';
import { LANE_Z, spaceX } from './layout';
import { DIE_TOP_ROTATION, dieModel } from './models';
import { WARE_COLORS } from './palette';
import { VoxelMesh } from './VoxelMesh';

const TUMBLE_S = 0.9;

/** One die per rolled ware, tumbling above its punt and landing on the result. */
export function Dice() {
  const dice = useGame((s) => s.dice);
  const display = useGame((s) => s.display);
  if (!dice) return null;
  return (
    <group>
      {WARES.filter((w) => dice.values[w]).map((w, i) => {
        const punt = display.punts.find((p) => p.ware === w);
        const route = punt?.route ?? 1;
        // Dice hover over the start of their lane so they never hide the punt they move.
        return (
          <Die
            key={`${dice.id}-${w}`}
            ware={w}
            value={dice.values[w]!}
            seed={dice.id * 7 + i}
            position={[spaceX(-0.2), 0, LANE_Z[route]]}
          />
        );
      })}
    </group>
  );
}

function Die({
  ware,
  value,
  seed,
  position,
}: {
  ware: Ware;
  value: number;
  seed: number;
  position: [number, number, number];
}) {
  const ref = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);
  const spin = useRef<[number, number, number]>([
    3 + (seed % 3),
    2 + ((seed * 5) % 4),
    4 + ((seed * 3) % 3),
  ]);
  const rest = DIE_TOP_ROTATION[value] ?? [0, 0, 0];
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    start.current ??= clock.elapsedTime;
    const speed = useGame.getState().settings.speed;
    const t = (clock.elapsedTime - start.current) * speed;
    if (t < TUMBLE_S) {
      const k = t / TUMBLE_S;
      g.position.y = 2.6 - 1.6 * k * k + Math.abs(Math.sin(k * Math.PI * 2)) * 0.3 * (1 - k);
      const [a, b, c] = spin.current;
      g.rotation.set(
        rest[0] + a * (1 - k) * 4,
        rest[1] + b * (1 - k) * 4,
        rest[2] + c * (1 - k) * 4,
      );
    } else {
      const k = Math.min(1, (t - TUMBLE_S) / 0.2);
      g.position.y = 1.0 + Math.sin(k * Math.PI) * 0.12;
      g.rotation.set(rest[0], rest[1], rest[2]);
    }
  });
  const c = WARE_COLORS[ware];
  return (
    <group position={position}>
      <group ref={ref}>
        <VoxelMesh
          model={`die-${ware}`}
          build={() => dieModel(c.main, ware === 'nutmeg' ? 0xf6ead2 : 0x1d1d22)}
          position-y={-0.35}
        />
      </group>
    </group>
  );
}
