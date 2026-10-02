import * as THREE from 'three';
import { ENV } from './palette';
import { VoxelGrid, buildVoxelGeometry } from './voxel';
import {
  GROUND_Y,
  PILOT_ISLAND,
  QUAY_X,
  SOUTH_SHORE_Z,
  TERRAIN_BASE_Y,
  TERRAIN_VOXEL,
  WEST_SHORE_X,
} from './layout';

/** World rectangle covered by the terrain grid. */
export const TERRAIN_BOUNDS = { minX: -12, maxX: 30, minZ: -11, maxZ: 12 };

function valueNoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const h = (a: number, b: number) => {
    let n = (a * 374761393 + b * 668265263) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = h(xi, zi) + (h(xi + 1, zi) - h(xi, zi)) * s(xf);
  const b = h(xi, zi + 1) + (h(xi + 1, zi + 1) - h(xi, zi + 1)) * s(xf);
  return a + (b - a) * s(zf);
}

const noise = (x: number, z: number) =>
  valueNoise(x * 0.45, z * 0.45) * 0.65 + valueNoise(x * 1.3 + 9, z * 1.3 - 4) * 0.35 - 0.5;

type Kind = 0 | 1 | 2; // 0 water, 1 natural land, 2 quay (man-made, straight edge)

function landKind(x: number, z: number): Kind {
  const n = noise(x, z);
  if (x > QUAY_X - 0.05 && z > -4.6 && z < 5.2) return 2; // Manila quay
  if (x > QUAY_X + 0.3 + n * 0.8) return 1; // Manila
  if (x < WEST_SHORE_X + n * 0.9) return 1; // west harbour
  if (z > SOUTH_SHORE_Z + n * 0.9 && x > -6 && x < 24) return 1; // south beach (shipyard)
  const [ix, iz] = PILOT_ISLAND;
  if (Math.hypot(x - ix, (z - iz) * 1.25) < 1.9 + n * 0.8) return 1; // pilot island
  return 0;
}

export interface Terrain {
  geometry: THREE.BufferGeometry;
  /** R channel: distance to the nearest land (0 = coast, 255 = open sea). Used by the water shader. */
  shoreTexture: THREE.DataTexture;
}

/** Builds the land voxels and a shore-distance texture in one pass. */
export function buildTerrain(): Terrain {
  const { minX, maxX, minZ, maxZ } = TERRAIN_BOUNDS;
  const S = TERRAIN_VOXEL;
  const W = Math.round((maxX - minX) / S);
  const D = Math.round((maxZ - minZ) / S);
  const kind = new Uint8Array(W * D);
  for (let k = 0; k < D; k++)
    for (let i = 0; i < W; i++)
      kind[i + k * W] = landKind(minX + (i + 0.5) * S, minZ + (k + 0.5) * S);

  // Two BFS passes: distance from water (for land) and distance from land (for water).
  const bfs = (isSource: (v: number) => boolean) => {
    const dist = new Int16Array(W * D).fill(-1);
    const queue: number[] = [];
    for (let c = 0; c < W * D; c++)
      if (isSource(kind[c]!)) {
        dist[c] = 0;
        queue.push(c);
      }
    for (let h = 0; h < queue.length; h++) {
      const c = queue[h]!;
      const i = c % W;
      const k = (c - i) / W;
      for (const [di, dk] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const ni = i + di;
        const nk = k + dk;
        if (ni < 0 || nk < 0 || ni >= W || nk >= D) continue;
        const n = ni + nk * W;
        if (dist[n] !== -1) continue;
        dist[n] = dist[c]! + 1;
        queue.push(n);
      }
    }
    return dist;
  };
  const fromWater = bfs((v) => v === 0);
  const fromLand = bfs((v) => v !== 0);

  const grid = new VoxelGrid(W, 4, D);
  for (let k = 0; k < D; k++)
    for (let i = 0; i < W; i++) {
      const c = i + k * W;
      const kd = kind[c]!;
      if (kd === 0) continue;
      const x = minX + (i + 0.5) * S;
      const z = minZ + (k + 0.5) * S;
      const d = fromWater[c]!;
      const n = noise(x * 2, z * 2);
      if (kd === 2) {
        // stone quay with a timber edge
        grid.box(i, 0, k, i, 2, k, d <= 1 ? ENV.woodDark : (i + k) % 2 ? ENV.rock : 0x9c9892);
        continue;
      }
      if (d <= 1) {
        grid.set(i, 0, k, ENV.wetSand);
      } else if (d <= 4) {
        grid.box(i, 0, k, i, 1, k, d <= 2 ? ENV.sandDark : ENV.sand);
      } else {
        grid.box(i, 0, k, i, 1, k, ENV.dirt);
        const top = n > 0.22 ? ENV.dirt : n > -0.05 ? ENV.grass : ENV.grassDark;
        grid.set(i, 2, k, d <= 5 ? ENV.sand : top);
      }
    }

  const geometry = buildVoxelGeometry(grid, { scale: S, origin: 'corner', jitter: 0.05, ao: 0.8 });
  geometry.translate(minX, TERRAIN_BASE_Y, minZ);

  const tex = new Uint8Array(W * D * 4);
  for (let c = 0; c < W * D; c++) {
    const v = kind[c]! !== 0 ? 0 : Math.min(255, fromLand[c]! * 24);
    tex[c * 4] = v;
    tex[c * 4 + 1] = v;
    tex[c * 4 + 2] = v;
    tex[c * 4 + 3] = 255;
  }
  const shoreTexture = new THREE.DataTexture(tex, W, D, THREE.RGBAFormat);
  shoreTexture.magFilter = THREE.LinearFilter;
  shoreTexture.minFilter = THREE.LinearFilter;
  shoreTexture.needsUpdate = true;
  return { geometry, shoreTexture };
}

/** Height of the land surface at a world position (for placing props). */
export function groundHeight(x: number, z: number): number {
  return landKind(x, z) === 0 ? 0 : GROUND_Y;
}
