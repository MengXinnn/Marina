import { Html } from '@react-three/drei';
import type { ReactNode } from 'react';
import { placementAdvice, type PlacementAdvice, type PlayerView } from '@manila/engine';
import { spotRules, spotTitle, type Spot } from '../i18n/spots';
import { useView } from '../game/store';
import { useOnScreen } from './useOnScreen';

/** Keep in-world DOM below the HUD panels and the hotseat curtain (they sit above the canvas). */
export const WORLD_Z: [number, number] = [20, 0];

const pct = (p: number) => `${Math.round(p * 100)}%`;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;

/**
 * Floating card over a hovered spot: what the place is, its rules, and — when the acting player
 * may pick it — what it costs and what it may pay, from the engine's `placementAdvice`.
 */
export function SpotTip({
  spot,
  y,
  actionable,
  hint,
}: {
  spot: Spot;
  /** Height of the card's anchor above the hovered object (local units). */
  y: number;
  actionable: boolean;
  /** Extra line, e.g. what a click does in the current decision. */
  hint?: string;
}) {
  return (
    <Html position={[0, y, 0]} zIndexRange={WORLD_Z} style={{ pointerEvents: 'none' }}>
      <SpotCard spot={spot} actionable={actionable} hint={hint} />
    </Html>
  );
}

function SpotCard({ spot, actionable, hint }: { spot: Spot; actionable: boolean; hint?: string }) {
  const view = useView();
  const ref = useOnScreen<HTMLDivElement>();
  const actor = view.pending.type === 'place-accomplice' ? view.pending.playerId : null;
  const placing = spot.kind !== 'office' && spot.kind !== 'warehouse';
  const advice = placing && actionable && actor ? placementAdvice(view, actor, spot) : null;
  return (
    <div className="spot-tip panel" ref={ref}>
      <h4>{spotTitle(spot)}</h4>
      <Status spot={spot} view={view} />
      {advice && <AdviceLine advice={advice} />}
      {hint && <p className="spot-hint">{hint}</p>}
      <ul>
        {spotRules(spot).map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

function AdviceLine({ advice }: { advice: PlacementAdvice }) {
  const parts: ReactNode[] = [
    <span key="c">
      花费 <b>{advice.cost}</b>
    </span>,
  ];
  if (advice.upfront)
    parts.push(
      <span key="u">
        立得 <b className="ok">{advice.upfront}</b>
      </span>,
    );
  if (advice.payout)
    parts.push(
      <span key="p">
        可得 <b className="ok">{advice.payout}</b>
        {advice.chance !== null && <> · 机会 {pct(advice.chance)}</>}
      </span>,
    );
  if (advice.liability)
    parts.push(
      <span key="l">
        最多赔 <b className="warn">{advice.liability}</b>
      </span>,
    );
  return (
    <div className="spot-advice">
      <div className="row">{parts}</div>
      {advice.expected !== null && (
        <div className={advice.expected >= 0 ? 'ok' : 'warn'}>
          按当前局面估算：平均 {signed(advice.expected)} 比索
        </div>
      )}
      {advice.chance === null && !advice.upfront && (
        <div className="muted">本身不赚钱，靠移动货船帮自己</div>
      )}
    </div>
  );
}

/** Who is there now / where the punt is. */
function Status({ spot, view }: { spot: Spot; view: PlayerView }) {
  const name = (id: string | null) => view.players.find((p) => p.id === id)?.name ?? null;
  switch (spot.kind) {
    case 'punt': {
      const p = view.punts.find((x) => x.ware === spot.ware);
      if (!p) return null;
      const aboard = p.seats.flatMap((s) => (s.occupant ? [name(s.occupant)] : []));
      const where =
        p.status === 'port'
          ? `已抵达港口 ${p.dock}`
          : p.status === 'shipyard'
            ? `在修船厂 ${p.dock}`
            : `在第 ${p.position} 格`;
      const odds = p.status === 'sailing' ? placementAdvice(view, '', spot).chance : null;
      return (
        <p className="spot-status">
          {where}
          {odds !== null && ` · 到港机会 ${pct(odds)}`}
          {` · 船上：${aboard.length ? aboard.join('、') : '没人'}`}
        </p>
      );
    }
    case 'port':
    case 'shipyard': {
      const who = name(view[spot.kind][spot.slot].occupant);
      return <p className="spot-status">{who ? `${who} 守在这里` : '空位'}</p>;
    }
    case 'pirate': {
      const c = name(view.pirates.captain);
      const m = name(view.pirates.crew);
      return (
        <p className="spot-status">
          船长：{c ?? '空'} · 船员：{m ?? '空'}
        </p>
      );
    }
    case 'pilot':
      return <p className="spot-status">{name(view.pilots[spot.size]) ?? '空位'}</p>;
    case 'insurance':
      return <p className="spot-status">{name(view.insurance) ?? '空位'}</p>;
    case 'office':
      return <p className="spot-status">现任港务长：{name(view.harborMaster) ?? '尚未选出'}</p>;
    case 'warehouse':
      return null;
  }
}
