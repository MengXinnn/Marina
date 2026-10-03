import { useEffect, useState } from 'react';
import type { GameEvent, GameState } from '@manila/engine';
import { onFxStep } from '../game/fx';
import { zh } from '../i18n/zh';
import { PLAYER_COLORS } from '../scene/palette';

interface Shown {
  id: number;
  title: string;
  sub?: string;
  tone: 'gold' | 'danger' | 'calm';
  color?: string;
  ms: number;
}

const HOLD_MS = 1500;
let nextId = 1;

function bannerFor(e: GameEvent, state: GameState): Omit<Shown, 'id' | 'ms'> | null {
  switch (e.type) {
    case 'voyage-started':
      return { title: zh.voyage(e.voyage), sub: zh.banner.voyageSub, tone: 'gold' };
    case 'harbor-master-elected': {
      const p = state.players.find((x) => x.id === e.playerId);
      return {
        title: zh.banner.harborMaster(p?.name ?? e.playerId),
        sub: zh.banner.harborMasterPrice(e.price),
        tone: 'calm',
        color: p ? PLAYER_COLORS[p.color].css : undefined,
      };
    }
    case 'dice-rolled':
      return { title: zh.banner.roll(e.round), tone: 'calm' };
    case 'punt-plundered':
      return {
        title: zh.banner.plunder,
        sub: zh.banner.plunderSub(zh.ware[e.ware]),
        tone: 'danger',
      };
    case 'voyage-ended':
      return { title: zh.banner.voyageEnd(e.voyage), tone: 'gold' };
    default:
      return null;
  }
}

/** Big pixel ribbon announcing the moments of a voyage, driven by the event director. */
export function Banner() {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(
    () =>
      onFxStep(({ events, after, speed }) => {
        for (const e of events) {
          const b = bannerFor(e, after);
          if (b) setShown({ ...b, id: nextId++, ms: HOLD_MS / speed });
        }
      }),
    [],
  );

  useEffect(() => {
    if (!shown) return;
    const id = setTimeout(() => setShown(null), shown.ms);
    return () => clearTimeout(id);
  }, [shown]);

  if (!shown) return null;
  return (
    <div
      key={shown.id}
      className={`banner banner-${shown.tone}`}
      style={
        {
          '--banner-ms': `${shown.ms}ms`,
          ...(shown.color ? { '--pc': shown.color } : {}),
        } as React.CSSProperties
      }
      aria-live="polite"
    >
      <div className="banner-title">
        {shown.color && <span className="swatch" />}
        {shown.title}
      </div>
      {shown.sub && <div className="banner-sub">{shown.sub}</div>}
    </div>
  );
}
