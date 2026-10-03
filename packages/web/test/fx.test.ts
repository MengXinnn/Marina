import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { applyAction, getLegalActions, type GameEvent } from '@manila/engine';
import { onFxStep, type FxStep } from '../src/game/fx';
import { ParticlePool } from '../src/scene/particles';

// The director paces itself with requestAnimationFrame, which node does not have.
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
  setTimeout(() => cb(performance.now()), 4),
);

const { useGame, actorOf } = await import('../src/game/store');

describe('fx: the director broadcasts every animated step', () => {
  let off: (() => void) | null = null;
  afterEach(() => off?.());

  it('emits the engine events in order, chaining before/after display states', async () => {
    const game = useGame.getState();
    game.setSettings({ speed: 4 });
    game.startGame({
      seed: 7,
      players: [
        { name: 'A', color: 'red' },
        { name: 'B', color: 'blue' },
        { name: 'C', color: 'orange' },
      ],
    });
    const start = useGame.getState().state;
    const action = getLegalActions(start, actorOf(start)!)[0]!;
    const expected = applyAction(start, action);
    if (!expected.ok) throw new Error(expected.error.code);

    const steps: FxStep[] = [];
    off = onFxStep((s) => steps.push(s));
    useGame.getState().dispatch(action);
    await vi.waitFor(() => expect(useGame.getState().playing).toBe(false), { timeout: 5000 });

    const events: GameEvent[] = steps.flatMap((s) => s.events);
    expect(events).toEqual(expected.events);
    expect(steps[0]!.before).toBe(start);
    for (let i = 1; i < steps.length; i++) expect(steps[i]!.before).toBe(steps[i - 1]!.after);
    expect(steps.every((s) => s.speed === 4)).toBe(true);
  });
});

describe('fx: particle pool', () => {
  const scaleOf = (pool: ParticlePool, i: number) => {
    const m = new THREE.Matrix4();
    pool.mesh.getMatrixAt(i, m);
    return new THREE.Vector3().setFromMatrixScale(m).x;
  };

  it('moves a particle under gravity and hides it once its life is over', () => {
    const pool = new ParticlePool();
    pool.spawn({ x: 0, y: 1, z: 0, vy: 0, g: -10, life: 0.5, s0: 0.2, color: 0xffffff });
    pool.update(0.1);
    const m = new THREE.Matrix4();
    pool.mesh.getMatrixAt(0, m);
    const pos = new THREE.Vector3().setFromMatrixPosition(m);
    expect(pos.y).toBeLessThan(1);
    expect(scaleOf(pool, 0)).toBeCloseTo(0.2);
    pool.update(0.5);
    expect(scaleOf(pool, 0)).toBe(0);
  });

  it('clear() hides every live particle at once', () => {
    const pool = new ParticlePool();
    for (let i = 0; i < 5; i++) pool.spawn({ x: i, y: 0, z: 0, life: 2, s0: 0.1, color: 0 });
    pool.update(0.016);
    expect(scaleOf(pool, 4)).toBeGreaterThan(0);
    pool.clear();
    pool.update(0.016);
    for (let i = 0; i < 5; i++) expect(scaleOf(pool, i)).toBe(0);
  });
});
