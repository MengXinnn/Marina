import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useGame } from '../game/store';
import { frameView, freeRectFromHud, playAreaPoints } from './framing';
import { CAMERA_TARGET, GROUND_Y } from './layout';

const INTRO_S = 1.8;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Camera moods: a slow sweep around the bay behind the setup screen, and a short glide to the
 * game view when a game starts. The game view is framed so every place a player acts on sits
 * in the part of the window the HUD panels leave open (the harbour office and warehouse used
 * to hide behind the player list). After the glide the player's orbit controls own it.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const size = useThree((s) => s.size);
  /** Camera position relative to its target in the home view (fixed direction and distance). */
  const offset = useRef<THREE.Vector3 | null>(null);
  /** Zoom the canvas started with; orbit controls allow 0.6–3× of it. */
  const baseZoom = useRef(0);
  const mode = useRef<{
    kind: 'idle' | 'intro' | 'free';
    t: number;
    from: number;
    zoomFrom: number;
    targetFrom: THREE.Vector3;
    goal: { target: THREE.Vector3; zoom: number } | null;
  }>({
    kind: 'free',
    t: 0,
    from: 0,
    zoomFrom: 1,
    targetFrom: new THREE.Vector3(...CAMERA_TARGET),
    goal: null,
  });
  const angle = useRef(0);
  const target = useRef(new THREE.Vector3(...CAMERA_TARGET));
  const points = useRef<THREE.Vector3[] | null>(null);

  useFrame(({ clock }, dt) => {
    if (!offset.current) {
      offset.current = camera.position.clone().sub(target.current);
      baseZoom.current = camera.zoom;
    }
    const m = mode.current;
    const screen = useGame.getState().screen;
    const start = () => ({
      t: 0,
      zoomFrom: camera.zoom,
      // Start from wherever the player panned to.
      targetFrom: (controls?.target ?? target.current).clone(),
    });
    if (screen === 'setup' && m.kind !== 'idle') Object.assign(m, { kind: 'idle', ...start() });
    if (screen === 'game' && m.kind === 'idle')
      Object.assign(m, { kind: 'intro', from: angle.current, goal: null, ...start() });
    if (m.kind === 'free') return;

    if (m.kind === 'intro' && !m.goal) {
      // The HUD mounts with the game screen; frame once its panels are laid out.
      if (!document.querySelector('.players')) return;
      points.current ??= playAreaPoints();
      const dir = offset.current.clone().normalize();
      const free = freeRectFromHud(size.width, size.height);
      const fit = frameView(dir, points.current, size.width, size.height, free, GROUND_Y);
      m.goal = {
        target: fit.target,
        zoom: THREE.MathUtils.clamp(fit.zoom, baseZoom.current * 0.6, baseZoom.current * 3),
      };
    }

    m.t += dt;
    let a: number;
    let zoom: number;
    if (m.kind === 'idle') {
      // Ease into the sweep so leaving a game does not snap the view.
      const blend = Math.min(1, m.t / 1.5);
      a = Math.sin(clock.elapsedTime * 0.11) * 0.32 * blend;
      zoom = m.zoomFrom + (baseZoom.current * 0.9 - m.zoomFrom) * blend;
      target.current.lerpVectors(m.targetFrom, new THREE.Vector3(...CAMERA_TARGET), blend);
    } else {
      const k = ease(Math.min(1, m.t / INTRO_S));
      a = m.from * (1 - k);
      zoom = m.zoomFrom + (m.goal!.zoom - m.zoomFrom) * k;
      target.current.lerpVectors(m.targetFrom, m.goal!.target, k);
      if (k >= 1) m.kind = 'free';
    }
    angle.current = a;
    camera.position
      .copy(target.current)
      .add(offset.current.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, a));
    camera.lookAt(target.current);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    controls?.target.copy(target.current);
  });
  return null;
}
