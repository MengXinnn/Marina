/**
 * The background tune: an original habanera / danza in D minor, the dance rhythm that
 * Spanish colonial Manila shared with Havana in the 1800s, played on a rondalla-like
 * plucked-string band with a wooden flute. Pure data, so it can be tested.
 *
 * Time grid: 2/4 bars of 8 sixteenth-note steps.
 */

export const STEPS_PER_BAR = 8;
export const BPM = 76;
export const STEP_SEC = 60 / BPM / 4;
export const BAR_SEC = STEP_SEC * STEPS_PER_BAR;

export type ChordName = 'Dm' | 'A7' | 'Gm' | 'F' | 'C7' | 'Bb';

export interface Chord {
  /** Guitar voicing (MIDI), low to high. */
  voicing: number[];
  /** Bass notes: root, fifth, third (MIDI). */
  bass: [number, number, number];
}

export const CHORDS: Record<ChordName, Chord> = {
  Dm: { voicing: [50, 57, 62, 65], bass: [38, 45, 41] },
  A7: { voicing: [52, 55, 61, 64], bass: [45, 40, 49] },
  Gm: { voicing: [55, 58, 62, 67], bass: [43, 50, 46] },
  F: { voicing: [53, 57, 60, 65], bass: [41, 48, 45] },
  C7: { voicing: [52, 58, 60, 64], bass: [36, 43, 40] },
  Bb: { voicing: [53, 58, 62, 65], bass: [46, 41, 50] },
};

/** [MIDI note or null for a rest, length in steps] */
export type Note = [number | null, number];

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Parse "A4:3 C#5:1 r:4" into notes. */
export function parseMelody(src: string): Note[] {
  return src
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [name, len] = tok.split(':');
      const steps = Number(len);
      if (!name || !Number.isInteger(steps) || steps <= 0) throw new Error(`bad note ${tok}`);
      if (name === 'r') return [null, steps];
      const m = /^([A-G])(#|b)?(\d)$/.exec(name);
      if (!m) throw new Error(`bad note ${tok}`);
      const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
      return [12 * (Number(m[3]) + 1) + PITCH[m[1]!]! + acc, steps];
    });
}

export interface ScoreBar {
  chord: ChordName;
  melody: Note[] | null;
}

const bars = (rows: Array<[ChordName, string | null]>): ScoreBar[] =>
  rows.map(([chord, m]) => ({ chord, melody: m ? parseMelody(m) : null }));

/** A: the minor theme. */
export const SECTION_A = bars([
  ['Dm', 'A4:3 D5:1 F5:2 E5:2'],
  ['A7', 'E5:3 D5:1 C#5:2 A4:2'],
  ['Dm', 'F5:3 E5:1 D5:2 A4:2'],
  ['A7', 'A4:3 C#5:1 E5:4'],
  ['Dm', 'F5:3 E5:1 D5:2 F5:2'],
  ['Gm', 'G5:3 F5:1 D5:2 Bb4:2'],
  ['A7', 'E5:3 D5:1 C#5:2 E5:2'],
  ['Dm', 'D5:6 r:2'],
]);

/** B: the relative-major answer, turning back to D minor. */
export const SECTION_B = bars([
  ['F', 'C5:3 F5:1 A5:2 G5:2'],
  ['C7', 'G5:3 E5:1 C5:2 Bb4:2'],
  ['F', 'A4:3 C5:1 F5:4'],
  ['Dm', 'A5:3 G5:1 F5:2 D5:2'],
  ['Gm', 'D5:3 G5:1 Bb5:2 A5:2'],
  ['C7', 'G5:3 F5:1 E5:2 C5:2'],
  ['F', 'F5:4 A4:2 C5:2'],
  ['A7', 'E5:3 C#5:1 A4:4'],
]);

/** C: a quieter bridge on the subdominant. */
export const SECTION_C = bars([
  ['Gm', 'Bb4:3 D5:1 G5:4'],
  ['Dm', 'F5:3 E5:1 D5:4'],
  ['Bb', 'D5:3 F5:1 Bb5:2 A5:2'],
  ['A7', 'G5:3 E5:1 C#5:4'],
  ['Gm', 'Bb4:2 D5:2 G5:2 F5:2'],
  ['Dm', 'F5:2 A5:2 F5:2 D5:2'],
  ['A7', 'E5:2 G5:2 E5:2 C#5:2'],
  ['A7', 'A4:6 r:2'],
]);

/** Accompaniment-only vamp used as intro and breathing space. */
export const VAMP = bars([
  ['Dm', null],
  ['A7', null],
  ['Dm', null],
  ['A7', null],
]);

export type Lead = 'pluck' | 'flute' | null;

export interface PlannedBar extends ScoreBar {
  lead: Lead;
  /** Ambience only, no music, so a long game doesn't wear the tune out. */
  rest: boolean;
  /** Last bar of the tune: let the chord ring instead of the habanera pattern. */
  final: boolean;
}

const plan = (section: ScoreBar[], lead: Lead): PlannedBar[] =>
  section.map((b) => ({ ...b, lead, rest: false, final: false }));

/** One full loop of the background music (≈1 minute of tune, then ≈15 s of sea). */
export function buildPlan(): PlannedBar[] {
  const tune = [
    ...plan(VAMP, null),
    ...plan(SECTION_A, 'pluck'),
    ...plan(SECTION_B, 'pluck'),
    ...plan(SECTION_C, 'flute'),
    ...plan(SECTION_A, 'flute'),
  ];
  tune[tune.length - 1] = { ...tune[tune.length - 1]!, final: true };
  const rest: PlannedBar[] = Array.from({ length: 10 }, () => ({
    chord: 'Dm',
    melody: null,
    lead: null,
    rest: true,
    final: false,
  }));
  return [...tune, ...rest];
}
