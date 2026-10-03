# Claude（前端 agent）交接日志

> 新条目写在最上面。

## 2026-10-03 — 按游戏审查改进（撤销、单人遮挡、部署、镜头、电脑难度、结算统计与回放）

- 负责人看了审查报告（`/mnt/project-files/reviews/game-review-2026-10-03.md`）后选了 1、2、5、6、7、9，本 PR 全部完成：
  - **撤销不能退过掷骰**：随机数在状态里，退回去重掷结果一样，等于先看骰子再改派遣。`dispatch` 遇到 `dice-rolled` 事件就清空 `history`。
  - **单个真人不再交接**：只有一个真人、其余都是电脑时，`useCurtain` 不弹遮挡，`useViewer` 始终是这位玩家（电脑回合也能看自己的股票），顶栏隐藏「隐私」开关（`soleHuman`）。
  - **GitHub Pages + PWA**：`.github/workflows/pages.yml`（main 每次更新发布 `packages/web/dist`）；`public/manifest.webmanifest`、像素图标、手写 `public/sw.js`（页面网络优先、`assets/` 缓存优先、跨域请求不碰），只在生产构建注册。**负责人要做一次**：仓库 Settings → Pages → Source 选 GitHub Actions，之后地址是 https://mengxinnn.github.io/Marina/ 。
  - **开局镜头**：`scene/framing.ts` 把所有可操作地点投影到镜头平面，算出让它们落在玩家栏右侧、顶栏与底栏之间的目标点和缩放；`CameraRig` 开局滑到这个视角并同步 `OrbitControls.target`（OrbitControls 改为 `makeDefault`，去掉 `target` 属性，由 CameraRig 管）。港务长塔楼和货栈不再被挡。
  - **电脑难度**（engine `src/ai/`，非契约）：简单电脑乱下比例 50% → 25%（`EASY_RANDOM_RATE`；对普通胜率约 7% → 26%）。新增 `hard.ts`：普通电脑最看好的 ≤6 个选择 + 「不做」，每个把本航次剩下的部分模拟 24 遍（`determinize` 只从看不到的股票里猜别人的暗股，骰子每遍新种子，所有人按普通电脑往下走，同一批世界比较各选择），按「自己财富 + 股票再涨一档的价值 − 其他人平均」选。`BotLevel` 加 `'hard'`，`chooseBotAction` 遇到 hard 转给 `chooseHardAction`；`rankChoices` 导出给它用。2 困难 + 2 普通 40 局：困难 34 胜，平均每人多 26 分，每步约 0.3 秒（最慢约 0.8 秒）。网页端在 Web Worker 里算（`game/hardWorker.ts` / `hardBot.ts`），没有 Worker 时同步算。
  - **结算统计与回放**：store 新增 `actions`（开局以来所有动作，写进存档；旧存档没有就不显示统计），撤销时截断。`game/stats.ts` 用引擎重放出每航次财富和每人收支（测试保证 起始现金 + 收支 = 最终现金）。结算页三栏：结算 / 身价走势（SVG 折线，玩家颜色 + 线尾名字 + 悬停）/ 收支明细；「回放，从第几航次开始」用 `startReplay` 按记录带动画重播，回放中不接受操作、不存档，底栏可结束回放。
- 契约变化：无（`BotLevel`、`rankChoices`、`chooseHardAction`、`determinize` 都在 `src/ai/`）。
- 已知问题：玩家颜色（橙、白）在深色面板上的折线图里亮度偏高，因为颜色必须和棋子一致，靠线尾名字区分；回放时隐藏所有人的暗股（`viewer = null`）。手机适配（审查第 3 条）和真人竞拍参考（第 4 条）未做。
- 下一步：负责人开启 Pages 后在手机上试一下安装和离线；按反馈再调困难电脑的强度/速度（`rollouts`、`candidates` 参数）。

## 2026-10-03 — 大语言模型电脑玩家 + AI 设置页

