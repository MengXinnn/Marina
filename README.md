# 马尼拉 Manila · Voxel Edition

桌游 **Manila**（Franz-Benno Delonge，Zoch 2005）的 3D 体素像素风网页版。3–5 人同一设备轮流游玩（hotseat），纯本地运行。

```bash
npm install
npm run dev      # http://localhost:5173
```

| 包 | 说明 | 负责 |
|---|---|---|
| `packages/engine` | 纯 TypeScript 规则引擎（确定性、可回放） | Codex |
| `packages/web` | Vite + React + three.js 体素渲染与 UI | Claude |

文档：[规则规格](docs/RULES.md) · [契约](docs/CONTRACT.md) · [协作手册](docs/COLLABORATION.md) · [Agent 须知](AGENTS.md)

## 大语言模型电脑玩家

座位除了人类和内置电脑，还可以交给大语言模型：

1. 开局设置页（或游戏中顶栏的「AI」）打开 **AI 设置**，选服务商预设，填 API Key 和模型，点「测试连接」让模型试走一步，然后保存。
2. 在玩家列表里把座位设为「AI·配置名」。不同座位可以用不同的模型对战。

- 支持 **OpenAI 兼容**接口（OpenAI、DeepSeek、Gemini、通义千问、Kimi、智谱、硅基流动、OpenRouter、Ollama、LM Studio、vLLM 等）和 **Anthropic Messages API**。
- 模型只看到自己座位能看到的信息（`getPlayerView`），只能从引擎给出的合法动作里选（`getLegalActions`）；回复无效、超时或出错时由内置电脑代走这一步，连续失败 3 次后该座位改由内置电脑接管，保存设置后重新启用。
- 设置保存在本浏览器的 localStorage（API Key 为明文，可选择不记住）；请求从浏览器直接发往你填写的地址，服务需要允许跨域（CORS）。
- 代码在 `packages/web/src/llm/`：`prompt.ts`（局面描述与指令）、`parse.ts`（解析回复）、`providers.ts`（两种接口）、`player.ts`（重试与校验）、`settings.ts`（配置与存储）。

