import type { ThreeElements } from '@react-three/fiber';
import { WARES } from '@manila/engine';
import { ENV, WARE_COLORS } from './palette';
import {
  ADUANA,
  CHURCH,
  CRATE,
  FORT,
  HARBOR_OFFICE,
  HULL_FRAME,
  INSURANCE_OFFICE,
  PILOT_BOAT,
  PILOT_ISLAND,
  PIRATE_SHIP,
  PLAZA_FOUNTAIN,
  PORT_PIERS_Z,
  SHIPWRIGHT_SHED,
  SHIPYARD_SLIP,
  WAREHOUSE,
  WEST_WHARF,
} from './layout';
import {
  barrelModel,
  bollardModel,
  crateModel,
  craneModel,
  lighthouseModel,
  palmModel,
  pirateShipModel,
  rowboatModel,
  slipwayModel,
  warehouseModel,
} from './models';
import {
  aduanaModel,
  anchorModel,
  bahayNaBatoModel,
  bambooClumpModel,
  bananaModel,
  bancaModel,
  binondoHouseModel,
  carabaoModel,
  churchModel,
  fortModel,
  fountainModel,
  hullFrameModel,
  lampPostModel,
  nipaHutModel,
  pierModel,
  ropeCoilModel,
  sackPileModel,
  shedModel,
  tarPotModel,
  timberStackModel,
} from './landmarks';
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

/** Rotation that turns a model's front (+z) towards the sea in the west (−x). */
const FACE_WEST = -Math.PI / 2;
const FACE_EAST = Math.PI / 2;

/** Manila's bahay na bato houses: x, z, w, d, roof colour, rotation. */
const HOUSES: Array<[x: number, z: number, w: number, d: number, roof: number, ry: number]> = [
  // waterfront row facing the quay
  [23.65, -3.55, 14, 10, ENV.roof, FACE_WEST],
  [23.65, -1.45, 12, 10, ENV.roofDark, FACE_WEST],
  [23.65, 0.55, 12, 11, ENV.roof, FACE_WEST],
  // around the plaza and the church
  [25.25, -3.1, 10, 12, ENV.roofDark, 0],
  [30.2, -2.7, 12, 10, ENV.roof, FACE_WEST],
  [30.3, -0.2, 10, 10, ENV.roofDark, FACE_WEST],
  [30.2, 2.3, 12, 10, ENV.roof, FACE_WEST],
  [26.2, 3.3, 12, 10, ENV.roof, 0],
  [28.5, 3.5, 12, 11, ENV.roofDark, 0],
  // north blocks behind the fort
  [25.6, -5.7, 12, 10, ENV.roof, 0],
  [27.9, -5.6, 14, 10, ENV.roofDark, 0],
  [30.2, -5.2, 10, 12, ENV.roof, 0],
  [26.0, -7.9, 12, 10, ENV.roofDark, 0],
  [28.4, -7.8, 12, 10, ENV.roof, 0],
  [30.6, -7.6, 10, 10, ENV.roofDark, 0],
  // south blocks
  [23.9, 6.5, 10, 10, ENV.roof, 0],
  [25.9, 6.1, 12, 10, ENV.roofDark, 0],
  [28.2, 6.2, 12, 10, ENV.roof, 0],
  [30.4, 5.2, 10, 12, ENV.roof, FACE_WEST],
];

const PALMS: Array<[number, number]> = [
  [21.5, 6.0],
  [22.2, 7.8],
  [26.0, 1.3],
  [28.8, 1.3],
  [-2.8, -6.6],
  [-6.6, 6.2],
  [-3.2, 7.4],
  [-7.4, -1.6],
  [4.0, 9.8],
  [6.8, -7.9],
  [-8.6, 3.0],
  [20.8, -8.4],
];

const NIPA_HUTS: Array<[number, number, number]> = [
  [1.4, 8.4, 0.3],
  [-1.4, 9.8, -0.2],
  [-7.0, -5.6, 0.5],
  [19.8, 10.0, -0.3],
];

const QUAY_LAMPS_Z = [-4.25, -0.35, 2.15, 4.85];

