import { ENV } from './palette';
import { roofDarken } from './models';
import { VoxelGrid } from './voxel';

/**
 * Landmark and location models that give the bay its 19th-century Manila character:
 * Intramuros stone (adobe tuff), bahay na bato houses with capiz windows, a Spanish fort,
 * the customs house, a Binondo merchant house, nipa huts, outrigger bancas and a working
 * shipyard. Same conventions as models.ts: x = length, y = up, z = depth, front faces +z,
 * meshed with origin 'bottom-center' at 0.1 world units per voxel.
 */

// ───────────────────────────── helpers ─────────────────────────────

/** Hip roof: courses shrink on all four sides from the footprint (x0..x1, z0..z1) at height y. */
function hipRoof(
  g: VoxelGrid,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  color: number,
  /** Inset per course: 1 = 45° pitch, 2 = the low colonial pitch. */
  step = 1,
): number {
  let k = 0;
  for (; x0 + k * step <= x1 - k * step && z0 + k * step <= z1 - k * step; k++) {
    const a0 = x0 + k * step;
    const a1 = x1 - k * step;
    const b0 = z0 + k * step;
    const b1 = z1 - k * step;
    // Tile ribs run down the slope; the hidden core is darker.
    g.box(a0, y + k, b0, a1, y + k, b1, (x, _y, z) => {
      const rim = x - a0 < step || a1 - x < step || z - b0 < step || b1 - z < step;
      if (!rim) return roofDarken(color, 0.7);
      const alongX = z - b0 < step || b1 - z < step;
      return (alongX ? x : z) % 2 ? color : roofDarken(color, 0.9);
    });
  }
  return y + k;
}

/** Stone texture: tuff blocks with lighter / darker stones scattered in courses. */
function stone(x: number, y: number, z: number): number {
  const h = (x * 7 + y * 13 + z * 5 + ((y >> 1) & 1) * 3) % 11;
  return h === 0 ? ENV.adobeLight : h === 5 ? ENV.adobeDark : ENV.adobe;
}

// ───────────────────────────── Manila town ─────────────────────────────

/**
 * Bahay na bato: stone ground floor with an arched carriage door, overhanging timber upper
 * floor with sliding capiz-shell windows above ventanilla balusters, red tiled hip roof.
 * Footprint (w + 2) × (d + 2) voxels including the overhang.
 */
export function bahayNaBatoModel(w: number, d: number, roof: number, seed = 0): VoxelGrid {
  const G = 5;
  const U = 6;
  const top = G + U;
  const W = w + 2;
  const D = d + 2;
  const g = new VoxelGrid(W, top + Math.ceil(Math.min(W, D) / 4) + 2, D);
  const mid = Math.floor(W / 2) - 1;
  const painted = [ENV.woodLight, ENV.wall, 0xe7d3a8][seed % 3]!;
  // Stone ground floor.
  g.box(1, 0, 1, w, G - 1, d, (x, y, z) => {
    const edge = x === 1 || x === w || z === 1 || z === d;
    if (!edge) return ENV.adobeDark;
    if (z === d && (x === mid || x === mid + 1)) return y <= 2 ? ENV.woodDark : ENV.adobeLight;
    if (y === 2 && (z === d || z === 1) && (x + seed) % 4 === 2) return ENV.iron;
    if (y === 2 && (x === 1 || x === w) && (z + seed) % 4 === 2) return ENV.iron;
    return y === 0 ? ENV.adobeDark : stone(x, y, z);
  });
  // Overhanging timber upper floor.
  g.box(0, G, 0, W - 1, top - 1, D - 1, (x, y, z) => {
    const fx = x === 0 || x === W - 1;
    const fz = z === 0 || z === D - 1;
    if (!fx && !fz) return ENV.wallShade;
    if (y === G || (fx && fz)) return ENV.woodDark; // floor beam and corner posts
    const along = fz ? x : z;
    const span = fz ? W : D;
    const win = along > 0 && along < span - 1 && (along + seed) % 5 !== 0;
    if (!win) return painted;
    if (y === G + 1) return along % 2 ? ENV.capizFrame : ENV.windowDark; // ventanilla balusters
    if (y === top - 1) return ENV.capizFrame;
    return y === G + 3 ? ENV.capizFrame : ENV.capiz;
  });
  hipRoof(g, 0, 0, W - 1, D - 1, top, roof, 2);
  return g;
}

