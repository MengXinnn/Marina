import type { RouteIndex } from '@manila/engine';
import { Board } from './Board';
import { LANE_Z, spaceX } from './layout';
import { voxelMaterial } from './materials';
import { tileModel } from './models';
import { Scenery } from './Scenery';
import { getTerrain } from './terrain';
import { VoxelMesh } from './VoxelMesh';
import { Water } from './Water';

/** The whole diorama: terrain, water, route markers, scenery and the live game pieces. */
export function Harbor() {
  const terrain = getTerrain();
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
      <Scenery />
      <Board />
    </group>
  );
}
