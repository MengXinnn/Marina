import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { MARKET_TRACK, WARES, type PlayerViewEntry, type Ware } from '@manila/engine';
import { zh } from '../i18n/zh';
import { soleHuman, useGame, useView, type ComputerSeat, type LlmSeatStats } from '../game/store';
import { isLlmSeat } from '../game/seats';
import { useLlmSettings } from '../llm/settings';
import { PLAYER_COLORS, WARE_COLORS } from '../scene/palette';
import { ActionBar } from './ActionBar';
import { AiSettings } from './AiSettings';
import { Banner } from './Banner';
import { CountUp } from './CountUp';
import { Curtain } from './Curtain';
import { GameOver } from './GameOver';
import { DevBar } from './DevBar';
import { RulesSheet } from './RulesSheet';
import { SoundControls } from './SoundControls';

/**
 * Phone layout: the market, the log and the top-bar buttons stay tucked away until asked for
 * (desktop CSS shows them all and ignores this).
 */
type Sheet = 'menu' | 'market' | 'log';
const useSheet = create<{ sheet: Sheet | null; toggle(s: Sheet): void; close(): void }>((set) => ({
  sheet: null,
  toggle: (sheet) => set((s) => ({ sheet: s.sheet === sheet ? null : sheet })),
  close: () => set({ sheet: null }),
}));

/** Tapping the scene or another panel puts the open phone sheet away. */
function useCloseSheetOutside() {
  const open = useSheet((s) => s.sheet !== null);
  const close = useSheet((s) => s.close);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('.sheet-host')) close();
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open, close]);
}