/** Baroque church in the San Agustín manner: twin bell towers, pedimented facade, buttressed nave. */
export function churchModel(): VoxelGrid {
  const g = new VoxelGrid(20, 34, 25);
  // Nave with buttresses.
  g.box(3, 0, 1, 16, 12, 20, (x, y, z) =>
    x === 3 || x === 16 || z === 1 ? stone(x, y, z) : ENV.adobeDark,
  );
  for (let z = 3; z <= 19; z += 4) {
    g.box(2, 0, z, 2, 9 - (z % 3), z, ENV.adobeDark).box(
      17,
      0,
      z,
      17,
      9 - (z % 3),
      z,
      ENV.adobeDark,
    );
    g.box(3, 6, z + 2, 3, 8, z + 2, ENV.windowDark).box(16, 6, z + 2, 16, 8, z + 2, ENV.windowDark);
  }
  // Nave roof (ridge along z).
  for (let k = 0; 3 + k <= 16 - k; k++)
    g.box(3 + k, 13 + k, 1, 16 - k, 13 + k, 20, (x) =>
      x === 3 + k || x === 16 - k ? (k % 2 ? ENV.roof : ENV.roofDark) : ENV.roofDark,
    );
  // Facade between the towers, with pediment, door and oculus.
  g.box(4, 0, 21, 15, 15, 22, (x, y, z) => {
    if (z === 22 && (x === 9 || x === 10) && y <= 6) return ENV.woodDark;
    if (z === 22 && (x === 8 || x === 11) && y <= 5) return ENV.woodDark;
    if (z === 22 && x >= 8 && x <= 11 && y === 7) return ENV.adobeLight;
    if (z === 22 && (x === 9 || x === 10) && (y === 10 || y === 11)) return ENV.windowDark;
    if (y === 8 || y === 15) return ENV.adobeLight; // cornices
    if (z === 22 && (x === 6 || x === 13) && y < 15) return ENV.adobeLight; // pilasters
    return ENV.adobe;
  });
  for (let k = 1; k <= 4; k++)
    g.box(4 + k * 1, 15 + k, 21, 15 - k, 15 + k, 22, k === 4 ? ENV.adobeLight : ENV.adobe);
  g.box(9, 20, 22, 10, 22, 22, ENV.gold).box(8, 21, 22, 11, 21, 22, ENV.gold); // cross
  // Twin bell towers.
  for (const tx of [0, 15]) {
    g.box(tx, 0, 19, tx + 4, 24, 24, (x, y, z) => {
      const face = x === tx || x === tx + 4 || z === 19 || z === 24;
      if (!face) return ENV.adobeDark;
      if (y % 8 === 0) return ENV.adobeLight; // storey cornices
      const c = x === tx + 2 || z === 21 || z === 22;
      if (y >= 18 && y <= 21 && c) return y === 21 ? ENV.adobeLight : ENV.windowDark; // belfry
      if (y >= 11 && y <= 12 && (x === tx + 2 || z === 22)) return ENV.windowDark;
      return stone(x, y, z);
    });
    g.set(tx + 2, 19, 24, ENV.goldDark); // bell
    g.box(tx, 25, 19, tx + 4, 25, 24, ENV.adobeLight);
    g.box(tx + 1, 26, 20, tx + 3, 27, 23, ENV.roofDark);
    g.box(tx + 2, 28, 21, tx + 2, 29, 22, ENV.roof);
    g.box(tx + 2, 30, 21, tx + 2, 33, 21, ENV.gold).box(tx + 1, 32, 21, tx + 3, 32, 21, ENV.gold);
  }
  return g;
}

/**
 * Spanish bastion in the manner of Fort Santiago. The front (+z) faces the sea: crenellated
 * walls, sentry boxes (garitas) on the front corners, three cannons and the Spanish flag.
 */
