import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { ENV } from './palette';
import { TERRAIN_BOUNDS } from './terrain';
import { shadowCatcherMaterial } from './materials';

const vertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// Stepped (posterised) colours so the water reads as pixel art after the low-res upscale.
const fragment = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uShore;
  uniform vec4 uBounds;
  uniform vec3 uDeep;
  uniform vec3 uSea;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  varying vec3 vWorld;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    vec2 uv = (vWorld.xz - uBounds.xy) / uBounds.zw;
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    float shore = mix(1.0, texture2D(uShore, uv).r, inside); // 0 = coast, 1 = open sea

    float w = sin(vWorld.x * 0.9 + uTime * 0.7) + sin(vWorld.z * 1.3 - uTime * 0.9)
            + sin((vWorld.x - vWorld.z) * 0.55 + uTime * 0.4);
    w = w / 6.0 + 0.5;
    float band = floor(w * 3.0) / 3.0;

    float depth = smoothstep(0.05, 0.6, shore);
    vec3 col = mix(uShallow, uSea, floor(depth * 3.0) / 3.0);
    col = mix(col, uDeep, smoothstep(0.75, 1.0, shore) * 0.6);
    col *= 0.94 + band * 0.12;

    // Shore foam ring that breathes in and out.
    float ring = 0.07 + 0.03 * sin(uTime * 1.6 + vWorld.x * 1.7 + vWorld.z * 1.1);
    float foam = 1.0 - step(0.03, abs(shore - ring));
    foam = max(foam, 1.0 - step(0.035, shore));
    col = mix(col, uFoam, foam * 0.85);

    // Sparse twinkling glints on a coarse grid.
    vec2 cell = floor(vWorld.xz * 3.0);
    float g = step(0.985, hash(cell)) * step(0.6, sin(uTime * 2.3 + hash(cell + 7.0) * 40.0));
    col = mix(col, uFoam, g * 0.7 * depth);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function Water({ shoreTexture }: { shoreTexture: THREE.Texture }) {
  const material = useMemo(() => {
    const { minX, maxX, minZ, maxZ } = TERRAIN_BOUNDS;
    const lin = (hex: number) => new THREE.Color(hex);
    return new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uTime: { value: 0 },
        uShore: { value: shoreTexture },
        uBounds: { value: new THREE.Vector4(minX, minZ, maxX - minX, maxZ - minZ) },
        uDeep: { value: lin(ENV.seaDeep) },
        uSea: { value: lin(ENV.sea) },
        uShallow: { value: lin(ENV.seaShallow) },
        uFoam: { value: lin(ENV.foam) },
      },
    });
  }, [shoreTexture]);

  useFrame((_, dt) => {
    material.uniforms.uTime!.value += dt;
  });

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} material={material}>
        <planeGeometry args={[220, 220]} />
      </mesh>
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={0.005}
        material={shadowCatcherMaterial}
        receiveShadow
      >
        <planeGeometry args={[80, 60]} />
      </mesh>
    </group>
  );
}
