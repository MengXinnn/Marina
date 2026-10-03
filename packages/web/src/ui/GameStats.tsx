import { useMemo, useState } from 'react';
import type { PlayerState } from '@manila/engine';
import { useGame } from '../game/store';
import { LEDGER_KEYS, gameStats, type GameStats } from '../game/stats';
import { PLAYER_COLORS } from '../scene/palette';
import { zh } from '../i18n/zh';

/** Statistics of the finished game, replayed from the recorded actions (null if unavailable). */
export function useGameStats(): GameStats | null {
  const state = useGame((s) => s.state);
  const actions = useGame((s) => s.actions);
  return useMemo(
    () =>
      state.phase === 'game-over' && actions.length === state.turn
        ? gameStats(state.config, actions)
        : null,
    [state, actions],
  );
}

const W = 560;
const H = 220;
const PAD = { left: 34, right: 64, top: 12, bottom: 26 };

/**
 * Fortune after each voyage, one line per player in their piece colour. Every line ends in a
 * name label (identity never rests on colour alone) and hovering a voyage shows all values.
 */
export function FortuneChart({ stats, players }: { stats: GameStats; players: PlayerState[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const points = stats.fortunes;
  const max = Math.max(10, ...points.flatMap((f) => Object.values(f)));
  const min = Math.min(0, ...points.flatMap((f) => Object.values(f)));
  const step = Math.ceil((max - min) / 4 / 10) * 10 || 10;
  const top = Math.ceil(max / step) * step;
  const bottom = Math.floor(min / step) * step;
  const x = (i: number) =>
    PAD.left + (i * (W - PAD.left - PAD.right)) / Math.max(1, points.length - 1);
  const y = (v: number) => PAD.top + ((top - v) * (H - PAD.top - PAD.bottom)) / (top - bottom);
  const ticks: number[] = [];
  for (let v = bottom; v <= top; v += step) ticks.push(v);
  // Spread end labels that would overlap.
  const last = points.length - 1;
  const ends = players
    .map((p) => ({ p, y: y(points[last]![p.id] ?? 0) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i]!.y = Math.max(ends[i]!.y, ends[i - 1]!.y + 13);

  return (
    <div className="fortune-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={zh.stats.chartLabel}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text className="tick" x={PAD.left - 6} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {points.map((_, i) => (
          <text key={i} className="tick" x={x(i)} y={H - 8} textAnchor="middle">
            {i === 0 ? zh.stats.start : i}
          </text>
        ))}
        {hover !== null && (
          <line
            className="crosshair"
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={H - PAD.bottom}
          />
        )}
        {players.map((p) => {
          const color = PLAYER_COLORS[p.color].css;
          const d = points.map((f, i) => `${i ? 'L' : 'M'}${x(i)},${y(f[p.id] ?? 0)}`).join('');
          return (
            <g key={p.id}>
              <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
              {points.map((f, i) => (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(f[p.id] ?? 0)}
                  r={hover === i ? 4 : 2.5}
                  fill={color}
                  stroke="var(--panel)"
                  strokeWidth={2}
                />
              ))}
            </g>
          );
        })}
        {ends.map(({ p, y: ly }) => (
          <text key={p.id} className="end-label" x={x(last) + 8} y={ly + 4}>
            <tspan fill={PLAYER_COLORS[p.color].css}>■</tspan> {p.name}
          </text>
        ))}
        {/* Hit areas wider than the marks: one band per voyage. */}
        {points.map((_, i) => (
          <rect
            key={i}
            x={x(i) - (W - PAD.left - PAD.right) / Math.max(1, last) / 2}
            y={PAD.top}
            width={(W - PAD.left - PAD.right) / Math.max(1, last)}
            height={H - PAD.top - PAD.bottom}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
      <p className="fortune-tip muted" aria-live="polite">
        {hover === null
          ? zh.stats.hoverHint
          : `${hover === 0 ? zh.stats.start : zh.voyage(hover)}：` +
            [...players]
              .sort((a, b) => (points[hover]![b.id] ?? 0) - (points[hover]![a.id] ?? 0))
              .map((p) => `${p.name} ${points[hover]![p.id] ?? 0}`)
              .join(' · ')}
      </p>
    </div>
  );
}

/** Every peso by kind: income first, then spending. */
export function LedgerTable({ stats, players }: { stats: GameStats; players: PlayerState[] }) {
  return (
    <table className="rules-table ledger-table">
      <thead>
        <tr>
          <th>{zh.gameOver.player}</th>
          {LEDGER_KEYS.map((k) => (
            <th key={k} title={zh.stats.ledgerHelp[k]}>
              {zh.stats.ledger[k]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {players.map((p) => {
          const l = stats.ledgers[p.id]!;
          return (
            <tr key={p.id} style={{ '--pc': PLAYER_COLORS[p.color].css } as React.CSSProperties}>
              <td>
                <span className="swatch" /> {p.name}
              </td>
              {LEDGER_KEYS.map((k) => (
                <td key={k} className={l[k] > 0 ? 'plus' : l[k] < 0 ? 'minus' : 'muted'}>
                  {l[k] > 0 ? `+${l[k]}` : l[k] < 0 ? `−${-l[k]}` : '0'}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** One button per voyage: watch the game again from there. */
export function ReplayPicker({ stats }: { stats: GameStats }) {
  const startReplay = useGame((s) => s.startReplay);
  return (
    <div className="replay-picker">
      <span className="muted">{zh.stats.replayFrom}</span>
      {stats.voyageStarts.map((_, i) => (
        <button key={i} className="btn tiny ghost" onClick={() => startReplay(i + 1)}>
          {i + 1}
        </button>
      ))}
    </div>
  );
}
