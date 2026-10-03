import { useFrame, type ThreeElements } from '@react-three/fiber';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type * as THREE from 'three';
import type { PlayerColor, PuntState } from '@manila/engine';
import { WARE_INFO } from '@manila/engine';
import { PLAYER_COLORS } from './palette';
import {
  LANE_Z,
  PIECE_SCALE,
  PORT_BERTH,
  PROP_VOXEL,
  PUNT_FLOAT_Y,
  SHIPYARD_CHANNEL_Z,
  SHIPYARD_SLIP,
  spaceX,
} from './layout';
import { ANIM_MS } from '../game/store';
import { useDropIn, useWaypointMotion, type Pose, type Waypoint } from './motion';
import {
  PUNT_DECK_VOXELS,
  PUNT_LENGTH,
  meepleModel,
  puntModel,
  puntSeatVoxelX,
  standModel,
  type StandKind,
} from './models';
import { SpotTip } from './SpotTip';
import { VoxelGrid } from './voxel';
import type { Spot } from '../i18n/spots';
import { VoxelMesh } from './VoxelMesh';

export function Meeple({
  color,
  pirate = false,
  ...group
}: { color: PlayerColor; pirate?: boolean } & ThreeElements['group']) {
  const c = PLAYER_COLORS[color];
  const drop = useDropIn();
  return (
    <group {...group}>
      <group ref={drop}>
        <VoxelMesh
          model={`meeple-${color}-${pirate ? 'p' : 'n'}`}
          build={() => meepleModel(c.main, c.dark, pirate)}
        />
      </group>
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

export interface Pickable {
  /** Spot can be chosen by the acting player right now. */
  selectable?: boolean;
  actorColor?: PlayerColor;
  onPick?: () => void;
  /** What the hover card describes; no card without it. */
  spot?: Spot;
  /** Extra hover-card line saying what a click does right now. */
  hint?: string;
}

/** Hover always shows the spot card; clicks only go through while the spot is selectable. */
export function usePick({ selectable, onPick }: Pick<Pickable, 'selectable' | 'onPick'>) {
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (!hover) return;
    document.body.style.cursor = selectable ? 'pointer' : 'help';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hover, selectable]);
  const handlers = {
    onPointerOver: (e: { stopPropagation(): void }) => {
      e.stopPropagation();
      setHover(true);
    },
    onPointerOut: () => setHover(false),
    onClick: (e: { stopPropagation(): void }) => {
      if (!selectable) return;
      e.stopPropagation();
      setHover(false);
      onPick?.();
    },
  };
  return { hover, hot: hover && !!selectable, handlers };
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
  const { selectable, actorColor, onPick, spot, hint, ...group } = pick;
  const { hover, hot, handlers } = usePick({ selectable, onPick });
  return (
    <group scale={PIECE_SCALE.stand} {...group}>
      <group {...handlers}>
        <VoxelMesh model={`stand-${kind}-${cost}`} build={() => standModel(kind, cost)} />
        {/* generous invisible hit area */}
        <mesh position-y={0.4} visible={false}>
          <boxGeometry args={[0.8, 0.8, 0.8]} />
        </mesh>
        {/* The occupant and the floating marker answer hover too. */}
        {occupant && <Meeple key={occupant} color={occupant} pirate={pirateHat} position-y={0.2} />}
        {selectable && actorColor && !occupant && <Marker color={actorColor} hot={hot} />}
      </group>
      {hover && spot && <SpotTip spot={spot} y={1.5} actionable={!!selectable} hint={hint} />}
      {children}
    </group>
  );
}

/** Resting pose of a punt for its current status. */
export function puntPose(p: PuntState): Pose {
  if (p.status === 'port' && p.dock)
    return { x: PORT_BERTH[p.dock][0], z: PORT_BERTH[p.dock][1], ry: 0 };
  if (p.status === 'shipyard' && p.dock)
    return { x: SHIPYARD_SLIP[p.dock][0], z: SHIPYARD_SLIP[p.dock][1] - 0.2, ry: -Math.PI / 2 };
  return { x: spaceX(Math.min(p.position, 14)), z: LANE_Z[p.route], ry: 0 };
}

