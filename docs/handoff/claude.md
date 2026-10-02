# Claude（前端 agent）交接日志

> 新条目写在最上面。

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
