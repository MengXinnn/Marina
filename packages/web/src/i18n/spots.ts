import {
  INSURANCE_PREMIUM,
  LOAN_AMOUNT,
  MAX_START_SPACE,
  MIN_SHARE_PRICE,
  PILOT_COST,
  PIRATE_COST,
  PORT_SLOTS,
  SHIPYARD_SLOTS,
  START_SUM,
  WARE_INFO,
  type DockSlot,
  type PlacementTarget,
} from '@manila/engine';
import { zh } from './zh';

/** Places on the board a player can hover: every placement target plus the two buildings. */
export type Spot = PlacementTarget | { kind: 'office' } | { kind: 'warehouse' };

const berth = (slot: DockSlot) => ({ A: 1, B: 2, C: 3 })[slot];

/** Name of a spot, as written on the in-world tooltip. */
export function spotTitle(s: Spot): string {
  switch (s.kind) {
    case 'punt':
      return `${zh.ware[s.ware]}货船`;
    case 'port':
      return `马尼拉港口 · ${s.slot} 泊位`;
    case 'shipyard':
      return `修船厂 · ${s.slot} 船台`;
    case 'pirate':
      return '海盗船';
    case 'pilot':
      return s.size === 'small' ? '小领航员' : '大领航员';
    case 'insurance':
      return '保险行';
    case 'office':
      return '港务长塔楼';
    case 'warehouse':
      return '货栈（股票）';
  }
}

/** Rule summary for a spot. Every number comes from the engine constants. */
export function spotRules(s: Spot): string[] {
  switch (s.kind) {
    case 'punt': {
      const info = WARE_INFO[s.ware];
      return [
        `座位 ${info.seatCosts.join(' / ')} 比索，自动坐最便宜的空座。`,
        `驶过 13 格抵达马尼拉：船上同伙平分 ${info.profit} 比索（向下取整）。`,
        '第 3 次掷骰后没到港的船进修船厂，船上的人一无所获。',
        '停在 13 格且海盗船上有人：被劫，船上的人一无所获。',
      ];
    }
    case 'port':
      return [
        `花 ${PORT_SLOTS[s.slot].cost}：第 ${berth(s.slot)} 艘抵达马尼拉的船停进这里时，得 ${PORT_SLOTS[s.slot].reward}（银行支付）。`,
        '抵达的船按 A → B → C 依次停泊；被海盗送来港口的船也算。',
      ];
    case 'shipyard':
      return [
        `花 ${SHIPYARD_SLOTS[s.slot].cost}：第 ${berth(s.slot)} 艘没能到港的船进这里时，得 ${SHIPYARD_SLOTS[s.slot].reward}。`,
        '由保险代理人赔付；没人做保险时由银行支付。',
      ];
    case 'pirate':
      return [
        `花 ${PIRATE_COST}，先上船的当船长，第二个当船员。`,
        '第 2 次掷骰后：可免费登上停在 13 格、还有空座的船。',
        '第 3 次掷骰后：劫掠停在 13 格的船，海盗平分它的利润，船长决定把船送去港口还是修船厂。',
      ];
    case 'pilot':
      return s.size === 'small'
        ? [`花 ${PILOT_COST.small}。第 3 次掷骰前，把一艘船前进或后退 1 格。`, '先于大领航员行动。']
        : [
            `花 ${PILOT_COST.large}。第 3 次掷骰前，把一艘船移动 1–2 格，或把两艘船各移动 1 格。`,
            '方向自选；可以再推小领航员动过的船。',
          ];
    case 'insurance':
      return [
        `不花钱，派遣时立刻从银行拿 ${INSURANCE_PREMIUM} 比索。`,
        `之后每有一艘船进修船厂，要赔该船台的金额（A ${SHIPYARD_SLOTS.A.reward} / B ${SHIPYARD_SLOTS.B.reward} / C ${SHIPYARD_SLOTS.C.reward}）。`,
      ];
    case 'office':
      return [
        '每个航次开始时竞拍港务长：轮流加价或放弃，最高者付钱当选。',
        `港务长可买 1 张股票，选 3 种货装船（起点 0–${MAX_START_SPACE}，合计 ${START_SUM}），并负责掷骰。`,
      ];
    case 'warehouse':
      return [
        `股票价格 = 黑市价值，最低 ${MIN_SHARE_PRICE}。抵达马尼拉的货物，黑市价值上涨一格。`,
        `游戏结束时每张股票按黑市价值计入财富；抵押一张股票可借 ${LOAN_AMOUNT}。`,
      ];
  }
}
