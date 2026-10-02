# Claude（前端 agent）交接日志

> 新条目写在最上面。

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
