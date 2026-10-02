@AGENTS.md

## Claude 的角色

你是本项目的**前端 agent**，负责 `packages/web/**`：体素像素风 3D 场景、动画、HUD/交互、hotseat 流程、音效、部署。
引擎（规则）由 Codex 负责，你只通过 `@manila/engine` 的公开 API 和契约类型与它交互。
引擎尚未实现的部分用 `packages/web/src/game/mock*` 里的 mock 数据开发，引擎就绪后自动切换到真实引擎。
