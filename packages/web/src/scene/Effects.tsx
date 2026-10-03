import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, type ReactNode } from 'react';
import type * as THREE from 'three';
import {
  WARES,
  type GameEvent,
  type GameState,
  type PlacementTarget,
  type PlayerId,
} from '@manila/engine';
import { onFxStep, type FxStep } from '../game/fx';
import { ANIM_MS, useGame } from '../game/store';
import {
  INSURANCE_STAND,
  LANE_Z,
  PILOT_BOAT,
  PIRATE_SHIP,
  PORT_BERTH,
  PORT_STAND,
  SHIPYARD_CHANNEL_Z,
  SHIPYARD_SLIP,
  SHIPYARD_STAND,
  spaceX,
} from './layout';
import { FX, PLAYER_COLORS, WARE_COLORS } from './palette';
import { coins, firework, puff, ring, sparkle, splash } from './particles';
import { type ParticlePool } from './particles';
import { puntPose } from './Pieces';
import { surfaceY } from './terrain';

/** Fall time of a tumbling die before it lands (scene/Dice.tsx). */
const DIE_LAND_MS = 900;
/** Fall time of a placed accomplice (motion.ts useDropIn). */
const DROP_MS = 290;

const SPRAY = [FX.spray, FX.sprayBlue, FX.spray];
const SMOKE = [FX.smoke, FX.smoke, FX.dust];
const GUNSMOKE = [FX.smokeDark, FX.smoke, FX.smokeDark];
const GOLD = [FX.coin, FX.coin, FX.coinDark, FX.flash];

// ───────────── shake ─────────────

const shake = { amp: 0, t: 0 };

/** Rumble the whole diorama briefly (cannon hits). */
export function shakeScene(amp: number): void {
  shake.amp = Math.max(shake.amp, amp);
}

export function Shake({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    shake.t += dt;
    shake.amp = Math.max(0, shake.amp - dt * 0.5);
    const a = shake.amp;
    g.position.set(
      Math.sin(shake.t * 61) * a,
      Math.sin(shake.t * 47) * a * 0.5,
      Math.sin(shake.t * 53) * a,
    );
  });
  return <group ref={ref}>{children}</group>;
}

// ───────────── where things are ─────────────

type Vec3 = [number, number, number];

const ground = (x: number, z: number, lift = 0): Vec3 => [x, surfaceY(x, z) + lift, z];

function puntAt(state: GameState, ware: string, lift = 0.35): Vec3 | null {
  const p = state.punts.find((x) => x.ware === ware);
  if (!p) return null;
  const pose = puntPose(p);
  return [pose.x, lift, pose.z];
}

function targetAt(state: GameState, t: PlacementTarget, seat: number | null): Vec3 | null {
  switch (t.kind) {
    case 'punt':
      return puntAt(state, t.ware, 0.5);
    case 'port':
      return ground(PORT_STAND[t.slot][0], PORT_STAND[t.slot][1], 0.3);
    case 'shipyard':
      return ground(SHIPYARD_STAND[t.slot][0], SHIPYARD_STAND[t.slot][1], 0.3);
    case 'pirate':
      return [PIRATE_SHIP[0], 0.55, PIRATE_SHIP[1] + (seat === 1 ? -0.55 : 0.85)];
    case 'pilot':
      return [PILOT_BOAT[t.size][0], 0.4, PILOT_BOAT[t.size][1]];
    case 'insurance':
      return ground(INSURANCE_STAND[0], INSURANCE_STAND[1], 0.3);
  }
}

/** The pirate ship's guns fire from its south side, facing the routes. */
const CANNON: Vec3 = [PIRATE_SHIP[0] + 0.3, 0.75, PIRATE_SHIP[1] + 0.75];
/**
 * Launch points for fireworks: open water north of the routes, where the bursts stay on screen
 * between the HUD panels (height reads as "further north" from the camera).
 */
const SKY: Vec3[] = [
  [4.0, 0, -4.8],
  [9.5, 0, -4.6],
  [14.0, 0, -4.4],
  [18.5, 0, -4.0],
];

// ───────────── the effect director ─────────────

interface Scheduled {
  at: number;
  fn: () => void;
}

/**
 * Particles and camera shake that follow the engine's events as the director plays them.
 * Purely presentational: positions come from the displayed state and the scene layout.
 */
