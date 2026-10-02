import { useEffect } from 'react';
import { MARKET_TRACK, WARES, type PlayerViewEntry, type Ware } from '@manila/engine';
import { zh } from '../i18n/zh';
import { useGame, useView } from '../game/store';
import { PLAYER_COLORS, WARE_COLORS } from '../scene/palette';
import { ActionBar } from './ActionBar';
import { DevBar } from './DevBar';

export function Hud() {
  return (
    <div className="hud">
      <TopBar />
      <PlayersPanel />
      <MarketPanel />
      <ActionBar />
      <Toast />
      <DevBar />
    </div>
  );
}

function TopBar() {
  const view = useView();
  const mode = useGame((s) => s.mode);
  const roll = view.lastRoll;
  return (
    <header className="topbar panel">
      <span className="logo">{zh.title}</span>
      <span>{zh.voyage(view.voyage)}</span>
      <span className="phase">{zh.phase[view.phase]}</span>
      {roll && (
        <span className="dice">
          {WARES.filter((w) => roll[w]).map((w) => (
            <span key={w} className="die" style={{ background: WARE_COLORS[w].css }}>
              {roll[w]}
            </span>
          ))}
        </span>
      )}
      {mode === 'mock' && <span className="badge">{zh.mockBanner}</span>}
    </header>
  );
}

export function WareChip({ ware, label }: { ware: Ware | null; label?: string }) {
  return (
    <span
      className={`chip ${ware ? '' : 'chip-hidden'}`}
      style={ware ? { background: WARE_COLORS[ware].css } : undefined}
    >
      {label ?? (ware ? zh.ware[ware] : '?')}
    </span>
  );
}

function PlayerCard({ p, active, hm }: { p: PlayerViewEntry; active: boolean; hm: boolean }) {
  const free = p.accomplices - p.accomplicesPlaced;
  return (
    <li
      className={`player ${active ? 'active' : ''}`}
      style={{ '--pc': PLAYER_COLORS[p.color].css } as React.CSSProperties}
    >
      <div className="player-head">
        <span className="swatch" />
        <span className="name">{p.name}</span>
        {hm && (
          <span className="hm" title={zh.harborMaster}>
            港
          </span>
        )}
        <span className="cash">{p.cash}</span>
      </div>
      <div className="player-row">
        {p.shares.map((s) => (
          <span
            key={s.id}
            className={s.mortgaged ? 'mortgaged' : ''}
            title={s.mortgaged ? zh.mortgaged : undefined}
          >
            <WareChip ware={s.ware} />
          </span>
        ))}
      </div>
      <div className="player-row pips">
        {Array.from({ length: p.accomplices }, (_, i) => (
          <span key={i} className={`pip ${i < free ? '' : 'used'}`} />
        ))}
        {p.passedPlacement && <span className="passed">已放弃</span>}
      </div>
    </li>
  );
}

function PlayersPanel() {
  const view = useView();
  const actor = 'playerId' in view.pending ? view.pending.playerId : null;
  return (
    <aside className="players panel">
      <ul>
        {view.players.map((p) => (
          <PlayerCard key={p.id} p={p} active={p.id === actor} hm={p.id === view.harborMaster} />
        ))}
      </ul>
    </aside>
  );
}

function MarketPanel() {
  const view = useView();
  return (
    <aside className="market panel">
      <h3>{zh.market}</h3>
      <table>
        <tbody>
          {WARES.map((w) => (
            <tr key={w}>
              <td>
                <WareChip ware={w} />
              </td>
              {MARKET_TRACK.map((v) => (
                <td
                  key={v}
                  className={`cell ${view.market[w] === v ? 'on' : ''}`}
                  style={view.market[w] === v ? { background: WARE_COLORS[w].css } : undefined}
                >
                  {v}
                </td>
              ))}
              <td className="supply" title={zh.supply}>
                ×{view.shareSupply[w]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  );
}

function Toast() {
  const notice = useGame((s) => s.notice);
  const notify = useGame((s) => s.notify);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => notify(null), 3200);
    return () => clearTimeout(id);
  }, [notice, notify]);
  if (!notice) return null;
  const text = zh.notices[notice] ?? (zh.engineError as Record<string, string>)[notice] ?? notice;
  return <div className="toast panel">{text}</div>;
}
