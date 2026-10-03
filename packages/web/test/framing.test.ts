import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { frameView, playAreaPoints } from '../src/scene/framing';

/** Project a world point with an orthographic camera (CSS px from the canvas' top-left). */
function toScreen(p: THREE.Vector3, target: THREE.Vector3, dir: THREE.Vector3, zoom: number) {
  const cam = new THREE.OrthographicCamera(-640, 640, 360, -360, -100, 300);
  cam.zoom = zoom;
  cam.position.copy(target).addScaledVector(dir, 40);
  cam.lookAt(target);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const ndc = p.clone().project(cam);
  return { x: (ndc.x + 1) * 640, y: (1 - ndc.y) * 360 };
}

describe('scene framing', () => {
  it('fits every play-area point inside the part of the window the HUD leaves open', () => {
    const dir = new THREE.Vector3(-9, 27, 29).normalize();
    const free = { left: 220, top: 76, right: 1280, bottom: 640 };
    const points = playAreaPoints();
    const { target, zoom } = frameView(dir, points, 1280, 720, free, 0.55);
    expect(target.y).toBeCloseTo(0.55);
    for (const p of points) {
      const s = toScreen(p, target, dir, zoom);
      expect(s.x).toBeGreaterThanOrEqual(free.left - 0.5);
      expect(s.x).toBeLessThanOrEqual(free.right + 0.5);
      expect(s.y).toBeGreaterThanOrEqual(free.top - 0.5);
      expect(s.y).toBeLessThanOrEqual(free.bottom + 0.5);
    }
  });
});
