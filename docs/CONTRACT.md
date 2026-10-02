# 引擎 ⇄ 前端契约

代码即文档：`packages/engine/src/contract/types.ts`（类型）与 `constants.ts`（版图数字）。本文件只记录**用法约定**与**变更历史**。

## 数据流

```
             Action（玩家点击）
  web ───────────────────────────────▶ engine.applyAction(state, action)
   ▲                                        │
   │   { ok, state, events[] }              │  纯函数，不修改入参
   └────────────────────────────────────────┘
   web: 1) 依次播放 events 动画  2) 动画结束后渲染新 state  3) 读 state.pending 决定显示哪个操作面板
```

- `state.pending` 永远只有一个待决策；前端为 `pending.playerId` 展示对应面板（hotseat：先显示"请把设备交给 XX"遮挡层）。
- 前端渲染用 `getPlayerView(state, viewer)`，隐藏其他玩家股票种类。
- 借贷（`take-loan` / `repay-loan`）任何玩家随时可发。
- 需要付款而现金不足时引擎自动抵押（`loan-taken`，`forced: true`），前端只负责动画提示。
- 撤销：引擎纯函数，前端保存历史 state 即可实现；是否允许撤销掷骰由前端产品规则决定。
- 存档：直接 JSON 序列化 `GameState`（或保存 `config + actions[]` 用 `replay` 重放）。

## 事件顺序约定（前端动画依赖）

| 动作 | 事件顺序 |
|---|---|
| 竞拍结束 | `bid-placed`/`bid-passed`… → (`loan-taken`) → `harbor-master-elected` |
| `load-punts` | `punts-loaded` |
| `place-accomplice` | (`loan-taken`) → `accomplice-placed` → (`payout` reason=insurance-premium) |
| `roll-dice` | `dice-rolled` → 每艘船 `punt-moved`(按航道 0→2) → `punt-docked`… → (第 3 轮后自动进入结算事件) |
| 结算 | `punt-plundered`… → `payout`(plunder/cargo/port/shipyard)… → `repair-paid`… → `market-rose`… → `voyage-ended` → (`game-ended` 或 `voyage-started`) |

## Changelog

- **0.2.0**（2026-10-03，Codex）：明确省略 `GameConfig.seed` 时使用确定性默认值 0；需要新随机对局时，由前端生成并传入 seed。此前注释的“省略即随机”与 M1 要求的纯函数、R1.6 随机源约束冲突；不新增字段、不改事件。

- **0.1.0**（2026-10-02，Claude 起草）初版。
