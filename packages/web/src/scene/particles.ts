import * as THREE from 'three';
import { FX } from './palette';

/**
 * A small CPU particle pool drawn as one instanced mesh of voxel cubes, so every effect keeps
 * the blocky pixel-art look. Time is in seconds of *animation* time (already scaled by speed).
 */

export interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** Vertical acceleration (negative = falls). */
  g?: number;
  /** Velocity damping per second. */
  drag?: number;
  life: number;
  /** Size at birth and at death (world units). */
  s0: number;
  s1?: number;
  color: number;
  /** Squash for flat pieces such as coins. */
  flat?: boolean;
  spin?: number;
  twinkle?: boolean;
  /** Stop on the water surface instead of sinking through it. */
  float?: boolean;
}

interface Particle extends Required<Omit<ParticleSpec, 'color'>> {
  alive: boolean;
  age: number;
  color: THREE.Color;
  seed: number;
}

export const MAX_PARTICLES = 1200;

export class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private readonly items: Particle[] = [];
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor() {
    const material = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, MAX_PARTICLES);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.mesh.setMatrixAt(i, hidden);
      this.mesh.setColorAt(i, new THREE.Color(0xffffff));
      this.items.push({
        alive: false,
        age: 0,
        seed: Math.random() * 100,
        color: new THREE.Color(),
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        g: 0,
        drag: 0,
        life: 1,
        s0: 0,
        s1: 0,
        flat: false,
        spin: 0,
        twinkle: false,
        float: false,
      });
    }
  }

  spawn(spec: ParticleSpec): void {
    const index = this.next;
    const p = this.items[index]!;
    this.next = (index + 1) % MAX_PARTICLES;
    Object.assign(p, {
      vx: 0,
      vy: 0,
      vz: 0,
      g: 0,
      drag: 0,
      s1: spec.s0,
      flat: false,
      spin: 0,
      twinkle: false,
      float: false,
      ...spec,
      color: p.color.setHex(spec.color),
      alive: true,
      age: 0,
    });
    this.mesh.setColorAt(index, p.color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Kill everything (used when animations are skipped). */
  clear(): void {
    const hidden = this.m.makeScale(0, 0, 0);
    this.items.forEach((p, i) => {
      if (p.alive) this.mesh.setMatrixAt(i, hidden);
      p.alive = false;
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number): void {
    const { m, q, e, p: pos, s } = this;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.items[i]!;
      if (!p.alive) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.alive = false;
        this.mesh.setMatrixAt(i, m.makeScale(0, 0, 0));
        continue;
      }
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k;
      p.vz *= k;
      p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.float && p.y < 0.02) {
        p.y = 0.02;
        p.vy = 0;
      }
      let size = p.s0 + (p.s1 - p.s0) * t;
      if (t > 0.75) size *= (1 - t) / 0.25;
      if (p.twinkle && Math.sin(p.age * 38 + p.seed) < -0.2) size *= 0.35;
      const r = p.spin * p.age;
      q.setFromEuler(e.set(r * 0.7 + p.seed, r, r * 0.4));
      pos.set(p.x, p.y, p.z);
      s.set(size, p.flat ? size * 0.3 : size, size);
      this.mesh.setMatrixAt(i, m.compose(pos, q, s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ───────────── emitters ─────────────

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

/** Water droplets and a foam ring where a boat lands after a hop. */
export function splash(
  pool: ParticlePool,
  x: number,
  z: number,
  colors: readonly number[],
  scale = 1,
): void {
  for (let i = 0; i < Math.round(9 * scale); i++) {
    const a = rand(0, Math.PI * 2);
    const v = rand(0.5, 1.3) * scale;
    pool.spawn({
      x: x + Math.cos(a) * 0.25,
      y: 0.05,
      z: z + Math.sin(a) * 0.25,
      vx: Math.cos(a) * v,
      vz: Math.sin(a) * v,
      vy: rand(1.6, 2.8) * Math.sqrt(scale),
      g: -9,
      life: rand(0.45, 0.7),
      s0: 0.12 * Math.sqrt(scale),
      s1: 0.06,
      color: pick(colors),
    });
  }
  ring(pool, x, 0.03, z, colors[0]!, 0.55 * scale, 12);
}

/** Flat ring of cubes expanding along the ground or water. */
export function ring(
  pool: ParticlePool,
  x: number,
  y: number,
  z: number,
  color: number,
  radius: number,
  n = 12,
): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pool.spawn({
      x: x + Math.cos(a) * radius * 0.3,
      y,
      z: z + Math.sin(a) * radius * 0.3,
      vx: Math.cos(a) * radius * 2.4,
      vz: Math.sin(a) * radius * 2.4,
      drag: 3.2,
      life: 0.5,
      s0: 0.09,
      s1: 0.05,
      color,
    });
  }
}

/** Billowing cubes that rise and grow (smoke, dust). */
export function puff(
  pool: ParticlePool,
  x: number,
  y: number,
  z: number,
  colors: readonly number[],
  n = 10,
  size = 0.18,
  rise = 0.7,
): void {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    const v = rand(0.3, 0.9);
    pool.spawn({
      x: x + rand(-0.15, 0.15),
      y: y + rand(0, 0.2),
      z: z + rand(-0.15, 0.15),
      vx: Math.cos(a) * v,
      vz: Math.sin(a) * v,
      vy: rand(0.5, 1) * rise,
      drag: 1.8,
      life: rand(0.8, 1.4),
      s0: size * 0.6,
      s1: size * 1.8,
      spin: rand(-2, 2),
      color: pick(colors),
    });
  }
}

/** Small bright pixels drifting upwards. */
export function sparkle(
  pool: ParticlePool,
  x: number,
  y: number,
  z: number,
  colors: readonly number[],
  n = 10,
  radius = 0.5,
): void {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(0.1, radius);
    pool.spawn({
      x: x + Math.cos(a) * r,
      y: y + rand(0, 0.4),
      z: z + Math.sin(a) * r,
      vx: Math.cos(a) * 0.3,
      vz: Math.sin(a) * 0.3,
      vy: rand(0.6, 1.4),
      drag: 1.5,
      life: rand(0.6, 1.1),
      s0: rand(0.06, 0.1),
      twinkle: true,
      color: pick(colors),
    });
  }
}

/** Pesos popping out of a spot and tumbling down. */
export function coins(
  pool: ParticlePool,
  x: number,
  y: number,
  z: number,
  colors: readonly number[],
  n: number,
): void {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    const v = rand(0.3, 0.9);
    pool.spawn({
      x,
      y,
      z,
      vx: Math.cos(a) * v,
      vz: Math.sin(a) * v,
      vy: rand(3.0, 4.2),
      g: -7.5,
      life: rand(0.9, 1.2),
      s0: 0.22,
      s1: 0.18,
      flat: true,
      spin: rand(6, 12),
      color: pick(colors),
    });
  }
}

