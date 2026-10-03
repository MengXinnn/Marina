import type { DockSlot, PilotSize, PirateRole, RouteIndex } from '@manila/engine';

/**
 * World layout — every scene position lives here so components, animations and
 * click targets agree. Units: 1 = one board "tile". Water surface is y = 0.
 *
 *            north (−z)   pirate ship · pilot island
 *   west  ┌──────────────────────────────────────────┐  east
 *  harbor │ 0 1 2 3 4 5 … 13 ═► quay A/B/C │ MANILA  │
 *  office │ 0 1 2 3 4 5 … 13 ═►            │  city   │
 *         │ 0 1 2 3 4 5 … 13 ═►            │         │
 *         └──── shipyard slipways A/B/C ─────────────┘
 *            south (+z, towards the camera)
 */

/** World size of one prop voxel (boats, people, buildings). */
export const PROP_VOXEL = 0.1;
/** World size of one terrain voxel. */
export const TERRAIN_VOXEL = 0.25;
/** Terrain layers: wet sand tops at 0.05, beach sand at 0.30, grass / quay at 0.55. */
export const TERRAIN_BASE_Y = -0.2;
export const SAND_Y = 0.3;
/** Height of the inland surface (grass, quay, city). */
export const GROUND_Y = 0.55;
/** Hull offset of floating boats (keel sits below the water line). */
export const PUNT_FLOAT_Y = -0.12;

/** Game pieces are drawn a bit larger than the scenery so they stay readable. */
export const PIECE_SCALE = { punt: 1.35, stand: 1.3, sign: 1.6 } as const;

export const SPACE_STEP = 1.25;
export const LANE_Z: Record<RouteIndex, number> = { 0: -2.5, 1: 0, 2: 2.5 };

/** x of route space i (0..13). Space 14 = "past 13" (arrived). */
export const spaceX = (i: number): number => i * SPACE_STEP;

/** Coastlines (used by terrain generation). */
export const WEST_SHORE_X = -1.7;
export const QUAY_X = 20.2;
export const SOUTH_SHORE_Z = 5.6;

export const PORT_BERTH: Record<DockSlot, [number, number]> = {
  A: [19.1, -2.5],
  B: [19.1, 0],
  C: [19.1, 2.5],
};
/** Accomplice stand for each port slot, on the quay next to its berth. */
export const PORT_STAND: Record<DockSlot, [number, number]> = {
  A: [20.85, -1.55],
  B: [20.85, 0.95],
  C: [20.85, 3.45],
};

export const SHIPYARD_SLIP: Record<DockSlot, [number, number]> = {
  A: [8.0, 6.8],
  B: [11.0, 6.8],
  C: [14.0, 6.8],
};
/** Water channel south of the routes that punts follow to reach the shipyard. */
export const SHIPYARD_CHANNEL_Z = 4.4;
export const SHIPYARD_STAND: Record<DockSlot, [number, number]> = {
  A: [9.25, 7.6],
  B: [12.25, 7.6],
  C: [15.25, 7.6],
};

export const PIRATE_SHIP: [number, number] = [16.2, -6.6];
/** Stand positions relative to the pirate ship origin (captain at the bow). */
export const PIRATE_STAND: Record<PirateRole, [number, number, number]> = {
  captain: [0, 1.0, 0.75],
  crew: [0, 1.0, -0.35],
};

export const PILOT_ISLAND: [number, number] = [7.4, -7.4];
export const PILOT_BOAT: Record<PilotSize, [number, number]> = {
  small: [5.9, -5.1],
  large: [8.7, -5.1],
};

export const INSURANCE_OFFICE: [number, number] = [-4.4, 3.6];
export const INSURANCE_STAND: [number, number] = [-2.6, 4.4];
export const HARBOR_OFFICE: [number, number] = [-4.6, -3.4];
export const WAREHOUSE: [number, number] = [-4.2, 0.2];

/** Ware crates outside the warehouse, in WARES order. */
export const CRATE = (i: number): [number, number] => [-2.7, -1.0 + i * 0.55];

/** Anchor of the in-scene notice board used before the punts are loaded (auction, shares). */
export const WORLD_PANEL: [number, number, number] = [6.9, 1.2, 0.4];

export const CAMERA_TARGET: [number, number, number] = [10.2, 0, -1.0];
