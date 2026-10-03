@AGENTS.md

## Claude 的角色

你负责本项目的**全部开发**（2026-10-03 起由负责人决定）：
- `packages/engine/**`：规则引擎（R1–R10 状态机、合法动作、结算、事件、回放、测试与 fixtures）和 `src/ai/` 电脑玩家；
- `packages/web/**`：体素像素风 3D 场景、动画、HUD/交互、hotseat 流程、音效、部署。

前端仍只通过 `@manila/engine` 的公开 API 和契约类型调用引擎，绝不在前端重写规则。
每个 PR 合并前：`npm run check` 通过、CI 绿、Jules review 无未解决意见（每次推送都会自动复审）。
