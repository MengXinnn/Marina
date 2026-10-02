import type { ThreeElements } from '@react-three/fiber';
import type { VoxelGrid, MeshOptions } from './voxel';
import { useVoxelGeometry } from './useVoxel';
import { voxelMaterial } from './materials';

type Props = Omit<ThreeElements['mesh'], 'geometry' | 'material'> & {
  /** Cache key — must uniquely identify the model + options. */
  model: string;
  build: () => VoxelGrid;
  options?: MeshOptions;
};

export function VoxelMesh({ model, build, options, ...mesh }: Props) {
  const geometry = useVoxelGeometry(model, build, options);
  return <mesh geometry={geometry} material={voxelMaterial} castShadow receiveShadow {...mesh} />;
}
