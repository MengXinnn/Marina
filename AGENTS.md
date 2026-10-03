# AGENTS.md — 马尼拉 Manila（体素像素风 3D 网页桌游）

> **2026-10-03 起：所有开发由 Claude 负责（引擎 + 前端 + 电脑玩家）**，Codex 不再开发，只做自动 PR review（Codex Review）。
> 人类负责人（仓库 owner）负责分派任务、拍板规则裁定；PR 在 CI 通过且 Codex Review 无未解决意见后合并。
> 所有 agent 开工前必须读完：本文件 → `docs/COLLABORATION.md` → `docs/RULES.md` → `packages/engine/src/contract/types.ts`。

## 项目一句话

把桌游 **Manila（马尼拉，Zoch 2005）** 做成可在浏览器本地游玩的 3D 体素像素风游戏：
3–5 人**同一台设备轮流操作（hotseat）**，无联网、无服务器。

## 分工（目录所有权）

| 区域 | 负责人 | 说明 |
|---|---|---|
| `packages/engine/**` | **Claude** | 纯 TypeScript 规则引擎：状态机、合法动作、结算、随机数、存档格式、测试；`src/ai/` 电脑玩家（只读 `PlayerView` + `getLegalActions`）。M1 引擎由 Codex 编写（PR #1/#4/#5），2026-10-03 由 Claude 接手 |
| `packages/web/**` | **Claude** | Vite + React + three.js（@react-three/fiber）体素渲染、动画、HUD、交互、音效、hotseat 隐私遮挡 |
| `packages/engine/src/contract/**` | Claude（契约纪律仍适用） | 引擎 ⇄ 前端接口契约。改动仍走 `contract` 流程（见下），方便以后再拆分协作 |
| `docs/RULES.md` | Claude 维护 | 规则规格；【裁定】条目改动需人类拍板 |
| `docs/handoff/claude.md` | Claude | 交接日志；`docs/handoff/codex.md` 保留为历史记录，不再追加 |
| 根目录配置、CI、其余 docs | Claude | |
| PR review | **Codex Review**（自动） | 每个 PR 打开时自动 review；推送修复后用 `@codex review` 请求复审 |

**以后若再引入第二个开发 agent**：恢复按目录划分所有权，不要修改对方目录下的文件；需要对方改东西 → 写进交接日志或开 GitHub Issue。

## 契约（contract）流程

`packages/engine/src/contract/types.ts` + `constants.ts` 是两边唯一的耦合点：

1. 前端只通过 `@manila/engine` 的公开导出（`src/index.ts`）调用引擎，**绝不在前端重写规则**。
2. 引擎是纯函数：`applyAction(state, action)` 不修改入参，返回 `{ ok, state, events }`；状态全部可 JSON 序列化。
3. 改契约：单独开 PR，标题以 `[contract]` 开头，同时：bump `CONTRACT_VERSION`（新增字段 = minor，改名/删除 = major）、在 `docs/CONTRACT.md` 的 Changelog 记录、在自己的交接日志里提醒对方。
4. 新增可选字段/新增事件类型属于向后兼容，可以随功能 PR 一起提交，但仍需写 Changelog。

## 分支与 PR

- 集成分支：`main`。所有 PR 都合入 `main`；开工前先拉取最新 `main`。
- Claude 分支前缀：`claude/…`（历史上的 `codex/…` 分支已全部合并或关闭）。
- 小步提交，PR 小而聚焦；PR 描述写清：做了什么、契约是否变化、如何验证、需要对方做什么。
- 合并前本地必须通过：`npm run check`（格式 + 类型检查 + 测试 + 构建）。CI 会跑同样的命令。
- 尽量不新增依赖。引擎包**不允许新增运行时依赖**；需要时先在交接日志里说明理由。`package-lock.json` 冲突时用 `npm install` 重新生成，不要手改。

## 常用命令

```bash
npm install                      # 根目录，安装全部 workspace
npm run dev                      # 启动前端 http://localhost:5173
npm test -w @manila/engine       # 引擎测试（vitest）
npm run typecheck -w @manila/engine
npm run check                    # 提交前全量检查
npm run format                   # prettier
```

## 代码约定

- TypeScript strict，ES Modules，prettier（单引号、分号、100 列）。
- 引擎：无 DOM、无全局可变状态、无 `Math.random()`（随机只能来自 `state.rng`）。规则实现处用注释引用规则编号，例如 `// R6.2 captain boards first`。测试名也带规则编号。
- 前端：所有场景坐标在 `packages/web/src/scene/layout.ts`，所有颜色在 `palette.ts`。

## 交接日志（每次工作结束必须写）

在 `docs/handoff/<你的名字>.md` **顶部**追加一条：日期、完成了什么、契约变化、已知问题、**给对方的请求/问题**、下一步计划。
开工时先读对方的交接日志。
