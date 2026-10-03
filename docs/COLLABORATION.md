# 双 agent 协作手册

> **2026-10-03 更新**：负责人决定由 Claude 接手全部开发（引擎 + 前端 + 电脑玩家），Codex 只做自动 PR review。
> 下面的双 agent 流程保留作参考：契约先行、交接日志、小 PR 的做法仍然沿用。

## 角色

| 角色 | 谁 | 职责 |
|---|---|---|
| 负责人 | 人类（仓库 owner） | 分派任务、合并 PR、对【裁定】和契约争议拍板、在两个 agent 之间转达消息 |
| 开发 | Claude | `packages/engine`（规则引擎、测试、fixtures、电脑玩家）+ `packages/web`（3D 场景、动画、UI、hotseat、部署） |
| 审查 | Codex Review（自动） | 每个 PR 的代码 review；修复后 `@codex review` 复审 |
| 历史 | Codex（ChatGPT） | M1 引擎作者（PR #1、#4、#5），2026-10-03 起不再开发 |

两个 agent 不直接对话，**仓库就是沟通渠道**：契约代码、交接日志（`docs/handoff/*.md`）、PR 描述、GitHub Issues。

## 为什么能并行

- 契约（`contract/types.ts`）先行：前端照着类型用 mock 数据开发，引擎照着类型和 `docs/RULES.md` 实现。
- 目录所有权互不重叠，交接日志各写各的文件 → 几乎不会有合并冲突。
- 引擎是纯函数 + 事件流：前端不需要知道规则细节，只需"播放事件、渲染状态、按 pending 显示操作面板"。
- 引擎桩函数抛 `NotImplementedError`，前端检测到就留在 mock 模式；引擎一合并，前端自动切到真实引擎。

## 每一轮的节奏（负责人视角）

1. 给两个 agent 各发一句"继续下一个里程碑任务"（或具体任务）。
2. 各自开 PR：`codex/...`、`claude/...`，并更新自己的交接日志。
3. 合并顺序：`[contract]` PR → 引擎 PR → 前端 PR（每次合并后 CI 必须绿）。
4. 告诉另一个 agent："已合并 #xx，请拉取最新 main 并阅读对方交接日志。"

## 冲突处理

- 规则理解分歧 → 以 `docs/RULES.md` 为准；RULES 没写清 → 在交接日志提问，负责人拍板后写入 RULES【裁定】。
- 契约需要改 → `[contract]` PR，对方在自己的交接日志里确认（或负责人直接拍板）。
- 发现对方代码有 bug → 不要直接改对方目录；开 Issue 或写进交接日志，附复现步骤（最好是一个 fixture）。

## 完成标准（Definition of Done）

- 引擎：对应 `rules.todo.test.ts` 条目变成真实测试并通过；规则代码有 R 编号注释；`npm run check` 通过。
- 前端：功能可在 `npm run dev` 中演示；PR 附截图/GIF；不在前端复制规则逻辑；`npm run check` 通过。

## 里程碑

| 里程碑 | 引擎（Codex） | 前端（Claude） |
|---|---|---|
| **M0 启动** | — | 规则规格、契约 v0.1、仓库骨架、CI（已完成） |
| **M1 核心** | `createGame`、竞拍、港务长、派遣、移动、海盗、领航员、结算、借贷、计分、`getLegalActions`、`getPlayerView`、`replay`；把 `rules.todo` 全部变成真实测试；3–5 个 fixtures | 完整 3D 场景（全部位置/船/同伙）、HUD（玩家、黑市、股票）、按 pending 类型的操作面板（mock 驱动） |
| **M2 联调** | 根据前端反馈修契约；随机对局 fuzz 测试（合法动作随机走到结束不崩、金钱守恒） | 接入真实引擎；事件驱动动画队列；开局设置页；hotseat 交接遮挡层；存档/读档；撤销 |
| **M3 打磨** | 性能与边界情况；存档版本迁移 | 音效、粒子、镜头运镜、规则速查/教程、中英双语、移动端适配 |
| **M4 AI** | —（已改由 Claude 负责） | `engine/src/ai`：启发式电脑玩家 `chooseBotAction(view, legal, {level, random})`（easy/normal）；电脑玩家回合节奏与可视化 |
| **M5 发布** | — | GitHub Pages 部署、Playwright 冒烟测试 |