- 负责人要求：让大语言模型当电脑玩家，在设置里配置并保存接口地址和模型信息。
- 完成（几乎全部在 `packages/web`；引擎只新增导出 `harborMasterValue`）：
  - `src/llm/`：`providers.ts` 用 fetch 直连 OpenAI 兼容 Chat Completions 和 Anthropic Messages API（浏览器直连头、system 块可缓存、温度/最大输出/推理强度只在设置了时才发送、附加请求参数 JSON 合并、超时与取消、错误转成可操作的中文提示、`/models` 获取模型列表）；`prompt.ts` 由 `getPlayerView` + `getLegalActions` 生成局面描述（含到港/13 格/船坞概率和泊位得奖概率，复用引擎 `outlook`/`atLeast`；派遣选项附上和悬停卡片同一套 `placementAdvice` 期望现金净收益）和指令表，规则摘要的数字全部来自引擎常量；竞拍和装货用模板指令（装货合法动作有 600 个），其余列出编号选项，等价动作（航道顺序、大领航员两步顺序）合并成同一条指令；`parse.ts` 容忍代码块、`<think>`、中文货名、全角、序号，但只返回合法选项之一；`player.ts` 唯一选项不调用模型，繁忙/断线重试一次，回复不合法时追问一次，然后抛错。
  - `settings.ts`：多个配置（服务商预设 12 个），存 localStorage `manila.llm.v1`；不记住密钥时密钥只放 sessionStorage。
  - store：座位类型扩展为 `BotLevel | { llm: profileId }`（`game/seats.ts`，存档兼容旧格式并做清洗）。AI 座位轮到时请求在上一步动画播放期间就发出；失败/超时由内置电脑（普通）代走并写日志；连续 3 次失败该座位改由内置电脑接管，保存 AI 设置后重新启用；「不等了，内置电脑代走」按钮；撤销/新游戏会取消请求；AI 的一句理由写进航海日志（可关闭），也作为最近历史给其他 AI 看。
  - UI：`ui/AiSettings.tsx`（配置列表、预设、地址实际请求预览、密钥显示/记住、模型列表、打法风格、高级选项、用示例局面做一次真实决定的「测试连接」）；设置页座位改为下拉框（人类 / 电脑 / AI·配置名）；顶栏「AI」按钮；玩家栏 AI 标签悬停显示模型和统计；行动栏显示「AI 正在思考（模型，秒数）」。样式在 `ui/ai.css`，没有动 `styles.css` 的其他部分。
  - 测试：`test/llm-*.test.ts` 共 43 条（随机真实对局里每个合法动作的指令都能解析回同一动作、看不到别人的暗股、两种接口的请求/错误/超时、存储、store 的代走/接管/撤销/删除配置）。
- 契约变化：无。
- 真实服务实测（负责人提供的 DeepSeek Key，只在本地会话用过，没有写进仓库或日志）：浏览器直连 DeepSeek 可用（允许 CORS）。`deepseek-flash` 开思考时每步 20–50 秒（派遣一步 5–7k 推理 tokens），3 个 AI 座位一局要将近一小时，而且三个 AI 把港务长竞价抬到 18；关思考 + 竞价参考后一局 67 次请求全部合法、平均 0.7 秒、没有代走，竞价停在 7 左右，DeepSeek 座位以 105 比 104 赢了内置电脑。其他服务未实测，是否允许浏览器跨域因服务而异（Anthropic 有专用头，Ollama 需要 `OLLAMA_ORIGINS`）。
- 实测后的改动：DeepSeek 预设改为 `deepseek-flash` / `deepseek-v4-pro`；预设可声明 `thinkingOff`（DeepSeek、智谱 `thinking: {type: "disabled"}`，通义 `enable_thinking: false`），设置页显示「关闭思考（更快）」并默认勾选，附加请求参数仍可覆盖；默认超时 60 → 90 秒；竞拍提示写明出价付给银行、自己的现金和内置电脑对港务长的估值（引擎 `ai/` 新导出 `harborMasterValue`，非契约）；解析器能读少了结尾 `}` 的回复。
- 已合入 main 的 #10–#13：底部提示栏的电脑分支显示 `<BotThinking />`；场景内操作（WorldActions）和可点位置在 AI 座位思考时同样隐藏（`useBotActing` 对 AI 座位也成立）；顶栏按钮顺序为 规则 · 声音 · AI · 速度。

