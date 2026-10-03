import type { Ware } from '@manila/engine';
import { WARE_INFO } from '@manila/engine';
import { ENV, WARE_COLORS } from './palette';
import { VoxelGrid, paintText, textWidth } from './voxel';

/**
 * Procedural voxel models. Every function returns a fresh VoxelGrid (x = length, y = up, z = depth).
 * Mesh them through `useVoxelGeometry` so each model is built once and cached.
 * Unless noted, models face +z (towards the camera) and are meshed with origin 'bottom-center'.
 */

// ───────────────────────────── punts ─────────────────────────────

export const PUNT_LENGTH = 18;
const PUNT_WIDTH = 7;
/** Seat x positions (in voxels) along the deck, cheapest seat first (stern → bow). */
export function puntSeatVoxelX(seatCount: number): number[] {
  return seatCount === 4 ? [6.5, 9, 11.5, 14] : [7.5, 10.5, 13.5];
}
/** Deck surface height of a punt in voxels. */
export const PUNT_DECK_VOXELS = 3;

export function puntModel(ware: Ware): VoxelGrid {
  const g = new VoxelGrid(PUNT_LENGTH, 7, PUNT_WIDTH);
  const L = PUNT_LENGTH - 1;
  const W = PUNT_WIDTH - 1;
  g.box(3, 0, 2, L - 3, 0, W - 2, ENV.woodDark); // keel
  g.box(1, 1, 1, L - 1, 1, W - 1, (_x, _y, z) =>
    z === 1 || z === W - 1 ? ENV.woodDark : ENV.wood,
  );
  g.box(0, 2, 0, L, 2, W, (x, _y, z) =>
    z === 0 || z === W || x === 0 || x === L ? ENV.woodDark : x % 2 ? ENV.plank : ENV.woodLight,
  ); // deck
  g.box(0, 3, 0, L, 3, 0, ENV.woodDark).box(0, 3, W, L, 3, W, ENV.woodDark); // gunwales
  g.box(0, 3, 0, 0, 3, W, ENV.woodDark);
  g.box(L, 3, 1, L, 4, W - 1, ENV.woodDark).box(L - 1, 3, 1, L - 1, 3, W - 1, ENV.wood); // bow
  // seat markers
  for (const sx of puntSeatVoxelX(WARE_INFO[ware].seatCosts.length))
    g.set(Math.floor(sx), 2, 3, ENV.rope);
  // cargo at the stern, styled per ware
  const c = WARE_COLORS[ware];
  g.box(1, 3, 1, 4, 5, W - 1, (x, y, z) => {
    switch (ware) {
      case 'ginseng': // sacks
        if (y === 5 && (x === 1 || x === 4 || z === 1 || z === W - 1)) return null;
        return y === 5 ? c.light : (x + z) % 3 === 0 ? c.dark : c.main;
      case 'nutmeg': // barrels with hoops
        if ((x === 1 || x === 4) && (z === 1 || z === W - 1)) return null;
        return y === 4 ? ENV.iron : y === 5 ? c.light : c.main;
      case 'silk': // rolled bolts
        return z % 2 ? c.main : c.light;
      case 'jade': // crates
        return x === 1 || x === 4 || y === 3 ? c.dark : y === 5 ? c.light : c.main;
    }
  });
  return g;
}

// ───────────────────────────── people ─────────────────────────────

export function meepleModel(main: number, dark: number, pirate = false): VoxelGrid {
  const g = new VoxelGrid(3, 8, 3);
  g.set(0, 0, 1, dark).set(2, 0, 1, dark).set(0, 1, 1, dark).set(2, 1, 1, dark); // legs
  g.box(0, 2, 0, 2, 4, 2, main); // body
  g.box(0, 5, 0, 2, 6, 2, main); // head
  g.set(0, 6, 2, 0x1d1d22).set(2, 6, 2, 0x1d1d22); // eyes (face +z)
  if (pirate) {
    g.box(0, 7, 0, 2, 7, 2, 0x1d1d22);
    g.set(1, 6, 0, 0x1d1d22).set(1, 7, 1, 0xd8433a); // bandana knot + red band
  }
  return g;
}