/** Waypoints from one displayed punt state to the next. */
function puntPath(prev: PuntState, next: PuntState): Waypoint[] {
  const z = LANE_Z[next.route];
  const path: Waypoint[] = [];
  if (prev.status === 'sailing') {
    const target = next.status === 'sailing' ? next.position : prev.position;
    const dir = Math.sign(target - prev.position);
    for (let i = prev.position + dir; dir !== 0 && i !== target + dir; i += dir)
      path.push({ x: spaceX(Math.min(i, 14)), z, ry: 0, ms: ANIM_MS.hop, hop: true });
  } else if (next.status === 'sailing') {
    return []; // new voyage: handled by a jump
  }
  const end = puntPose(next);
  if (next.status === 'port' && prev.status !== 'port') {
    path.push({ x: spaceX(14), z, ry: 0, ms: 300 }, { ...end, ms: 520 });
  } else if (next.status === 'shipyard' && prev.status !== 'shipyard') {
    const x0 = spaceX(Math.min(prev.position, 14));
    path.push(
      { x: x0, z: SHIPYARD_CHANNEL_Z, ry: 0, ms: 380 },
      { x: end.x, z: SHIPYARD_CHANNEL_Z, ry: 0, ms: 180 + Math.abs(end.x - x0) * 50 },
      { ...end, ms: 420 },
    );
  }
  return path;
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
  const { selectable, actorColor, onPick, spot, hint, ...group } = pick;
  const bob = useRef<THREE.Group>(null);
  const { hover, hot, handlers } = usePick({ selectable, onPick });
  const docked = punt.status !== 'sailing';

  // Sail in from the west harbour on mount, then follow every displayed change.
  const motion = useWaypointMotion({ x: -2.6, z: LANE_Z[punt.route], ry: 0 });
  const last = useRef<PuntState | null>(null);
  const key = `${punt.status}:${punt.dock}:${punt.position}`;
  useEffect(() => {
    const prev = last.current;
    last.current = punt;
    if (!prev) {
      const pose = puntPose(punt);
      if (punt.status === 'sailing') motion.go([{ ...pose, ms: 500 + pose.x * 60 }]);
      else motion.jump(pose);
      return;
    }
    const path = puntPath(prev, punt);
    if (path.length) motion.go(path);
    else motion.jump(puntPose(punt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useFrame(({ clock }) => {
    if (!bob.current) return;
    const t = clock.elapsedTime + bobPhase;
    bob.current.position.y = docked ? 0 : Math.sin(t * 1.6) * 0.035;
    bob.current.rotation.z = docked ? 0 : Math.sin(t * 1.1) * 0.025;
    bob.current.rotation.x = docked ? 0 : Math.sin(t * 1.3 + 1) * 0.02;
  });
  const seatX = puntSeatVoxelX(WARE_INFO[punt.ware].seatCosts.length);
  const deckY = PUNT_FLOAT_Y + PUNT_DECK_VOXELS * PROP_VOXEL;
  const free = punt.seats.findIndex((s) => !s.occupant);
  // Boarding / plunder decisions point at the punt itself, not at a free seat.
  const markAt = free >= 0 ? free : Math.floor(punt.seats.length / 2);
  return (
    <group ref={motion.ref}>
      <group {...group}>
        <group ref={bob} {...handlers}>
          <VoxelMesh
            model={`punt-${punt.ware}`}
            build={() => puntModel(punt.ware)}
            position-y={PUNT_FLOAT_Y}
          />
          {punt.seats.map((seat, i) =>
            seat.occupant ? (
              <Meeple
                key={`${i}-${seat.occupant}`}
                color={colorOf(seat.occupant)}
                pirate={seat.pirate}
                position={[(Math.floor(seatX[i]!) + 0.5 - PUNT_LENGTH / 2) * PROP_VOXEL, deckY, 0]}
              />
            ) : null,
          )}
          {selectable && actorColor && (
            <group
              position={[
                (Math.floor(seatX[markAt]!) + 0.5 - PUNT_LENGTH / 2) * PROP_VOXEL,
                deckY - 0.3,
                0,
              ]}
            >
              <Marker color={actorColor} hot={hot} />
            </group>
          )}
          {hover && spot && <SpotTip spot={spot} y={1.3} actionable={!!selectable} hint={hint} />}
        </group>
      </group>
    </group>
  );
}