## 2026-10-03 — 动画与画面细节打磨

- 完成（全部为表现层，规则仍只来自引擎事件）：
  - `game/fx.ts`：director 每播放一步就广播 `{ events, before, after, speed }`，特效和横幅订阅它，不再往 store 里塞状态。
  - `scene/particles.ts` + `scene/Effects.tsx`：一个 InstancedMesh 体素粒子池。船每跳一格溅水花；靠港水花 + 货物色闪光；进船坞扬尘木屑；海盗劫掠 = 炮口闪光 → 炮弹弧线 → 命中水花硝烟 + 画面震动；登船水花；派遣落地扬尘；分红/保险/船坞收入从对应位置弹出金币；新港务长、航次结束、游戏结束放烟花。特效时间按动画速度缩放，"跳过动画"会一起清掉。
  - `scene/Ambient.tsx`：海鸥盘旋（只在航道北侧和城里，不挡棋子）、偶尔跃出水面的鱼、灯塔闪灯。
  - `scene/CameraRig.tsx`：设置页背后镜头缓慢环绕海湾；开局滑回正视角，之后交还给玩家拖动。
  - `motion.ts`：船跳格时船头先抬后落；同伙落下有挤压回弹（也随动画速度缩放）。
  - HUD：`ui/Banner.tsx` 事件横幅（第 N 航次、XX 成为港务长、第 N 次掷骰、海盗劫掠、航次结束）；`ui/CountUp.tsx` 现金滚动计数并变色；`ui/fx.css` 面板依次滑入、操作栏每个新决策滑入、股票/港务长标记弹出、黑市价格跳动、顶栏骰子翻滚、结算表逐行出现；尊重 `prefers-reduced-motion`。
  - 新增测试 `test/fx.test.ts`（广播事件顺序与 before/after 链、粒子池生命周期）。
- 契约变化：无。
- 已知问题：烟花发射点写死在海湾北侧（`Effects.tsx` 的 `SKY`），以后改镜头默认视角时要一起看；音效/背景音乐由另一条线程负责，本 PR 没碰 `audio/`。
- 合并前已把 #9–#12 合进来，并在新地点建模和 3D 操作面板下重新核对了特效的位置。
- 下一步：按负责人反馈调整动画强度。

## 2026-10-03 — 背景音乐与音效

- 完成（全部在 `packages/web/src/audio/`，没有音频素材文件、没有新依赖，曲子和音效都由 WebAudio 实时合成，所以没有版权问题）：
  - **背景音乐** `score.ts` + `music.ts`：原创 D 小调哈巴涅拉舞曲（19 世纪西属马尼拉与哈瓦那共有的舞曲节奏），拨弦乐队（Karplus–Strong 合成的吉他 / 班杜里亚，长音用弦乐队式轮指）+ 木笛 + 低音 + 沙锤/木箱鼓。结构：前奏 → A → B → C（桥段）→ A，约 57 秒，然后约 16 秒只有海浪，再循环，长局不至于听腻。按局面调整打击乐：设置页只有弦乐，游戏中加沙锤，第 3 次掷骰和海盗决策时加满木箱鼓；游戏结束后音乐让位给号角，进入一段安静海浪。
  - **环境声**：海浪（两层滤波噪声，慢速起伏、左右漂移）+ 随机海鸥叫，跟随"音乐"开关和音量。
  - **音效** `cues.ts`（事件 → 音效的纯映射，有测试）+ `sfx.ts`：掷骰（木骰在杯里翻滚落定）、船每前进一格一下划桨水声、到港（靠岸 + 港口钟两响）、进船坞（拖上坡道 + 锤子）、装货（三声货箱）、放同伙（木子落盘）、放弃、出价、港务长成交（法槌两下）、买股（纸张 + 盖章）、收钱（硬币数量随金额 1–5 枚）、付钱、海盗登船（拔刀 + 落甲板）、劫掠（炮声）、领航员（水手哨）、涨价（木琴上行，价越高音越高）、新航次（船钟两响）、航次结算（拨弦终止式）、游戏结束（号角）。另有按钮点击声、轮到新的人类玩家时的提示铃（hotseat 交接）。大音效会短暂压低音乐（ducking）。
  - **设置**：顶栏和开局设置页都有"声音"按钮，弹出音乐 / 音效各自的开关和音量滑块；保存在 localStorage `manila.audio.v1`（兼容旧的 `manila.muted`）。浏览器禁止自动播放，所以第一次点击或按键后才出声；切到后台标签页时暂停。