export function fortModel(): VoxelGrid {
  const W = 28;
  const D = 22;
  const H = 10;
  const g = new VoxelGrid(W, 26, D + 2);
  g.box(0, 0, 0, W - 1, H - 1, D - 1, (x, y, z) => {
    const edge = x === 0 || x === W - 1 || z === 0 || z === D - 1;
    if (!edge)
      return y === H - 1
        ? [ENV.paving, ENV.pavingDark, ENV.paving, ENV.pavingLight][
            (x * 5 + z * 3 + ((x * z) % 7)) % 4
          ]!
        : ENV.adobeDark;
    if (z === 0 && x >= 12 && x <= 15 && y <= 5) return y === 5 ? ENV.adobeLight : ENV.woodDark; // gate
    if (y === 0) return ENV.adobeDark;
    if (y === 6) return ENV.adobeLight; // cordon
    return stone(x, y, z);
  });
  // Battered base: a sloped course one voxel out.
  g.box(0, 0, D - 1, W - 1, 1, D - 1, ENV.adobeDark);
  // Crenellations, with embrasures where the cannons are.
  const guns = [6, 14, 21];
  for (let x = 0; x < W; x++)
    for (const z of [0, D - 1])
      if (x % 3 !== 2 && !(z === D - 1 && guns.some((gx) => Math.abs(gx - x) <= 0)))
        g.set(x, H, z, stone(x, H, z));
  for (let z = 0; z < D; z++)
    for (const x of [0, W - 1]) if (z % 3 !== 2) g.set(x, H, z, stone(x, H, z));
  for (const gx of guns) {
    g.box(gx - 1, H, D - 4, gx + 1, H, D - 3, ENV.woodDark); // carriage
    g.box(gx, H + 1, D - 5, gx, H + 1, D + 1, ENV.cannon); // barrel through the embrasure
    g.set(gx, H + 2, D - 5, ENV.cannon);
  }
  g.box(2, H + 0, 2, 3, H + 0, 3, ENV.cannon).set(3, H + 1, 3, ENV.cannon); // cannonball pile
  // Garitas (sentry boxes) on the seaward corners.
  for (const gx of [0, W - 3]) {
    g.box(gx, H, D - 3, gx + 2, H + 3, D - 1, (x, y, z) =>
      y === H + 2 && (x === gx + 1 || z === D - 2) ? ENV.windowDark : ENV.adobeLight,
    );
    g.box(gx, H + 4, D - 3, gx + 2, H + 4, D - 1, ENV.adobeDark).set(
      gx + 1,
      H + 5,
      D - 2,
      ENV.adobeDark,
    );
  }
  // Flag of Spain (red–yellow–red) on a staff in the courtyard.
  g.box(14, H, 8, 14, H + 13, 8, ENV.woodDark);
  g.box(15, H + 9, 8, 19, H + 12, 8, (_x, y) =>
    y === H + 9 || y === H + 12 ? ENV.flagRed : ENV.flagYellow,
  );
  return g;
}

