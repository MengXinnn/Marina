import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import type * as THREE from 'three';
import {
  MAX_START_SPACE,
  START_SUM,
  WARES,
  type Action,
  type PendingDecision,
  type PilotMove,
  type PlayerColor,
  type PlayerView,
  type PuntPlan,
  type RouteIndex,
  type Ware,
} from '@manila/engine';
import { legalActionsFor, useGame } from '../game/store';
import { zh } from '../i18n/zh';
import { WareChip } from '../ui/Hud';
import { Stepper } from '../ui/Stepper';
import {
  LANE_Z,
  PIECE_SCALE,
  PILOT_BOAT,
  PIRATE_SHIP,
  PORT_STAND,
  PUNT_FLOAT_Y,
  SHIPYARD_STAND,
  WORLD_PANEL,
  spaceX,
} from './layout';
import { DIE_TOP_ROTATION, dieModel, puntModel } from './models';
import { ENV, PLAYER_COLORS, WARE_COLORS } from './palette';
import { Marker, usePick } from './Pieces';
import { WORLD_Z } from './SpotTip';
import { useOnScreen } from './useOnScreen';
import { surfaceY } from './terrain';
import { VoxelMesh } from './VoxelMesh';

type Send = (a: Action) => void;
type Of<T extends PendingDecision['type']> = Extract<PendingDecision, { type: T }>;

/** A DOM panel standing in the scene: anchored at its bottom-centre to a world point. */
export function WorldPanel({
  position,
  children,
  tone,
}: {
  position: [number, number, number];
  children: ReactNode;
  tone?: PlayerColor;
}) {
  return (
    <Html position={position} zIndexRange={WORLD_Z}>
      <PanelBody tone={tone}>{children}</PanelBody>
    </Html>
  );
}

