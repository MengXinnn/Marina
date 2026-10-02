import { useMemo } from 'react';
import type { RouteIndex } from '@manila/engine';
import { LANE_Z, spaceX } from './layout';
import { tileModel } from './models';
import { buildTerrain } from './terrain';
import { VoxelMesh } from './VoxelMesh';
import { Water } from './Water';
import { voxelMaterial } from './materials';

/** Static harbour: terrain, water and the three sea routes. Pieces are added in Board.tsx. */
export function Harbor() {
  const terrain = useMemo(() => buildTerrain(), []);
  return (
    <group>
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
    </group>
  );
}
