import { Canvas } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import { CAMERA_TARGET } from './layout';
import { Harbor } from './Harbor';

/**
 * Render at the display's native resolution (capped at 2× to keep fill-rate sane on
 * high-DPI phones) with MSAA on. The voxel look comes from the geometry itself; the
 * previous low-res nearest-neighbour upscale only added stair-stepped edges.
 */
const MAX_DPR = 2;

function usePixelRatio(): number {
  const [dpr, setDpr] = useState(() => Math.min(MAX_DPR, window.devicePixelRatio || 1));
  useEffect(() => {
    // devicePixelRatio changes with browser zoom or when moving to another monitor.
    const onResize = () => setDpr(Math.min(MAX_DPR, window.devicePixelRatio || 1));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return dpr;
}

export function GameCanvas() {
  const dpr = usePixelRatio();
  const [tx, ty, tz] = CAMERA_TARGET;
  const zoom = useMemo(
    () => Math.max(20, Math.min(window.innerWidth / 26, window.innerHeight / 16.5)),
    [],
  );
  return (
    <Canvas dpr={dpr} shadows gl={{ antialias: true }} style={{ position: 'fixed', inset: 0 }}>
      <color attach="background" args={['#0f4c6e']} />
      <OrthographicCamera
        makeDefault
        position={[tx - 9, 27, tz + 29]}
        zoom={zoom}
        near={-100}
        far={300}
      />
      <OrbitControls
        makeDefault
        // No target prop: CameraRig owns the target (a re-render would snap it back).
        enableDamping
        minZoom={zoom * 0.6}
        maxZoom={zoom * 3}
        minPolarAngle={0.35}
        maxPolarAngle={1.05}
        minAzimuthAngle={-0.9}
        maxAzimuthAngle={0.5}
      />
      <hemisphereLight args={[0xcdeeff, 0xd9b874, 1.4]} />
      <directionalLight
        position={[tx - 10, ty + 22, tz + 12]}
        intensity={2.6}
        color={0xfff0d6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-bias={-0.0005}
      >
        <object3D attach="target" position={CAMERA_TARGET} />
      </directionalLight>
      <Harbor />
    </Canvas>
  );
}