/** A rocket rises from (x, y, z) and bursts into a sphere of sparks. */
export function firework(
  pool: ParticlePool,
  schedule: (ms: number, fn: () => void) => void,
  x: number,
  y: number,
  z: number,
  colors: readonly number[],
  height = 4,
): void {
  const T = 0.7;
  const g = -5;
  const vy = (height - 0.5 * g * T * T) / T;
  pool.spawn({ x, y, z, vy, g, life: T, s0: 0.14, color: colors[0]!, twinkle: true });
  for (let i = 1; i <= 8; i++) {
    const t = (i / 9) * T;
    schedule(t * 1000, () =>
      pool.spawn({
        x: x + rand(-0.04, 0.04),
        y: y + vy * t + 0.5 * g * t * t,
        z: z + rand(-0.04, 0.04),
        vy: -0.3,
        life: 0.35,
        s0: 0.08,
        s1: 0.03,
        color: FX.flash,
      }),
    );
  }
  schedule(T * 1000, () => {
    const by = y + height;
    pool.spawn({ x, y: by, z, life: 0.16, s0: 0.9, s1: 0.2, color: FX.flash });
    const n = 56;
    for (let i = 0; i < n; i++) {
      // Fibonacci sphere so the burst reads as a round shell.
      const k = (i + 0.5) / n;
      const phi = Math.acos(1 - 2 * k);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const v = rand(2.6, 3.2);
      pool.spawn({
        x,
        y: by,
        z,
        vx: Math.sin(phi) * Math.cos(theta) * v,
        vy: Math.cos(phi) * v,
        vz: Math.sin(phi) * Math.sin(theta) * v,
        g: -1.6,
        drag: 1.7,
        life: rand(1.0, 1.4),
        s0: 0.17,
        s1: 0.08,
        twinkle: true,
        color: pick(colors),
      });
    }
  });
}
