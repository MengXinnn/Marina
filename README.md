# 马尼拉 Manila · Voxel Edition

桌游 **Manila**（Franz-Benno Delonge，Zoch 2005）的 3D 体素像素风网页版。3–5 人同一设备轮流游玩（hotseat），纯本地运行。

**在线试玩：<https://mengxinnn.github.io/Marina/>**（手机/平板浏览器可"添加到主屏幕"，之后离线也能玩）

```bash
npm install
npm run dev      # http://localhost:5173
```

`main` 每次更新都会由 `.github/workflows/pages.yml` 自动构建并发布到 GitHub Pages（首次需要在仓库 Settings → Pages 把 Source 设为 GitHub Actions）。

| 包 | 说明 | 负责 |
|---|---|---|
| `packages/engine` | 纯 TypeScript 规则引擎（确定性、可回放） | Codex |
| `packages/web` | Vite + React + three.js 体素渲染与 UI | Claude |

文档：[规则规格](docs/RULES.md) · [契约](docs/CONTRACT.md) · [协作手册](docs/COLLABORATION.md) · [Agent 须知](AGENTS.md)

## 内置电脑

开局设置里每个座位可以设为内置电脑，三档难度（代码在 `packages/engine/src/ai/`）：

- **简单**：普通电脑的思路，但约四分之一的决定随手乱下，适合新手练手。
- **普通**：按到港/劫掠/进船坞的概率算每个选择的期望收益。
- **困难**：在普通电脑最看好的几个选择上，把本航次剩下的部分模拟几十遍（别人的暗股按看不到的股票随机猜，骰子每遍重掷），选平均结果最好的。在浏览器的后台线程里算，每步约几百毫秒，不会卡画面。

## 大语言模型电脑玩家

座位除了人类和内置电脑，还可以交给大语言模型：

1. 开局设置页（或游戏中顶栏的「AI」）打开 **AI 设置**，选服务商预设，填 API Key 和模型，点「测试连接」让模型试走一步，然后保存。
2. 在玩家列表里把座位设为「AI·配置名」。不同座位可以用不同的模型对战。

- 支持 **OpenAI 兼容**接口（OpenAI、DeepSeek、Gemini、通义千问、Kimi、智谱、硅基流动、OpenRouter、Ollama、LM Studio、vLLM 等）和 **Anthropic Messages API**。
- 模型只看到自己座位能看到的信息（`getPlayerView`），只能从引擎给出的合法动作里选（`getLegalActions`）；回复无效、超时或出错时由内置电脑代走这一步，连续失败 3 次后该座位改由内置电脑接管，保存设置后重新启用。
- DeepSeek、通义千问、智谱的预设默认「关闭思考」：每步一两秒；打开思考会下得更细，但每步常要 20–60 秒。
- 设置保存在本浏览器的 localStorage（API Key 为明文，可选择不记住）；请求从浏览器直接发往你填写的地址，服务需要允许跨域（CORS）。
- 代码在 `packages/web/src/llm/`：`prompt.ts`（局面描述与指令）、`parse.ts`（解析回复）、`providers.ts`（两种接口）、`player.ts`（重试与校验）、`settings.ts`（配置与存储）。