// ───────────────────────────── board pieces ─────────────────────────────

/** Floating route marker for space n (0..13). */
export function tileModel(n: number): VoxelGrid {
  const g = new VoxelGrid(9, 2, 9);
  const danger = n === 13;
  const start = n <= 5;
  const top = danger ? ENV.danger : start ? 0xf3dcae : ENV.plank;
  const ink = danger ? 0xfff3df : ENV.woodDark;
  g.box(0, 0, 0, 8, 1, 8, (x, y, z) => {
    const corner = (x === 0 || x === 8) && (z === 0 || z === 8);
    if (corner) return null;
    if (y === 0) return danger ? 0x8f2a24 : ENV.woodDark;
    return x === 0 || x === 8 || z === 0 || z === 8 ? (danger ? 0xb83a30 : ENV.wood) : top;
  });
  const text = String(n);
  paintText(g, text, Math.floor((9 - textWidth(text)) / 2), 1, 2, ink);
  return g;
}

export type StandKind = 'port' | 'shipyard' | 'pirate' | 'pilot' | 'insurance';

/** Round accomplice stand with the cost inlaid on top. */
export function standModel(kind: StandKind, cost: number): VoxelGrid {
  const g = new VoxelGrid(7, 2, 7);
  const rim: Record<StandKind, number> = {
    port: ENV.gold,
    shipyard: ENV.woodLight,
    pirate: 0x2b2b31,
    pilot: ENV.rope,
    insurance: 0x3f8f6b,
  };
  const face: Record<StandKind, number> = {
    port: 0xfff1c4,
    shipyard: 0xf3dcae,
    pirate: 0x4a4a52,
    pilot: 0xfff1c4,
    insurance: 0xd5f0dc,
  };
  g.box(0, 0, 0, 6, 1, 6, (x, y, z) => {
    const corner = (x === 0 || x === 6) && (z === 0 || z === 6);
    if (corner) return null;
    if (y === 0) return ENV.rockDark;
    return x === 0 || x === 6 || z === 0 || z === 6 ? rim[kind] : face[kind];
  });
  const ink = kind === 'pirate' ? 0xf2efe6 : ENV.woodDark;
  if (kind === 'insurance') paintText(g, '+', 2, 1, 1, ink);
  else paintText(g, String(cost), 2, 1, 1, ink);
  return g;
}

/** Signpost with `text` on its front face, framed with a 1-voxel margin so glyphs never touch the frame. */
export function signModel(
  text: string,
  board: number = ENV.plank,
  ink: number = 0x2a1a10,
): VoxelGrid {
  const w = textWidth(text) + 4;
  const g = new VoxelGrid(w, 15, 2);
  const mid = Math.floor(w / 2);
  g.box(mid, 0, 0, mid, 7, 0, ENV.woodDark);
  g.box(0, 6, 1, w - 1, 14, 1, (x, y) =>
    x === 0 || x === w - 1 || y === 6 || y === 14 ? ENV.woodDark : board,
  );
  paintText(g, text, 2, 8, 1, ink, 'front');
  return g;
}

// ───────────────────────────── ships ─────────────────────────────

/** Pirate ship, length along +x (bow at +x). Deck surface at y = 5 voxels. */
export function pirateShipModel(): VoxelGrid {
  const L = 30;
  const g = new VoxelGrid(L + 2, 28, 11);
  const halfW = (x: number) => (x > 24 ? Math.max(1, 5 - (x - 24)) : x < 2 ? 4 : 5);
  for (let x = 0; x < L; x++) {
    const hw = halfW(x);
    for (let y = 0; y <= 4; y++) {
      const w = y === 0 ? Math.max(0, hw - 2) : y === 1 ? hw - 1 : hw;
      for (let z = 5 - w; z <= 5 + w; z++) {
        const edge = z === 5 - w || z === 5 + w;
        g.set(
          x,
          y,
          z,
          y === 3 && edge ? 0xb8862e : y === 4 ? (edge ? ENV.woodDark : 0x5a3f2c) : ENV.pirateHull,
        );
      }
    }
  }
  g.box(L, 4, 5, L + 1, 5, 5, ENV.woodDark); // bowsprit
  g.box(0, 5, 1, 6, 7, 9, (x, y, z) => (y === 6 && z === 1 && x % 2 ? ENV.lamp : 0x4a3426)); // stern castle
  g.box(0, 8, 1, 6, 8, 9, ENV.woodDark);
  g.box(15, 5, 5, 15, 25, 5, ENV.woodDark); // mast
  g.box(16, 10, 1, 16, 21, 9, (_x, y, z) => {
    const sx = z - 3;
    const sy = 18 - y;
    const skull = ['.###.', '#####', '#.#.#', '#####', '.#.#.'];
    if (sx >= 0 && sx < 5 && sy >= 0 && sy < 5 && skull[sy]![sx] === '#') return 0xf2efe6;
    return ENV.pirateSail;
  });
  g.box(16, 23, 5, 19, 25, 5, (x) => (x % 2 ? 0xd8433a : 0x1d1d22)); // flag
  return g;
}