export function Effects({ pool }: { pool: ParticlePool }) {
  const clock = useRef(0);
  const queue = useRef<Scheduled[]>([]);

  useEffect(() => {
    const schedule = (ms: number, fn: () => void) => {
      queue.current.push({ at: clock.current + ms / 1000, fn });
    };
    const offStep = onFxStep((step) => {
      for (const e of step.events) react(e, step, pool, schedule);
    });
    // "Skip animation" drops pending effects together with the animation.
    const offSkip = useGame.subscribe((s, prev) => {
      if (s.skip && !prev.skip) {
        queue.current = [];
        pool.clear();
      }
    });
    return () => {
      offStep();
      offSkip();
    };
  }, [pool]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05) * useGame.getState().settings.speed;
    clock.current += dt;
    if (queue.current.length) {
      const due = queue.current.filter((s) => s.at <= clock.current);
      if (due.length) {
        queue.current = queue.current.filter((s) => s.at > clock.current);
        for (const s of due) s.fn();
      }
    }
    pool.update(dt);
  });

  return <primitive object={pool.mesh} />;
}

function react(
  e: GameEvent,
  { before, after }: FxStep,
  pool: ParticlePool,
  schedule: (ms: number, fn: () => void) => void,
): void {
  const colorOf = (id: PlayerId) => {
    const c = after.players.find((p) => p.id === id)?.color;
    return c ? PLAYER_COLORS[c].main : FX.flash;
  };

  switch (e.type) {
    case 'punts-loaded':
      // Each punt sails in from the west wharf and settles on its start space.
      for (const p of e.punts) {
        const x = spaceX(p.start);
        schedule(500 + x * 60, () => splash(pool, x, LANE_Z[p.route], SPRAY, 0.7));
      }
      break;

    case 'punt-moved': {
      const punt = after.punts.find((p) => p.ware === e.ware);
      if (!punt || punt.status !== 'sailing') break;
      const dir = Math.sign(e.to - e.from);
      const hops = Math.abs(e.to - e.from);
      const z = LANE_Z[punt.route];
      for (let i = 1; i <= hops; i++) {
        const x = spaceX(Math.min(e.from + dir * i, 14));
        schedule(i * ANIM_MS.hop - 20, () => splash(pool, x, z, SPRAY, i === hops ? 1 : 0.6));
      }
      break;
    }

    case 'punt-docked': {
      const prev = before.punts.find((p) => p.ware === e.ware);
      const ware = WARE_COLORS[e.ware];
      if (e.dock === 'port') {
        const [x, z] = PORT_BERTH[e.slot];
        schedule(780, () => {
          splash(pool, x, z, SPRAY, 0.8);
          sparkle(pool, x, 0.6, z, [ware.main, ware.light, FX.flash], 14, 0.9);
        });
      } else {
        const x0 = spaceX(Math.min(prev?.position ?? 13, 14));
        const [sx, sz] = SHIPYARD_SLIP[e.slot];
        const turn = 380;
        const along = 180 + Math.abs(sx - x0) * 50;
        schedule(turn, () => splash(pool, x0, SHIPYARD_CHANNEL_Z, SPRAY, 0.7));
        schedule(turn + along + 380, () => {
          puff(pool, sx, 0.35, sz - 0.2, SMOKE, 12, 0.16, 0.5);
          puff(pool, sx, 0.3, sz - 0.2, [FX.chips, FX.dust], 6, 0.08, 1.4);
        });
      }
      break;
    }

    case 'punt-plundered': {
      const to = puntAt(before, e.ware, 0.3);
      if (!to) break;
      cannon(pool, schedule, CANNON, to);
      break;
    }

    case 'pirate-boarded': {
      const to = puntAt(before, e.ware, 0.4);
      puff(pool, ...CANNON, GUNSMOKE, 8, 0.14, 0.8);
      if (to) {
        schedule(320, () => {
          splash(pool, to[0], to[2], SPRAY, 0.9);
          sparkle(pool, ...to, [colorOf(e.playerId), FX.flash], 10, 0.5);
        });
      }
      break;
    }

    case 'dice-rolled':
      for (const w of WARES) {
        if (!e.values[w]) continue;
        const punt = after.punts.find((p) => p.ware === w);
        const z = LANE_Z[punt?.route ?? 1];
        schedule(DIE_LAND_MS, () => {
          sparkle(pool, spaceX(-0.2), 0.75, z, [WARE_COLORS[w].light, FX.flash], 8, 0.45);
          ring(pool, spaceX(-0.2), 0.04, z, FX.spray, 0.5, 10);
        });
      }
      break;

    case 'accomplice-placed': {
      const at = targetAt(after, e.target, e.seat);
      if (!at) break;
      const c = colorOf(e.playerId);
      schedule(DROP_MS, () => {
        ring(pool, at[0], at[1] - 0.15, at[2], FX.dust, 0.35, 10);
        sparkle(pool, ...at, [c, c, FX.flash], 8, 0.35);
      });
      break;
    }

    case 'payout': {
      const at = payoutSource(after, e);
      if (!at) break;
      coins(pool, ...at, GOLD, Math.max(4, Math.min(16, Math.round(e.amount / 3))));
      sparkle(pool, ...at, [FX.flash, FX.coin], 6, 0.4);
      break;
    }

    case 'repair-paid': {
      const [x, z] = SHIPYARD_STAND[e.slot];
      coins(pool, ...ground(x, z, 0.5), [FX.coinDark, FX.coin], 5);
      break;
    }

    case 'harbor-master-elected':
      firework(pool, schedule, ...SKY[0]!, [colorOf(e.playerId), FX.flash, FX.spark], 3);
      break;

    case 'voyage-ended':
      [SKY[1]!, SKY[3]!].forEach((at, i) =>
        schedule(i * 280, () => firework(pool, schedule, ...at, [FX.spark, FX.flash, FX.coin], 3)),
      );
      break;

    case 'game-ended': {
      const colors = after.players.map((p) => PLAYER_COLORS[p.color].main);
      for (let i = 0; i < 10; i++) {
        const at = SKY[i % SKY.length]!;
        schedule(i * 380, () =>
          firework(
            pool,
            schedule,
            at[0] + (Math.random() - 0.5) * 2,
            at[1],
            at[2] + (Math.random() - 0.5),
            [colors[i % colors.length]!, FX.flash, FX.spark],
            2.6 + Math.random() * 1.2,
          ),
        );
      }
      break;
    }

    default:
      break;
  }
}

