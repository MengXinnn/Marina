import type { PendingDecision } from '@manila/engine';
import { useGame } from '../game/store';

/** Mock-mode helper: preview every decision panel before the engine exists. */
const PREVIEWS: Array<[string, PendingDecision]> = [
  ['竞拍', { type: 'bid', playerId: 'p3', minBid: 4, maxBid: 51 }],
  [
    '买股',
    { type: 'buy-share', playerId: 'p2', prices: { ginseng: 5, nutmeg: 10, silk: 5, jade: 5 } },
  ],
  ['装货', { type: 'load-punts', playerId: 'p2' }],
  ['派遣', { type: 'place-accomplice', playerId: 'p3', round: 2, blindPassenger: false }],
  ['掷骰', { type: 'roll-dice', playerId: 'p2', round: 2 }],
  ['登船', { type: 'pirate-board', playerId: 'p4', role: 'captain', candidates: ['ginseng'] }],
  ['领航', { type: 'pilot', playerId: 'p1', size: 'large' }],
  ['劫掠', { type: 'plunder-destination', playerId: 'p4', ware: 'jade' }],
];

export function DevBar() {
  const mode = useGame((s) => s.mode);
  const setMockPending = useGame((s) => s.setMockPending);
  if (mode !== 'mock') return null;
  return (
    <nav className="devbar panel">
      <span className="muted">预览</span>
      {PREVIEWS.map(([label, p]) => (
        <button key={label} className="btn tiny" onClick={() => setMockPending(p)}>
          {label}
        </button>
      ))}
    </nav>
  );
}
