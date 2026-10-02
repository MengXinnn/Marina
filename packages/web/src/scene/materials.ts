import * as THREE from 'three';

/** Shared material for all voxel meshes (colours + AO live in vertex colours). */
export const voxelMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

/** Transparent plane that only shows shadows — lets the custom water shader receive shadows. */
export const shadowCatcherMaterial = new THREE.ShadowMaterial({ opacity: 0.22, color: 0x06263a });