export function rowboatModel(length: number, width: number, sail: boolean): VoxelGrid {
  const g = new VoxelGrid(length, sail ? 14 : 4, width);
  const L = length - 1;
  const W = width - 1;
  g.box(1, 0, 1, L - 1, 0, W - 1, ENV.woodDark);
  g.box(0, 1, 0, L, 1, W, (x, _y, z) => {
    if ((x === 0 || x === L) && (z === 0 || z === W)) return null;
    return z === 0 || z === W || x === 0 || x === L ? ENV.wood : ENV.plank;
  });
  g.box(0, 2, 0, L, 2, 0, ENV.woodDark).box(0, 2, W, L, 2, W, ENV.woodDark);
  if (sail) {
    const m = Math.floor(L * 0.7);
    g.box(m, 2, Math.floor(W / 2), m, 13, Math.floor(W / 2), ENV.woodDark);
    g.box(m - 4, 5, Math.floor(W / 2), m - 1, 12, Math.floor(W / 2), (_x, y) =>
      y === 12 ? ENV.rope : ENV.sail,
    );
  }
  return g;
}

// ───────────────────────────── buildings & props ─────────────────────────────

/** Multiply a colour's brightness (default: the darker tile course of a roof). */
export function roofDarken(c: number, f = 0.82): number {
  const r = Math.min(255, ((c >> 16) & 255) * f);
  const gg = Math.min(255, ((c >> 8) & 255) * f);
  const b = Math.min(255, (c & 255) * f);
  return (Math.round(r) << 16) | (Math.round(gg) << 8) | Math.round(b);
}

/**
 * Harbour master's watchtower (Capitanía del Puerto): stone base, whitewashed shaft, timber
 * lookout gallery under a tiled cap, and a flagstaff flying the current harbour master's colour.
 */
export function towerModel(flag: number): VoxelGrid {
  const g = new VoxelGrid(9, 34, 9);
  g.box(1, 0, 1, 7, 3, 7, (x, y, z) => ((x + y + z) % 5 === 0 ? ENV.adobeLight : ENV.adobeDark));
  g.box(1, 4, 1, 7, 16, 7, (x, y, z) => {
    const edge = x === 1 || x === 7 || z === 1 || z === 7;
    if (!edge) return ENV.wallShade;
    if (y === 4 || y === 16) return ENV.adobeLight;
    if ((y === 8 || y === 9 || y === 13) && (x === 4 || z === 4)) return ENV.window;
    return ENV.wall;
  });
  g.box(4, 0, 7, 4, 2, 7, ENV.woodDark); // door
  // Lookout gallery: deck, railing, corner posts, tiled pyramid cap.
  g.box(0, 17, 0, 8, 17, 8, ENV.woodDark);
  g.box(0, 18, 0, 8, 18, 8, (x, _y, z) =>
    x === 0 || x === 8 || z === 0 || z === 8 ? ((x + z) % 2 ? ENV.wood : ENV.woodDark) : null,
  );
  for (const x of [1, 7]) for (const z of [1, 7]) g.box(x, 18, z, x, 21, z, ENV.woodDark);
  g.box(2, 18, 2, 6, 20, 6, (x, _y, z) => (x === 4 || z === 4 ? ENV.window : ENV.wall));
  for (let k = 0; k < 4; k++)
    g.box(k, 22 + k, k, 8 - k, 22 + k, 8 - k, k % 2 ? ENV.roof : ENV.roofDark);
  g.box(4, 26, 4, 4, 33, 4, ENV.woodDark); // flagstaff
  g.box(5, 29, 4, 7, 32, 4, flag);
  g.set(4, 34 - 1, 4, ENV.gold);
  return g;
}