function PanelBody({ tone, children }: { tone?: PlayerColor; children: ReactNode }) {
  const ref = useOnScreen<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="world-panel panel"
      style={tone ? ({ '--pc': PLAYER_COLORS[tone].css } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

/**
 * In-scene controls for the decisions that are not a simple "click a spot": every choice the
 * bottom action bar used to hold now lives next to the thing it acts on.
 */
export function WorldActions({ view, actorColor }: { view: PlayerView; actorColor: PlayerColor }) {
  const send = useGame((s) => s.dispatch);
  const mode = useGame((s) => s.mode);
  const state = useGame((s) => s.state);
  const legal = useMemo(() => legalActionsFor(state, mode), [state, mode]);
  const p = view.pending;
  const props = { view, send, legal, actorColor };
  switch (p.type) {
    case 'bid':
      return <BidBoard key={view.turn} pending={p} {...props} />;
    case 'buy-share':
      return <ShareBoard pending={p} {...props} />;
    case 'load-punts':
      return <LoadEditor key={view.turn} pending={p} {...props} />;
    case 'roll-dice':
      return <IdleDice pending={p} {...props} />;
    case 'pirate-board':
      return (
        <WorldPanel position={[PIRATE_SHIP[0] - 2.6, 0.6, PIRATE_SHIP[1] + 0.8]} tone={actorColor}>
          <p>{zh.world.pirateBoard}</p>
          <button
            className="btn ghost"
            onClick={() => send({ type: 'pirate-board', playerId: p.playerId, ware: null })}
          >
            {zh.actions.stay}
          </button>
        </WorldPanel>
      );
    case 'pilot':
      return <PilotControls key={view.turn} pending={p} {...props} />;
    case 'plunder-destination':
      return <PlunderChoice pending={p} {...props} />;
    default:
      return null;
  }
}

interface Common {
  view: PlayerView;
  send: Send;
  legal: Action[];
  actorColor: PlayerColor;
}

// ───────────── auction: the harbour master's notice board ─────────────

function BidBoard({ pending, view, send, actorColor }: Common & { pending: Of<'bid'> }) {
  const [amount, setAmount] = useState(pending.minBid);
  const canBid = pending.maxBid >= pending.minBid;
  const high = view.auction?.highBid;
  const highName = view.players.find((pl) => pl.id === high?.playerId)?.name;
  return (
    <WorldPanel position={WORLD_PANEL} tone={actorColor}>
      <h4>{zh.world.bidTitle}</h4>
      <p className="muted">
        {high ? zh.world.highBid(highName ?? '', high.amount) : zh.world.noBid}
      </p>
      <div className="row">
        {canBid && (
          <>
            <Stepper
              value={amount}
              min={pending.minBid}
              max={pending.maxBid}
              onChange={setAmount}
            />
            <button
              className="btn"
              onClick={() => send({ type: 'bid', playerId: pending.playerId, amount })}
            >
              {zh.actions.bid} {amount}
            </button>
          </>
        )}
        <button
          className="btn ghost"
          onClick={() => send({ type: 'pass-bid', playerId: pending.playerId })}
        >
          {zh.actions.passBid}
        </button>
      </div>
      <p className="muted small">{zh.world.bidHint(pending.minBid, pending.maxBid)}</p>
    </WorldPanel>
  );
}

// ───────────── harbour master buys a share: crates on the notice board ─────────────

function ShareBoard({ pending, view, send, actorColor }: Common & { pending: Of<'buy-share'> }) {
  return (
    <WorldPanel position={WORLD_PANEL} tone={actorColor}>
      <h4>{zh.world.buyTitle}</h4>
      <div className="row">
        {WARES.map((w) => {
          const price = pending.prices[w];
          return (
            <button
              key={w}
              className="crate-btn"
              disabled={price === undefined}
              style={{ '--wc': WARE_COLORS[w].css } as React.CSSProperties}
              onClick={() => send({ type: 'buy-share', playerId: pending.playerId, ware: w })}
            >
              <span className="crate-name">{zh.ware[w]}</span>
              <span className="crate-price">{price ?? '—'}</span>
              <span className="crate-left">{zh.world.left(view.shareSupply[w])}</span>
            </button>
          );
        })}
      </div>
      <div className="row">
        <span className="muted small">{zh.world.buyHint}</span>
        <button
          className="btn ghost"
          onClick={() => send({ type: 'buy-share', playerId: pending.playerId, ware: null })}
        >
          {zh.actions.skipBuy}
        </button>
      </div>
    </WorldPanel>
  );
}

// ───────────── harbour master loads the punts: pick wares and starts on the lanes ─────────────

const ROUTES: RouteIndex[] = [0, 1, 2];
const planKey = (punts: PuntPlan[]) => punts.map((p) => `${p.ware}@${p.start}`).join(',');

function LoadEditor({ pending, send, legal, actorColor }: Common & { pending: Of<'load-punts'> }) {
  const [plan, setPlan] = useState<PuntPlan[]>([
    { ware: 'jade', start: 2 },
    { ware: 'silk', start: 3 },
    { ware: 'ginseng', start: 4 },
  ]);
  const sum = plan.reduce((s, p) => s + p.start, 0);
  const ashore = WARES.find((w) => !plan.some((p) => p.ware === w))!;
  const legalKeys = useMemo(
    () => new Set(legal.flatMap((a) => (a.type === 'load-punts' ? [planKey(a.punts)] : []))),
    [legal],
  );
  // Mock mode has no legal actions: fall back to the printed sum rule for the button state.
  const valid = legalKeys.size ? legalKeys.has(planKey(plan)) : sum === START_SUM;
  const setLane = (r: RouteIndex, patch: Partial<PuntPlan>) =>
    setPlan((cur) => cur.map((p, i) => (i === r ? { ...p, ...patch } : p)));
  // Swap the lane's ware with the one left ashore, cycling through the four wares.
  const cycle = (r: RouteIndex, dir: 1 | -1) => {
    const used = new Set(plan.map((p) => p.ware));
    let i = WARES.indexOf(plan[r]!.ware);
    for (let k = 0; k < WARES.length; k++) {
      i = (i + dir + WARES.length) % WARES.length;
      if (!used.has(WARES[i]!)) return setLane(r, { ware: WARES[i]! });
    }
  };
  return (
    <group>
      {ROUTES.map((r) => {
        const lane = plan[r]!;
        return (
          <group key={r}>
            {Array.from({ length: MAX_START_SPACE + 1 }, (_, n) => (
              <StartTile
                key={n}
                route={r}
                space={n}
                chosen={lane.start === n}
                color={actorColor}
                onPick={() => setLane(r, { start: n })}
              />
            ))}
            <group
              position={[spaceX(lane.start), PUNT_FLOAT_Y, LANE_Z[r]]}
              scale={PIECE_SCALE.punt}
            >
              <VoxelMesh model={`punt-${lane.ware}`} build={() => puntModel(lane.ware)} />
            </group>
            <Html position={[spaceX(-1.15), 0.3, LANE_Z[r]]} zIndexRange={WORLD_Z} center>
              <div className="lane-ware">
                <button className="btn tiny ghost" onClick={() => cycle(r, -1)}>
                  ◀
                </button>
                <WareChip ware={lane.ware} />
                <button className="btn tiny ghost" onClick={() => cycle(r, 1)}>
                  ▶
                </button>
              </div>
            </Html>
          </group>
        );
      })}
      <WorldPanel position={[spaceX(9), 0.4, LANE_Z[2] + 2.3]} tone={actorColor}>
        <h4>{zh.world.loadTitle}</h4>
        <p className="muted small">{zh.world.loadHint(MAX_START_SPACE, START_SUM)}</p>
        <div className="row">
          <span>
            {zh.world.ashore} <WareChip ware={ashore} />
          </span>
          <span className={sum === START_SUM ? 'ok' : 'warn'}>
            {zh.world.startSum(sum, START_SUM)}
          </span>
          <button
            className="btn"
            disabled={!valid}
            onClick={() =>
              send({
                type: 'load-punts',
                playerId: pending.playerId,
                punts: plan as [PuntPlan, PuntPlan, PuntPlan],
              })
            }
          >
            {zh.actions.load}
          </button>
        </div>
      </WorldPanel>
    </group>
  );
}

/** Clickable glow over one of the start spaces 0..5 while loading. */
function StartTile({
  route,
  space,
  chosen,
  color,
  onPick,
}: {
  route: RouteIndex;
  space: number;
  chosen: boolean;
  color: PlayerColor;
  onPick: () => void;
}) {
  const { hot, handlers } = usePick({ selectable: true, onPick });
  return (
    <mesh position={[spaceX(space), 0.13, LANE_Z[route]]} rotation-x={-Math.PI / 2} {...handlers}>
      <planeGeometry args={[0.95, 0.95]} />
      <meshBasicMaterial
        color={PLAYER_COLORS[color].main}
        transparent
        opacity={chosen ? 0 : hot ? 0.55 : 0.22}
        depthWrite={false}
      />
    </mesh>
  );
}

// ───────────── harbour master rolls: click the dice ─────────────

function IdleDice({ pending, view, send, actorColor }: Common & { pending: Of<'roll-dice'> }) {
  const roll = () => send({ type: 'roll-dice', playerId: pending.playerId });
  const sailing = view.punts.filter((p) => p.status === 'sailing');
  const { hot, handlers } = usePick({ selectable: true, onPick: roll });
  const lane = sailing[Math.floor(sailing.length / 2)]?.route ?? 1;
  return (
    <group>
      <group {...handlers}>
        {sailing.map((p, i) => (
          <IdleDie key={p.ware} ware={p.ware} route={p.route} phase={i * 0.9} hot={hot} />
        ))}
      </group>
      <group position={[spaceX(-0.2), 1.2, LANE_Z[lane]]}>
        <Marker color={actorColor} hot={hot} />
      </group>
      {/* Beside the dice, clear of the player list that covers the far west of the bay. */}
      <WorldPanel position={[spaceX(1.6), 0.9, LANE_Z[lane] - 1.25]} tone={actorColor}>
        <button className="btn" onClick={roll}>
          🎲 {zh.world.roll(pending.round)}
        </button>
      </WorldPanel>
    </group>
  );
}

function IdleDie({
  ware,
  route,
  phase,
  hot,
}: {
  ware: Ware;
  route: RouteIndex;
  phase: number;
  hot: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime * (hot ? 3 : 1.4) + phase;
    g.position.y = 0.75 + Math.abs(Math.sin(t)) * (hot ? 0.25 : 0.1);
    g.rotation.y = Math.sin(t * 0.5) * 0.4;
  });
  const c = WARE_COLORS[ware];
  const rest = DIE_TOP_ROTATION[1]!;
  return (
    <group position={[spaceX(-0.2), 0, LANE_Z[route]]}>
      <group ref={ref}>
        <VoxelMesh
          model={`die-${ware}`}
          build={() => dieModel(c.main, ware === 'nutmeg' ? ENV.pipLight : ENV.pipDark)}
          position-y={-0.35}
          rotation={rest}
        />
        {/* generous invisible hit area */}
        <mesh visible={false}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      </group>
    </group>
  );
}

// ───────────── pilots: arrows beside each sailing punt ─────────────

const moveKey = (moves: PilotMove[]) =>
  [...moves]
    .sort((a, b) => a.ware.localeCompare(b.ware))
    .map((m) => `${m.ware}${m.delta}`)
    .join(',');

function PilotControls({
  pending,
  view,
  send,
  legal,
  actorColor,
}: Common & { pending: Of<'pilot'> }) {
  const [deltas, setDeltas] = useState<Partial<Record<Ware, number>>>({});
  const limit = pending.size === 'small' ? 1 : 2;
  const sailing = view.punts.filter((p) => p.status === 'sailing');
  const moves: PilotMove[] = sailing
    .filter((p) => deltas[p.ware])
    .map((p) => ({ ware: p.ware, delta: deltas[p.ware] as PilotMove['delta'] }));
  const legalKeys = useMemo(
    () => new Set(legal.flatMap((a) => (a.type === 'pilot' ? [moveKey(a.moves)] : []))),
    [legal],
  );
  const total = moves.reduce((s, m) => s + Math.abs(m.delta), 0);
  const valid =
    moves.length > 0 &&
    (legalKeys.size
      ? legalKeys.has(moveKey(moves))
      : total <= limit && (moves.length < 2 || moves.every((m) => Math.abs(m.delta) === 1)));
  const boat = PILOT_BOAT[pending.size];
  return (
    <group>
      {sailing.map((p) => {
        const d = deltas[p.ware] ?? 0;
        const to = Math.max(0, p.position + d);
        const nudge = (k: number) =>
          setDeltas((cur) => ({ ...cur, [p.ware]: Math.max(-limit, Math.min(limit, d + k)) }));
        return (
          <group key={p.ware}>
            {d !== 0 && (
              <mesh
                position={[spaceX(Math.min(to, 14)), 0.14, LANE_Z[p.route]]}
                rotation-x={-Math.PI / 2}
              >
                <planeGeometry args={[0.95, 0.95]} />
                <meshBasicMaterial
                  color={PLAYER_COLORS[actorColor].main}
                  transparent
                  opacity={0.6}
                  depthWrite={false}
                />
              </mesh>
            )}
            <Html
              position={[spaceX(Math.min(p.position, 14)), 1.5, LANE_Z[p.route]]}
              zIndexRange={WORLD_Z}
              center
            >
              <div className="pilot-arrows">
                <button
                  className="btn tiny"
                  disabled={d <= -limit || to <= 0}
                  onClick={() => nudge(-1)}
                >
                  ◀
                </button>
                <span className={`pilot-delta ${d ? 'on' : ''}`}>
                  {d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '·'}
                </span>
                <button className="btn tiny" disabled={d >= limit} onClick={() => nudge(1)}>
                  ▶
                </button>
              </div>
            </Html>
          </group>
        );
      })}
      <WorldPanel position={[boat[0], 1.9, boat[1]]} tone={actorColor}>
        <h4>{zh.pilot[pending.size]}</h4>
        <p className="muted small">{zh.world.pilotHint(limit)}</p>
        <div className="row">
          <button
            className="btn"
            disabled={!valid}
            onClick={() => send({ type: 'pilot', playerId: pending.playerId, moves })}
          >
            {zh.actions.confirm}
          </button>
          <button
            className="btn ghost"
            onClick={() => send({ type: 'pilot', playerId: pending.playerId, moves: [] })}
          >
            {zh.actions.skipPilot}
          </button>
        </div>
      </WorldPanel>
    </group>
  );
}

// ───────────── pirate captain: send the plundered punt to port or shipyard ─────────────

function PlunderChoice({
  pending,
  send,
  actorColor,
}: Common & { pending: Of<'plunder-destination'> }) {
  const go = (destination: 'port' | 'shipyard') =>
    send({ type: 'plunder-destination', playerId: pending.playerId, destination });
  const [px, pz] = PORT_STAND.B;
  const [sx, sz] = SHIPYARD_STAND.B;
  const ware = zh.ware[pending.ware];
  return (
    <group>
      <WorldPanel position={[px, surfaceY(px, pz) + 2.2, pz]} tone={actorColor}>
        <button className="btn" onClick={() => go('port')}>
          {zh.world.toPort(ware)}
        </button>
      </WorldPanel>
      <WorldPanel position={[sx, surfaceY(sx, sz) + 2.2, sz]} tone={actorColor}>
        <button className="btn" onClick={() => go('shipyard')}>
          {zh.world.toShipyard(ware)}
        </button>
      </WorldPanel>
    </group>
  );
}
