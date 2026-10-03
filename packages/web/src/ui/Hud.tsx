import { useEffect, useRef, useState } from 'react';
import { MARKET_TRACK, WARES, type PlayerViewEntry, type Ware } from '@manila/engine';
import { zh } from '../i18n/zh';
import { useGame, useView } from '../game/store';
import { PLAYER_COLORS, WARE_COLORS } from '../scene/palette';
import { ActionBar } from './ActionBar';
import { Curtain } from './Curtain';
import { GameOver } from './GameOver';
import { DevBar } from './DevBar';
import { RulesSheet } from './RulesSheet';
import { SoundControls } from './SoundControls';

export function Hud() {
  return (
    <div className="hud">
      <TopBar />
      <PlayersPanel />
      <MarketPanel />
      <EventLog />
      <ActionBar />
      <Toast />
      <DevBar />
      <Curtain />
      <GameOver />
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
      <GameControls />
    </header>
  );
}

function GameControls() {
  const [rules, setRules] = useState(false);
  const settings = useGame((s) => s.settings);
  const setSettings = useGame((s) => s.setSettings);
  const backToSetup = useGame((s) => s.backToSetup);
  const nextSpeed = ({ 1: 2, 2: 4, 4: 1 } as const)[settings.speed];
  return (
    <span className="controls">
      <button className="btn tiny ghost" onClick={() => setRules(true)}>
        规则
      </button>
      <SoundControls />
      {rules && <RulesSheet onClose={() => setRules(false)} />}
      <button
        className="btn tiny ghost"
        title="动画速度"
        onClick={() => setSettings({ speed: nextSpeed })}
      >
        ×{settings.speed}
      </button>
      <button
        className="btn tiny ghost"
        title="隐藏股票（交接设备）"
        onClick={() => setSettings({ privacy: !settings.privacy })}
      >
        {settings.privacy ? '隐私开' : '隐私关'}
      </button>
      <button
        className="btn tiny ghost"
        onClick={() => {
          if (window.confirm('回到开局设置？当前对局已自动保存，可以在设置页"继续上局"。'))
            backToSetup();
        }}
      >
        新游戏
      </button>
    </span>
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

function PlayerCard({
  p,
  active,
  hm,
  bot,
}: {
  p: PlayerViewEntry;
  active: boolean;
  hm: boolean;
  bot: boolean;
}) {
  const free = p.accomplices - p.accomplicesPlaced;
  return (
    <li
      className={`player ${active ? 'active' : ''}`}
      style={{ '--pc': PLAYER_COLORS[p.color].css } as React.CSSProperties}
    >
      <div className="player-head">
        <span className="swatch" />
        <span className="name">{p.name}</span>
        {bot && <span className="bot-tag">{zh.bot}</span>}
        {hm && (
          <span className="hm" title={zh.harborMaster}>
            港
          </span>
        )}
        <span className="cash">{p.cash}</span>
        <Floaters playerId={p.id} />
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

/** "+18" / "−4" bubbles rising over a player's cash. */
function Floaters({ playerId }: { playerId: string }) {
  const floaters = useGame((s) => s.floaters);
  const mine = floaters.filter((f) => f.playerId === playerId);
  return (
    <span className="floaters">
      {mine.map((f, i) => (
        <span
          key={f.id}
          className={`floater ${f.amount >= 0 ? 'gain' : 'loss'}`}
          // Line concurrent amounts up along the player's own row (newest nearest the panel).
          style={{ left: `${(mine.length - 1 - i) * 44}px` }}
        >
          {f.amount >= 0 ? `+${f.amount}` : `−${-f.amount}`}
        </span>
      ))}
    </span>
  );
}

function EventLog() {
  const log = useGame((s) => s.log);
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [log]);
  return (
    <section className="log panel">
      <h3>航海日志</h3>
      <ol ref={ref}>
        {log.map((l) => (
          <li key={l.id}>{l.text}</li>
        ))}
      </ol>
    </section>
  );
}

function PlayersPanel() {
  const view = useView();
  const actor = 'playerId' in view.pending ? view.pending.playerId : null;
  const bots = useGame((s) => s.bots);
  return (
    <aside className="players panel">
      <ul>
        {view.players.map((p) => (
          <PlayerCard
            key={p.id}
            p={p}
            active={p.id === actor}
            hm={p.id === view.harborMaster}
            bot={!!bots[p.id]}
          />
        ))}
      </ul>
    </aside>
  );
}

function MarketPanel() {
  const view = useView();
  return (
    <section className="market panel">
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
    </section>
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