export function Hud() {
  useCloseSheetOutside();
  return (
    <div className="hud">
      <TopBar />
      <PlayersPanel />
      <MarketPanel />
      <EventLog />
      <ActionBar />
      <Banner />
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
  const menu = useSheet((s) => s.sheet === 'menu');
  const toggle = useSheet((s) => s.toggle);
  return (
    <header className="topbar panel sheet-host">
      <span className="logo">{zh.title}</span>
      <span>{zh.voyage(view.voyage)}</span>
      <span className="phase">{zh.phase[view.phase]}</span>
      {roll && (
        <span className="dice">
          {WARES.filter((w) => roll[w]).map((w) => (
            <span
              key={`${view.voyage}-${view.movementRound}-${w}`}
              className="die"
              style={{ background: WARE_COLORS[w].css }}
            >
              {roll[w]}
            </span>
          ))}
        </span>
      )}
      {mode === 'mock' && <span className="badge">{zh.mockBanner}</span>}
      <MiniMarket />
      <button
        className="btn tiny ghost menu-toggle"
        aria-expanded={menu}
        onClick={() => toggle('menu')}
      >
        {menu ? '收起' : '菜单'}
      </button>
      <GameControls />
    </header>
  );
}

function GameControls() {
  const [rules, setRules] = useState(false);
  const [ai, setAi] = useState(false);
  const settings = useGame((s) => s.settings);
  const setSettings = useGame((s) => s.setSettings);
  const backToSetup = useGame((s) => s.backToSetup);
  // With one human and only computers there is no device to hand over.
  const solo = useGame((s) => soleHuman(s.state, s.bots) !== null);
  const nextSpeed = ({ 1: 2, 2: 4, 4: 1 } as const)[settings.speed];
  const menu = useSheet((s) => s.sheet === 'menu');
  const toggle = useSheet((s) => s.toggle);
  const close = useSheet((s) => s.close);
  return (
    <span className={`controls ${menu ? 'open' : ''}`}>
      <button
        className="btn tiny ghost"
        onClick={() => {
          close();
          setRules(true);
        }}
      >
        规则
      </button>
      <SoundControls />
      {rules && <RulesSheet onClose={() => setRules(false)} />}
      <button
        className="btn tiny ghost"
        title="AI 玩家设置（大语言模型）"
        onClick={() => {
          close();
          setAi(true);
        }}
      >
        AI
      </button>
      {ai && <AiSettings onClose={() => setAi(false)} />}
      <button
        className="btn tiny ghost"
        title="动画速度"
        onClick={() => setSettings({ speed: nextSpeed })}
      >
        ×{settings.speed}
      </button>
      {!solo && (
        <button
          className="btn tiny ghost"
          title="隐藏股票（交接设备）"
          onClick={() => setSettings({ privacy: !settings.privacy })}
        >
          {settings.privacy ? '隐私开' : '隐私关'}
        </button>
      )}
      <button className="btn tiny ghost phone-only" onClick={() => toggle('log')}>
        航海日志
      </button>
      <button
        className="btn tiny ghost"
        onClick={() => {
          close();
          if (window.confirm('回到开局设置？当前对局已自动保存，可以在设置页"继续上局"。'))
            backToSetup();
        }}
      >
        新游戏
      </button>
    </span>
  );
}

/** Phone top bar: each ware's current market value; tap for the full market table. */
function MiniMarket() {
  const view = useView();
  const toggle = useSheet((s) => s.toggle);
  return (
    <button className="mini-market" title={zh.market} onClick={() => toggle('market')}>
      {WARES.map((w) => (
        <span key={w} style={{ background: WARE_COLORS[w].css }}>
          {view.market[w]}
        </span>
      ))}
    </button>
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

/** Hover text for a language-model seat: which profile, and how it has been doing. */
function llmTitle(label: string, stats: LlmSeatStats | undefined): string {
  if (!stats) return label;
  const parts = [`${label}`, `AI 决策 ${stats.decisions} 次`];
  if (stats.fallbacks) parts.push(`内置电脑代走 ${stats.fallbacks} 次`);
  if (stats.inputTokens || stats.outputTokens)
    parts.push(`tokens 输入 ${stats.inputTokens} / 输出 ${stats.outputTokens}`);
  if (stats.lastError) parts.push(`最近错误：${stats.lastError}`);
  return parts.join('\n');
}

function BotTag({ playerId, seat }: { playerId: string; seat: ComputerSeat }) {
  const profile = useLlmSettings((s) =>
    isLlmSeat(seat) ? s.settings.profiles.find((p) => p.id === seat.llm) : undefined,
  );
  const stats = useGame((s) => s.llmStats[playerId]);
  if (!isLlmSeat(seat)) return <span className="bot-tag">{zh.bot}</span>;
  const label = profile ? `${profile.name} · ${profile.model}` : 'AI 配置已删除，由内置电脑代走';
  return (
    <span className="bot-tag llm" title={llmTitle(label, stats)}>
      AI
    </span>
  );
}

function PlayerCard({
  p,
  active,
  hm,
  seat,
}: {
  p: PlayerViewEntry;
  active: boolean;
  hm: boolean;
  seat: ComputerSeat | undefined;
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
        {seat && <BotTag playerId={p.id} seat={seat} />}
        {hm && (
          <span className="hm" title={zh.harborMaster}>
            港
          </span>
        )}
        <CountUp className="cash" value={p.cash} />
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
  const open = useSheet((s) => s.sheet === 'log');
  const close = useSheet((s) => s.close);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [log, open]);
  return (
    <section className={`log panel sheet-host ${open ? 'open' : ''}`}>
      <SheetClose onClose={close} />
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
            seat={bots[p.id]}
          />
        ))}
      </ul>
    </aside>
  );
}

function MarketPanel() {
  const view = useView();
  const open = useSheet((s) => s.sheet === 'market');
  const close = useSheet((s) => s.close);
  return (
    <section className={`market panel sheet-host ${open ? 'open' : ''}`}>
      <SheetClose onClose={close} />
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

/** Close button of a phone sheet (hidden on desktop, where the panel is always shown). */
function SheetClose({ onClose }: { onClose: () => void }) {
  return (
    <button className="btn tiny ghost sheet-close phone-only" onClick={onClose}>
      ×
    </button>
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
