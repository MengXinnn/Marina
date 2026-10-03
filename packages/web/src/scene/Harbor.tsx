import { useMemo } from 'react';
import type { RouteIndex } from '@manila/engine';
import { Ambient } from './Ambient';
import { Board } from './Board';
import { CameraRig } from './CameraRig';
import { Effects, Shake } from './Effects';
import { LANE_Z, spaceX } from './layout';
import { voxelMaterial } from './materials';
import { tileModel } from './models';
import { ParticlePool } from './particles';
import { Scenery } from './Scenery';
import { getTerrain } from './terrain';
import { VoxelMesh } from './VoxelMesh';
import { Water } from './Water';

/** The whole diorama: terrain, water, route markers, scenery and the live game pieces. */
export function Harbor() {
  const terrain = getTerrain();
  const particles = useMemo(() => new ParticlePool(), []);
  return (
    <Shake>
      <CameraRig />
      <Water shoreTexture={terrain.shoreTexture} />
      <mesh geometry={terrain.geometry} material={voxelMaterial} receiveShadow castShadow />
      {([0, 1, 2] as RouteIndex[]).map((route) =>
        Array.from({ length: 14 }, (_, n) => (
          <VoxelMesh
            key={`${route}-${n}`}
            model={`tile-${n}`}
            build={() => tileModel(n)}
            position={[spaceX(n), -0.1, LANE_Z[route]]}
          />
        )),
      )}
      <Scenery />
      <Board />
      <Ambient pool={particles} />
      <Effects pool={particles} />
    </Shake>
  );
}