/** Aduana (customs house): two storeys, arcaded ground floor, capiz windows, clock pediment. */
export function aduanaModel(): VoxelGrid {
  const W = 30;
  const D = 14;
  const g = new VoxelGrid(W, 22, D);
  // Ground floor: inner wall with doors behind an open arcade.
  g.box(0, 0, 0, W - 1, 5, D - 3, (x, y, z) =>
    z === D - 3 && x % 4 === 2 && y <= 3 ? ENV.woodDark : stone(x, y, z),
  );
  g.box(0, 0, D - 2, W - 1, 5, D - 1, (x, y) => {
    const pier = x % 4 === 0 || x === W - 1;
    if (pier) return y === 0 ? ENV.adobeDark : ENV.adobeLight;
    if (y <= 3) return null; // open arches
    return y === 4 && (x % 4 === 1 || x % 4 === 3) ? ENV.adobeLight : ENV.adobe;
  });
  g.box(0, 0, D - 2, W - 1, 0, D - 1, (x) => (x % 4 === 0 ? ENV.adobeDark : ENV.paving)); // arcade floor
  // Whitewashed upper floor with capiz windows.
  g.box(0, 6, 0, W - 1, 11, D - 1, (x, y, z) => {
    const fz = z === 0 || z === D - 1;
    const fx = x === 0 || x === W - 1;
    if (!fx && !fz) return ENV.wallShade;
    if (y === 6) return ENV.adobeLight;
    const along = fz ? x : z;
    if (along % 3 !== 0 && along > 0 && (fz ? along < W - 1 : along < D - 1) && y >= 7 && y <= 10)
      return y === 7 ? ENV.capizFrame : y === 9 ? ENV.capizFrame : ENV.capiz;
    return ENV.wall;
  });
  g.box(0, 12, 0, W - 1, 12, D - 1, ENV.adobeLight); // cornice
  hipRoof(g, 0, 0, W - 1, D - 1, 13, ENV.roof, 2);
  // Central pediment with a clock.
  for (let k = 0; k < 5; k++) g.box(10 + k, 12 + k, D - 1, 19 - k, 12 + k, D - 1, ENV.wall);
  g.box(14, 13, D - 1, 15, 14, D - 1, ENV.gold).set(14, 14, D - 1, ENV.woodDark);
  g.box(14, 17, D - 1, 15, 17, D - 1, ENV.adobeLight);
  return g;
}

/** Plaza fountain. */
export function fountainModel(): VoxelGrid {
  const g = new VoxelGrid(9, 7, 9);
  g.box(0, 0, 0, 8, 1, 8, (x, y, z) => {
    const corner = (x === 0 || x === 8) && (z === 0 || z === 8);
    if (corner) return null;
    const rim = x === 0 || x === 8 || z === 0 || z === 8;
    return rim ? ENV.adobeLight : y === 1 ? ENV.seaShallow : ENV.adobeDark;
  });
  g.box(4, 2, 4, 4, 4, 4, ENV.adobeLight).box(3, 4, 3, 5, 4, 5, ENV.adobe);
  g.set(4, 5, 4, ENV.foam).set(4, 6, 4, ENV.foam);
  return g;
}

// ───────────────────────────── quay ─────────────────────────────

/** Cast-iron gas lamp. */
export function lampPostModel(): VoxelGrid {
  const g = new VoxelGrid(3, 15, 3);
  g.box(0, 0, 0, 2, 1, 2, ENV.cannon);
  g.box(1, 2, 1, 1, 11, 1, ENV.cannon);
  g.box(0, 12, 0, 2, 13, 2, ENV.lamp).box(0, 14, 0, 2, 14, 2, ENV.cannon);
  return g;
}

/** Pile of jute sacks in a ware's colours. */
export function sackPileModel(main: number, dark: number, light: number): VoxelGrid {
  const g = new VoxelGrid(8, 5, 6);
  const sack = (x0: number, y0: number, z0: number) =>
    g.box(x0, y0, z0, x0 + 1, y0 + 1, z0 + 2, (x, y, z) =>
      y === y0 + 1 && (z === z0 || z === z0 + 2) ? light : (x + z) % 3 ? main : dark,
    );
  for (let x = 0; x < 8; x += 2) (sack(x, 0, 0), sack(x, 0, 3));
  for (let x = 1; x < 6; x += 2) sack(x, 2, 1);
  g.box(3, 4, 2, 4, 4, 2, light);
  return g;
}

/** Plank finger pier on piles, running along x. Deck at y = 4 voxels. */
export function pierModel(length: number, width = 4): VoxelGrid {
  const g = new VoxelGrid(length, 6, width);
  g.box(0, 4, 0, length - 1, 4, width - 1, (x, _y, z) =>
    z === 0 || z === width - 1 ? ENV.woodDark : x % 2 ? ENV.plank : ENV.woodLight,
  );
  for (let x = 0; x < length; x += 4) {
    g.box(x, 0, 0, x, 5, 0, ENV.woodDark).box(x, 0, width - 1, x, 5, width - 1, ENV.woodDark);
  }
  g.box(length - 1, 0, 0, length - 1, 5, 0, ENV.woodDark);
  g.box(length - 1, 0, width - 1, length - 1, 5, width - 1, ENV.woodDark);
  return g;
}

