import { useFrame, type ThreeElements } from '@react-three/fiber';
import { useRef, useState, type ReactNode } from 'react';
import type * as THREE from 'three';
import type { PlayerColor, PuntState } from '@manila/engine';
import { WARE_INFO } from '@manila/engine';
import { PLAYER_COLORS } from './palette';
import { PIECE_SCALE, PROP_VOXEL, PUNT_FLOAT_Y } from './layout';
import {
  PUNT_DECK_VOXELS,
  PUNT_LENGTH,
  meepleModel,
  puntModel,
  puntSeatVoxelX,
  standModel,
  type StandKind,
} from './models';
import { VoxelGrid } from './voxel';
import { VoxelMesh } from './VoxelMesh';

export function Meeple({
  color,
  pirate = false,
  ...group
}: { color: PlayerColor; pirate?: boolean } & ThreeElements['group']) {
  const c = PLAYER_COLORS[color];
  return (
    <group {...group}>
      <VoxelMesh
        model={`meeple-${color}-${pirate ? 'p' : 'n'}`}
        build={() => meepleModel(c.main, c.dark, pirate)}
      />
    </group>
  );
}

/** Bobbing arrow shown above a spot the acting player can choose. */
export function Marker({ color, hot }: { color: PlayerColor; hot: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = 1.0 + Math.sin(clock.elapsedTime * 4) * 0.08 + (hot ? 0.1 : 0);
    ref.current.rotation.y = clock.elapsedTime * 1.5;
  });
  const c = PLAYER_COLORS[color];
  return (
    <group ref={ref} scale={hot ? 1.35 : 1}>
      <VoxelMesh model={`marker-${color}`} build={() => arrowModel(c.main, c.dark)} />
    </group>
  );
}

function arrowModel(main: number, dark: number): VoxelGrid {
  const g = new VoxelGrid(5, 5, 5);
  g.box(0, 2, 0, 4, 2, 4, (x, _y, z) => (x === 0 || x === 4 || z === 0 || z === 4 ? dark : main));
  g.box(1, 1, 1, 3, 1, 3, main);
  g.set(2, 0, 2, dark);
  g.box(1, 3, 1, 3, 4, 3, main);
  return g;
}

interface Pickable {
  /** Spot can be chosen by the acting player right now. */
  selectable?: boolean;
  actorColor?: PlayerColor;
  onPick?: () => void;
}

function usePick({ selectable, onPick }: Pickable) {
  const [hot, setHot] = useState(false);
  const handlers = selectable
    ? {
        onPointerOver: (e: { stopPropagation(): void }) => {
          e.stopPropagation();
          setHot(true);
          document.body.style.cursor = 'pointer';
        },
        onPointerOut: () => {
          setHot(false);
          document.body.style.cursor = '';
        },
        onClick: (e: { stopPropagation(): void }) => {
          e.stopPropagation();
          onPick?.();
        },
      }
    : {};
  return { hot: hot && !!selectable, handlers };
}

/** Accomplice stand with its printed cost; shows the occupant on top. */
export function Stand({
  kind,
  cost,
  occupant,
  pirateHat = false,
  children,
  ...pick
}: {
  kind: StandKind;
  cost: number;
  occupant: PlayerColor | null;
  pirateHat?: boolean;
  children?: ReactNode;
} & Pickable &
  ThreeElements['group']) {
  const { selectable, actorColor, onPick, ...group } = pick;
  const { hot, handlers } = usePick({ selectable, onPick });
  return (
    <group scale={PIECE_SCALE.stand} {...group}>
      <group {...handlers}>
        <VoxelMesh model={`stand-${kind}-${cost}`} build={() => standModel(kind, cost)} />
        {/* generous invisible hit area */}
        <mesh position-y={0.4} visible={false}>
          <boxGeometry args={[0.8, 0.8, 0.8]} />
        </mesh>
      </group>
      {occupant && <Meeple color={occupant} pirate={pirateHat} position-y={0.2} />}
      {selectable && actorColor && !occupant && <Marker color={actorColor} hot={hot} />}
      {children}
    </group>
  );
}

/** A loaded punt with its cargo and the accomplices aboard. */
export function Punt({
  punt,
  colorOf,
  bobPhase = 0,
  ...pick
}: {
  punt: PuntState;
  colorOf: (id: string) => PlayerColor;
  bobPhase?: number;
} & Pickable &
  ThreeElements['group']) {
  const { selectable, actorColor, onPick, ...group } = pick;
  const ref = useRef<THREE.Group>(null);
  const { hot, handlers } = usePick({ selectable, onPick });
  const docked = punt.status !== 'sailing';
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime + bobPhase;
    ref.current.position.y = docked ? 0 : Math.sin(t * 1.6) * 0.035;
    ref.current.rotation.z = docked ? 0 : Math.sin(t * 1.1) * 0.025;
    ref.current.rotation.x = docked ? 0 : Math.sin(t * 1.3 + 1) * 0.02;
  });
  const seatX = puntSeatVoxelX(WARE_INFO[punt.ware].seatCosts.length);
  const deckY = PUNT_FLOAT_Y + PUNT_DECK_VOXELS * PROP_VOXEL;
  const nextFree = punt.seats.findIndex((s) => !s.occupant);
  return (
    <group {...group}>
      <group ref={ref} {...handlers}>
        <VoxelMesh
          model={`punt-${punt.ware}`}
          build={() => puntModel(punt.ware)}
          position-y={PUNT_FLOAT_Y}
        />
        {punt.seats.map((seat, i) =>
          seat.occupant ? (
            <Meeple
              key={i}
              color={colorOf(seat.occupant)}
              pirate={seat.pirate}
              position={[(Math.floor(seatX[i]!) + 0.5 - PUNT_LENGTH / 2) * PROP_VOXEL, deckY, 0]}
            />
          ) : null,
        )}
        {selectable && actorColor && nextFree >= 0 && (
          <group
            position={[
              (Math.floor(seatX[nextFree]!) + 0.5 - PUNT_LENGTH / 2) * PROP_VOXEL,
              deckY - 0.3,
              0,
            ]}
          >
            <Marker color={actorColor} hot={hot} />
          </group>
        )}
      </group>
    </group>
  );
}
