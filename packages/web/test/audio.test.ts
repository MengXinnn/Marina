import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@manila/engine';
import { coinCount, cuesForStep } from '../src/audio/cues';
import {
  CHORDS,
  SECTION_A,
  SECTION_B,
  SECTION_C,
  STEPS_PER_BAR,
  buildPlan,
  parseMelody,
} from '../src/audio/score';
import { DEFAULT_AUDIO_SETTINGS, parseAudioSettings } from '../src/audio/settings';

describe('sound cues', () => {
  it('one oar stroke per space for grouped punt moves', () => {
    const step: GameEvent[] = [
      { type: 'punt-moved', ware: 'silk', from: 2, to: 5, cause: 'dice' },
      { type: 'punt-moved', ware: 'jade', from: 0, to: 1, cause: 'dice' },
    ];
    expect(cuesForStep(step, 0.25)).toEqual([
      { name: 'oar', at: 0 },
      { name: 'oar', at: 0.25 },
      { name: 'oar', at: 0.5 },
    ]);
  });

  it('port and shipyard arrivals sound different', () => {
    const dock = (d: 'port' | 'shipyard'): GameEvent[] => [
      { type: 'punt-docked', ware: 'silk', dock: d, slot: 'A' },
    ];
    expect(cuesForStep(dock('port'), 0)[0]?.name).toBe('arrive');
    expect(cuesForStep(dock('shipyard'), 0)[0]?.name).toBe('shipyard');
  });

  it('bigger payouts clink more coins, capped at five', () => {
    expect(coinCount(0)).toBe(1);
    expect(coinCount(6)).toBe(1);
    expect(coinCount(20)).toBe(3);
    expect(coinCount(200)).toBe(5);
    const payout: GameEvent = {
      type: 'payout',
      playerId: 'p1',
      amount: 30,
      source: 'bank',
      reason: 'cargo',
    };
    expect(cuesForStep([payout], 0)).toEqual([{ name: 'coins', at: 0, arg: 4 }]);
  });

  it('an empty step is silent', () => {
    expect(cuesForStep([], 0)).toEqual([]);
  });
});

describe('background score', () => {
  it('parses note names, accidentals and rests', () => {
    expect(parseMelody('A4:3 C#5:1 Bb4:2 r:2')).toEqual([
      [69, 3],
      [73, 1],
      [70, 2],
      [null, 2],
    ]);
    expect(() => parseMelody('H4:2')).toThrow();
  });

  it('every melody bar fills exactly one 2/4 bar', () => {
    for (const bar of [...SECTION_A, ...SECTION_B, ...SECTION_C]) {
      const steps = (bar.melody ?? []).reduce((n, [, len]) => n + len, 0);
      expect(steps).toBe(STEPS_PER_BAR);
    }
  });

  it('melody notes on strong beats belong to the bar chord', () => {
    for (const bar of [...SECTION_A, ...SECTION_B, ...SECTION_C]) {
      const { voicing, bass } = CHORDS[bar.chord];
      const pcs = new Set([...voicing, ...bass].map((m) => m % 12));
      const first = bar.melody?.[0]?.[0];
      if (first != null) expect(pcs.has(first % 12), `${bar.chord} ${first}`).toBe(true);
    }
  });

  it('the loop ends on a rest so a long game is not wall-to-wall music', () => {
    const plan = buildPlan();
    expect(plan.filter((b) => b.final)).toHaveLength(1);
    expect(plan[plan.length - 1]?.rest).toBe(true);
    expect(plan.findIndex((b) => b.final)).toBe(plan.findIndex((b) => b.rest) - 1);
  });
});

describe('audio settings', () => {
  it('falls back to defaults and clamps volumes', () => {
    expect(parseAudioSettings(null, null)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(parseAudioSettings('not json', null)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(parseAudioSettings('{"music":false,"musicVolume":7}', null)).toEqual({
      ...DEFAULT_AUDIO_SETTINGS,
      music: false,
      musicVolume: 1,
    });
  });

  it('honours the old single mute flag', () => {
    expect(parseAudioSettings(null, '1')).toMatchObject({ music: false, sfx: false });
  });
});
