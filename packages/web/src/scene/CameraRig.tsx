import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { useGame } from '../game/store';
import { CAMERA_TARGET } from './layout';

const INTRO_S = 1.8;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Camera moods: a slow sweep around the bay behind the setup screen, and a short glide back
 * to the home view when a game starts. After the glide the player's orbit controls own it.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera);
  const home = useRef<{ offset: THREE.Vector3; zoom: number } | null>(null);
  const mode = useRef<{
    kind: 'idle' | 'intro' | 'free';
    t: number;
    from: number;
    zoomFrom: number;
  }>({ kind: 'free', t: 0, from: 0, zoomFrom: 1 });
  const angle = useRef(0);
  const target = new THREE.Vector3(...CAMERA_TARGET);

  useFrame(({ clock }, dt) => {
    home.current ??= {
      offset: camera.position.clone().sub(target),
      zoom: (camera as THREE.OrthographicCamera).zoom,
    };
    const h = home.current;
    const m = mode.current;
    const screen = useGame.getState().screen;
    if (screen === 'setup' && m.kind !== 'idle') Object.assign(m, { kind: 'idle', t: 0 });
    if (screen === 'game' && m.kind === 'idle')
      Object.assign(m, {
        kind: 'intro',
        t: 0,
        from: angle.current,
        zoomFrom: (camera as THREE.OrthographicCamera).zoom / h.zoom,
      });
    if (m.kind === 'free') return;

    m.t += dt;
    let a: number;
    let z: number;
    if (m.kind === 'idle') {
      // Ease into the sweep so leaving a game does not snap the view.
      const blend = Math.min(1, m.t / 1.5);
      a = Math.sin(clock.elapsedTime * 0.11) * 0.32 * blend;
      z = 1 - 0.1 * blend;
    } else {
      const k = ease(Math.min(1, m.t / INTRO_S));
      a = m.from * (1 - k);
      z = m.zoomFrom + (1 - m.zoomFrom) * k;
      if (k >= 1) m.kind = 'free';
    }
    angle.current = a;
    camera.position.copy(target).add(h.offset.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, a));
    camera.lookAt(target);
    const ortho = camera as THREE.OrthographicCamera;
    ortho.zoom = h.zoom * z;
    ortho.updateProjectionMatrix();
  });
  return null;
}
