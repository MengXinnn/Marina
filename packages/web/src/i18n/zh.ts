import type { EngineErrorCode, GameEvent, Phase, PilotSize, Ware } from '@manila/engine';

/** zh-CN strings. Keep keys stable; an `en.ts` with the same shape comes in M3. */
export const zh = {
  title: '马尼拉',
  ware: { ginseng: '人参', nutmeg: '肉豆蔻', silk: '丝绸', jade: '玉器' } satisfies Record<
    Ware,
    string
  >,
  phase: {
    auction: '港务长竞拍',
    'harbor-master': '港务长行动',
    placement: '派遣同伙',
    movement: '掷骰航行',
    pirates: '海盗出没',
    pilots: '领航员',
    'game-over': '游戏结束',
  } satisfies Record<Phase, string>,
  pilot: { small: '小领航员', large: '大领航员' } satisfies Record<PilotSize, string>,
  voyage: (n: number) => `第 ${n} 航次`,
  round: (n: number) => `第 ${n} 轮`,
  peso: '比索',
  harborMaster: '港务长',
  cash: '现金',
  shares: '股票',
  accomplices: '同伙',
  mortgaged: '已抵押',
  bot: '电脑',
  botLevel: { easy: '简单', normal: '普通' } as const,
  botThinking: (name: string) => `电脑 ${name} 正在思考……`,
  banner: {
    voyageSub: '竞拍港务长',
    harborMaster: (name: string) => `${name} 成为港务长`,
    harborMasterPrice: (price: number) => (price ? `出价 ${price} 比索` : '无人竞拍'),
    roll: (n: number) => `第 ${n} 次掷骰`,
    plunder: '海盗劫掠！',
    plunderSub: (ware: string) => `${ware}船被洗劫一空`,
    voyageEnd: (n: number) => `第 ${n} 航次结束`,
  },
  gameOver: {
    title: '游戏结束',
    winner: (name: string) => `${name} 成为马尼拉最富有的商人！`,
    tie: (names: string) => `平局：${names} 共享胜利！`,
    player: '玩家',
    shareValue: '股票价值',
    mortgage: '抵押扣除',
    total: '财富',
    again: '再来一局',
    board: '看看棋盘',
    show: '查看结算',
  },
  hidden: '暗股',
  market: '黑市行情',
  supply: '剩余股票',
  mockBanner: '演示数据 · 规则引擎开发中',
  engineError: {
    'not-your-turn': '还没轮到你',
    'illegal-action': '这一步不合规则',
    'insufficient-funds': '钱不够',
    'invalid-payload': '操作参数有误',
    'game-over': '游戏已经结束',
  } satisfies Record<EngineErrorCode, string>,
  notices: {
    mock: '当前为演示数据：规则引擎完成后即可真正游玩',
    'engine-pending': '规则引擎尚未就绪，这一步暂时无法执行',
    'bot-stalled': '电脑这一步无法行动，请由人代为操作或撤销',
  } as Record<string, string>,
  actions: {
    bid: '出价',
    passBid: '放弃竞拍',
    buy: '购买',
    skipBuy: '不买',
    load: '装货下水',
    pass: '放弃派遣',
    roll: '掷骰子',
    stay: '留在海盗船',
    board: (w: string) => `登上${w}船`,
    boardDisplace: (w: string, name: string) => `登上${w}船（挤下${name}）`,
    toPort: '送去港口',
    toShipyard: '送去船坞',
    skipPilot: '不行动',
    confirm: '确认',
    undo: '撤销',
  },
  prompts: {
    bid: (min: number, max: number) => `竞拍港务长：最低 ${min}，你最多可出 ${max}`,
    buyShare: '港务长可以买一张股票（价格 = 黑市价值，最低 5）',
    loadPunts: '选择 3 种货物装船，起点 0–5，三船起点之和必须为 9',
    place: '点击场景中带箭头的位置派遣同伙',
    blind: '你钱不够：可以作为偷渡者免费上任意空位（保险除外）',
    roll: (n: number) => `第 ${n} 次航行：港务长掷骰子`,
    pirateBoard: '有船停在 13 格！海盗可以登船',
    pilot: (size: string) => `${size}：可以推动货船前进或后退`,
    plunder: (w: string) => `劫掠了${w}船：送去港口还是船坞？`,
    gameOver: '游戏结束',
  },
};

