import { useState } from 'react';
import { WARES } from '@manila/engine';
import { zh } from '../i18n/zh';
import { useGame } from '../game/store';
import { PLAYER_COLORS, WARE_COLORS } from '../scene/palette';
import { WareChip } from './Hud';

/**
 * Final standings (R9.2/R9.3). Hidden shares no longer matter once the game is over,
 * so this reads the full engine state and reveals every hand.
 */
export function GameOver() {
  const state = useGame((s) => s.display);
  const playing = useGame((s) => s.playing);
  const backToSetup = useGame((s) => s.backToSetup);
  const [hidden, setHidden] = useState(false);
  const result = state.result;
  if (state.phase !== 'game-over' || !result || playing) return null;
  if (hidden)
    return (
      <button className="btn big gameover-reopen" onClick={() => setHidden(false)}>
        {zh.gameOver.show}
      </button>
    );

  const byId = new Map(state.players.map((p) => [p.id, p]));
  const ranked = [...result.scores].sort((a, b) => b.total - a.total);
  const winners = result.winners.map((id) => byId.get(id)?.name ?? id);

  return (
    <div className="curtain-backdrop">
      <div className="gameover panel">
        <h2>{zh.gameOver.title}</h2>
        <p className="gameover-winner">
          {winners.length > 1
            ? zh.gameOver.tie(winners.join('、'))
            : zh.gameOver.winner(winners[0]!)}
        </p>
        <table className="rules-table gameover-table">
          <thead>
            <tr>
              <th />
              <th>{zh.gameOver.player}</th>
              <th>{zh.cash}</th>
              <th>{zh.gameOver.shareValue}</th>
              <th>{zh.gameOver.mortgage}</th>
              <th>{zh.gameOver.total}</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((line, i) => {
              const p = byId.get(line.playerId)!;
              const won = result.winners.includes(line.playerId);
              return (
                <tr
                  key={line.playerId}
                  className={won ? 'won' : ''}
                  style={{ '--pc': PLAYER_COLORS[p.color].css } as React.CSSProperties}
                >
                  <td>{won ? '★' : i + 1}</td>
                  <td>
                    <span className="swatch" /> {p.name}
                    <div className="gameover-shares">
                      {p.shares.map((s) => (
                        <span key={s.id} className={s.mortgaged ? 'mortgaged' : ''}>
                          <WareChip ware={s.ware} label={String(state.market[s.ware])} />
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>{line.cash}</td>
                  <td>{line.shareValue}</td>
                  <td>{line.mortgagePenalty ? `−${line.mortgagePenalty}` : 0}</td>
                  <td className="gameover-total">{line.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted gameover-market">
          {zh.market}：
          {WARES.map((w) => (
            <span key={w} className="chip" style={{ background: WARE_COLORS[w].css }}>
              {zh.ware[w]} {state.market[w]}
            </span>
          ))}
        </p>
        <div className="row gameover-actions">
          <button className="btn big" onClick={backToSetup}>
            {zh.gameOver.again}
          </button>
          <button className="btn ghost" onClick={() => setHidden(true)}>
            {zh.gameOver.board}
          </button>
        </div>
      </div>
    </div>
  );
}
