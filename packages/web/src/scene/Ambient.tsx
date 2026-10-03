import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { PILOT_ISLAND } from './layout';
import { ENV, FX } from './palette';
import { splash, type ParticlePool } from './particles';
import { surfaceY } from './terrain';
import { VoxelGrid } from './voxel';
import { VoxelMesh } from './VoxelMesh';

/**
 * Background life that never touches the game: gulls circling the bay, fish jumping in open
 * water and the lighthouse lamp sweeping. Runs on wall-clock time, not the animation speed.
 */
export function Ambient({ pool }: { pool: ParticlePool }) {
  return (
    <group>
      {GULLS.map((g, i) => (
        <Gull key={i} {...g} phase={i * 2.1} />
      ))}
      <FishJumps pool={pool} />
      <LighthouseLamp />
    </group>
  );
}

// ───────────── gulls ─────────────

interface GullPath {
  cx: number;
  cz: number;
  r: number;
  h: number;
  /** Radians per second; negative circles clockwise. */
  w: number;
}

// Height reads as "further north" from the camera, so gulls circle north of the routes and over
// the town where they never cover a game piece.
const GULLS: GullPath[] = [
  { cx: 2.5, cz: -6.2, r: 2.2, h: 3.2, w: 0.42 },
  { cx: 13.5, cz: -9.5, r: 3.0, h: 3.8, w: -0.33 },
  { cx: 25.5, cz: -5.5, r: 2.2, h: 3.6, w: 0.5 },
  { cx: 27.5, cz: 4.5, r: 1.8, h: 3.0, w: -0.45 },
];

function gullBody(): VoxelGrid {
  const g = new VoxelGrid(7, 3, 3);
  g.box(0, 0, 0, 5, 1, 2, (x, y) => (x === 0 ? FX.gullWing : y === 0 ? FX.gull : FX.gull));
  g.box(4, 2, 1, 5, 2, 1, FX.gull);
  g.set(6, 1, 1, FX.beak);
  g.set(5, 2, 0, FX.gullTip).set(5, 2, 2, FX.gullTip);
  return g;
}

function gullWing(): VoxelGrid {
  const g = new VoxelGrid(3, 1, 5);
  g.box(0, 0, 0, 2, 0, 4, (x, _y, z) => (z >= 4 ? FX.gullTip : x === 0 ? FX.gullWing : FX.gull));
  return g;
}

function Gull({ cx, cz, r, h, w, phase }: GullPath & { phase: number }) {
  const ref = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime + phase;
    const a = t * w;
    g.position.set(cx + Math.cos(a) * r, h + Math.sin(t * 0.8) * 0.25, cz + Math.sin(a) * r);
    // Face along the circle (models face +x).
    const dx = -Math.sin(a) * Math.sign(w);
    const dz = Math.cos(a) * Math.sign(w);
    g.rotation.set(0, Math.atan2(-dz, dx), 0);
    g.rotateX(0.35 * Math.sign(w)); // bank into the turn
    // Flap in bursts, then glide.
    const flapping = Math.sin(t * 0.9) > -0.2;
    const flap = flapping ? Math.sin(t * 11) * 0.55 : 0.12;
    if (left.current) left.current.rotation.x = -flap;
    if (right.current) right.current.rotation.x = flap;
  });
  return (
    <group ref={ref}>
      <group scale={0.9}>
        <VoxelMesh model="gull-body" build={gullBody} position={[0, -0.1, 0]} />
        <group ref={left} position={[0.25, 0.05, -0.1]}>
          <VoxelMesh model="gull-wing" build={gullWing} position={[0, 0, -0.25]} />
        </group>
        <group ref={right} position={[0.25, 0.05, 0.1]}>
          <VoxelMesh model="gull-wing" build={gullWing} position={[0, 0, 0.25]} />
        </group>
      </group>
    </group>
  );
}

// ───────────── fish ─────────────

function fishModel(): VoxelGrid {
  const g = new VoxelGrid(5, 2, 1);
  g.box(1, 0, 0, 3, 0, 0, FX.fish);
  g.box(1, 1, 0, 3, 1, 0, FX.fishDark);
  g.set(0, 0, 0, FX.fishDark).set(0, 1, 0, FX.fishDark);
  g.set(4, 0, 0, FX.fish);
  return g;
}

/** Open water away from the routes, docks and boats. */
const FISH_WATER: Array<[x0: number, x1: number, z: number]> = [
  [1.0, 4.6, -4.2],
  [10.2, 14.5, -4.0],
  [1.5, 6.0, 4.2],
  [15.5, 17.8, 4.0],
];

const JUMP_S = 0.75;

function FishJumps({ pool }: { pool: ParticlePool }) {
  const ref = useRef<THREE.Group>(null);
  const jump = useRef({ t: JUMP_S, next: 3, x: 0, z: 0, dir: 1 });
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const j = jump.current;
    if (j.t >= JUMP_S) {
      g.visible = false;
      j.next -= dt;
      if (j.next > 0) return;
      const [x0, x1, z] = FISH_WATER[Math.floor(Math.random() * FISH_WATER.length)]!;
      Object.assign(j, {
        t: 0,
        next: 4 + Math.random() * 5,
        x: x0 + Math.random() * (x1 - x0),
        z: z + (Math.random() - 0.5) * 0.6,
        dir: Math.random() < 0.5 ? -1 : 1,
      });
      splash(pool, j.x, j.z, [FX.spray, FX.sprayBlue], 0.45);
    }
    j.t = Math.min(JUMP_S, j.t + dt);
    const k = j.t / JUMP_S;
    g.visible = true;
    g.position.set(j.x + (k - 0.5) * 0.9 * j.dir, Math.sin(Math.PI * k) * 0.55 - 0.05, j.z);
    g.rotation.set(0, j.dir > 0 ? 0 : Math.PI, Math.cos(Math.PI * k) * 1.1);
    if (j.t >= JUMP_S) splash(pool, g.position.x, j.z, [FX.spray, FX.sprayBlue], 0.4);
  });
  return (
    <group ref={ref} visible={false}>
      <VoxelMesh model="fish" build={fishModel} position-y={-0.1} />
    </group>
  );
}

// ───────────── lighthouse ─────────────

/** Lamp room of lighthouseModel: voxel rows 17–19 of a 0.1-voxel model on the island. */
const LAMP: [number, number, number] = [
  PILOT_ISLAND[0] + 0.3,
  surfaceY(PILOT_ISLAND[0] + 0.3, PILOT_ISLAND[1] - 0.2) + 1.85,
  PILOT_ISLAND[1] - 0.2,
];

const glowMaterial = new THREE.MeshBasicMaterial({
  color: ENV.lamp,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});

/** The lamp flashes every few seconds, like a real light signal. */
function LighthouseLamp() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime % 3.2;
    const on = t < 0.25 || (t > 0.5 && t < 0.75);
    glowMaterial.opacity = on ? 0.55 : 0;
    if (ref.current) ref.current.scale.setScalar(on ? 1 : 0.6);
  });
  return (
    <mesh ref={ref} position={LAMP} material={glowMaterial}>
      <boxGeometry args={[0.55, 0.45, 0.55]} />
    </mesh>
  );
}