/** Where the money of a payout comes from on the board. */
function payoutSource(state: GameState, e: Extract<GameEvent, { type: 'payout' }>): Vec3 | null {
  switch (e.reason) {
    case 'cargo': {
      const p = e.ware ? state.punts.find((x) => x.ware === e.ware) : undefined;
      if (p?.status === 'port' && p.dock)
        return [PORT_BERTH[p.dock][0], 0.6, PORT_BERTH[p.dock][1]];
      return e.ware ? puntAt(state, e.ware, 0.6) : null;
    }
    case 'port':
      return e.slot ? ground(PORT_STAND[e.slot][0], PORT_STAND[e.slot][1], 0.7) : null;
    case 'shipyard':
      return e.slot ? ground(SHIPYARD_STAND[e.slot][0], SHIPYARD_STAND[e.slot][1], 0.7) : null;
    case 'plunder':
      return [PIRATE_SHIP[0], 1.0, PIRATE_SHIP[1]];
    case 'insurance-premium':
      return ground(INSURANCE_STAND[0], INSURANCE_STAND[1], 0.7);
  }
}

/** Muzzle flash and smoke at the ship, a cannonball arc, then the hit on the punt. */
function cannon(
  pool: ParticlePool,
  schedule: (ms: number, fn: () => void) => void,
  from: Vec3,
  to: Vec3,
): void {
  const T = 0.55;
  const g = -9;
  pool.spawn({ x: from[0], y: from[1], z: from[2], life: 0.14, s0: 0.7, s1: 0.2, color: FX.flash });
  puff(pool, ...from, GUNSMOKE, 14, 0.2, 0.9);
  pool.spawn({
    x: from[0],
    y: from[1],
    z: from[2],
    vx: (to[0] - from[0]) / T,
    vz: (to[2] - from[2]) / T,
    vy: (to[1] - from[1] - 0.5 * g * T * T) / T,
    g,
    life: T,
    s0: 0.2,
    s1: 0.2,
    color: FX.cannonball,
  });
  shakeScene(0.05);
  schedule(T * 1000, () => {
    shakeScene(0.14);
    pool.spawn({ x: to[0], y: to[1], z: to[2], life: 0.16, s0: 0.9, s1: 0.3, color: FX.flash });
    splash(pool, to[0], to[2], SPRAY, 1.6);
    puff(pool, ...to, GUNSMOKE, 16, 0.22, 1);
    puff(pool, ...to, [FX.chips, FX.dust], 8, 0.08, 2.2);
  });
}
