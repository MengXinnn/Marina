import { useState } from 'react';
import {
  MAX_START_SPACE,
  START_SUM,
  WARES,
  type Action,
  type PendingDecision,
  type PilotMove,
  type PlayerView,
  type PuntPlan,
  type Ware,
} from '@manila/engine';
import { zh } from '../i18n/zh';
import { useCurtain, useGame, useView } from '../game/store';
import { PLAYER_COLORS } from '../scene/palette';
import { WareChip } from './Hud';

/** Bottom panel: one UI per `pending.type`. It only collects input — the engine validates. */
export function ActionBar() {
  const view = useView();
  const dispatch = useGame((s) => s.dispatch);
  const undo = useGame((s) => s.undo);
  const canUndo = useGame((s) => s.history.length > 0);
  const playing = useGame((s) => s.playing);
  const skip = useGame((s) => s.skipAnimation);
  const curtain = useCurtain();
  const bots = useGame((s) => s.bots);
  const pending = view.pending;
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
  if (actor && bots[actor.id])
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
          <p className="muted">{zh.botThinking(actor.name)}</p>
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
        <PendingPanel pending={pending} view={view} send={dispatch} />
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

function PendingPanel({
  pending,
  view,
  send,
}: {
  pending: PendingDecision;
  view: PlayerView;
  send: Send;
}) {
  switch (pending.type) {
    case 'bid':
      return <BidPanel pending={pending} send={send} />;
    case 'buy-share':
      return (
        <>
          <p>{zh.prompts.buyShare}</p>
          <div className="row">
            {WARES.filter((w) => pending.prices[w] !== undefined).map((w) => (
              <button
                key={w}
                className="btn"
                onClick={() => send({ type: 'buy-share', playerId: pending.playerId, ware: w })}
              >
                <WareChip ware={w} /> {pending.prices[w]}
              </button>
            ))}
            <button
              className="btn ghost"
              onClick={() => send({ type: 'buy-share', playerId: pending.playerId, ware: null })}
            >
              {zh.actions.skipBuy}
            </button>
          </div>
        </>
      );
    case 'load-punts':
      return <LoadPanel playerId={pending.playerId} send={send} />;
    case 'place-accomplice':
      return (
        <>
          <p>{pending.blindPassenger ? zh.prompts.blind : zh.prompts.place}</p>
          <div className="row">
            <span className="muted">{zh.round(pending.round)}</span>
            <button
              className="btn ghost"
              onClick={() => send({ type: 'pass-placement', playerId: pending.playerId })}
            >
              {zh.actions.pass}
            </button>
          </div>
        </>
      );
    case 'roll-dice':
      return (
        <>
          <p>{zh.prompts.roll(pending.round)}</p>
          <button
            className="btn big"
            onClick={() => send({ type: 'roll-dice', playerId: pending.playerId })}
          >
            🎲 {zh.actions.roll}
          </button>
        </>
      );
    case 'pirate-board':
      return (
        <>
          <p>{zh.prompts.pirateBoard}</p>
          <div className="row">
            {pending.candidates.map((w) => (
              <button
                key={w}
                className="btn"
                onClick={() => send({ type: 'pirate-board', playerId: pending.playerId, ware: w })}
              >
                {zh.actions.board(zh.ware[w])}
              </button>
            ))}
            <button
              className="btn ghost"
              onClick={() => send({ type: 'pirate-board', playerId: pending.playerId, ware: null })}
            >
              {zh.actions.stay}
            </button>
          </div>
        </>
      );
    case 'pilot':
      return <PilotPanel pending={pending} view={view} send={send} />;
    case 'plunder-destination':
      return (
        <>
          <p>{zh.prompts.plunder(zh.ware[pending.ware])}</p>
          <div className="row">
            <button
              className="btn"
              onClick={() =>
                send({
                  type: 'plunder-destination',
                  playerId: pending.playerId,
                  destination: 'port',
                })
              }
            >
              {zh.actions.toPort}
            </button>
            <button
              className="btn"
              onClick={() =>
                send({
                  type: 'plunder-destination',
                  playerId: pending.playerId,
                  destination: 'shipyard',
                })
              }
            >
              {zh.actions.toShipyard}
            </button>
          </div>
        </>
      );
    case 'game-over':
      return <p>{zh.prompts.gameOver}</p>;
  }
}

function BidPanel({
  pending,
  send,
}: {
  pending: Extract<PendingDecision, { type: 'bid' }>;
  send: Send;
}) {
  const [amount, setAmount] = useState(pending.minBid);
  const canBid = pending.maxBid >= pending.minBid;
  return (
    <>
      <p>{zh.prompts.bid(pending.minBid, pending.maxBid)}</p>
      <div className="row">
        {canBid && (
          <>
            <Stepper
              value={amount}
              min={pending.minBid}
              max={pending.maxBid}
              onChange={setAmount}
            />
            <button
              className="btn"
              onClick={() => send({ type: 'bid', playerId: pending.playerId, amount })}
            >
              {zh.actions.bid} {amount}
            </button>
          </>
        )}
        <button
          className="btn ghost"
          onClick={() => send({ type: 'pass-bid', playerId: pending.playerId })}
        >
          {zh.actions.passBid}
        </button>
      </div>
    </>
  );
}

function LoadPanel({ playerId, send }: { playerId: string; send: Send }) {
  const [plan, setPlan] = useState<Partial<Record<Ware, number>>>({ jade: 2, silk: 3, ginseng: 4 });
  const chosen = WARES.filter((w) => plan[w] !== undefined);
  const sum = chosen.reduce((s, w) => s + plan[w]!, 0);
  const valid = chosen.length === 3 && sum === START_SUM;
  const toggle = (w: Ware) =>
    setPlan((p) => {
      const next = { ...p };
      if (next[w] === undefined) {
        if (chosen.length >= 3) return p;
        next[w] = 0;
      } else delete next[w];
      return next;
    });
  return (
    <>
      <p>{zh.prompts.loadPunts}</p>
      <div className="row">
        {WARES.map((w) => (
          <div key={w} className={`load ${plan[w] === undefined ? 'off' : ''}`}>
            <button className="btn ghost" onClick={() => toggle(w)}>
              <WareChip ware={w} />
            </button>
            {plan[w] !== undefined && (
              <Stepper
                value={plan[w]!}
                min={0}
                max={MAX_START_SPACE}
                onChange={(v) => setPlan((p) => ({ ...p, [w]: v }))}
              />
            )}
          </div>
        ))}
        <span className={valid ? 'ok' : 'warn'}>
          Σ {sum}/{START_SUM}
        </span>
        <button
          className="btn"
          disabled={!valid}
          onClick={() =>
            send({
              type: 'load-punts',
              playerId,
              punts: chosen.map((ware) => ({ ware, start: plan[ware]! })) as [
                PuntPlan,
                PuntPlan,
                PuntPlan,
              ],
            })
          }
        >
          {zh.actions.load}
        </button>
      </div>
    </>
  );
}

function PilotPanel({
  pending,
  view,
  send,
}: {
  pending: Extract<PendingDecision, { type: 'pilot' }>;
  view: PlayerView;
  send: Send;
}) {
  const sailing = view.punts.filter((p) => p.status === 'sailing').map((p) => p.ware);
  const [deltas, setDeltas] = useState<Partial<Record<Ware, number>>>({});
  const moves: PilotMove[] = sailing
    .filter((w) => deltas[w])
    .map((w) => ({ ware: w, delta: deltas[w] as PilotMove['delta'] }));
  const limit = pending.size === 'small' ? 1 : 2;
  const total = moves.reduce((s, m) => s + Math.abs(m.delta), 0);
  const valid = total <= limit && (moves.length < 2 || moves.every((m) => Math.abs(m.delta) === 1));
  return (
    <>
      <p>{zh.prompts.pilot(zh.pilot[pending.size])}</p>
      <div className="row">
        {sailing.map((w) => (
          <div key={w} className="load">
            <WareChip ware={w} />
            <Stepper
              value={deltas[w] ?? 0}
              min={-limit}
              max={limit}
              signed
              onChange={(v) => setDeltas((d) => ({ ...d, [w]: v }))}
            />
          </div>
        ))}
        <button
          className="btn"
          disabled={!valid || moves.length === 0}
          onClick={() => send({ type: 'pilot', playerId: pending.playerId, moves })}
        >
          {zh.actions.confirm}
        </button>
        <button
          className="btn ghost"
          onClick={() => send({ type: 'pilot', playerId: pending.playerId, moves: [] })}
        >
          {zh.actions.skipPilot}
        </button>
      </div>
    </>
  );
}

function Stepper({
  value,
  min,
  max,
  signed,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  signed?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <span className="stepper">
      <button className="btn tiny" disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="value">{signed && value > 0 ? `+${value}` : value}</span>
      <button className="btn tiny" disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </span>
  );
}
