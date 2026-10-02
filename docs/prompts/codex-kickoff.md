# Codex 启动提示词（M1：规则引擎）

> 负责人把下面整段粘贴给 Codex。

你是「马尼拉 Manila」网页桌游项目的**引擎 / 后端 agent**。仓库：https://github.com/MengXinnn/Marina 。另一个 agent（Claude）正在**同时**开发前端 `packages/web`，你们通过仓库协作。

## 开工前必读（按顺序）
1. `AGENTS.md`：分工、目录所有权、分支与 PR 规则
2. `docs/COLLABORATION.md`：协作流程与里程碑
3. `docs/RULES.md`：规则规格（R1–R10，带编号和【裁定】），这是唯一的规则真相来源
4. `packages/engine/src/contract/types.ts` 和 `constants.ts`：引擎 ⇄ 前端契约
5. `docs/CONTRACT.md`：事件顺序约定
6. `docs/handoff/claude.md`：Claude 给你的请求

## 你的任务：里程碑 M1（引擎核心）
在 `packages/engine/src/` 中实现 `engine.ts` 里的全部桩函数（`createGame`、`applyAction`、`getLegalActions`、`getPlayerView`、`computeScores`、`replay`），完整覆盖 docs/RULES.md 的 R1–R10：
- 纯函数、确定性：不修改入参；随机数只来自 `state.rng`（自己实现一个小型可序列化 PRNG，如 mulberry32）；支持 `config.debug.dice` / `config.debug.deal`。
- `applyAction` 返回的 `events` 必须按 docs/CONTRACT.md 的顺序与粒度发出，前端靠它们播放动画。
- 自动推进：没有决策可做的步骤（例如派遣轮全员已放弃、第 3 轮后结算、下一航次开始）要在同一次 `applyAction` 中自动推进，直到出现下一个需要玩家决策的 `pending`。
- 把 `test/rules.todo.test.ts` 里的每个 `it.todo` 变成真实测试（测试名保留规则编号），再加一个"随机合法动作对局跑到结束"的 fuzz 测试（多个种子，检查不崩溃、金钱不为负或由银行兜底、状态可 JSON 往返）。
- 在 `packages/engine/fixtures/` 写至少 4 个场景 JSON（完整一个航次、海盗登船+劫掠、领航员推船过 13、保险代理人破产），并在测试里自动回放全部 fixtures。
- 代码可以按需拆模块（如 `src/rules/auction.ts`、`src/rng.ts`），但公开导出只经由 `src/index.ts`。

## 协作规则（必须遵守）
- **只修改 `packages/engine/**`（不含 `src/contract/`）和 `docs/handoff/codex.md`。** 不要碰 `packages/web/**`，那是 Claude 正在写的。
- 契约 `src/contract/*` 是共同所有：如果实现中发现契约需要调整（字段、pending、事件），单独开一个标题以 `[contract]` 开头的小 PR，bump `CONTRACT_VERSION`，在 `docs/CONTRACT.md` 的 Changelog 写明原因；越早提越好，前端正在照着它开发。
- 规则有疑问：按 `docs/RULES.md` 实现；RULES 没写清的，在 `docs/handoff/codex.md` 里提问并先选一个合理做法、在代码注释中标注 `TODO(ruling)`。
- 引擎不新增运行时依赖。
- 从 `main` 拉出分支 `codex/engine-core`，小步提交，完成后开 PR 合回 `main`。
- 提交前运行 `npm install && npm run check`（格式 + 类型检查 + 测试 + 构建）必须全部通过；可用 `npm run format` 自动格式化。
- 每次工作结束，在 `docs/handoff/codex.md` **顶部**追加交接条目：完成了什么、契约变化、已知问题、给 Claude 的请求、下一步。

## 完成标准
`rules.todo.test.ts` 中不再有 `it.todo`，全部测试通过；fixtures ≥ 4 个且自动回放；`npm run check` 通过；PR 已开，交接日志已写。