- 验证：`npm run check` 通过；浏览器里 4 个电脑玩家 ×4 速度打完整局，AudioContext 正常运行、无报错；用 OfflineAudioContext 离线渲染检查了音量（音乐 RMS 约 −30 dBFS、无削波）和频谱。
- 契约变化：无。
- 已知问题：音色是合成的，不如真实采样细腻；如果以后想换成 CC0 采样，只需替换 `synth.ts` 里的对应乐器。
- 下一步：等负责人试听反馈调整音量 / 曲风。

## 2026-10-03 — 操作搬进 3D 场景 + 悬停卡片（花费 / 收益 / 规则）

- 负责人反馈：操作太依赖 HUD；上船时要在画面里提示花费和可能收益；鼠标悬停在浮动光标上要显示地名和详细规则。
- 引擎（`src/ai/advice.ts`，非契约）：新增 `placementAdvice(view, me, target)`，返回 花费（偷渡者 = 全部现金）/ 立得 / 可得 / 概率 / 最多赔 / 期望净收益。复用电脑玩家的概率模型（`withPlacement` 从 bot.ts 移到 evaluate.ts 共用），6 条测试。
- 前端：
  - 悬停卡片 `scene/SpotTip.tsx`：所有派遣位置、货船、港务长塔楼、货栈，悬停（含浮动箭头）显示地名、当前占用、规则摘要（`i18n/spots.ts`，数字全取自引擎常量）；可派遣时加一行"花费 · 可得 · 机会 · 平均±"。
  - 场景内操作 `scene/WorldActions.tsx`（drei `<Html>` 羊皮纸告示牌）：竞拍、买股（四个货箱按钮）、装货下水（◀▶ 换货、点航道 0–5 格选起点、预览货船）、掷骰（点骰子）、海盗登船（点 13 格上的船；R10 挤人时弹出选择）/ 留在海盗船、领航员（船上方 ◀▶ + 目标格高亮 + 领航船旁确认）、劫掠去向（港口 / 修船厂旁各一个按钮）。按钮可用性都按 `getLegalActions` 判断。
  - 底部操作栏缩成一行提示 + 放弃派遣 + 撤销。
  - `scene/useOnScreen.ts`：卡片会避开屏幕边缘和 HUD 面板（上 / 下 / 左 / 右择优）。
- 契约变化：无。
- 已知问题：港务长塔楼和货栈在默认镜头下被左侧玩家栏挡住，所以竞拍 / 买股告示牌放在海湾中央；触屏没有悬停，点一下会直接派遣。
- 下一步：等负责人看截图反馈。

## 2026-10-03 — 地点建模重做（港口、码头、修船厂 + 马尼拉地域特色）

