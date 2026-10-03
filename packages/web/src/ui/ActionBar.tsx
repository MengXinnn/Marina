import type { Action, PendingDecision } from '@manila/engine';
import { zh } from '../i18n/zh';
import { useBotActing, useCurtain, useGame, useView } from '../game/store';
import { PLAYER_COLORS } from '../scene/palette';
import { BotThinking } from './BotThinking';

/** Bottom prompt strip: who acts and what to do. It only collects "pass" — the engine validates. */
export function ActionBar() {
  const view = useView();
  const dispatch = useGame((s) => s.dispatch);
  const undo = useGame((s) => s.undo);
  const canUndo = useGame((s) => s.history.length > 0);
  const playing = useGame((s) => s.playing);
  const skip = useGame((s) => s.skipAnimation);
  const curtain = useCurtain();
  const pending = view.pending;
  const botActing = useBotActing('playerId' in pending ? pending.playerId : null);
  if (playing)
    return (
      <footer className="actionbar panel">
        <div className="action-body">
          <p className="muted">航行中……</p>
        </div>
        <button className="btn ghost" onClick={skip}>
          跳过动画
        </button>
      </footer>
    );
  if (curtain) return null;
  const actor =
    'playerId' in pending ? view.players.find((p) => p.id === pending.playerId) : undefined;
  if (actor && botActing)
    return (
      <footer className="actionbar panel">
        <div
          className="actor"
          style={{ '--pc': PLAYER_COLORS[actor.color].css } as React.CSSProperties}
        >
          <span className="swatch" />
          {actor.name}
        </div>
        <div className="action-body">
          <BotThinking playerId={actor.id} name={actor.name} />
        </div>
      </footer>
    );
  return (
    <footer className="actionbar panel" key={`${view.turn}-${pending.type}`}>
      {actor && (
        <div
          className="actor"
          style={{ '--pc': PLAYER_COLORS[actor.color].css } as React.CSSProperties}
        >
          <span className="swatch" />
          {actor.name}
        </div>
      )}
      <div className="action-body">
        <Prompt pending={pending} send={dispatch} />
      </div>
      {canUndo && (
        <button className="btn ghost" onClick={undo}>
          {zh.actions.undo}
        </button>
      )}
    </footer>
  );
}

type Send = (a: Action) => void;

/**
 * One line telling the acting player what to do. The choices themselves live in the scene
 * (scene/WorldActions.tsx and the clickable spots); only "pass" stays here.
 */
function Prompt({ pending, send }: { pending: PendingDecision; send: Send }) {
  switch (pending.type) {
    case 'bid':
      return <p>{zh.prompts.bid}</p>;
    case 'buy-share':
      return <p>{zh.prompts.buyShare}</p>;
    case 'load-punts':
      return <p>{zh.prompts.loadPunts}</p>;
    case 'place-accomplice':
      return (
        <div className="row">
          <p>{pending.blindPassenger ? zh.prompts.blind : zh.prompts.place}</p>
          <span className="muted">{zh.round(pending.round)}</span>
          <button
            className="btn ghost"
            onClick={() => send({ type: 'pass-placement', playerId: pending.playerId })}
          >
            {zh.actions.pass}
          </button>
        </div>
      );
    case 'roll-dice':
      return <p>{zh.prompts.roll(pending.round)}</p>;
    case 'pirate-board':
      return <p>{zh.prompts.pirateBoard}</p>;
    case 'pilot':
      return <p>{zh.prompts.pilot(zh.pilot[pending.size])}</p>;
    case 'plunder-destination':
      return <p>{zh.prompts.plunder(zh.ware[pending.ware])}</p>;
    case 'game-over':
      return <p>{zh.prompts.gameOver}</p>;
  }
}