// ───────────────────────────── shipyard ─────────────────────────────

/**
 * A hull being built on stocks, bow towards +x: the stern half is planked, the bow half still
 * shows bare ribs rising from the keel; scaffolding on the far side.
 */
export function hullFrameModel(): VoxelGrid {
  const L = 32;
  const g = new VoxelGrid(L, 16, 13);
  const c = 6;
  const deck = 10;
  /** Half-width of the hull at station x and height y (tapers to the stem and stern). */
  const hw = (x: number, y: number) => {
    const ends = Math.min(x - 1, L - 3 - x);
    return Math.max(0, Math.min(5, y - 2, Math.floor(ends / 2) + (y > 6 ? 1 : 0)));
  };
  for (let x = 3; x < L - 4; x += 6) g.box(x, 0, c - 3, x + 1, 2, c + 3, ENV.woodDark); // stocks
  g.box(2, 3, c, L - 4, 3, c, ENV.woodDark); // keel
  for (let y = 3; y <= deck + 3; y++) g.set(L - 4 + Math.floor((y - 3) / 4), y, c, ENV.woodDark); // stem
  g.box(2, 3, c, 2, deck + 2, c, ENV.woodDark); // sternpost
  const planked = 18;
  for (let x = 3; x <= L - 5; x++)
    for (let y = 4; y <= deck; y++) {
      const w = hw(x, y);
      if (w <= 0) continue;
      if (x <= planked) {
        const plank = y === deck ? ENV.woodDark : y % 2 ? ENV.woodLight : ENV.wood;
        g.set(x, y, c - w, plank).set(x, y, c + w, plank);
        if (y === 4) g.box(x, y, c - w, x, y, c + w, ENV.wood);
      } else if (x % 2 === 0) {
        g.set(x, y, c - w, ENV.plank).set(x, y, c + w, ENV.plank); // bare ribs
        if (y === deck) g.box(x, y, c - w, x, y, c + w, ENV.plank); // deck beam
      }
    }
  // Scaffolding on the far side, with a ladder.
  for (let x = 3; x < L - 4; x += 7) g.box(x, 0, 0, x, 11, 0, ENV.bambooDark);
  g.box(3, 8, 0, L - 7, 8, 0, ENV.bamboo).box(3, 11, 0, L - 7, 11, 0, ENV.bamboo);
  for (let y = 0; y <= 8; y += 2) g.set(L - 6, y, 12, ENV.bamboo);
  g.box(L - 6, 0, 12, L - 6, 9, 12, (_x, y) => (y % 2 ? ENV.bambooDark : ENV.bamboo));
  return g;
}

/**
 * Shipwrights' shed: two bays under steep nipa-thatch gables whose ends face +z, on timber posts,
 * with a woven bamboo back wall, a workbench and a plank rack inside.
 */
export function shedModel(): VoxelGrid {
  const BAY = 15;
  const W = BAY * 2;
  const D = 14;
  const g = new VoxelGrid(W, 18, D);
  for (const x of [0, BAY - 1, BAY, W - 1])
    for (const z of [1, D - 2]) g.box(x, 0, z, x, 8, z, ENV.woodDark);
  g.box(0, 0, 0, W - 1, 8, 0, (x) => (x % 2 ? ENV.bamboo : ENV.bambooDark)); // back wall
  g.box(0, 8, 1, W - 1, 8, 1, ENV.woodDark).box(0, 8, D - 2, W - 1, 8, D - 2, ENV.woodDark);
  for (let b = 0; b < 2; b++) {
    const x0 = b * BAY;
    for (let k = 0; k <= 7; k++)
      g.box(x0 + k, 9 + k, 0, x0 + BAY - 1 - k, 9 + k, D - 1, (x, _y, z) => {
        if (z === D - 1 || z === 0) {
          // gable end: thatch eaves, woven bamboo infill
          if (x === x0 + k || x === x0 + BAY - 1 - k) return ENV.thatchDark;
          return z === D - 1 ? (x % 2 ? ENV.bamboo : ENV.bambooDark) : ENV.bambooDark;
        }
        return x === x0 + k || x === x0 + BAY - 1 - k
          ? (z + k) % 3
            ? ENV.thatch
            : ENV.thatchDark
          : ENV.thatchDark;
      });
  }
  g.box(3, 0, 4, 10, 2, 6, (_x, y) => (y === 2 ? ENV.woodLight : ENV.woodDark)); // workbench
  g.box(17, 0, 3, 26, 3, 6, (x, y) => (y % 2 ? ENV.plank : x % 3 ? ENV.woodLight : ENV.wood));
  g.box(14, 6, 7, 15, 7, 7, ENV.lamp);
  return g;
}