- 负责人反馈：港口、码头、修船厂特征不明显；港口用的像"默认贴图"。原因：`terrain.ts` 里港口码头（kind 2）每个地形格在 `ENV.rock` 和 `0x9c9892` 两种灰色之间交替，铺出一整片灰色棋盘格，正是"缺失贴图"的样子。
- 完成（只动 `packages/web/src/scene/`，没有改任何点击目标的位置/标识）：
  - 地形：港口改为错缝铺砌的花岗岩条石 + 浅色压顶石 + 木护舷，码头宽度 1.9 → 2.3；码头后面新增马尼拉城区（kind 4，鹅卵石街面）；修船厂地面改为沙地 + 木屑 + 后排木板道。
  - 新文件 `scene/landmarks.ts`：石木楼（bahay na bato）、双塔教堂、炮台、海关、喷泉、路灯、麻袋堆、木栈桥、在建船体、工棚、木料堆、焦油锅、锚、缆绳、华商店屋（保险行）、高脚茅屋、螃蟹船、水牛、香蕉树、竹丛。
  - `models.ts`：港务塔（石基 + 白墙 + 木瞭望廊 + 红瓦顶，旗帜仍是港务长颜色）和货栈重画；旧 `churchModel` 移到 landmarks。
  - `layout.ts`：新增 FORT / CHURCH / PLAZA_FOUNTAIN / ADUANA / PORT_PIERS_Z / HULL_FRAME / SHIPWRIGHT_SHED / WEST_WHARF；INSURANCE_OFFICE 西移（只是背景建筑，保险位置 INSURANCE_STAND 没动）。
  - 截图：`docs/screenshots/locations/`（前后对比）。
- 契约变化：无。
- 已知问题：修船厂的收益牌（6/8/15）和滑道仍有些挤，位置属于 Board/交互那边，没动。
- 下一步：等抗锯齿与场景内交互两条线合并后，再统一看一遍整体观感。

## 2026-10-03 — 画面抗锯齿

- 负责人反馈画面锯齿严重。原因：场景故意以约 400px 高度渲染（1440×900 窗口下画布只有 640×400），再用 `image-rendering: pixelated` 放大 2.25 倍，且关闭了 MSAA，所有斜边都是大台阶。
- 改为按屏幕原生分辨率渲染（`devicePixelRatio`，上限 2，浏览器缩放/换屏时更新），开启 MSAA（`antialias: true`），去掉画布的 pixelated 放大样式。体素风格由几何本身保留。没有加后处理依赖。
- 契约变化：无。
- 已知问题：高 DPI 低端手机上填充率是原来的十几倍，若卡顿可再加自适应 dpr。

## 2026-10-03 — Claude 接手引擎（负责人决定）

- 负责人决定 Codex 不再开发，由 Claude 接手全部开发；Codex 随后停用，PR 改由 Jules 自动 review（负责人加的 `pr-review.yml`）。AGENTS.md / CLAUDE.md / COLLABORATION.md 已更新。
- 接手时的状态：Codex 的完整引擎 PR #5（R1–R10、合法动作、事件、回放、4 个 fixtures、随机对局测试，Codex Review 无问题、CI 绿）一直未合并。Claude 逐个文件对照 RULES.md 审查（流程、合法动作、校验、结算与保险破产、劫掠与领航员、新航次重置），未发现规则错误；本地把 main + #5 + #7 合并后全量检查通过，并让电脑玩家用真实引擎打完整局（浏览器 ×4 速度全程无报错；200 局统计：普通赢 175、简单赢 28、平均 4.9 航次）。之后合并了 #5。
- 前端补充：游戏结束结算画面（排名、现金/股票/抵押明细、翻开所有股票、再来一局）；同时到账的多笔飘字移到玩家栏外侧横向排开、不再挡住现金；动画中海盗挤人/劫掠后同伙数量回到主人手里（Codex 交接请求）。
- 两条规则裁定已由负责人确认（按原暂定实现），写入 RULES.md 并去掉代码里的 `TODO(ruling)`：
  1. R8.2：竞拍中当前最高出价者赎回抵押股票后，如果剩余支付能力不够付出价，则拒绝这次赎回。
  2. R6.3：第 3 次掷骰后，自然搁浅的船先按航道顺序进船坞，之后海盗船长再逐艘决定被劫船的去向（新增测试固定泊位顺序）。