export function lighthouseModel(): VoxelGrid {
  const g = new VoxelGrid(5, 22, 5);
  g.box(0, 0, 0, 4, 15, 4, (x, y, z) => {
    if ((x === 0 || x === 4) && (z === 0 || z === 4)) return null;
    return Math.floor(y / 3) % 2 ? 0xd8433a : 0xf2efe6;
  });
  g.box(0, 16, 0, 4, 16, 4, ENV.iron);
  g.box(1, 17, 1, 3, 19, 3, ENV.lamp);
  g.box(1, 20, 1, 3, 20, 3, 0xd8433a).set(2, 21, 2, 0xd8433a);
  return g;
}

export function palmModel(seed = 0): VoxelGrid {
  const g = new VoxelGrid(13, 24, 13);
  const lean = seed % 2 ? 1 : -1;
  let top: [number, number] = [6, 6];
  for (let y = 0; y < 17; y++) {
    const off = Math.round((y / 17) ** 2 * 3) * lean;
    top = [6 + off, 6];
    g.set(top[0], y, top[1], y % 3 ? ENV.trunk : ENV.woodDark);
  }
  const [tx, tz] = top;
  g.box(tx - 1, 17, tz - 1, tx + 1, 17, tz + 1, ENV.leafDark);
  g.set(tx, 16, tz + 1, 0x7a4a24).set(tx + 1, 16, tz, 0x7a4a24); // coconuts
  const fronds: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ];
  for (const [dx, dz] of fronds) {
    for (let k = 1; k <= 5; k++) {
      const y = 18 - Math.floor((k * k) / 7);
      g.set(tx + dx * k, y, tz + dz * k, k % 2 ? ENV.leaf : ENV.leafDark);
      if (k < 5) g.set(tx + dx * k, y + (k < 2 ? 1 : 0), tz + dz * k, ENV.leaf);
    }
  }
  return g;
}

export function crateModel(color: number, dark: number): VoxelGrid {
  const g = new VoxelGrid(4, 4, 4);
  g.box(0, 0, 0, 3, 3, 3, (x, y, z) => {
    const edges = [x === 0 || x === 3, y === 0 || y === 3, z === 0 || z === 3].filter(
      Boolean,
    ).length;
    return edges >= 2 ? dark : color;
  });
  return g;
}

/** Bodega (stone warehouse): tuff walls, two big cargo doors under ware-coloured shades, tiled roof. */
export function warehouseModel(): VoxelGrid {
  const g = new VoxelGrid(22, 17, 15);
  g.box(0, 0, 0, 21, 8, 13, (x, y, z) => {
    const edge = x === 0 || x === 21 || z === 0 || z === 13;
    if (!edge) return ENV.adobeDark;
    const door = z === 13 && ((x >= 3 && x <= 8) || (x >= 13 && x <= 18)) && y <= 5;
    if (door)
      return x === 3 || x === 8 || x === 13 || x === 18 || y === 5 ? ENV.woodDark : 0x3a2618;
    if (y === 0) return ENV.adobeDark;
    if (y === 7 && x % 3 === 1) return ENV.windowDark;
    return (x * 7 + y * 13 + z * 5) % 11 === 0 ? ENV.adobeLight : ENV.adobe;
  });
  // Striped awnings over the doors in the four ware colours.
  const wares = Object.values(WARE_COLORS);
  for (const [x0, i0] of [
    [3, 0],
    [13, 2],
  ] as const)
    g.box(x0, 6, 14, x0 + 5, 6, 14, (x) => wares[i0 + ((x - x0) >> 1 >= 2 ? 1 : 0)]!.main);
  for (let k = 0; k < 7; k++)
    g.box(0, 9 + k, k, 21, 9 + k, 13 - k, (x, _y, z) =>
      x === 0 || x === 21
        ? ENV.roofDark
        : z === k || z === 13 - k
          ? ENV.roof
          : roofDarken(ENV.roof),
    );
  return g;
}

