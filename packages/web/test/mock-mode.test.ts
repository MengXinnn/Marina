import { describe, expect, it, vi } from 'vitest';

/** Engine still fully stubbed: createGame throws NotImplementedError, so the store boots in mock mode. */
vi.mock('@manila/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('@manila/engine')>();
  return {
    ...real,
    createGame: () => {
      throw new real.NotImplementedError('createGame');
    },
  };
});

const { useGame } = await import('../src/game/store');

describe('store: mock mode', () => {
  it('boots in mock mode while the engine is stubbed', () => {
    expect(useGame.getState().mode).toBe('mock');
  });

  it('ignores computer seats so the mock seat in turn never "thinks" forever', () => {
    useGame.getState().startGame({ players: [] }, { p3: 'normal' });
    const s = useGame.getState();
    expect(s.bots).toEqual({});
    expect('playerId' in s.state.pending && s.state.pending.playerId).toBe('p3');
  });
});
