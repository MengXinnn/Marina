import * as THREE from 'three';
import {
  GROUND_Y,
  HARBOR_OFFICE,
  INSURANCE_STAND,
  LANE_Z,
  PILOT_BOAT,
  PILOT_ISLAND,
  PIRATE_SHIP,
  PORT_STAND,
  SHIPYARD_STAND,
  WAREHOUSE,
  spaceX,
} from './layout';

/** Screen rectangle (CSS px, from the canvas' top-left) that no HUD panel covers. */
export interface FreeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Everything a player acts on, so the opening view shows all of it: harbour office and
 * warehouse (west), the routes, pilot boats and pirate ship (north), port (east), shipyard
 * and insurance (south). Tall pieces get a second point at their top.
 */
export function playAreaPoints(): THREE.Vector3[] {
  const g = (x: number, z: number, h = 0.6) => [
    new THREE.Vector3(x, GROUND_Y, z),
    new THREE.Vector3(x, GROUND_Y + h, z),
  ];
  return [
    ...g(HARBOR_OFFICE[0], HARBOR_OFFICE[1], 3.6),
    ...g(WAREHOUSE[0], WAREHOUSE[1], 1.8),
    // Stands carry a payout sign about a unit to their side.
    ...g(INSURANCE_STAND[0] - 1.6, INSURANCE_STAND[1], 2.4),
    ...g(PILOT_ISLAND[0], PILOT_ISLAND[1]),
    ...Object.values(PILOT_BOAT).flatMap(([x, z]) => g(x, z)),
    ...g(PIRATE_SHIP[0], PIRATE_SHIP[1], 2.4),
    ...Object.values(PORT_STAND).flatMap(([x, z]) => g(x + 1.6, z, 2.4)),
    ...Object.values(SHIPYARD_STAND).flatMap(([x, z]) => g(x + 1.6, z, 2.4)),
    ...Object.values(LANE_Z).flatMap((z) => [...g(spaceX(0), z), ...g(spaceX(13), z)]),
  ];
}

/**
 * Where an orthographic camera looking along `dir` (target → camera, unit length) must aim,
 * and how far it must zoom (CSS px per world unit), so that `points` fill `free` on a
 * `width` × `height` canvas. The target stays on the plane y = `groundY`, so orbiting
 * afterwards still turns around the bay rather than a point in the air.
 */
export function frameView(
  dir: THREE.Vector3,
  points: THREE.Vector3[],
  width: number,
  height: number,
  free: FreeRect,
  groundY = 0,
  margin = 0.94,
): { target: THREE.Vector3; zoom: number } {
  // Same basis as Object3D.lookAt with world-up Y: z = dir, x = up × z, y = z × x.
  const z = dir.clone().normalize();
  const x = new THREE.Vector3().crossVectors(THREE.Object3D.DEFAULT_UP, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  let minR = Infinity;
  let maxR = -Infinity;
  let minU = Infinity;
  let maxU = -Infinity;
  for (const p of points) {
    const r = p.dot(x);
    const u = p.dot(y);
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
  }
  const availW = Math.max(1, free.right - free.left);
  const availH = Math.max(1, free.bottom - free.top);
  const zoom = margin * Math.min(availW / (maxR - minR), availH / (maxU - minU));
  // Offset (px, y up) of the free rectangle's centre from the canvas centre.
  const dx = (free.left + free.right) / 2 - width / 2;
  const dy = height / 2 - (free.top + free.bottom) / 2;
  const r = (minR + maxR) / 2 - dx / zoom;
  const u = (minU + maxU) / 2 - dy / zoom;
  const target = x.multiplyScalar(r).add(y.multiplyScalar(u));
  // Sliding along the view direction does not change an orthographic image.
  target.addScaledVector(z, (groundY - target.y) / z.y);
  return { target, zoom };
}

/** The part of the window the HUD leaves open (layout boxes, so slide-in animations don't skew it). */
export function freeRectFromHud(width: number, height: number): FreeRect {
  const box = (sel: string) => document.querySelector<HTMLElement>(sel);
  const players = box('.players');
  const topbar = box('.topbar');
  const actionbar = box('.actionbar');
  const free: FreeRect = { left: 0, top: 0, right: width, bottom: height };
  if (players) free.left = players.offsetLeft + players.offsetWidth + 8;
  if (topbar) free.top = topbar.offsetTop + topbar.offsetHeight + 4;
  if (actionbar) free.bottom = actionbar.offsetTop - 4;
  // On narrow screens the panels cover too much to frame around; use the whole canvas.
  if (free.right - free.left < width * 0.55) Object.assign(free, { left: 0, right: width });
  if (free.bottom - free.top < height * 0.5) Object.assign(free, { top: 0, bottom: height });
  return free;
}