export function craneModel(): VoxelGrid {
  const g = new VoxelGrid(14, 26, 5);
  g.box(1, 0, 0, 1, 22, 0, ENV.woodDark).box(1, 0, 4, 1, 22, 4, ENV.woodDark);
  for (let y = 3; y < 22; y += 5) g.box(1, y, 1, 1, y, 3, ENV.wood);
  g.box(0, 23, 0, 13, 23, 4, ENV.woodDark);
  g.box(12, 10, 2, 12, 22, 2, ENV.rope);
  g.box(11, 8, 1, 13, 9, 3, ENV.iron);
  return g;
}

export function slipwayModel(letter: string): VoxelGrid {
  const g = new VoxelGrid(12, 3, 24);
  g.box(0, 0, 0, 11, 0, 23, (x, _y, z) =>
    x === 0 || x === 11 ? ENV.woodDark : z % 3 ? ENV.plank : ENV.wood,
  );
  g.box(0, 1, 0, 0, 2, 23, ENV.woodDark).box(11, 1, 0, 11, 2, 23, ENV.woodDark);
  paintText(g, letter, 4, 0, 17, ENV.woodDark);
  return g;
}

export function bollardModel(): VoxelGrid {
  const g = new VoxelGrid(2, 3, 2);
  g.box(0, 0, 0, 1, 2, 1, (_x, y) => (y === 2 ? ENV.iron : 0x2f3238));
  return g;
}

export function barrelModel(): VoxelGrid {
  const g = new VoxelGrid(3, 4, 3);
  g.box(0, 0, 0, 2, 3, 2, (x, y, z) =>
    (x === 0 || x === 2) && (z === 0 || z === 2) ? null : y === 1 ? ENV.iron : ENV.wood,
  );
  return g;
}

// ───────────────────────────── dice ─────────────────────────────

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[3, 3]],
  2: [
    [1, 1],
    [5, 5],
  ],
  3: [
    [1, 1],
    [3, 3],
    [5, 5],
  ],
  4: [
    [1, 1],
    [1, 5],
    [5, 1],
    [5, 5],
  ],
  5: [
    [1, 1],
    [1, 5],
    [3, 3],
    [5, 1],
    [5, 5],
  ],
  6: [
    [1, 1],
    [1, 3],
    [1, 5],
    [5, 1],
    [5, 3],
    [5, 5],
  ],
};

/** 7³ die in the ware's colour. Faces: +y 1, −y 6, +x 2, −x 5, +z 3, −z 4 (see DIE_TOP_ROTATION). */
export function dieModel(color: number, pip: number): VoxelGrid {
  const g = new VoxelGrid(7, 7, 7);
  g.box(0, 0, 0, 6, 6, 6, (x, y, z) => {
    const edges = [x === 0 || x === 6, y === 0 || y === 6, z === 0 || z === 6].filter(
      Boolean,
    ).length;
    return edges === 3 ? null : color;
  });
  const face: Record<number, (u: number, v: number) => [number, number, number]> = {
    1: (u, v) => [u, 6, v],
    6: (u, v) => [u, 0, v],
    2: (u, v) => [6, u, v],
    5: (u, v) => [0, u, v],
    3: (u, v) => [u, v, 6],
    4: (u, v) => [u, v, 0],
  };
  for (let n = 1; n <= 6; n++)
    for (const [u, v] of PIPS[n]!) {
      const [x, y, z] = face[n]!(u, v);
      g.set(x, y, z, pip);
    }
  return g;
}

/** Euler rotation that brings face `n` of dieModel to the top. */
export const DIE_TOP_ROTATION: Record<number, [number, number, number]> = {
  1: [0, 0, 0],
  2: [0, 0, Math.PI / 2],
  3: [-Math.PI / 2, 0, 0],
  4: [Math.PI / 2, 0, 0],
  5: [0, 0, -Math.PI / 2],
  6: [Math.PI, 0, 0],
};
