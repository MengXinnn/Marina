import { useMemo } from 'react';
import type * as THREE from 'three';
import type { VoxelGrid, MeshOptions } from './voxel';
import { buildVoxelGeometry } from './voxel';

const cache = new Map<string, THREE.BufferGeometry>();

/**
 * Build (once) and cache a voxel geometry by key. Geometries are shared between meshes and
 * live for the whole session, so never dispose them from a component.
 */
export function getVoxelGeometry(
  key: string,
  build: () => VoxelGrid,
  opts?: MeshOptions,
): THREE.BufferGeometry {
  let geo = cache.get(key);
  if (!geo) {
    geo = buildVoxelGeometry(build(), opts);
    cache.set(key, geo);
  }
  return geo;
}

export function useVoxelGeometry(
  key: string,
  build: () => VoxelGrid,
  opts?: MeshOptions,
): THREE.BufferGeometry {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getVoxelGeometry(key, build, opts), [key]);
}