/** Stack of seasoned logs with visible end grain. */
export function timberStackModel(): VoxelGrid {
  const g = new VoxelGrid(16, 6, 7);
  const log = (y: number, z: number) =>
    g.box(0, y, z, 15, y + 1, z + 1, (x, yy, zz) =>
      x === 0 || x === 15
        ? (yy + zz) % 2
          ? ENV.woodLight
          : ENV.plank
        : x % 5 === 0
          ? ENV.woodDark
          : ENV.trunk,
    );
  (log(0, 0), log(0, 2), log(0, 4), log(2, 1), log(2, 3), log(4, 2));
  return g;
}

/** Tar cauldron over a fire, with a curl of smoke. */
export function tarPotModel(): VoxelGrid {
  const g = new VoxelGrid(5, 13, 5);
  g.box(0, 0, 1, 4, 0, 3, (x) => (x % 2 ? ENV.woodDark : ENV.fire));
  g.box(1, 0, 0, 3, 0, 4, (_x, _y, z) => (z % 2 ? ENV.fire : ENV.woodDark));
  g.box(0, 1, 0, 4, 3, 4, (x, _y, z) =>
    (x === 0 || x === 4) && (z === 0 || z === 4) ? null : ENV.cannon,
  );
  g.box(1, 3, 1, 3, 3, 3, ENV.tar);
  for (const [x, y, z] of [
    [2, 5, 2],
    [2, 6, 3],
    [3, 7, 3],
    [3, 8, 2],
    [2, 9, 2],
    [2, 10, 1],
    [1, 11, 1],
    [1, 12, 2],
  ] as const)
    g.set(x, y, z, ENV.smoke);
  return g;
}

/** Spare anchor propped on its stock. */
export function anchorModel(): VoxelGrid {
  const g = new VoxelGrid(9, 11, 2);
  g.box(4, 1, 0, 4, 10, 0, ENV.iron); // shank
  g.box(1, 9, 1, 7, 9, 1, ENV.woodDark); // stock
  g.box(3, 10, 0, 5, 10, 0, ENV.iron).set(4, 10, 1, ENV.iron);
  g.box(1, 1, 0, 7, 1, 0, ENV.iron).set(0, 2, 0, ENV.iron).set(8, 2, 0, ENV.iron); // arms
  g.set(0, 3, 0, ENV.iron).set(8, 3, 0, ENV.iron).set(4, 0, 0, ENV.iron);
  return g;
}

/** Coiled hawser. */
export function ropeCoilModel(): VoxelGrid {
  const g = new VoxelGrid(5, 2, 5);
  g.box(0, 0, 0, 4, 1, 4, (x, y, z) => {
    const ring = x === 0 || x === 4 || z === 0 || z === 4;
    if ((x === 0 || x === 4) && (z === 0 || z === 4)) return null;
    if (!ring) return y === 0 ? ENV.rope : null;
    return (x + z + y) % 2 ? ENV.rope : ENV.thatchDark;
  });
  return g;
}

// ───────────────────────────── west harbour ─────────────────────────────

