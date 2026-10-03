import type { ThreeElements } from '@react-three/fiber';
import { WARES } from '@manila/engine';
import { ENV, WARE_COLORS } from './palette';
import {
  HARBOR_OFFICE,
  INSURANCE_OFFICE,
  PILOT_BOAT,
  PILOT_ISLAND,
  PIRATE_SHIP,
  SHIPYARD_SLIP,
  WAREHOUSE,
  CRATE,
} from './layout';
import {
  barrelModel,
  bollardModel,
  churchModel,
  crateModel,
  craneModel,
  houseModel,
  lighthouseModel,
  palmModel,
  pirateShipModel,
  rowboatModel,
  slipwayModel,
  warehouseModel,
} from './models';
import { surfaceY } from './terrain';
import { VoxelMesh } from './VoxelMesh';

type GroupProps = ThreeElements['group'];

/** Place a prop on the terrain surface at (x, z). */
function OnGround({ x, z, children, ...group }: { x: number; z: number } & GroupProps) {
  return (
    <group position={[x, surfaceY(x, z), z]} {...group}>
      {children}
    </group>
  );
}

const HOUSES: Array<[x: number, z: number, w: number, d: number, floors: number, roof: number]> = [
  [23.4, -7.6, 12, 10, 1, ENV.roof],
  [23.2, -5.6, 10, 9, 2, ENV.roofDark],
  [25.4, -7.2, 14, 10, 2, ENV.roof],
  [28.3, -6.4, 12, 12, 1, ENV.roof],
  [23.6, 2.8, 12, 10, 2, ENV.roof],
  [23.4, 5.4, 10, 9, 1, ENV.roofDark],
  [25.8, 4.0, 14, 10, 1, ENV.roof],
  [28.6, 1.6, 12, 12, 2, ENV.roofDark],
  [28.2, 5.6, 10, 10, 1, ENV.roof],
  [30.6, -2.4, 12, 10, 2, ENV.roof],
  [23.2, -2.6, 9, 8, 1, ENV.roofGreen],
];

const PALMS: Array<[number, number]> = [
  [21.7, -4.6],
  [21.8, 5.6],
  [22.4, 7.4],
  [-2.8, -6.6],
  [-6.6, 6.2],
  [-3.0, 7.2],
  [-7.4, -1.6],
  [3.2, 8.4],
  [18.6, 8.6],
  [6.8, -7.9],
  [27.0, 8.6],
  [-8.6, 3.0],
];

export function Scenery() {
  return (
    <group>
      {/* ── Manila ── */}
      <OnGround x={26.4} z={-1.6}>
        <VoxelMesh model="church" build={churchModel} />
      </OnGround>
      {HOUSES.map(([x, z, w, d, floors, roof], i) => (
        <OnGround key={i} x={x} z={z}>
          <VoxelMesh model={`house-${i}`} build={() => houseModel(w, d, floors, roof, i)} />
        </OnGround>
      ))}
      {[-4.2, -1.3, 1.3, 3.8].map((z) => (
        <OnGround key={z} x={20.45} z={z}>
          <VoxelMesh model="bollard" build={bollardModel} />
        </OnGround>
      ))}
      {PALMS.map(([x, z], i) => (
        <OnGround key={i} x={x} z={z}>
          <VoxelMesh model={`palm-${i % 2}`} build={() => palmModel(i)} />
        </OnGround>
      ))}

      {/* ── West harbour: harbour master's office, warehouse ── */}
      <OnGround x={WAREHOUSE[0]} z={WAREHOUSE[1]} rotation-y={Math.PI / 2}>
        <VoxelMesh model="warehouse" build={warehouseModel} />
      </OnGround>
      {WARES.map((w, i) => (
        <OnGround key={w} x={CRATE(i)[0]} z={CRATE(i)[1]}>
          <VoxelMesh
            model={`crate-${w}`}
            build={() => crateModel(WARE_COLORS[w].main, WARE_COLORS[w].dark)}
          />
        </OnGround>
      ))}
      <OnGround x={-3.1} z={1.6}>
        <VoxelMesh model="barrel" build={barrelModel} />
      </OnGround>
      <OnGround x={INSURANCE_OFFICE[0]} z={INSURANCE_OFFICE[1]}>
        <VoxelMesh model="insurance" build={() => houseModel(12, 10, 1, ENV.roofGreen, 3)} />
      </OnGround>

      {/* ── Shipyard ── */}
      {(['A', 'B', 'C'] as const).map((slot) => (
        <group
          key={slot}
          position={[SHIPYARD_SLIP[slot][0], 0.08, SHIPYARD_SLIP[slot][1]]}
          rotation-x={-0.07}
        >
          <VoxelMesh model={`slip-${slot}`} build={() => slipwayModel(slot)} receiveShadow />
        </group>
      ))}
      <OnGround x={16.8} z={7.4}>
        <VoxelMesh model="crane" build={craneModel} />
      </OnGround>
      <OnGround x={6.4} z={7.8}>
        <VoxelMesh model="barrel" build={barrelModel} />
      </OnGround>

      {/* ── Pirate ship ── */}
      <PirateShipHull />

      {/* ── Pilot island ── */}
      <OnGround x={PILOT_ISLAND[0] + 0.3} z={PILOT_ISLAND[1] - 0.2}>
        <VoxelMesh model="lighthouse" build={lighthouseModel} />
      </OnGround>
      <group position={[PILOT_BOAT.small[0], -0.08, PILOT_BOAT.small[1]]}>
        <VoxelMesh model="pilot-small" build={() => rowboatModel(10, 5, false)} />
      </group>
      <group position={[PILOT_BOAT.large[0], -0.08, PILOT_BOAT.large[1]]}>
        <VoxelMesh model="pilot-large" build={() => rowboatModel(14, 6, true)} />
      </group>

      <OnGround x={HARBOR_OFFICE[0] - 1.6} z={HARBOR_OFFICE[1] - 1.2}>
        <VoxelMesh model="house-west" build={() => houseModel(12, 10, 1, ENV.roof, 7)} />
      </OnGround>
    </group>
  );
}

/** The ship body; its two accomplice stands are rendered by Board as children of the same transform. */
export function PirateShipHull() {
  return (
    <group position={[PIRATE_SHIP[0], -0.2, PIRATE_SHIP[1]]} rotation-y={-Math.PI / 2}>
      <VoxelMesh model="pirate-ship" build={pirateShipModel} />
    </group>
  );
}