- 下一步：继续打磨（镜头跟随、新手提示、移动端）。

## 2026-10-02 — 前端接入电脑玩家 + 引擎部分实现时的回退

- 完成：
  - 设置页每个座位可切换 人类 / 电脑·普通 / 电脑·简单；座位设置随存档保存（web 专属，不进引擎状态）。
  - 轮到电脑时：显示"电脑 XX 正在思考……"，约 0.75 秒（随动画速度缩放）后调用 `chooseBotAction(getPlayerView(state, bot), getLegalActions(state, bot), …)` 并 dispatch；不弹交接遮挡层，不显示电脑的暗股；撤销会跳过电脑回合退回到最近一次人类决策。
  - 引擎就绪判定加固：启动时除了 `createGame` 还要求 `getPlayerView` / `getLegalActions` 可用，否则留在 mock；游戏中 `applyAction` 抛 `NotImplementedError` 只提示"引擎尚未就绪"，不会崩。
  - `packages/web` 新增 vitest：用假引擎测试电脑自动行动、撤销跳过电脑回合、引擎部分实现时的容错（4 条）。
- 契约变化：无。
- 给 Codex 的请求：同上一条（`getLegalActions` 完整、未实现分支抛 `NotImplementedError`）。

## 2026-10-02 — 接手电脑玩家（engine/src/ai）

- 负责人决定：`packages/engine/src/ai/**` 改由 Claude 负责（AGENTS.md 已更新），Codex 专注规则状态机。
- 完成：`chooseBotAction(view, legal, { level, random })`——纯函数，只读 `getPlayerView(state, botId)` 和 `getLegalActions(state, botId)` 的结果，随机数由调用方注入（引擎包内不用 `Math.random()`）。
  - `ai/probability.ts`：剩余掷骰次数下每艘船"到港 / 恰停 13 / 进船坞"的精确分布（DP，已用 6³ 穷举校验）；Poisson-binomial 尾概率（港口/船坞第 k 个泊位是否有船）。
  - `ai/evaluate.ts`：期望收益模型（座位分成、港口/船坞泊位、保险赔付、海盗劫掠、持股涨价按 0.6 权重）。
  - `ai/bot.ts`：竞拍（估算港务长价值，不出会触发强制借款的价）、买股、装货下水（让自己持股的货更可能到港，并给自己留一个好座位）、派遣（边际期望收益 − 花费，低于阈值就放弃）、海盗登船、领航员（枚举合法动作取期望最大）、劫掠去向；easy 难度一半随机。从不主动借钱/还钱。
  - `test/ai.test.ts`：11 条测试。
- 契约变化：无。`src/index.ts` 末尾加了一行 `export * from './ai'`，请保留。
- 给 Codex 的请求：
  1. 电脑玩家完全依赖 `getLegalActions` 返回**完整且准确**的动作列表（竞拍给出 minBid..maxBid 每个金额；装货给出所有合法起点组合；领航员给出所有合法移动组合，包括"不动" `moves: []`）。
  2. 某个分支还没实现时请抛 `NotImplementedError`（不要抛普通 Error），前端靠它判断是否退回 mock 模式。
- 下一步：前端接入电脑玩家（设置页选择座位为"电脑"，轮到时自动行动），并加固"引擎部分实现"时的回退逻辑。

## 2026-10-02 — 事件动画层、开局设置、hotseat 交接、存档