/** Binondo Chinese merchant house (the insurance office): lacquered pillars, glazed curved roof, lanterns. */
export function binondoHouseModel(): VoxelGrid {
  const W = 16;
  const D = 13;
  const g = new VoxelGrid(W, 15, D + 1);
  g.box(1, 0, 1, W - 2, 6, D - 2, (x, y, z) => {
    if (y === 0) return ENV.adobeDark;
    if (z === D - 2 && (x === 7 || x === 8) && y <= 4) return ENV.lacquerDark; // door
    if (z === D - 2 && (x === 3 || x === 4 || x === 11 || x === 12) && (y === 3 || y === 4))
      return (x + y) % 2 ? ENV.lacquer : ENV.windowDark; // lattice windows
    return ENV.wall;
  });
  // Lacquered pillars carrying the eaves, gold plaque over the door.
  for (const x of [1, 5, 10, 14]) g.box(x, 0, D - 1, x, 6, D - 1, ENV.lacquer);
  g.box(6, 6, D - 1, 9, 6, D - 1, ENV.gold);
  // Glazed green tile roof with upturned eave corners and a ridge with raised ends.
  for (let k = 0; k <= 5; k++) {
    const z0 = k;
    const z1 = D - 1 - k;
    g.box(0, 7 + k, z0, W - 1, 7 + k, z1, (x, _y, z) =>
      z === z0 || z === z1
        ? x % 2
          ? ENV.jadeTile
          : roofDarken(ENV.jadeTile)
        : roofDarken(ENV.jadeTile, 0.7),
    );
  }
  for (const x of [0, W - 1]) for (const z of [0, D - 1]) g.set(x, 8, z, ENV.jadeTile);
  g.box(0, 13, 6, W - 1, 13, 6, ENV.lacquer)
    .set(0, 14, 6, ENV.lacquer)
    .set(W - 1, 14, 6, ENV.lacquer);
  // Red lanterns hanging under the front eave.
  for (const x of [3, 12]) {
    g.box(x, 4, D, x, 5, D, ENV.lantern).set(x, 6, D, ENV.gold);
  }
  return g;
}

// ───────────────────────────── countryside ─────────────────────────────

/** Bahay kubo: bamboo stilt hut with woven walls and a steep nipa-thatch roof. */
export function nipaHutModel(seed = 0): VoxelGrid {
  const g = new VoxelGrid(14, 20, 15);
  for (const x of [2, 11]) for (const z of [2, 11]) g.box(x, 0, z, x, 3, z, ENV.bambooDark);
  g.box(2, 4, 2, 11, 4, 11, ENV.bamboo); // floor
  g.box(2, 5, 2, 11, 8, 11, (x, y, z) => {
    const fz = z === 2 || z === 11;
    const fx = x === 2 || x === 11;
    if (!fx && !fz) return ENV.thatchDark;
    if (fz && x >= 4 && x <= 5 + (seed % 2) && (y === 6 || y === 7)) return ENV.windowDark;
    if (z === 11 && x >= 8 && x <= 9 && y <= 7) return ENV.woodDark; // door
    return (fz ? x : z) % 2 ? ENV.bamboo : ENV.thatch;
  });
  // Ladder up to the door.
  for (let y = 0; y <= 3; y++)
    g.set(8, y, 12 + (3 - y > 1 ? 1 : 0), y % 2 ? ENV.bambooDark : ENV.bamboo);
  g.box(8, 0, 13, 9, 0, 13, ENV.bambooDark);
  // Steep thatch roof: overhanging hip rising 1.5 courses per step.
  let y = 9;
  for (let k = 0; k < 7; k++) {
    const a = k;
    const b = 13 - k;
    for (let r = 0; r < (k % 2 ? 2 : 1); r++, y++)
      g.box(a, y, a, b, y, b, (x, _y, z) =>
        r === 0 && (x === a || x === b || z === a || z === b) ? ENV.thatchDark : ENV.thatch,
      );
  }
  return g;
}

