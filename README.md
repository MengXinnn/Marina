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
