import { useEffect, useState } from 'react';
import type { PlayerId } from '@manila/engine';
import { zh } from '../i18n/zh';
import { useGame } from '../game/store';
import './ai.css';

/**
 * What the action bar says while a computer seat acts. For a language-model seat it shows the
 * model and how long the table has been waiting, and lets the humans stop waiting.
 */
export function BotThinking({ playerId, name }: { playerId: PlayerId; name: string }) {
  const thinking = useGame((s) => (s.llmThinking?.playerId === playerId ? s.llmThinking : null));
  const takeOver = useGame((s) => s.llmTakeOver);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!thinking) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [thinking]);
  if (!thinking) return <p className="muted">{zh.botThinking(name)}</p>;
  const seconds = Math.max(0, Math.floor((now - thinking.startedAt) / 1000));
  return (
    <div className="ai-thinking">
      <p className="muted">
        AI {name} 正在思考
        <span className="ai-dots" />（{thinking.label}，{seconds} 秒）
      </p>
      <button
        className="btn tiny ghost"
        onClick={takeOver}
        title="放弃这次等待，由内置电脑走这一步"
      >
        不等了，内置电脑代走
      </button>
    </div>
  );
}
