import { Canvas } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import { CAMERA_TARGET } from './layout';
import { Harbor } from './Harbor';

/** Render height in "art pixels"; the canvas is upscaled with nearest-neighbour for the pixel look. */
const TARGET_PIXEL_HEIGHT = 400;

function usePixelRatio(): number {
  const [h, setH] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return Math.min(1, TARGET_PIXEL_HEIGHT / h);
}

export function GameCanvas() {
  const dpr = usePixelRatio();
  const [tx, ty, tz] = CAMERA_TARGET;
  const zoom = useMemo(() => Math.max(18, window.innerWidth / 34), []);
  return (
    <Canvas dpr={dpr} shadows gl={{ antialias: false }} style={{ position: 'fixed', inset: 0 }}>
      <color attach="background" args={['#0f4c6e']} />
      <OrthographicCamera
        makeDefault
        position={[tx - 9, 27, tz + 29]}
        zoom={zoom}
        near={-100}
        far={300}
      />
      <OrbitControls
        target={CAMERA_TARGET}
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
