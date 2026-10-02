import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { useGame } from '../game/store';

export interface Pose {
  x: number;
  z: number;
  ry: number;
}
export interface Waypoint extends Pose {
  /** Duration at speed 1, in ms. */
  ms: number;
  /** Little hop (one route space). */
  hop?: boolean;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Moves a group through queued waypoints, frame by frame. Durations follow the global
 * animation speed so the scene stays in sync with the event director.
 */
export function useWaypointMotion(initial: Pose) {
  const ref = useRef<THREE.Group>(null);
  const from = useRef<Pose>(initial);
  const queue = useRef<Waypoint[]>([]);
  const t = useRef(0);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const seg = queue.current[0];
    if (!seg) {
      g.position.set(from.current.x, 0, from.current.z);
      g.rotation.y = from.current.ry;
      return;
    }
    const speed = useGame.getState().settings.speed;
    t.current = Math.min(1, t.current + (dt * 1000 * speed) / seg.ms);
    const k = seg.hop ? t.current : ease(t.current);
    const f = from.current;
    g.position.set(
      f.x + (seg.x - f.x) * k,
      seg.hop ? Math.sin(Math.PI * t.current) * 0.22 : 0,
      f.z + (seg.z - f.z) * k,
    );
    g.rotation.y = f.ry + (seg.ry - f.ry) * k;
    if (t.current >= 1) {
      from.current = { x: seg.x, z: seg.z, ry: seg.ry };
      queue.current.shift();
      t.current = 0;
    }
  });

  return {
    ref,
    /** Append waypoints to the path. */
    go(points: Waypoint[]) {
      queue.current.push(...points);
    },
    /** Teleport, dropping any queued motion. */
    jump(pose: Pose) {
      queue.current = [];
      t.current = 0;
      from.current = pose;
    },
    /** Where the group will be once the queue drains. */
    end(): Pose {
      return queue.current[queue.current.length - 1] ?? from.current;
    },
  };
}

/** Drop-in animation for freshly placed pieces. */
export function useDropIn(height = 1.4, ms = 380) {
  const ref = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    start.current ??= clock.elapsedTime;
    const t = Math.min(1, ((clock.elapsedTime - start.current) * 1000) / ms);
    // fall, then a small bounce
    const y =
      t < 0.75 ? height * (1 - (t / 0.75) ** 2) : Math.sin(((t - 0.75) / 0.25) * Math.PI) * 0.08;
    g.position.y = y;
  });
  return ref;
}