- 完成：
  - **事件驱动动画**（`web/src/game/store.ts` 的 director + `game/present.ts`）：`applyAction` 返回的 events 逐步播放，`display` 状态落后于引擎真实 `state`，全部播完后对齐到真实 state。连续的 `punt-moved` 同时播放；船逐格跳跃前进、驶入港口泊位或船坞坡道；同伙落位弹跳；骰子在航道起点翻滚后落定；金钱变化在玩家面板上飘 "+18/−4"；航海日志逐条记录。动画速度 ×1/×2/×4，可"跳过动画"。
  - **开局设置页**：3–5 人、名字、颜色（互换）、座次（第一位 = 最年长）、隐藏股票开关、强力海盗变体 → `createGame(config)`。
  - **hotseat 交接遮挡层**：轮到另一位玩家时先显示"请把设备交给 XX"，确认前所有股票种类隐藏（`getPlayerView(state, null)`）。
  - **存档**：每步自动存 localStorage（`manila.save.v1`，按契约主版本校验），设置页"继续上局"；撤销基于历史 state。
  - mock 模式下"▶ 演示航次"播放一段手写事件脚本（派遣 → 第 2 次掷骰 → 第 3 次掷骰、劫掠、结算、涨价），用来在引擎就绪前验证动画层。
- 契约变化：无。
- 给 Codex 的请求/问题：
  1. 动画完全依赖事件的 payload：`punt-moved` 的 `from/to`、`punt-docked` 的 `dock/slot`、`accomplice-placed` 的 `seat`、`payout`/`repair-paid` 的金额与来源。只要这些齐全，前端不需要任何规则推断。
  2. 新航次开始时请确保 `voyage-ended` 在 `voyage-started` 之前，前端会在 `voyage-ended` 处停顿让玩家看清结算结果。
- 回应 Codex（PR #1 交接）：前端开新局时已显式生成随机 `seed` 传给 `createGame`，引擎可以保持"省略 seed = 0"。契约注释里 "Omit for a random seed" 与此不符，下次谁改契约时顺手改成 "Omit = 0; the web always supplies one"。
- 下一步：规则速查/新手提示、音效、粒子特效、镜头跟随；接入真实引擎后的联调。

## 2026-10-02 — 前端 M1 第一步：完整场景 + HUD（mock 驱动）

- 完成：
  - 3D 场景：海湾地形（BFS 海岸线、沙滩/草地/码头/船坞坡道）、像素风水面着色器（浅滩分层、浪花、闪光）、3 条航道 0–13 格（13 为红色危险格）。
  - 全部可派遣位置：货船座位、港口 A/B/C、船坞 A/B/C、海盗船（船长/船员）、大小领航员、保险；空位显示价格，收益写在金色告示牌上；轮到的玩家在可选位置上方显示箭头，点击即发送 `place-accomplice`。
  - 布景：马尼拉城（教堂、民居、棕榈）、港务长塔楼（旗帜 = 当前港务长颜色）、仓库与四色货箱、保险所、灯塔岛、起重机。
  - HUD：玩家面板（现金、股票——只显示当前行动玩家自己的种类、同伙数、港务长标记）、黑市行情表、顶部航次/阶段/骰子、底部按 `pending.type` 的全部操作面板（竞拍、买股、装货下水、派遣、掷骰、海盗登船、领航员、劫掠去向）、撤销、提示 toast。
  - `game/store.ts`：启动时尝试 `createGame`，捕获 `NotImplementedError` 则进入 mock 模式；引擎合并后自动切换到真实引擎，无需改前端代码。mock 模式下右侧"预览"栏可切换各个决策面板。
- 契约变化：`PlayerColor` 改为 red/blue/orange/purple/white（避开货物颜色）——仍属 0.1.0 初版，未发布过。
- 给 Codex 的请求/问题：
  1. 前端用 `getLegalActions(state, pending.playerId)` 里的 `place-accomplice` 动作决定哪些位置可点，请确保它返回完整、准确的合法目标集合。
  2. `getPlayerView(state, viewer)` 在 hotseat 下会每次状态变化都调用，请保持它便宜（纯投影即可）。
- 下一步：事件驱动的动画队列（船移动、骰子、金币飞行）、开局设置页（人数/名字/颜色/座次）、hotseat 交接遮挡层、存档读档。

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
