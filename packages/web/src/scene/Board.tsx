import { Html } from '@react-three/drei';
import { useMemo, useState } from 'react';
import {
  DOCK_SLOTS,
  INSURANCE_PREMIUM,
  PIRATE_COST,
  PILOT_COST,
  PORT_SLOTS,
  SHIPYARD_SLOTS,
  targetKey,
  type PlacementTarget,
  type PlayerColor,
  type PlayerView,
  type Ware,
} from '@manila/engine';
import { boardingOptions, type BoardAction } from '../game/choices';
import { legalActionsFor, useBotActing, useCurtain, useGame, useView } from '../game/store';
import { zh } from '../i18n/zh';
import type { Spot } from '../i18n/spots';
import {
  CRATE,
  HARBOR_OFFICE,
  LANE_Z,
  INSURANCE_STAND,
  PILOT_BOAT,
  PIRATE_SHIP,
  PORT_STAND,
  SHIPYARD_STAND,
  WAREHOUSE,
  spaceX,
} from './layout';
import { Dice } from './Dice';
import { signModel, towerModel } from './models';
import { ENV, PLAYER_COLORS } from './palette';
import { PIECE_SCALE } from './layout';
import { Punt, Stand, usePick, type Pickable } from './Pieces';
import { SpotTip, WORLD_Z } from './SpotTip';
import { WorldActions } from './WorldActions';
import { surfaceY } from './terrain';
import { VoxelMesh } from './VoxelMesh';

/**
 * Which placement targets the acting player may pick.
 * Live mode asks the engine; mock mode just highlights vacant spots (presentation only).
 */
function useSelectableTargets(view: PlayerView): Set<string> {
  const mode = useGame((s) => s.mode);
  const state = useGame((s) => s.state);
  return useMemo(() => {
    if (view.pending.type !== 'place-accomplice') return new Set();
    if (mode === 'live')
      return new Set(
        legalActionsFor(state, mode).flatMap((a) =>
          a.type === 'place-accomplice' ? [targetKey(a.target)] : [],
        ),
      );
    const keys = new Set<string>();
    for (const p of view.punts)
      if (p.status === 'sailing' && p.seats.some((s) => !s.occupant)) keys.add(`punt:${p.ware}`);
    for (const slot of DOCK_SLOTS) {
      if (!view.port[slot].occupant) keys.add(`port:${slot}`);
      if (!view.shipyard[slot].occupant) keys.add(`shipyard:${slot}`);
    }
    if (!view.pirates.captain || !view.pirates.crew) keys.add('pirate');
    if (!view.pilots.small) keys.add('pilot:small');
    if (!view.pilots.large) keys.add('pilot:large');
    if (!view.insurance) keys.add('insurance');
    return keys;
  }, [mode, state, view]);
}

