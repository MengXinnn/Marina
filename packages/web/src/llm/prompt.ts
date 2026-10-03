import {
  DOCK_SLOTS,
  GAME_END_VALUE,
  INSURANCE_PREMIUM,
  LAST_SPACE,
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
  VOYAGE_SCHEDULE,
  WARE_INFO,
  WARES,
  atLeast,
  nextMarketValue,
  harborMasterValue,
  outlook,
  placementAdvice,
  type Action,
  type PendingDecision,
  type PlayerView,
  type PuntState,
  type Ware,
} from '@manila/engine';
import { zh } from '../i18n/zh';

/**
 * What a language model reads on its turn, and the command vocabulary it answers in.
 * Built only from getPlayerView(state, seat) + getLegalActions(state, seat), like the built-in bot:
 * the model sees exactly what its seat may see and can only pick a move the engine allows.
 */

export interface LlmOption {
  /** Canonical command the model answers with, e.g. "place port C". */
  command: string;
  /** What the move means, with its costs (Chinese). */
  label: string;
  action: Action;
}

export interface TurnPrompt {
  /** The user message for this decision. */
  text: string;
  /** Every distinct legal move (voluntary loans left out, as for the built-in bot). */
  options: LlmOption[];
  /** False for bids and loading, which are answered with a template instead of a numbered list. */
  listed: boolean;
}

const pct = (p: number) => `${Math.round(p * 100)}%`;
const wn = (w: Ware) => `${zh.ware[w]}(${w})`;
const SLOT_ORDER = ['第 1', '第 2', '第 3'];

// ───────────── commands ─────────────

