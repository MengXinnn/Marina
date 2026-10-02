import { useMemo } from 'react';
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
} from '@manila/engine';
import { legalActionsFor, useCurtain, useGame, useView } from '../game/store';
import {
  HARBOR_OFFICE,
  INSURANCE_STAND,
  PILOT_BOAT,
  PIRATE_SHIP,
  PORT_STAND,
  SHIPYARD_STAND,
} from './layout';
import { Dice } from './Dice';
import { signModel, towerModel } from './models';
import { ENV, PLAYER_COLORS } from './palette';
import { PIECE_SCALE } from './layout';
import { Punt, Stand } from './Pieces';
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
  const playing = useGame((s) => s.playing);
  const curtain = useCurtain();
  const selectableAll = useSelectableTargets(view);
  const selectable = playing || curtain ? new Set<string>() : selectableAll;
  const colors = useMemo(
    () =>
      Object.fromEntries(view.players.map((p) => [p.id, p.color])) as Record<string, PlayerColor>,
    [view.players],
  );
  const colorOf = (id: string | null) => (id ? (colors[id] ?? null) : null);
  const actor = 'playerId' in view.pending ? view.pending.playerId : null;
  const actorColor = actor ? colors[actor] : undefined;
  const pick = (target: PlacementTarget) => ({
    selectable: selectable.has(targetKey(target)),
    actorColor,
    onPick: () => actor && dispatch({ type: 'place-accomplice', playerId: actor, target }),
  });
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
          {...(p.status === 'sailing' ? pick({ kind: 'punt', ware: p.ware }) : {})}
        />
      ))}
      <Dice />

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
            {...(role === pirateNext ? pick({ kind: 'pirate' }) : {})}
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
