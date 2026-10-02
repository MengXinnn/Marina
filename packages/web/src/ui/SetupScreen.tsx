import { useState } from 'react';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  type BotLevel,
  type PlayerColor,
  type PlayerSetup,
} from '@manila/engine';
import { zh } from '../i18n/zh';
import { useGame } from '../game/store';
import { hasSave } from '../game/save';
import { PLAYER_COLORS } from '../scene/palette';
import { RulesSheet } from './RulesSheet';

const COLORS: PlayerColor[] = ['red', 'blue', 'orange', 'purple', 'white'];
const DEFAULT_NAMES = ['小红', '阿蓝', '橙子', '紫苏', '小白'];

/** A setup row: the engine's PlayerSetup plus whether the computer plays this seat. */
type Row = PlayerSetup & { bot: BotLevel | null };

const freshPlayers = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ name: DEFAULT_NAMES[i]!, color: COLORS[i]!, bot: null }));

/** Human → easy computer → normal computer → human. */
const nextSeat = (bot: BotLevel | null): BotLevel | null =>
  bot === null ? 'normal' : bot === 'normal' ? 'easy' : null;

export function SetupScreen() {
  const mode = useGame((s) => s.mode);
  const settings = useGame((s) => s.settings);
  const setSettings = useGame((s) => s.setSettings);
  const startGame = useGame((s) => s.startGame);
  const resumeSaved = useGame((s) => s.resumeSaved);
  const [players, setPlayers] = useState<Row[]>(() => freshPlayers(4));
  const [pirateDisplace, setPirateDisplace] = useState(false);
  const [rules, setRules] = useState(false);
  const canResume = mode === 'live' && hasSave();

  const update = (i: number, patch: Partial<Row>) =>
    setPlayers((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const pickColor = (i: number, color: PlayerColor) =>
    setPlayers((ps) => {
      const owner = ps.findIndex((p) => p.color === color);
      return ps.map((p, k) =>
        k === i ? { ...p, color } : k === owner ? { ...p, color: ps[i]!.color } : p,
      );
    });
  const move = (i: number, d: -1 | 1) =>
    setPlayers((ps) => {
      const j = i + d;
      if (j < 0 || j >= ps.length) return ps;
      const next = [...ps];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const add = () =>
    setPlayers((ps) => {
      if (ps.length >= MAX_PLAYERS) return ps;
      const color = COLORS.find((c) => !ps.some((p) => p.color === c))!;
      const name =
        DEFAULT_NAMES.find((n) => !ps.some((p) => p.name === n)) ?? `玩家${ps.length + 1}`;
      return [...ps, { name, color, bot: null }];
    });
  const remove = (i: number) =>
    setPlayers((ps) => (ps.length <= MIN_PLAYERS ? ps : ps.filter((_, k) => k !== i)));

  const valid =
    players.every((p) => p.name.trim()) &&
    new Set(players.map((p) => p.name.trim())).size === players.length;

  return (
    <div className="setup-backdrop">
      <div className="setup panel">
        <h1 className="setup-title">{zh.title}</h1>
        <p className="setup-sub">
          MANILA · 体素版 · 本地 {MIN_PLAYERS}–{MAX_PLAYERS} 人轮流游玩
        </p>
        <p className="muted setup-story">
          1821
          年的马尼拉，商人们竞拍港务长、派遣同伙押注货船，躲开海盗，把人参、肉豆蔻、丝绸和玉器偷运进黑市。
        </p>

        <h3>玩家（按座次顺时针；第一位视为最年长，第一航次先叫价）</h3>
        <ol className="setup-players">
          {players.map((p, i) => (
            <li key={i} style={{ '--pc': PLAYER_COLORS[p.color].css } as React.CSSProperties}>
              <span className="swatch" />
              <input
                className="input"
                value={p.name}
                maxLength={8}
                onChange={(e) => update(i, { name: e.target.value })}
                aria-label={`玩家 ${i + 1} 名字`}
              />
              <button
                className={`btn tiny seat-toggle ${p.bot ? '' : 'ghost'}`}
                onClick={() => update(i, { bot: nextSeat(p.bot) })}
                title="切换：人类 / 电脑（普通）/ 电脑（简单）"
              >
                {p.bot ? `${zh.bot}·${zh.botLevel[p.bot]}` : '人类'}
              </button>
              <span className="colors">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`color-dot ${p.color === c ? 'on' : ''}`}
                    style={{ background: PLAYER_COLORS[c].css }}
                    onClick={() => pickColor(i, c)}
                    aria-label={c}
                  />
                ))}
              </span>
              <button
                className="btn tiny ghost"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label="上移"
              >
                ↑
              </button>
              <button
                className="btn tiny ghost"
                disabled={i === players.length - 1}
                onClick={() => move(i, 1)}
                aria-label="下移"
              >
                ↓
              </button>
              <button
                className="btn tiny ghost"
                disabled={players.length <= MIN_PLAYERS}
                onClick={() => remove(i)}
                aria-label="移除"
              >
                ×
              </button>
            </li>
          ))}
        </ol>
        {players.length < MAX_PLAYERS && (
          <button className="btn ghost" onClick={add}>
            + 添加玩家
          </button>
        )}

        <h3>选项</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.privacy}
            onChange={(e) => setSettings({ privacy: e.target.checked })}
          />
          隐藏股票：每次轮到别人时先交接设备（推荐）
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={pirateDisplace}
            onChange={(e) => setPirateDisplace(e.target.checked)}
          />
          变体规则：强力海盗（满员也能挤下同伙登船）
        </label>

        <div className="row setup-actions">
          <button
            className="btn big"
            disabled={!valid}
            onClick={() =>
              startGame(
                {
                  players: players.map(({ name, color }) => ({ name: name.trim(), color })),
                  rules: { pirateDisplace },
                },
                // createGame assigns ids p1..pN in seat order (contract).
                Object.fromEntries(
                  players.flatMap((p, i) => (p.bot ? [[`p${i + 1}`, p.bot]] : [])),
                ),
              )
            }
          >
            开始游戏
          </button>
          <button className="btn ghost" onClick={() => setRules(true)}>
            规则速查
          </button>
          {canResume && (
            <button className="btn ghost" onClick={() => resumeSaved()}>
              继续上局
            </button>
          )}
        </div>
        {rules && <RulesSheet onClose={() => setRules(false)} />}
        {mode === 'mock' && (
          <p className="warn">规则引擎开发中：现在开始会进入固定的 4 人演示局。</p>
        )}
      </div>
    </div>
  );
}