/** Banca: narrow outrigger canoe, painted hull, bamboo floats on both sides. */
export function bancaModel(paint: number): VoxelGrid {
  const L = 22;
  const g = new VoxelGrid(L, 5, 15);
  const c = 7;
  g.box(4, 0, c, L - 5, 0, c, ENV.woodDark);
  g.box(3, 1, c - 1, L - 4, 1, c + 1, (_x, _y, z) => (z === c ? ENV.wood : paint));
  g.box(2, 2, c - 1, L - 3, 2, c - 1, ENV.wall).box(2, 2, c + 1, L - 3, 2, c + 1, ENV.wall);
  g.box(1, 2, c, 1, 3, c, paint).box(L - 2, 2, c, L - 2, 3, c, paint); // upturned ends
  for (const z of [0, 14]) g.box(4, 0, z, L - 5, 0, z, ENV.bamboo); // floats
  for (const x of [7, L - 8]) {
    g.box(x, 3, 0, x, 3, 14, ENV.bambooDark);
    g.box(x, 1, 0, x, 2, 0, ENV.bambooDark).box(x, 1, 14, x, 2, 14, ENV.bambooDark);
  }
  return g;
}

/** Carabao (water buffalo) with swept-back horns. */
export function carabaoModel(): VoxelGrid {
  const g = new VoxelGrid(11, 7, 7);
  g.box(2, 2, 2, 7, 4, 4, ENV.carabao);
  g.box(2, 5, 3, 6, 5, 3, ENV.carabaoDark);
  for (const x of [2, 7]) for (const z of [2, 4]) g.box(x, 0, z, x, 1, z, ENV.carabaoDark);
  g.box(8, 2, 2, 9, 4, 4, ENV.carabao).box(10, 2, 3, 10, 3, 3, ENV.carabaoDark);
  g.set(9, 4, 1, 0xd9d0c0).set(9, 4, 5, 0xd9d0c0).set(8, 5, 0, 0xd9d0c0).set(8, 5, 6, 0xd9d0c0);
  g.set(9, 3, 2, ENV.pipDark).set(9, 3, 4, ENV.pipDark);
  g.box(1, 2, 3, 1, 4, 3, ENV.carabaoDark);
  return g;
}

/** Banana plant: short trunk under broad drooping leaves. */
export function bananaModel(seed = 0): VoxelGrid {
  const g = new VoxelGrid(11, 13, 11);
  g.box(5, 0, 5, 5, 6, 5, (_x, y) => (y % 2 ? ENV.leafDark : ENV.trunk));
  const dirs: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
  ];
  dirs.forEach(([dx, dz], i) => {
    if ((i + seed) % 5 === 4) return;
    for (let k = 1; k <= 5; k++) {
      const y = 9 + (k <= 2 ? k : 4 - k);
      const c = k % 2 ? ENV.banana : ENV.leaf;
      g.set(5 + dx * k, y, 5 + dz * k, c);
      if (dz === 0) g.set(5 + dx * k, y, 5 + 1, c);
      else if (dx === 0) g.set(5 + 1, y, 5 + dz * k, c);
    }
  });
  g.box(5, 7, 5, 5, 9, 5, ENV.leaf);
  g.set(6, 6, 5, ENV.gold).set(6, 5, 5, ENV.gold); // bunch
  return g;
}

/** Clump of bamboo. */
export function bambooClumpModel(seed = 0): VoxelGrid {
  const g = new VoxelGrid(9, 22, 9);
  const stalks: Array<[number, number, number]> = [
    [3, 3, 19],
    [5, 4, 21],
    [4, 6, 16],
    [6, 2, 17],
    [2, 5, 14],
  ];
  stalks.forEach(([x, z, h], i) => {
    const hh = h - ((i + seed) % 3);
    for (let y = 0; y < hh; y++) g.set(x, y, z, y % 4 === 3 ? ENV.bambooDark : ENV.bamboo);
    for (let y = hh - 6; y < hh; y += 2) {
      g.set(x + 1, y, z, ENV.leaf)
        .set(x - 1, y + 1, z, ENV.leafDark)
        .set(x, y, z + 1, ENV.leaf);
    }
    g.set(x, hh, z, ENV.leaf);
  });
  return g;
}