const slotName = (dock: 'port' | 'shipyard', slot: string) =>
  `${dock === 'port' ? '港口' : '船坞'} ${slot}`;

/** One log line per event. `name` resolves a player id to its display name. */
export function describeEvent(e: GameEvent, name: (id: string) => string): string | null {
  const w = (ware: Ware) => zh.ware[ware];
  switch (e.type) {
    case 'voyage-started':
      return `—— ${zh.voyage(e.voyage)} 开始 ——`;
    case 'bid-placed':
      return `${name(e.playerId)} 出价 ${e.amount}`;
    case 'bid-passed':
      return `${name(e.playerId)} 放弃竞拍`;
    case 'harbor-master-elected':
      return e.price > 0
        ? `${name(e.playerId)} 以 ${e.price} 比索成为港务长`
        : `${name(e.playerId)} 担任港务长`;
    case 'share-bought':
      return `${name(e.playerId)} 买入一张${w(e.ware)}股票（${e.price}）`;
    case 'share-declined':
      return `${name(e.playerId)} 没有买股票`;
    case 'loan-taken':
      return `${name(e.playerId)} 抵押一张股票，借得 ${e.amount}${e.forced ? '（强制）' : ''}`;
    case 'loan-repaid':
      return `${name(e.playerId)} 赎回一张股票（${e.amount}）`;
    case 'punts-loaded':
      return `装船：${e.punts.map((p) => `${w(p.ware)}@${p.start}`).join('、')}；${w(e.unloaded)}留在岸上`;
    case 'accomplice-placed': {
      const t = e.target;
      const where =
        t.kind === 'punt'
          ? `${w(t.ware)}船`
          : t.kind === 'port' || t.kind === 'shipyard'
            ? slotName(t.kind, t.slot)
            : t.kind === 'pirate'
              ? e.seat === 1
                ? '海盗船（船员）'
                : '海盗船（船长）'
              : t.kind === 'pilot'
                ? zh.pilot[t.size]
                : '保险公司';
      return `${name(e.playerId)} 派同伙到${where}${e.blindPassenger ? '（偷渡）' : ''}${e.cost ? `，花费 ${e.cost}` : ''}`;
    }
    case 'placement-passed':
      return `${name(e.playerId)} 不再派遣`;
    case 'dice-rolled':
      return `第 ${e.round} 次掷骰：${Object.entries(e.values)
        .map(([ware, v]) => `${w(ware as Ware)} ${v}`)
        .join('、')}`;
    case 'punt-moved':
      return e.cause === 'pilot'
        ? `领航员把${w(e.ware)}船从 ${e.from} 推到 ${e.to > 13 ? '马尼拉' : e.to}`
        : null;
    case 'punt-docked':
      return `${w(e.ware)}船 停入${slotName(e.dock, e.slot)}`;
    case 'pirate-boarded':
      return `海盗 ${name(e.playerId)} 登上${w(e.ware)}船！${e.displaced ? `（${name(e.displaced)} 被挤下船）` : ''}`;
    case 'pirate-stayed':
      return `海盗 ${name(e.playerId)} 留在海盗船上`;
    case 'pirate-promoted':
      return `${name(e.playerId)} 成为新的海盗船长`;
    case 'punt-plundered':
      return `${w(e.ware)}船 遭到海盗劫掠！`;
    case 'pilot-used':
      return e.moves.length ? null : `${name(e.playerId)}（${zh.pilot[e.size]}）没有行动`;
    case 'payout':
      return `${name(e.playerId)} +${e.amount}`;
    case 'repair-paid':
      return `保险赔付 ${e.amount}（船坞 ${e.slot}）`;
    case 'market-rose':
      return `${w(e.ware)} 黑市价值 ${e.from} → ${e.to}`;
    case 'voyage-ended':
      return `—— ${zh.voyage(e.voyage)} 结束 ——`;
    case 'game-ended':
      return '游戏结束！';
  }
}
