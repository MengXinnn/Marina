import { zh } from '../i18n/zh';
import { useCurtain, useGame } from '../game/store';
import { PLAYER_COLORS } from '../scene/palette';

/**
 * Hotseat hand-over: while it is up every share is hidden (viewer = null), so the previous
 * player cannot see the next player's hand. The board stays visible — it is public information.
 */
export function Curtain() {
  const actor = useCurtain();
  const reveal = useGame((s) => s.reveal);
  const display = useGame((s) => s.display);
  if (!actor) return null;
  const p = display.players.find((x) => x.id === actor);
  if (!p) return null;
  return (
    <div className="curtain-backdrop">
      <div
        className="curtain panel"
        style={{ '--pc': PLAYER_COLORS[p.color].css } as React.CSSProperties}
      >
        <p className="muted">{zh.phase[display.phase]}</p>
        <p className="curtain-name">
          <span className="swatch" />
          {p.name}
        </p>
        <p>请把设备交给 {p.name}，其他人请不要看屏幕上的股票。</p>
        <button className="btn big" autoFocus onClick={reveal}>
          我是{p.name}，开始
        </button>
      </div>
    </div>
  );
}