export function Scenery() {
  const sack = (w: (typeof WARES)[number]) => () =>
    sackPileModel(WARE_COLORS[w].main, WARE_COLORS[w].dark, WARE_COLORS[w].light);
  return (
    <group>
      {/* ── Manila: fort, church and plaza, customs house, bahay na bato streets ── */}
      <OnGround x={FORT[0]} z={FORT[1]} rotation-y={FACE_WEST}>
        <VoxelMesh model="fort" build={fortModel} />
      </OnGround>
      <OnGround x={CHURCH[0]} z={CHURCH[1]}>
        <VoxelMesh model="church" build={churchModel} />
      </OnGround>
      <OnGround x={PLAZA_FOUNTAIN[0]} z={PLAZA_FOUNTAIN[1]}>
        <VoxelMesh model="fountain" build={fountainModel} />
      </OnGround>
      <OnGround x={ADUANA[0]} z={ADUANA[1]} rotation-y={FACE_WEST}>
        <VoxelMesh model="aduana" build={aduanaModel} />
      </OnGround>
      {HOUSES.map(([x, z, w, d, roof, ry], i) => (
        <OnGround key={i} x={x} z={z} rotation-y={ry}>
          <VoxelMesh model={`bahay-${i}`} build={() => bahayNaBatoModel(w, d, roof, i)} />
        </OnGround>
      ))}

      {/* ── Port quay: finger piers between the berths, bollards, lamps, cargo, quay crane ── */}
      {PORT_PIERS_Z.map((z) => (
        <group key={z} position={[19.2, -0.2, z]}>
          <VoxelMesh model="port-pier" build={() => pierModel(20, 4)} />
        </group>
      ))}
      {[-4.2, -1.3, 1.3, 3.8].map((z) => (
        <OnGround key={z} x={20.45} z={z}>
          <VoxelMesh model="bollard" build={bollardModel} />
        </OnGround>
      ))}
      {QUAY_LAMPS_Z.map((z) => (
        <OnGround key={z} x={22.25} z={z}>
          <VoxelMesh model="lamp-post" build={lampPostModel} />
        </OnGround>
      ))}
      <OnGround x={21.75} z={-3.95} rotation-y={-0.2}>
        <VoxelMesh model="sacks-nutmeg" build={sack('nutmeg')} />
      </OnGround>
      <OnGround x={21.05} z={-3.2} rotation-y={0.3}>
        <VoxelMesh model="sacks-ginseng" build={sack('ginseng')} />
      </OnGround>
      <OnGround x={21.85} z={-0.3} rotation-y={FACE_EAST}>
        <VoxelMesh model="sacks-silk" build={sack('silk')} />
      </OnGround>
      {(
        [
          [21.75, 2.0, 'jade'],
          [22.05, 2.3, 'jade'],
          [21.8, 2.4, 'silk'],
          [21.6, 4.7, 'nutmeg'],
        ] as const
      ).map(([x, z, w], i) => (
        <OnGround key={i} x={x} z={z} rotation-y={i * 0.4}>
          <VoxelMesh
            model={`crate-${w}`}
            build={() => crateModel(WARE_COLORS[w].main, WARE_COLORS[w].dark)}
          />
        </OnGround>
      ))}
      {[
        [21.95, 4.55],
        [21.95, 4.85],
      ].map(([x, z]) => (
        <OnGround key={z} x={x!} z={z!}>
          <VoxelMesh model="barrel" build={barrelModel} />
        </OnGround>
      ))}

      {PALMS.map(([x, z], i) => (
        <OnGround key={i} x={x} z={z}>
          <VoxelMesh model={`palm-${i % 2}`} build={() => palmModel(i)} />
        </OnGround>
      ))}

      {/* ── West wharf: warehouse, loading pier, cargo; Binondo merchant house (insurance) ── */}
      <OnGround x={WAREHOUSE[0]} z={WAREHOUSE[1]}>
        <VoxelMesh model="warehouse" build={warehouseModel} />
      </OnGround>
      <group position={[WEST_WHARF[0], -0.2, WEST_WHARF[1]]} rotation-y={FACE_EAST}>
        <VoxelMesh model="west-wharf" build={() => pierModel(46, 6)} />
      </group>
      <group position={[WEST_WHARF[0], 0.3, WEST_WHARF[1] - 1.6]} rotation-y={FACE_EAST}>
        <VoxelMesh model="sacks-ginseng" build={sack('ginseng')} />
      </group>
      {[1.7, 2.0].map((dz) => (
        <group key={dz} position={[WEST_WHARF[0] + (dz - 1.85) * 0.6, 0.3, WEST_WHARF[1] + dz]}>
          <VoxelMesh model="barrel" build={barrelModel} />
        </group>
      ))}
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
      <OnGround x={-3.3} z={-1.6} rotation-y={0.2}>
        <VoxelMesh model="sacks-nutmeg" build={sack('nutmeg')} />
      </OnGround>
      <OnGround x={INSURANCE_OFFICE[0]} z={INSURANCE_OFFICE[1]}>
        <VoxelMesh model="insurance" build={binondoHouseModel} />
      </OnGround>

      {/* ── Shipyard: slipways, a hull on the stocks, shipwrights' shed, timber and tar ── */}
      {(['A', 'B', 'C'] as const).map((slot) => (
        <group
          key={slot}
          position={[SHIPYARD_SLIP[slot][0], 0.08, SHIPYARD_SLIP[slot][1]]}
          rotation-x={-0.07}
        >
          <VoxelMesh model={`slip-${slot}`} build={() => slipwayModel(slot)} receiveShadow />
        </group>
      ))}
      <OnGround x={HULL_FRAME[0]} z={HULL_FRAME[1]}>
        <VoxelMesh model="hull-frame" build={hullFrameModel} />
      </OnGround>
      <OnGround x={SHIPWRIGHT_SHED[0]} z={SHIPWRIGHT_SHED[1]}>
        <VoxelMesh model="shed" build={shedModel} />
      </OnGround>
      <OnGround x={16.8} z={7.4}>
        <VoxelMesh model="crane" build={craneModel} />
      </OnGround>
      <OnGround x={15.3} z={9.6}>
        <VoxelMesh model="timber" build={timberStackModel} />
      </OnGround>
      <OnGround x={7.9} z={9.7} rotation-y={0.15}>
        <VoxelMesh model="timber" build={timberStackModel} />
      </OnGround>
      <OnGround x={6.6} z={8.9}>
        <VoxelMesh model="tar-pot" build={tarPotModel} />
      </OnGround>
      <OnGround x={18.1} z={8.6} rotation-y={-0.4}>
        <VoxelMesh model="anchor" build={anchorModel} />
      </OnGround>
      {[
        [7.2, 8.15],
        [16.3, 8.35],
      ].map(([x, z]) => (
        <OnGround key={x} x={x!} z={z!}>
          <VoxelMesh model="rope-coil" build={ropeCoilModel} />
        </OnGround>
      ))}
      <OnGround x={6.2} z={8.25}>
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

      {/* ── Countryside: nipa huts, bananas, bamboo, a carabao, outrigger bancas ── */}
      {NIPA_HUTS.map(([x, z, ry], i) => (
        <OnGround key={i} x={x} z={z} rotation-y={ry}>
          <VoxelMesh model={`nipa-${i % 2}`} build={() => nipaHutModel(i)} />
        </OnGround>
      ))}
      <OnGround x={HARBOR_OFFICE[0] - 1.7} z={HARBOR_OFFICE[1] - 1.3} rotation-y={0.4}>
        <VoxelMesh model="nipa-0" build={() => nipaHutModel(0)} />
      </OnGround>
      {(
        [
          [0.1, 7.6],
          [2.2, 9.9],
          [-2.4, 9.0],
          [-6.2, -4.0],
          [20.9, 9.2],
        ] as const
      ).map(([x, z], i) => (
        <OnGround key={i} x={x} z={z}>
          <VoxelMesh model={`banana-${i % 2}`} build={() => bananaModel(i)} />
        </OnGround>
      ))}
      {(
        [
          [-7.8, -3.4],
          [-5.4, 7.4],
          [18.6, 10.4],
        ] as const
      ).map(([x, z], i) => (
        <OnGround key={i} x={x} z={z}>
          <VoxelMesh model={`bamboo-${i}`} build={() => bambooClumpModel(i)} />
        </OnGround>
      ))}
      <OnGround x={3.0} z={9.3} rotation-y={-0.5}>
        <VoxelMesh model="carabao" build={carabaoModel} />
      </OnGround>
      <OnGround x={1.3} z={6.4} rotation-y={0.15}>
        <VoxelMesh model="banca-red" build={() => bancaModel(ENV.flagRed)} />
      </OnGround>
      <group position={[-0.9, -0.1, -5.6]} rotation-y={0.5}>
        <VoxelMesh model="banca-blue" build={() => bancaModel(ENV.window)} />
      </group>
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
