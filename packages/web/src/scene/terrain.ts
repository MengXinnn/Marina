import * as THREE from 'three';
import { ENV } from './palette';
import { VoxelGrid, buildVoxelGeometry } from './voxel';
import {
  PILOT_ISLAND,
  QUAY_X,
  SOUTH_SHORE_Z,
  TERRAIN_BASE_Y,
  TERRAIN_VOXEL,
  WEST_SHORE_X,
} from './layout';

/** World rectangle covered by the terrain grid. */
export const TERRAIN_BOUNDS = { minX: -14, maxX: 34, minZ: -13, maxZ: 16 };

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

/** Stable 0..1 hash of a terrain cell, for paving / cobble variation. */
function cellHash(i: number, k: number): number {
  let h = (i * 73856093) ^ (k * 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const noise = (x: number, z: number) =>
  valueNoise(x * 0.45, z * 0.45) * 0.65 + valueNoise(x * 1.3 + 9, z * 1.3 - 4) * 0.35 - 0.5;

// 0 water, 1 natural land, 2 quay (man-made), 3 shipyard apron (low, flat), 4 Manila town streets
type Kind = 0 | 1 | 2 | 3 | 4;

/** Manila's quay strip and the paved town behind it. */
export const QUAY_WIDTH = 2.3;
export const TOWN_BOUNDS = { minX: QUAY_X + QUAY_WIDTH, maxX: 31.6, minZ: -8.6, maxZ: 8.2 };

function landKind(x: number, z: number): Kind {
  const n = noise(x, z);
  if (x > QUAY_X - 0.05 && x < QUAY_X + QUAY_WIDTH && z > -4.6 && z < 5.2) return 2; // Manila quay
  const t = TOWN_BOUNDS;
  if (x >= t.minX && x < t.maxX + n * 1.2 && z > t.minZ - n && z < t.maxZ + n) return 4; // town
  if (x > QUAY_X + 0.3 + n * 0.8 || (x > QUAY_X && z > -4.6 && z < 5.2)) return 1; // Manila
  if (x < WEST_SHORE_X + n * 0.9) return 1; // west harbour
  if (x > 6.6 && x < 17.6 && z > 5.7 && z < 8.6) return 3; // shipyard apron
  if (z > SOUTH_SHORE_Z + n * 0.9) return 1; // south beach
  const [ix, iz] = PILOT_ISLAND;
  if (Math.hypot(x - ix, (z - iz) * 1.25) < 1.9 + n * 0.8) return 1; // pilot island
  return 0;
}

export interface Terrain {
  geometry: THREE.BufferGeometry;
  /** Surface height per terrain cell (0 for water). */
  heights: Float32Array;
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
  const heights = new Float32Array(W * D);
  for (let k = 0; k < D; k++)
    for (let i = 0; i < W; i++) {
      const c = i + k * W;
      const kd = kind[c]!;
      if (kd === 0) continue;
      const x = minX + (i + 0.5) * S;
      const z = minZ + (k + 0.5) * S;
      const d = fromWater[c]!;
      const n = noise(x * 2, z * 2);
      const r = cellHash(i, k);
      if (kd === 3) {
        // Shipyard apron: packed sand strewn with sawdust and wood chips, plank walk at the back.
        if (z > 8.05) grid.set(i, 0, k, i % 2 ? ENV.plank : ENV.woodLight);
        else grid.set(i, 0, k, r < 0.12 ? ENV.woodLight : r < 0.3 ? ENV.plank : ENV.sandDark);
        continue;
      }
      if (kd === 2) {
        // Cut-granite quay laid in running bond, with coping stones and timber fenders
        // on the water face.
        if (d <= 1) {
          const fender = k % 5 === 0;
          grid.box(i, 0, k, i, 1, k, fender ? ENV.woodDark : ENV.pavingDark);
          grid.set(i, 2, k, fender ? ENV.woodDark : ENV.pavingLight);
        } else {
          const block = Math.floor((k + (i % 2)) / 2);
          const b = cellHash(i, block * 31);
          grid.box(i, 0, k, i, 1, k, ENV.mortar);
          grid.set(i, 2, k, b < 0.33 ? ENV.paving : b < 0.66 ? ENV.pavingDark : ENV.pavingLight);
        }
        continue;
      }
      if (kd === 4 && d > 4) {
        // Town: cobbled streets with the odd worn patch.
        grid.box(i, 0, k, i, 1, k, ENV.dirt);
        grid.set(i, 2, k, r < 0.6 ? ENV.cobble : r < 0.92 ? ENV.cobbleDark : ENV.sandDark);
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
  for (let c = 0; c < W * D; c++) {
    const i = c % W;
    const k = (c - i) / W;
    let top = -1;
    for (let y = grid.h - 1; y >= 0; y--)
      if (grid.filled(i, y, k)) {
        top = y;
        break;
      }
    heights[c] = top < 0 ? 0 : TERRAIN_BASE_Y + (top + 1) * S;
  }
  return { geometry, heights, shoreTexture };
}

let cached: Terrain | null = null;
/** Terrain is static, so build it once per session. */
export function getTerrain(): Terrain {
  cached ??= buildTerrain();
  return cached;
}

/** Height of the surface (land top or water level 0) at a world position. */
export function surfaceY(x: number, z: number): number {
  const { minX, minZ } = TERRAIN_BOUNDS;
  const S = TERRAIN_VOXEL;
  const W = Math.round((TERRAIN_BOUNDS.maxX - minX) / S);
  const D = Math.round((TERRAIN_BOUNDS.maxZ - minZ) / S);
  const i = Math.floor((x - minX) / S);
  const k = Math.floor((z - minZ) / S);
  if (i < 0 || k < 0 || i >= W || k >= D) return 0;
  return getTerrain().heights[i + k * W]!;
}