export function Board() {
  const view = useView();
  const dispatch = useGame((s) => s.dispatch);
  const mode = useGame((s) => s.mode);
  const state = useGame((s) => s.state);
  const playing = useGame((s) => s.playing);
  const curtain = useCurtain();
  const selectableAll = useSelectableTargets(view);
  const botTurn = useBotActing('playerId' in view.pending ? view.pending.playerId : null);
  const inGame = useGame((s) => s.screen === 'game');
  const interactive = inGame && !playing && !curtain && !botTurn;
  const selectable = interactive ? selectableAll : new Set<string>();
  const colors = useMemo(
    () =>
      Object.fromEntries(view.players.map((p) => [p.id, p.color])) as Record<string, PlayerColor>,
    [view.players],
  );
  const colorOf = (id: string | null) => (id ? (colors[id] ?? null) : null);
  const actor = 'playerId' in view.pending ? view.pending.playerId : null;
  const actorColor = actor ? colors[actor] : undefined;
  const pick = (target: PlacementTarget): Pickable => ({
    spot: target,
    selectable: selectable.has(targetKey(target)),
    actorColor,
    hint: selectable.has(targetKey(target)) ? zh.world.clickToPlace : undefined,
    onPick: () => actor && dispatch({ type: 'place-accomplice', playerId: actor, target }),
  });

  // Pirate boarding (R6.2): the candidate punts themselves are the buttons.
  const [boardMenu, setBoardMenu] = useState<{ turn: number; ware: Ware } | null>(null);
  const boarding = useMemo(
    () =>
      interactive && view.pending.type === 'pirate-board'
        ? boardingOptions(view.pending, legalActionsFor(state, mode))
        : [],
    [interactive, view.pending, state, mode],
  );
  const puntPick = (ware: Ware): Pickable => {
    if (view.pending.type !== 'pirate-board') return pick({ kind: 'punt', ware });
    const options = boarding.filter((a) => a.ware === ware);
    return {
      spot: { kind: 'punt', ware },
      selectable: options.length > 0,
      actorColor,
      hint: options.length ? zh.world.clickToBoard : undefined,
      onPick: () =>
        options.length === 1 ? dispatch(options[0]!) : setBoardMenu({ turn: view.turn, ware }),
    };
  };
  const menu = boardMenu?.turn === view.turn ? boardMenu : null;
  const hmColor = colorOf(view.harborMaster) ?? 'white';
  const pirateNext = view.pirates.captain ? 'crew' : 'captain';

  return (
    <group>
      {view.punts.map((p, i) => (
        <Punt
          key={`${view.voyage}-${p.ware}`}
          punt={p}
          colorOf={(id) => colors[id]!}
          bobPhase={i * 1.7}
          scale={PIECE_SCALE.punt}
          {...(p.status === 'sailing'
            ? puntPick(p.ware)
            : { spot: { kind: 'punt', ware: p.ware } })}
        />
      ))}
      <Dice />
      {interactive && actorColor && <WorldActions view={view} actorColor={actorColor} />}
      {menu && interactive && (
        <DisplaceMenu
          view={view}
          ware={menu.ware}
          options={boarding.filter((a) => a.ware === menu.ware)}
          onPick={(a) => dispatch(a)}
        />
      )}
      <InfoSpot spot={{ kind: 'office' }} at={HARBOR_OFFICE} size={[1.8, 3.2, 1.8]} tipY={3.6} />
      <InfoSpot spot={{ kind: 'warehouse' }} at={WAREHOUSE} size={[2.6, 1.8, 3.2]} tipY={2.2} />
      <InfoSpot
        spot={{ kind: 'warehouse' }}
        at={[CRATE(1.5)[0], CRATE(1.5)[1]]}
        size={[0.7, 0.8, 2.4]}
        tipY={1.4}
      />

      {DOCK_SLOTS.map((slot) => {
        const [px, pz] = PORT_STAND[slot];
        const [sx, sz] = SHIPYARD_STAND[slot];
        return (
          <group key={slot}>
            <Stand
              kind="port"
              cost={PORT_SLOTS[slot].cost}
              occupant={colorOf(view.port[slot].occupant)}
              position={[px, surfaceY(px, pz), pz]}
              {...pick({ kind: 'port', slot })}
            />
            <Sign text={String(PORT_SLOTS[slot].reward)} x={px + 0.95} z={pz} />
            <Stand
              kind="shipyard"
              cost={SHIPYARD_SLOTS[slot].cost}
              occupant={colorOf(view.shipyard[slot].occupant)}
              position={[sx, surfaceY(sx, sz), sz]}
              {...pick({ kind: 'shipyard', slot })}
            />
            <Sign text={String(SHIPYARD_SLOTS[slot].reward)} x={sx + 0.95} z={sz} />
          </group>
        );
      })}

      {/* Pirate stands on the deck; the captain stands at the bow (towards the routes). */}
      <group position={[PIRATE_SHIP[0], -0.2, PIRATE_SHIP[1]]}>
        {(['captain', 'crew'] as const).map((role) => (
          <Stand
            key={role}
            kind="pirate"
            cost={PIRATE_COST}
            occupant={colorOf(view.pirates[role])}
            pirateHat
            position={[0, 0.5, role === 'captain' ? 0.85 : -0.55]}
            {...(role === pirateNext ? pick({ kind: 'pirate' }) : { spot: { kind: 'pirate' } })}
          />
        ))}
      </group>

      {(['small', 'large'] as const).map((size) => (
        <Stand
          key={size}
          kind="pilot"
          cost={PILOT_COST[size]}
          occupant={colorOf(view.pilots[size])}
          position={[PILOT_BOAT[size][0], 0.14, PILOT_BOAT[size][1]]}
          {...pick({ kind: 'pilot', size })}
        />
      ))}

      <Stand
        kind="insurance"
        cost={0}
        occupant={colorOf(view.insurance)}
        position={[
          INSURANCE_STAND[0],
          surfaceY(INSURANCE_STAND[0], INSURANCE_STAND[1]),
          INSURANCE_STAND[1],
        ]}
        {...pick({ kind: 'insurance' })}
      />
      <Sign text={String(INSURANCE_PREMIUM)} x={INSURANCE_STAND[0] - 0.95} z={INSURANCE_STAND[1]} />

      {/* Harbour master's tower flies the current harbour master's colour. */}
      <group
        position={[
          HARBOR_OFFICE[0],
          surfaceY(HARBOR_OFFICE[0], HARBOR_OFFICE[1]),
          HARBOR_OFFICE[1],
        ]}
      >
        <VoxelMesh
          model={`tower-${hmColor}`}
          build={() => towerModel(PLAYER_COLORS[hmColor].main)}
        />
      </group>
    </group>
  );
}

