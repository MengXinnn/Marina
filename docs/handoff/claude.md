# Claude（前端 agent）交接日志

> 新条目写在最上面。

## 2026-10-03 — Claude 接手引擎（负责人决定）

- 负责人决定 Codex 不再开发，由 Claude 接手全部开发；Codex 只做自动 PR review。AGENTS.md / CLAUDE.md / COLLABORATION.md 已更新。
- 接手时的状态：Codex 的完整引擎 PR #5（R1–R10、合法动作、事件、回放、4 个 fixtures、随机对局测试，Codex Review 无问题、CI 绿）一直未合并。Claude 逐个文件对照 RULES.md 审查（流程、合法动作、校验、结算与保险破产、劫掠与领航员、新航次重置），未发现规则错误；本地把 main + #5 + #7 合并后全量检查通过，并让电脑玩家用真实引擎打完整局（浏览器 ×4 速度全程无报错；200 局统计：普通赢 175、简单赢 28、平均 4.9 航次）。之后合并了 #5。
- 前端补充：游戏结束结算画面（排名、现金/股票/抵押明细、翻开所有股票、再来一局）；同时到账的多笔飘字移到玩家栏外侧横向排开、不再挡住现金；动画中海盗挤人/劫掠后同伙数量回到主人手里（Codex 交接请求）。
- 待负责人确认的两条规则裁定（代码中 `TODO(ruling)`，目前按暂定实现）：
  1. 竞拍中当前最高出价者赎回抵押股票后，如果剩余支付能力不够付出价，则拒绝这次赎回（R3.3 × R8.2）。
  2. 第 3 次掷骰后，自然搁浅的船先按航道顺序进船坞，之后海盗船长再逐艘决定被劫船的去向（R5.9 × R6.3）。
- 下一步：等确认后把两条裁定写进 RULES.md；继续打磨（镜头跟随、新手提示、移动端）。

## 2026-10-02 — 前端接入电脑玩家 + 引擎部分实现时的回退

- 完成：
  - 设置页每个座位可切换 人类 / 电脑·普通 / 电脑·简单；座位设置随存档保存（web 专属，不进引擎状态）。
  - 轮到电脑时：显示"电脑 XX 正在思考……"，约 0.75 秒（随动画速度缩放）后调用 `chooseBotAction(getPlayerView(state, bot), getLegalActions(state, bot), …)` 并 dispatch；不弹交接遮挡层，不显示电脑的暗股；撤销会跳过电脑回合退回到最近一次人类决策。
  - 引擎就绪判定加固：启动时除了 `createGame` 还要求 `getPlayerView` / `getLegalActions` 可用，否则留在 mock；游戏中 `applyAction` 抛 `NotImplementedError` 只提示"引擎尚未就绪"，不会崩。
  - `packages/web` 新增 vitest：用假引擎测试电脑自动行动、撤销跳过电脑回合、引擎部分实现时的容错（4 条）。
- 契约变化：无。
- 给 Codex 的请求：同上一条（`getLegalActions` 完整、未实现分支抛 `NotImplementedError`）。

## 2026-10-02 — 接手电脑玩家（engine/src/ai）

- 负责人决定：`packages/engine/src/ai/**` 改由 Claude 负责（AGENTS.md 已更新），Codex 专注规则状态机。
- 完成：`chooseBotAction(view, legal, { level, random })`——纯函数，只读 `getPlayerView(state, botId)` 和 `getLegalActions(state, botId)` 的结果，随机数由调用方注入（引擎包内不用 `Math.random()`）。
  - `ai/probability.ts`：剩余掷骰次数下每艘船"到港 / 恰停 13 / 进船坞"的精确分布（DP，已用 6³ 穷举校验）；Poisson-binomial 尾概率（港口/船坞第 k 个泊位是否有船）。
  - `ai/evaluate.ts`：期望收益模型（座位分成、港口/船坞泊位、保险赔付、海盗劫掠、持股涨价按 0.6 权重）。
  - `ai/bot.ts`：竞拍（估算港务长价值，不出会触发强制借款的价）、买股、装货下水（让自己持股的货更可能到港，并给自己留一个好座位）、派遣（边际期望收益 − 花费，低于阈值就放弃）、海盗登船、领航员（枚举合法动作取期望最大）、劫掠去向；easy 难度一半随机。从不主动借钱/还钱。
  - `test/ai.test.ts`：11 条测试。
- 契约变化：无。`src/index.ts` 末尾加了一行 `export * from './ai'`，请保留。
- 给 Codex 的请求：
  1. 电脑玩家完全依赖 `getLegalActions` 返回**完整且准确**的动作列表（竞拍给出 minBid..maxBid 每个金额；装货给出所有合法起点组合；领航员给出所有合法移动组合，包括"不动" `moves: []`）。
  2. 某个分支还没实现时请抛 `NotImplementedError`（不要抛普通 Error），前端靠它判断是否退回 mock 模式。
- 下一步：前端接入电脑玩家（设置页选择座位为"电脑"，轮到时自动行动），并加固"引擎部分实现"时的回退逻辑。

## 2026-10-02 — 事件动画层、开局设置、hotseat 交接、存档

