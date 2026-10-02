import {
  DOCK_SLOTS,
  GAME_END_VALUE,
  INSURANCE_PREMIUM,
  LOAN_AMOUNT,
  LOAN_REPAYMENT,
  MARKET_TRACK,
  MAX_START_SPACE,
  MIN_SHARE_PRICE,
  PILOT_COST,
  PIRATE_COST,
  PORT_SLOTS,
  SHIPYARD_SLOTS,
  START_SUM,
  STARTING_CASH,
  WARE_INFO,
  WARES,
} from '@manila/engine';
import { zh } from '../i18n/zh';
import { WareChip } from './Hud';

/** Quick reference. Every number comes from the engine constants, so it can never drift. */
export function RulesSheet({ onClose }: { onClose: () => void }) {
  const slots = (table: typeof PORT_SLOTS) =>
    DOCK_SLOTS.map((s) => `${s}：花 ${table[s].cost} 得 ${table[s].reward}`).join('　');
  return (
    <div className="curtain-backdrop" onClick={onClose}>
      <div className="rules panel" onClick={(e) => e.stopPropagation()}>
        <div className="rules-head">
          <h2>规则速查</h2>
          <button className="btn tiny ghost" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <h3>目标</h3>
        <p>
          每人开局 {STARTING_CASH} 比索、2 张暗股。任一货物黑市价值达到 {GAME_END_VALUE}{' '}
          时游戏结束。财富 = 现金 + 所有股票的黑市价值 − 每张抵押股 {LOAN_REPAYMENT}。
        </p>

        <h3>每个航次</h3>
        <ol>
          <li>竞拍港务长：轮流加价或放弃，最高者付钱当选。</li>
          <li>
            港务长可买 1 张股票（价格 = 黑市价值，至少 {MIN_SHARE_PRICE}），然后选 3 种货装船，起点
            0–{MAX_START_SPACE}，三船起点之和必须为 {START_SUM}。
          </li>
          <li>派遣同伙与掷骰交替进行，共掷骰 3 次（3 人局开头多一轮派遣）。</li>
          <li>越过 13 格的船抵达马尼拉；第 3 次掷骰后没到的船进船坞。</li>
          <li>结算收益；抵达的货物黑市价值上涨一格（{MARKET_TRACK.join(' → ')}）。</li>
        </ol>

        <h3>派遣位置</h3>
        <table className="rules-table">
          <tbody>
            {WARES.map((w) => (
              <tr key={w}>
                <td>
                  <WareChip ware={w} />
                </td>
                <td>座位 {WARE_INFO[w].seatCosts.join(' / ')}</td>
                <td>抵达后船上的人平分 {WARE_INFO[w].profit}</td>
              </tr>
            ))}
            <tr>
              <td>港口</td>
              <td colSpan={2}>{slots(PORT_SLOTS)}（第 1/2/3 艘抵达的船停 A/B/C）</td>
            </tr>
            <tr>
              <td>船坞</td>
              <td colSpan={2}>{slots(SHIPYARD_SLOTS)}（由保险代理人支付）</td>
            </tr>
            <tr>
              <td>海盗</td>
              <td colSpan={2}>
                花 {PIRATE_COST}。第 2 次掷骰后停在 13 格的船可登船；第 3 次后停在 13
                格的船被劫掠，海盗平分货物利润并决定它去港口还是船坞。
              </td>
            </tr>
            <tr>
              <td>{zh.pilot.small}</td>
              <td colSpan={2}>花 {PILOT_COST.small}。第 3 次掷骰前把一艘船前后移 1 格。</td>
            </tr>
            <tr>
              <td>{zh.pilot.large}</td>
              <td colSpan={2}>
                花 {PILOT_COST.large}。第 3 次掷骰前把一艘船移 1–2 格，或两艘船各移 1 格。
              </td>
            </tr>
            <tr>
              <td>保险</td>
              <td colSpan={2}>
                免费并立刻得 {INSURANCE_PREMIUM}，但每有一艘船进船坞都要付对应船坞位的赔付。
              </td>
            </tr>
          </tbody>
        </table>

        <h3>借钱</h3>
        <p>
          随时可以抵押一张股票借 {LOAN_AMOUNT}，赎回要付 {LOAN_REPAYMENT}
          。必须付钱而现金不够时会自动抵押。
        </p>
      </div>
    </div>
  );
}