function Sign({ text, x, z }: { text: string; x: number; z: number }) {
  return (
    <group position={[x, surfaceY(x, z), z]} scale={PIECE_SCALE.sign}>
      <VoxelMesh model={`sign-${text}`} build={() => signModel(text, ENV.gold, ENV.woodDark)} />
    </group>
  );
}

/** Invisible hover box over a building, showing its card. */
function InfoSpot({
  spot,
  at,
  size,
  tipY,
}: {
  spot: Spot;
  at: [number, number];
  size: [number, number, number];
  tipY: number;
}) {
  const { hover, handlers } = usePick({});
  const y = surfaceY(at[0], at[1]);
  return (
    <group position={[at[0], y, at[1]]}>
      <mesh position-y={size[1] / 2} visible={false} {...handlers}>
        <boxGeometry args={size} />
      </mesh>
      {hover && <SpotTip spot={spot} y={tipY} actionable={false} />}
    </group>
  );
}

/** R10 variant: boarding a full punt means choosing whom to push off. */
function DisplaceMenu({
  view,
  ware,
  options,
  onPick,
}: {
  view: PlayerView;
  ware: Ware;
  options: BoardAction[];
  onPick: (a: BoardAction) => void;
}) {
  const punt = view.punts.find((p) => p.ware === ware);
  if (!punt) return null;
  const nameOf = (id: string | null) => view.players.find((p) => p.id === id)?.name ?? '';
  return (
    <Html
      position={[spaceX(Math.min(punt.position, 14)), 1.6, LANE_Z[punt.route]]}
      zIndexRange={WORLD_Z}
    >
      <div className="world-panel panel">
        <div className="row">
          {options.map((a) => {
            const victim =
              a.displaceSeat === undefined ? null : (punt.seats[a.displaceSeat]?.occupant ?? null);
            return (
              <button key={a.displaceSeat ?? 'free'} className="btn" onClick={() => onPick(a)}>
                {victim ? zh.world.displace(nameOf(victim)) : zh.actions.board(zh.ware[ware])}
              </button>
            );
          })}
        </div>
      </div>
    </Html>
  );
}
