import * as THREE from 'three';

/**
 * A dense voxel grid (x = length, y = up, z = depth). Colours are sRGB hex (0xRRGGBB).
 * Models are authored procedurally with `set` / `box` and meshed once with `buildVoxelGeometry`.
 */
export class VoxelGrid {
  readonly data: Uint32Array;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly d: number,
  ) {
    this.data = new Uint32Array(w * h * d);
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.h && z < this.d;
  }

  private index(x: number, y: number, z: number): number {
    return x + this.w * (y + this.h * z);
  }

  /** Bit 24 marks "filled" so that pure black (0x000000) is still a voxel. */
  set(x: number, y: number, z: number, color: number): this {
    if (this.inBounds(x, y, z)) this.data[this.index(x, y, z)] = (color & 0xffffff) | 0x1000000;
    return this;
  }

  clear(x: number, y: number, z: number): this {
    if (this.inBounds(x, y, z)) this.data[this.index(x, y, z)] = 0;
    return this;
  }

  filled(x: number, y: number, z: number): boolean {
    return this.inBounds(x, y, z) && this.data[this.index(x, y, z)]! !== 0;
  }

  color(x: number, y: number, z: number): number {
    return this.data[this.index(x, y, z)]! & 0xffffff;
  }

  /** Inclusive box fill. `color` may be a function for patterns. */
  box(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    color: number | ((x: number, y: number, z: number) => number | null),
  ): this {
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
          const c = typeof color === 'number' ? color : color(x, y, z);
          if (c === null) this.clear(x, y, z);
          else this.set(x, y, z, c);
        }
    return this;
  }

  /** Recolour every filled voxel matching `from`. */
  recolor(from: number, to: number): this {
    for (let i = 0; i < this.data.length; i++)
      if (this.data[i]! !== 0 && (this.data[i]! & 0xffffff) === from) this.data[i] = to | 0x1000000;
    return this;
  }
}

export interface MeshOptions {
  /** World size of one voxel. */
  scale?: number;
  /** Where (0,0,0) of the mesh sits: 'bottom-center' (default) or 'corner'. */
  origin?: 'bottom-center' | 'corner';
  /** ± random brightness per voxel, e.g. 0.05. */
  jitter?: number;
  /** AO strength 0..1. */
  ao?: number;
}

// For face axis a, the in-plane axes (u, v) are chosen cyclically so u × v = +a (CCW winding from outside).
const AXES: Array<[number, number, number]> = [
  [0, 1, 2],
  [1, 2, 0],
  [2, 0, 1],
];
const QUAD: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
const AO_CURVE = [0.5, 0.68, 0.84, 1];

function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/**
 * Culled-face mesher with per-vertex ambient occlusion (0fps.net style) and colour jitter.
 * Produces a non-indexed-by-material BufferGeometry with position / normal / color attributes.
 */
export function buildVoxelGeometry(grid: VoxelGrid, opts: MeshOptions = {}): THREE.BufferGeometry {
  const scale = opts.scale ?? 0.1;
  const jitter = opts.jitter ?? 0.04;
  const aoStrength = opts.ao ?? 1;
  const dims = [grid.w, grid.h, grid.d];
  const offset = opts.origin === 'corner' ? [0, 0, 0] : [-grid.w / 2, 0, -grid.d / 2];

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const c = new THREE.Color();
  const p = [0, 0, 0];
  const q = [0, 0, 0];

  const filledAt = (v: number[]) => (grid.filled(v[0]!, v[1]!, v[2]!) ? 1 : 0);

  for (let z = 0; z < grid.d; z++)
    for (let y = 0; y < grid.h; y++)
      for (let x = 0; x < grid.w; x++) {
        if (!grid.filled(x, y, z)) continue;
        const pos = [x, y, z];
        c.setHex(grid.color(x, y, z));
        const j = 1 + (hash3(x, y, z) - 0.5) * 2 * jitter;
        const r0 = c.r * j;
        const g0 = c.g * j;
        const b0 = c.b * j;

        for (const [a, u, v] of AXES) {
          for (const s of [1, -1]) {
            p[0] = pos[0]!;
            p[1] = pos[1]!;
            p[2] = pos[2]!;
            p[a] = p[a]! + s;
            if (p[a]! >= 0 && p[a]! < dims[a]! && filledAt(p)) continue;

            const base = positions.length / 3;
            const ao: number[] = [];
            const quad = s > 0 ? QUAD : [QUAD[0]!, QUAD[3]!, QUAD[2]!, QUAD[1]!];
            for (const [du, dv] of quad) {
              // AO samples live in the layer in front of the face.
              const su = du ? 1 : -1;
              const sv = dv ? 1 : -1;
              q[0] = p[0]!;
              q[1] = p[1]!;
              q[2] = p[2]!;
              q[u] = q[u]! + su;
              const side1 = filledAt(q);
              q[u] = q[u]! - su;
              q[v] = q[v]! + sv;
              const side2 = filledAt(q);
              q[u] = q[u]! + su;
              const corner = filledAt(q);
              const level = side1 && side2 ? 0 : 3 - (side1 + side2 + corner);
              ao.push(level);

              const vx = [0, 0, 0];
              vx[a] = pos[a]! + (s > 0 ? 1 : 0);
              vx[u] = pos[u]! + du;
              vx[v] = pos[v]! + dv;
              positions.push(
                (vx[0]! + offset[0]!) * scale,
                (vx[1]! + offset[1]!) * scale,
                (vx[2]! + offset[2]!) * scale,
              );
              const n = [0, 0, 0];
              n[a] = s;
              normals.push(n[0]!, n[1]!, n[2]!);
              const shade = 1 - (1 - AO_CURVE[level]!) * aoStrength;
              colors.push(r0 * shade, g0 * shade, b0 * shade);
            }
            // Split along the diagonal through the darker corner(s) to avoid AO anisotropy.
            if (ao[0]! + ao[2]! > ao[1]! + ao[3]!)
              indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
            else indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        }
      }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

// ───────────── 3×5 pixel font for inlaid numbers / slot letters ─────────────

const GLYPHS: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '-': ['...', '...', '###', '...', '...'],
  $: ['.##', '##.', '.#.', '.##', '##.'],
};

export function textWidth(text: string): number {
  return text.length * 4 - 1;
}

/**
 * Paint `text` into the grid.
 *  - 'top':   lying on the XZ plane at height y, glyph tops pointing to −z (readable from a camera in +z).
 *  - 'front': standing on the XY plane at depth z, readable from +z.
 */
export function paintText(
  grid: VoxelGrid,
  text: string,
  x0: number,
  y0: number,
  z0: number,
  color: number,
  plane: 'top' | 'front' = 'top',
): void {
  let cx = x0;
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (glyph) {
      glyph.forEach((row, r) => {
        for (let k = 0; k < 3; k++) {
          if (row[k] !== '#') continue;
          if (plane === 'top') grid.set(cx + k, y0, z0 + r, color);
          else grid.set(cx + k, y0 + (4 - r), z0, color);
        }
      });
    }
    cx += 4;
  }
}