/** Moves in a fixed ware order so equivalent pilot plans read the same. */
function sortedMoves<T extends { ware: Ware }>(moves: readonly T[]): T[] {
  return [...moves].sort((a, b) => WARES.indexOf(a.ware) - WARES.indexOf(b.ware));
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/**
 * The text command for a legal action. Equivalent actions share a command (route order when
 * loading, move order for the large pilot), so the model never has to pick between twins.
 * Loans return null: the engine takes them automatically when a payment needs it (R8.3).
 */
export function commandOf(a: Action): string | null {
  switch (a.type) {
    case 'bid':
      return `bid ${a.amount}`;
    case 'pass-bid':
    case 'pass-placement':
      return 'pass';
    case 'buy-share':
      return `buy ${a.ware ?? 'none'}`;
    case 'load-punts':
      return `load ${sortedMoves(a.punts)
        .map((p) => `${p.ware}@${p.start}`)
        .join(' ')}`;
    case 'place-accomplice': {
      const t = a.target;
      switch (t.kind) {
        case 'punt':
          return `place punt ${t.ware}`;
        case 'port':
        case 'shipyard':
          return `place ${t.kind} ${t.slot}`;
        case 'pilot':
          return `place pilot ${t.size}`;
        case 'pirate':
        case 'insurance':
          return `place ${t.kind}`;
      }
      return null;
    }
    case 'roll-dice':
      return 'roll';
    case 'pirate-board':
      if (!a.ware) return 'stay';
      return a.displaceSeat === undefined
        ? `board ${a.ware}`
        : `board ${a.ware} seat ${a.displaceSeat + 1}`;
    case 'pilot':
      return a.moves.length
        ? `pilot ${sortedMoves(a.moves)
            .map((m) => `${m.ware} ${signed(m.delta)}`)
            .join(' ')}`
        : 'pilot none';
    case 'plunder-destination':
      return `plunder ${a.destination}`;
    case 'take-loan':
    case 'repay-loan':
      return null;
  }
}

// ───────────── shared helpers ─────────────

function me(view: PlayerView) {
  return view.players.find((p) => p.id === view.viewer);
}

function nameOf(view: PlayerView, id: string | null): string {
  if (!id) return '空';
  const p = view.players.find((x) => x.id === id);
  return p ? (id === view.viewer ? `${p.name}（你）` : p.name) : id;
}

function rollsLeft(view: PlayerView): number {
  return 3 - view.movementRound;
}

function piratesAboard(view: PlayerView): boolean {
  return view.pirates.captain !== null || view.pirates.crew !== null;
}

/** Chance each punt ends up in port / the shipyard (a plundered punt counts half each way). */
function dockChances(view: PlayerView): { port: number[]; yard: number[] } {
  const port: number[] = [];
  const yard: number[] = [];
  for (const p of view.punts) {
    if (p.status === 'port') {
      port.push(1);
      yard.push(0);
    } else if (p.status === 'shipyard') {
      port.push(0);
      yard.push(1);
    } else {
      const o = outlook(p.position, rollsLeft(view));
      // R6.3: on 13 after the last roll the pirates plunder; with nobody aboard it docks.
      const split = piratesAboard(view) ? o.on13 / 2 : o.on13;
      port.push(o.arrive + split);
      yard.push(o.fail + (piratesAboard(view) ? o.on13 / 2 : 0));
    }
  }
  return { port, yard };
}

function seatCost(punt: PuntState): number | null {
  const seat = punt.seats.findIndex((s) => !s.occupant);
  return seat < 0 ? null : (WARE_INFO[punt.ware].seatCosts[seat] ?? null);
}

// ───────────── the board ─────────────

function describePlayers(view: PlayerView): string[] {
  const lines = ['## 玩家（顺时针座次）'];
  for (const p of view.players) {
    const tags = [p.id === view.harborMaster ? '港务长' : '', p.id === view.viewer ? '你' : '']
      .filter(Boolean)
      .map((t) => `【${t}】`)
      .join('');
    const mortgaged = p.shares.filter((s) => s.mortgaged).length;
    const shares =
      p.id === view.viewer
        ? p.shares.length
          ? `股票：${p.shares.map((s) => `${wn(s.ware!)}${s.mortgaged ? '·已抵押' : ''}`).join('、')}`
          : '没有股票'
        : `股票 ${p.shares.length} 张${mortgaged ? `（${mortgaged} 张已抵押）` : ''}，种类保密`;
    const free = p.accomplices - p.accomplicesPlaced;
    lines.push(
      `- ${p.name}（${p.id}）${tags}：现金 ${p.cash}；${shares}；可用同伙 ${free}/${p.accomplices}` +
        (p.passedPlacement ? '；本航次已放弃派遣' : ''),
    );
  }
  return lines;
}

function describeMarket(view: PlayerView): string[] {
  const lines = ['## 黑市（股票价值）'];
  for (const w of WARES) {
    const v = view.market[w];
    lines.push(
      `- ${wn(w)}：${v}` +
        (v < GAME_END_VALUE ? `，下次到港涨到 ${nextMarketValue(v)}` : '（已到顶）') +
        `；旁边剩余股票 ${view.shareSupply[w]} 张`,
    );
  }
  const top = Math.max(...WARES.map((w) => view.market[w]));
  lines.push(
    top >= 20
      ? `最高价值已到 ${top}：任一货物到 ${GAME_END_VALUE} 时，本航次结算后游戏结束。`
      : `任一货物到 ${GAME_END_VALUE} 时，本航次结算后游戏结束。`,
  );
  return lines;
}

function describePunts(view: PlayerView): string[] {
  if (!view.punts.length) return ['## 货船', '本航次还没有装货。'];
  const lines = ['## 货船（本航次）'];
  const rolls = rollsLeft(view);
  for (const p of view.punts) {
    const seats = p.seats
      .map(
        (s, i) =>
          `[${WARE_INFO[p.ware].seatCosts[i]}: ${nameOf(view, s.occupant)}${s.pirate ? '·海盗' : ''}]`,
      )
      .join(' ');
    let where: string;
    if (p.status === 'port') where = `已到港（港口 ${p.dock}）`;
    else if (p.status === 'shipyard') where = `已进船坞（船坞 ${p.dock}）`;
    else {
      where = `航道 ${p.route + 1}，位置 ${p.position}/${LAST_SPACE}，航行中`;
      if (rolls > 0) {
        const o = outlook(p.position, rolls);
        where += `；剩余 ${rolls} 次掷骰：到港 ${pct(o.arrive)}，停在 13 格 ${pct(o.on13)}，进船坞 ${pct(o.fail)}`;
      }
    }
    lines.push(
      `- ${wn(p.ware)}船：${where}${p.plundered ? '；已被海盗劫掠' : ''}`,
      `  座位（价格: 乘客）${seats}；到港后乘客平分 ${WARE_INFO[p.ware].profit}`,
    );
  }
  if (view.unloadedWare) lines.push(`留在岸上：${wn(view.unloadedWare)}`);
  return lines;
}

function describeDocks(view: PlayerView): string[] {
  if (!view.punts.length) return [];
  const { port, yard } = dockChances(view);
  const lines = ['## 港口（按到港先后占 A、B、C；奖金由银行支付）'];
  DOCK_SLOTS.forEach((slot, k) => {
    const s = view.port[slot];
    lines.push(
      `- 港口 ${slot}：花费 ${PORT_SLOTS[slot].cost}，${SLOT_ORDER[k]} 艘到港的船让这里的同伙得 ${PORT_SLOTS[slot].reward}；` +
        `占位：${nameOf(view, s.occupant)}；` +
        (s.punt ? `已停入 ${wn(s.punt)}船` : `有船停入的估计概率 ${pct(atLeast(port, k + 1))}`),
    );
  });
  lines.push('## 船坞（没到港的船按顺序占 A、B、C；奖金由保险代理人支付，没有代理人则银行支付）');
  DOCK_SLOTS.forEach((slot, k) => {
    const s = view.shipyard[slot];
    lines.push(
      `- 船坞 ${slot}：花费 ${SHIPYARD_SLOTS[slot].cost}，${SLOT_ORDER[k]} 艘进船坞的船让这里的同伙得 ${SHIPYARD_SLOTS[slot].reward}；` +
        `占位：${nameOf(view, s.occupant)}；` +
        (s.punt ? `已停入 ${wn(s.punt)}船` : `有船停入的估计概率 ${pct(atLeast(yard, k + 1))}`),
    );
  });
  return lines;
}

function describeOthers(view: PlayerView): string[] {
  const lines = ['## 其他位置'];
  lines.push(
    `- 海盗船（每个位置花费 ${PIRATE_COST}）：船长 ${nameOf(view, view.pirates.captain)}，船员 ${nameOf(view, view.pirates.crew)}`,
    `- 领航员：小领航员（花费 ${PILOT_COST.small}）${nameOf(view, view.pilots.small)}；大领航员（花费 ${PILOT_COST.large}）${nameOf(view, view.pilots.large)}`,
    `- 保险代理人（免费，立即得 ${INSURANCE_PREMIUM}）：${nameOf(view, view.insurance)}`,
  );
  return lines;
}

function describeVoyage(view: PlayerView): string[] {
  const lines = ['## 航行进度'];
  const roll = view.lastRoll;
  lines.push(
    `已掷骰 ${view.movementRound}/3 次` +
      (roll
        ? `；上次骰子：${WARES.filter((w) => roll[w])
            .map((w) => `${zh.ware[w]} ${roll[w]}`)
            .join('、')}`
        : ''),
  );
  const schedule = VOYAGE_SCHEDULE[view.players.length] ?? [];
  const steps: string[] = schedule.map((s) => (s === 'P' ? '派遣' : '掷骰'));
  // The pilots act right before the last roll (R7.1).
  steps.splice(steps.lastIndexOf('掷骰'), 0, '领航员');
  lines.push(
    `每航次日程（${view.players.length} 人局）：竞拍 → 港务长 → ${steps.join(' → ')} → 结算`,
  );
  if (view.pending.type === 'place-accomplice') {
    const total = schedule.filter((s) => s === 'P').length;
    lines.push(`现在是第 ${view.pending.round}/${total} 个派遣轮。`);
  }
  return lines;
}

// ───────────── the decision ─────────────

function placementLabel(
  view: PlayerView,
  a: Extract<Action, { type: 'place-accomplice' }>,
): string {
  const t = a.target;
  const pending = view.pending;
  const cash = me(view)?.cash ?? 0;
  const blind = pending.type === 'place-accomplice' && pending.blindPassenger;
  let price = 0;
  let what = '';
  const { port, yard } = dockChances(view);
  switch (t.kind) {
    case 'punt': {
      const punt = view.punts.find((p) => p.ware === t.ware)!;
      price = seatCost(punt) ?? 0;
      const aboard = punt.seats.filter((s) => s.occupant).map((s) => nameOf(view, s.occupant));
      const o = punt.status === 'sailing' ? outlook(punt.position, rollsLeft(view)) : null;
      what =
        `上${zh.ware[t.ware]}船：座位费 ${price}；船上现有 ${aboard.length ? aboard.join('、') : '无人'}，` +
        `共 ${punt.seats.length} 座；到港后乘客平分 ${WARE_INFO[t.ware].profit}` +
        (o ? `（到港 ${pct(o.arrive)}，停在 13 格 ${pct(o.on13)}）` : '');
      break;
    }
    case 'port': {
      const k = DOCK_SLOTS.indexOf(t.slot);
      price = PORT_SLOTS[t.slot].cost;
      what = view.port[t.slot].punt
        ? `港口 ${t.slot}：花费 ${price}，已有船停入，结算时稳得 ${PORT_SLOTS[t.slot].reward}`
        : `港口 ${t.slot}：花费 ${price}，${SLOT_ORDER[k]} 艘船到港则得 ${PORT_SLOTS[t.slot].reward}（估计 ${pct(atLeast(port, k + 1))}）`;
      break;
    }
    case 'shipyard': {
      const k = DOCK_SLOTS.indexOf(t.slot);
      price = SHIPYARD_SLOTS[t.slot].cost;
      what = view.shipyard[t.slot].punt
        ? `船坞 ${t.slot}：花费 ${price}，已有船停入，结算时稳得 ${SHIPYARD_SLOTS[t.slot].reward}`
        : `船坞 ${t.slot}：花费 ${price}，${SLOT_ORDER[k]} 艘船进船坞则得 ${SHIPYARD_SLOTS[t.slot].reward}（估计 ${pct(atLeast(yard, k + 1))}）`;
      break;
    }
    case 'pirate':
      price = PIRATE_COST;
      what = `海盗船${view.pirates.captain ? '船员' : '船长'}：花费 ${price}`;
      break;
    case 'pilot':
      price = PILOT_COST[t.size];
      what =
        t.size === 'small'
          ? `小领航员：花费 ${price}，第 3 次掷骰前把一艘船前后移 1 格`
          : `大领航员：花费 ${price}，第 3 次掷骰前把一艘船移 1–2 格，或两艘船各移 1 格`;
      break;
    case 'insurance': {
      const expected = DOCK_SLOTS.reduce(
        (sum, slot, k) => sum + atLeast(yard, k + 1) * SHIPYARD_SLOTS[slot].reward,
        0,
      );
      what =
        `保险代理人：免费，立即得 ${INSURANCE_PREMIUM}；每艘船进船坞都要赔付该泊位奖金` +
        (view.punts.length ? `（按现在的估计约赔 ${expected.toFixed(1)}）` : '');
      return what + expectation(view, a);
    }
  }
  if (blind) return `${what}【偷渡：改为支付你的全部现金 ${cash}】${expectation(view, a)}`;
  return (price > cash ? `${what}（现金不足，将自动抵押股票）` : what) + expectation(view, a);
}

/** The same cash estimate the hover cards show (engine `placementAdvice`); none for pilots. */
function expectation(view: PlayerView, a: Extract<Action, { type: 'place-accomplice' }>): string {
  if (!view.punts.length) return '';
  const { expected } = placementAdvice(view, a.playerId, a.target);
  if (expected === null) return '';
  const sign = expected > 0 ? '+' : expected < 0 ? '−' : '±';
  return `；期望现金净收益 ${sign}${Math.abs(expected).toFixed(1)}（不含股价变化）`;
}

function pilotLabel(view: PlayerView, a: Extract<Action, { type: 'pilot' }>): string {
  if (!a.moves.length) return '不移动任何船';
  const rolls = rollsLeft(view);
  return sortedMoves(a.moves)
    .map((m) => {
      const punt = view.punts.find((p) => p.ware === m.ware)!;
      const to = punt.position + m.delta;
      if (to > LAST_SPACE) return `${zh.ware[m.ware]}船 ${punt.position}→到港`;
      const o = outlook(to, rolls);
      return `${zh.ware[m.ware]}船 ${punt.position}→${to}（之后：到港 ${pct(o.arrive)}，13 格 ${pct(o.on13)}，船坞 ${pct(o.fail)}）`;
    })
    .join('；');
}

function optionLabel(view: PlayerView, a: Action): string {
  switch (a.type) {
    case 'pass-bid':
      return '放弃竞拍（本航次不再出价）';
    case 'bid':
      return `出价 ${a.amount}`;
    case 'buy-share': {
      if (!a.ware) return '不买股票';
      const v = view.market[a.ware];
      const price = view.pending.type === 'buy-share' ? view.pending.prices[a.ware] : undefined;
      return `买一张${zh.ware[a.ware]}股票，价格 ${price ?? Math.max(MIN_SHARE_PRICE, v)}（现价值 ${v}，下次到港涨到 ${nextMarketValue(v)}）`;
    }
    case 'load-punts':
      return `装船：${a.punts.map((p) => `${zh.ware[p.ware]}起点 ${p.start}`).join('，')}`;
    case 'place-accomplice':
      return placementLabel(view, a);
    case 'pass-placement':
      return '放弃派遣（本航次不再派遣，保留现金和同伙）';
    case 'roll-dice':
      return '掷骰子';
    case 'pirate-board': {
      if (!a.ware) return '留在海盗船上（第 3 次掷骰后停在 13 格的船会被你们劫掠）';
      const punt = view.punts.find((p) => p.ware === a.ware);
      if (a.displaceSeat !== undefined)
        return `登上${zh.ware[a.ware]}船，挤下 ${nameOf(view, punt?.seats[a.displaceSeat]?.occupant ?? null)}，成为普通乘客`;
      return `登上${zh.ware[a.ware]}船（免费占最便宜的空座，成为普通乘客：到港则分利润）`;
    }
    case 'pilot':
      return pilotLabel(view, a);
    case 'plunder-destination': {
      const ware = view.pending.type === 'plunder-destination' ? view.pending.ware : null;
      const free = (dock: 'port' | 'shipyard') => DOCK_SLOTS.find((s) => !view[dock][s].punt);
      if (a.destination === 'port') {
        const slot = free('port');
        return `把${ware ? zh.ware[ware] : ''}船送去港口：算作到港（该货涨价）${slot ? `，停入港口 ${slot}` : ''}`;
      }
      const slot = free('shipyard');
      return `把${ware ? zh.ware[ware] : ''}船送去船坞${slot ? `，停入船坞 ${slot}` : ''}（保险代理人要赔付）`;
    }
    case 'take-loan':
    case 'repay-loan':
      return '';
  }
}

/** Distinct legal moves, in the engine's order, with voluntary loans left out. */
export function optionsFor(view: PlayerView, legal: Action[]): LlmOption[] {
  const seen = new Set<string>();
  const options: LlmOption[] = [];
  for (const action of legal) {
    const command = commandOf(action);
    if (!command || seen.has(command)) continue;
    seen.add(command);
    options.push({ command, action, label: optionLabel(view, action) });
  }
  return options;
}

const DECISION_TITLE: Record<PendingDecision['type'], string> = {
  bid: '竞拍港务长',
  'buy-share': '港务长买股票',
  'load-punts': '港务长装货下水',
  'place-accomplice': '派遣一个同伙',
  'roll-dice': '掷骰子',
  'pirate-board': '海盗登船',
  pilot: '领航员移动货船',
  'plunder-destination': '决定被劫货船的去向',
  'game-over': '游戏结束',
};

function describeDecision(
  view: PlayerView,
  options: LlmOption[],
): { lines: string[]; listed: boolean } {
  const pending = view.pending;
  const lines = [`# 轮到你决定：${DECISION_TITLE[pending.type]}`];
  if (pending.type === 'bid') {
    const high = view.auction?.highBid;
    lines.push(
      high ? `当前最高出价：${nameOf(view, high.playerId)} ${high.amount}。` : '还没有人出价。',
      `仍在竞拍：${(view.auction?.active ?? []).map((id) => nameOf(view, id)).join('、')}。`,
      `港务长的好处：可以买 1 张股票；决定装哪 3 种货、各从哪格出发（影响你持股的货能否到港涨价）；每个派遣轮第一个选位置。`,
      `出价是净支出：钱付给银行，不会回来。参考：内置电脑估计港务长对你约值 ${Math.round(harborMasterValue(view, pending.playerId))} 比索。你现在有 ${me(view)?.cash ?? 0} 比索，当上港务长后还要留钱派遣同伙（一个位置 1–5 比索）。`,
    );
    const bids = options.filter((o) => o.action.type === 'bid');
    if (bids.length) {
      lines.push(
        `你可以出 ${pending.minBid} 到 ${pending.maxBid}（超过现金的部分会自动抵押股票）。`,
        '',
        `回复的 move 写 \`pass\`（放弃，本航次不再出价），或 \`bid N\`（N 为 ${pending.minBid} 到 ${pending.maxBid} 的整数）。`,
      );
    } else lines.push('', '你的钱不够再加价，只能回复 move 为 `pass`。');
    return { lines, listed: false };
  }
  if (pending.type === 'load-punts') {
    lines.push(
      `选 3 种不同的货装船（剩下一种留在岸上），每艘船的起点为 0–${MAX_START_SPACE} 格，三个起点之和必须恰好为 ${START_SUM}。起点越大越容易到港。`,
      '起点 → 3 次掷骰后的结果：到港 / 停在 13 格 / 进船坞',
      ...Array.from({ length: MAX_START_SPACE + 1 }, (_, s) => {
        const o = outlook(s, 3);
        return `- ${s} 格 → ${pct(o.arrive)} / ${pct(o.on13)} / ${pct(o.fail)}`;
      }),
      '',
      `回复的 move 写 \`load 货物@起点 货物@起点 货物@起点\`，货物用英文名（ginseng、nutmeg、silk、jade），例如 \`load ginseng@2 silk@3 jade@4\`。`,
    );
    return { lines, listed: false };
  }
  if (pending.type === 'place-accomplice' && pending.blindPassenger)
    lines.push(
      '你的现金加上可抵押额度不够任何位置的标价：可以作为偷渡者，付出全部现金上任意空位（保险除外）。',
    );
  if (pending.type === 'pilot')
    lines.push(`你是${zh.pilot[pending.size]}，现在在第 3 次掷骰之前。`);
  lines.push(
    '合法选项（回复的 move 照抄反引号里的指令，也可以只写序号）：',
    ...options.map((o, i) => `${i + 1}. \`${o.command}\` — ${o.label}`),
  );
  return { lines, listed: true };
}

/** The user message for the pending decision of `view.viewer`. */
export function buildTurnPrompt(
  view: PlayerView,
  legal: Action[],
  recent: string[] = [],
): TurnPrompt {
  const options = optionsFor(view, legal);
  const self = me(view);
  const head = [
    `# 当前局面：${zh.voyage(view.voyage)} · ${zh.phase[view.phase]}`,
    `你是 ${self?.name ?? view.viewer}（${view.viewer}）。`,
  ];
  const board = [
    ...describePlayers(view),
    ...describeMarket(view),
    ...describePunts(view),
    ...describeDocks(view),
    ...describeOthers(view),
    ...describeVoyage(view),
  ];
  const history = recent.length
    ? ['## 最近发生的事（旧 → 新）', ...recent.map((l) => `- ${l}`)]
    : [];
  const decision = describeDecision(view, options);
  const text = [
    ...head,
    '',
    ...board,
    ...(history.length ? ['', ...history] : []),
    '',
    ...decision.lines,
    '',
    '只回复一个 JSON 对象：{"move": "<指令>", "reason": "<一句中文理由>"}',
  ].join('\n');
  return { text, options, listed: decision.listed };
}

// ───────────── the rules (system prompt) ─────────────

/** Rules digest. Every number comes from the engine constants, so it cannot drift from play. */
export function buildSystemPrompt(extraInstructions = ''): string {
  const seats = WARES.map(
    (w) => `${wn(w)} 座位费 ${WARE_INFO[w].seatCosts.join('/')}，利润 ${WARE_INFO[w].profit}`,
  ).join('；');
  const slots = (t: typeof PORT_SLOTS) =>
    DOCK_SLOTS.map((s) => `${s} 花 ${t[s].cost} 得 ${t[s].reward}`).join('，');
  const rules = [
    '你在玩桌游《马尼拉》（Manila，Zoch 2005），是其中一名玩家。目标：游戏结束时财富最多。',
    `财富 = 现金 + 所持全部股票的黑市价值（抵押的也算）− ${LOAN_REPAYMENT} × 已抵押股票数。`,
    '',
    '# 规则要点',
    `1. 开局每人 ${STARTING_CASH} 比索和 2 张暗股。每航次：竞拍港务长 → 港务长买股票、装货下水 → 派遣同伙与掷骰交替进行（共 3 次掷骰）→ 结算 → 到港的货涨价。`,
    `2. 竞拍：轮流出价，每次必须高于当前最高价；放弃后本航次不能再出价。最后的最高出价者付钱给银行，当选港务长。无人出价时上一任连任（不付钱）。`,
    `3. 港务长可以买 1 张股票，价格 = max(${MIN_SHARE_PRICE}, 该货黑市价值)；然后选 3 种货装上 3 艘船（第 4 种留在岸上），起点 0–${MAX_START_SPACE} 格，三船起点之和恰好为 ${START_SUM}。每个派遣轮由港务长先选，再顺时针轮流。`,
    `4. 派遣：轮到你时放 1 个同伙到一个空位并付钱，或者放弃（放弃后本航次不能再派遣）。可选位置：`,
    `   - 货船座位（自动坐最便宜的空座）：${seats}。船到港后，船上的同伙平分利润（向下取整）；船进船坞则一无所获。`,
    `   - 港口：${slots(PORT_SLOTS)}。第 1/2/3 艘到港的船分别让 A/B/C 上的同伙得奖（银行支付）。`,
    `   - 船坞：${slots(SHIPYARD_SLOTS)}。第 1/2/3 艘没能到港的船分别让 A/B/C 上的同伙得奖（保险代理人支付）。`,
    `   - 保险代理人：免费，立即从银行得 ${INSURANCE_PREMIUM}；但每有一艘船进船坞，要赔付该船坞泊位的奖金（钱不够会被强制抵押）。`,
    `   - 海盗船：船长、船员各花 ${PIRATE_COST}。第 2 次掷骰后停在 13 格的船，海盗可以登船（免费占空座，之后算普通乘客）。第 3 次掷骰后停在 13 格的船被劫掠：船上的人一无所获，海盗平分该货利润，船长决定把船送去港口（算到港，会涨价）还是船坞。海盗船上没人时，13 格的船按到港处理。`,
    `   - 领航员：小领航员花 ${PILOT_COST.small}，大领航员花 ${PILOT_COST.large}。第 3 次掷骰前，小领航员把一艘船前后移 1 格；大领航员把一艘船移 1–2 格或两艘船各移 1 格；也可以不动。被推过 13 格的船立即到港。`,
    `5. 航行：港务长掷骰，每艘船按自己的骰子（1–6）前进，越过 13 格即到港（马尼拉）。第 3 次掷骰后仍在 0–12 格的船进船坞。`,
    `6. 结算后，本航次到港的每种货在黑市上涨一格：${MARKET_TRACK.join('→')}。任一货物达到 ${GAME_END_VALUE} 时，本航次结束后游戏结束。股票只在游戏结束时按黑市价值计入财富。`,
    `7. 钱不够付款时，系统自动抵押你的股票（每张借 ${LOAN_AMOUNT}，结束时每张扣 ${LOAN_REPAYMENT}），所以尽量不要超出现金花钱。`,
    '',
    '# 回复格式',
    '每次轮到你时，你会收到局面和合法选项。只回复一个 JSON 对象，不要写任何其他文字，也不要用代码块：',
    '{"move": "<从合法选项里照抄的指令>", "reason": "<一句理由，简体中文，不超过 30 个字>"}',
    'reason 会公开显示给其他玩家看，像牌桌上的闲聊：不要透露你持有哪些股票。',
  ];
  const extra = extraInstructions.trim();
  if (extra) rules.push('', '# 你的打法', extra);
  return rules.join('\n');
}