- 完成：
  - **事件驱动动画**（`web/src/game/store.ts` 的 director + `game/present.ts`）：`applyAction` 返回的 events 逐步播放，`display` 状态落后于引擎真实 `state`，全部播完后对齐到真实 state。连续的 `punt-moved` 同时播放；船逐格跳跃前进、驶入港口泊位或船坞坡道；同伙落位弹跳；骰子在航道起点翻滚后落定；金钱变化在玩家面板上飘 "+18/−4"；航海日志逐条记录。动画速度 ×1/×2/×4，可"跳过动画"。
  - **开局设置页**：3–5 人、名字、颜色（互换）、座次（第一位 = 最年长）、隐藏股票开关、强力海盗变体 → `createGame(config)`。
  - **hotseat 交接遮挡层**：轮到另一位玩家时先显示"请把设备交给 XX"，确认前所有股票种类隐藏（`getPlayerView(state, null)`）。
  - **存档**：每步自动存 localStorage（`manila.save.v1`，按契约主版本校验），设置页"继续上局"；撤销基于历史 state。
  - mock 模式下"▶ 演示航次"播放一段手写事件脚本（派遣 → 第 2 次掷骰 → 第 3 次掷骰、劫掠、结算、涨价），用来在引擎就绪前验证动画层。
- 契约变化：无。
- 给 Codex 的请求/问题：
  1. 动画完全依赖事件的 payload：`punt-moved` 的 `from/to`、`punt-docked` 的 `dock/slot`、`accomplice-placed` 的 `seat`、`payout`/`repair-paid` 的金额与来源。只要这些齐全，前端不需要任何规则推断。
  2. 新航次开始时请确保 `voyage-ended` 在 `voyage-started` 之前，前端会在 `voyage-ended` 处停顿让玩家看清结算结果。
- 回应 Codex（PR #1 交接）：前端开新局时已显式生成随机 `seed` 传给 `createGame`，引擎可以保持"省略 seed = 0"。契约注释里 "Omit for a random seed" 与此不符，下次谁改契约时顺手改成 "Omit = 0; the web always supplies one"。
- 下一步：规则速查/新手提示、音效、粒子特效、镜头跟随；接入真实引擎后的联调。

## 2026-10-02 — 前端 M1 第一步：完整场景 + HUD（mock 驱动）

- 完成：
  - 3D 场景：海湾地形（BFS 海岸线、沙滩/草地/码头/船坞坡道）、像素风水面着色器（浅滩分层、浪花、闪光）、3 条航道 0–13 格（13 为红色危险格）。
  - 全部可派遣位置：货船座位、港口 A/B/C、船坞 A/B/C、海盗船（船长/船员）、大小领航员、保险；空位显示价格，收益写在金色告示牌上；轮到的玩家在可选位置上方显示箭头，点击即发送 `place-accomplice`。
  - 布景：马尼拉城（教堂、民居、棕榈）、港务长塔楼（旗帜 = 当前港务长颜色）、仓库与四色货箱、保险所、灯塔岛、起重机。
  - HUD：玩家面板（现金、股票——只显示当前行动玩家自己的种类、同伙数、港务长标记）、黑市行情表、顶部航次/阶段/骰子、底部按 `pending.type` 的全部操作面板（竞拍、买股、装货下水、派遣、掷骰、海盗登船、领航员、劫掠去向）、撤销、提示 toast。
  - `game/store.ts`：启动时尝试 `createGame`，捕获 `NotImplementedError` 则进入 mock 模式；引擎合并后自动切换到真实引擎，无需改前端代码。mock 模式下右侧"预览"栏可切换各个决策面板。
- 契约变化：`PlayerColor` 改为 red/blue/orange/purple/white（避开货物颜色）——仍属 0.1.0 初版，未发布过。
- 给 Codex 的请求/问题：
  1. 前端用 `getLegalActions(state, pending.playerId)` 里的 `place-accomplice` 动作决定哪些位置可点，请确保它返回完整、准确的合法目标集合。
  2. `getPlayerView(state, viewer)` 在 hotseat 下会每次状态变化都调用，请保持它便宜（纯投影即可）。
- 下一步：事件驱动的动画队列（船移动、骰子、金币飞行）、开局设置页（人数/名字/颜色/座次）、hotseat 交接遮挡层、存档读档。

## 2026-10-02 — 项目启动（M0）

- 完成：
  - 调研原版规则（Zoch 2005 英文规则书）并写成 `docs/RULES.md`（规则编号 R1–R10、边界情况清单、【裁定】条目）。
  - 起草契约 v0.1.0：`packages/engine/src/contract/types.ts`（GameState / PendingDecision / Action / GameEvent / ManilaEngine API）与 `constants.ts`（全部版图数字）。
  - 引擎包骨架：`src/engine.ts` 为抛出 `NotImplementedError` 的桩函数，签名即契约；`test/rules.todo.test.ts` 是按规则编号列出的验收清单（`it.todo`）。
  - 前端包骨架：Vite + React 19 + three.js + @react-three/fiber；体素网格器（带 AO）、程序化体素模型、地形与水面着色器（进行中）。
- 契约变化：初版 0.1.0。
- 给 Codex 的请求/问题：
  1. 契约是我起草的草案，实现过程中觉得哪里别扭（字段命名、pending 设计、事件粒度）请直接提 `[contract]` PR，越早越好。
  2. 前端最依赖的是 **events 的顺序和粒度**（用来驱动动画）：一次 `roll-dice` 应返回 `dice-rolled` → 每艘船 `punt-moved` → `punt-docked`（如有）；结算时每笔钱一个 `payout` / `repair-paid` 事件。
  3. 请尽早提供几个 `fixtures/*.json`（一个完整航次、海盗劫掠、领航员、保险破产），我会用它们做动画演示。
- 下一步：完成 3D 场景（航道、货船、港口/船坞/海盗/领航员/保险位置）、HUD、按 pending 类型的操作面板（先接 mock）。
