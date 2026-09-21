# 忍者之夜（ninja-night）

![deploy pages](https://github.com/Byte-Git-hub/NinjaNight/actions/workflows/deploy-pages.yml/badge.svg)
![license](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue)
![node](https://img.shields.io/badge/node-%3E%3D20-green)

远程仓库：https://github.com/Byte-Git-hub/NinjaNight

**线上游玩：https://byte-git-hub.github.io/NinjaNight/**

中文网页多人联机：4–11 人，浏览器完成一整局基础规则对战。

| 大厅（桌面） | 对局中（桌面） | 移动端对局 |
|---|---|---|
| ![大厅](docs/06_assets/readme/desktop-lobby.jpg) | ![对局](docs/06_assets/readme/desktop-game.jpg) | ![移动端](docs/06_assets/readme/mobile-game.jpg) |

## 玩法（5 行）

- 4–11 人开房，房主建房发 6 位房间码，全员准备后开局。
- 每轮先选忍者牌（选 2 留牌），再按密探→隐士→骗徒→刺客→上忍五阶段夜晚结算。
- 白天亮身份分阵营（仙鹤/莲花/浪人），拿荣誉令牌，凑齐胜利条件即胜。
- 可加人机（Bot）凑数，掉线 5 分钟内凭 token 重连回座。
- 全程点选操作（鼠标/触摸）：选牌、出牌、选目标、扔表情砸人，无复杂键位。

## 功能亮点

- **联机**：6 位房间码，4–11 人，房主开局/踢人，断线凭 token 重连，掉线座位默认托管推进。
- **AI 陪玩**：房内随时加减 Bot；可选 LLM 三人格（`aggressive/cautious/deceptive`），只负责社交发言，不参与出牌胜负。
- **中文体验**：全中文卡面、内置规则说明弹窗、卡牌悬浮说明；拖拽出牌/拖扔互动，桌面 + 移动端。
- **语音房**：mediasoup 纯音频，静音/旁听/说话指示；快捷短语支持本地 TTS 播报（默认关）。
- **社交玩法**：怀疑标记（每人 2 个）、23 条快捷短语、扔蛋/鲜花/表情、9 种互动物品特效（含连击）。
- **视听表现**：BGM 随夜晚/结算切换、11 种合成音效、击杀盖章、卡牌飞行、每轮高光回放横幅。
- **成就**：8 枚本地成就 + 音量/偏好本地保存。
- **公平隐私**：令牌枚数公开、面值/总分私密；日志脱敏，暗牌/种子永不下发。

## 当前阶段

**阶段 6 完成**：6G（语音连麦/互动特效/快捷短语/视觉打磨）+ 6H（音效/BGM/成就/高光）+ 6I/6J（对局种子复现、GitHub Pages + Railway 上线、错误边界/安全/基准/手机测试）。

- 进度凭据：`docs/00_DEV_PLAN.md`（阶段 0–6H）、`docs/06I-6J_TASKS.md`（6I/6J）。
- 线上打磨进行中：胜利结算 10 秒可视倒计时（单人房自动进下一轮，多人房等房主）。

## Windows PowerShell 启动（开发）

```powershell
# 1. 安装依赖
npm install

# 2. 终端 A：后端 Socket.IO（默认 :3000）
npm run dev:server

# 3. 终端 B：前端 Vite（默认 :5173，已代理 /socket.io）
npm run dev
```

浏览器打开：`http://127.0.0.1:5173`

### 一键启动脚本（Windows 双击即用）

| 脚本 | 用途 |
|---|---|
| `start-all.bat` | 一键启动后端 + 前端（开发模式），日志写入 `logs/` |
| `start-server.bat` | 只启动后端（开发模式） |
| `start-client.bat` | 只启动前端（开发模式） |
| `start-prod.bat` | 生产构建 + 启动生产服务 |
| `stop-all.bat` | **危险：杀掉全系统所有 node 进程**（会询问确认） |

- 创建房间后把 **6 位房间码** 发给朋友；需 **4–11** 人全员准备后房主点「开始」。
- 端口：后端 `PORT` 环境变量，默认 `3000`。

### 局域网访问

前后端均监听 `0.0.0.0`（所有网卡），同一局域网的设备可用
`http://<你的局域网IP>:5173`（如 `http://192.168.124.2:5173`）直接打开，
本机 `http://localhost:5173` 照常可用。

Windows 防火墙需放行 Node 的入站连接：
控制面板 → Windows Defender 防火墙 → 允许应用通过防火墙 → 勾选 Node.js。

### 语音连麦端口（6G-1 mediasoup）

- 信令走 Socket.IO（与游戏同端口，无需额外放行）。
- 音频走 UDP 端口段，默认 `40000–40100`（`NINJA_MEDIA_PORT_MIN/MAX` 可改，
  见 `.env.example`），Windows 防火墙需放行该 UDP 段的入站，否则表现为
  能进语音房但听不到声音。
- 对外宣告 IP 默认自动探测（`192.168/10.x` 优先），探测失败时置
  `NINJA_MEDIA_ANNOUNCED_IP` 为本机局域网 IP。
- 自签证书在 `certs/`（gitignored，`npm run certs` 生成），仅 `NINJA_TLS=1`
  时启用 https；默认 http 即可局域网联机。

### 超时/清理（常用环境变量）

见 `.env.example`（全量见文末 [附录](#附录全量环境变量)）：

| 变量 | 默认 | 含义 |
|---|---|---|
| `NINJA_WINDOW_MS` | 60000 | 决策窗口超时 |
| `NINJA_VICTORY_AUTO_MS` | 10000 | 胜利结算展示后单人房自动进下一轮 |
| `NINJA_EMPTY_ROOM_TTL_MS` | 300000 | 空房清理 |
| `NINJA_ENDED_ROOM_TTL_MS` | 600000 | 结束后保留 |
| `NINJA_COMMAND_RATE_PER_SEC` | 10 | 指令限频 |
| `NINJA_DISCONNECT_RETAIN_MS` | 300000 | 断线座位保留 |
| `NINJA_SEED` | 留空 | 固定对局种子（dev/复现用，留空每局随机） |
| `PORT` | 3000 | 服务端端口 |

开发调试可用短超时，例如 PowerShell：

```powershell
$env:NINJA_WINDOW_MS=5000; npm run dev:server
```

## 生产构建

```powershell
npm run build          # Pages/本地生产：tsc + vite + 写 dist/.nojekyll
npm run build:server   # Railway 后端用：tsc + vite（无 .nojekyll）
npm start              # 生产入口（读 PORT，默认 3000）；dist 存在时单进程兼 serve 前端 + SPA fallback
npm run build:check    # 构建后断言 dist 不含 dev/local-adapter/omniscient
```

> `railway.toml` 构建必须用 `npm install`，禁用 `npm ci`（Railpack 缓存层会报 `EBUSY rmdir`）。

## 部署

- 前端主线：GitHub Pages（push 到 `main` 自动发布，需配 Secrets
  `VITE_API_BASE_URL` + Pages Source 选 GitHub Actions；`GITHUB_PAGES_BASE`
  由 workflow 按仓库名自动注入，无需手配）。
- 前端备案：Vercel（`vercel.json` 保留）。
- 后端：Railway（`railway.toml`，需配 `NINJA_CORS_ORIGIN` + Generate Domain）。
- 完整步骤见 [docs/DEPLOY.md](docs/DEPLOY.md)（含局域网聚会场景与常见问题；
  Railway 免费层休眠，首次建房慢 5–10s 属正常）。

## 验证

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
```

- 跑 `npm run test:e2e` 前先确认 `:3000` 无残留 node 进程
 （`Get-Process node` 或 `netstat -ano | findstr :3000`，有残留先杀掉），
  否则 Playwright `reuseExistingServer` 会复用旧服务端代码。
- 线上验收（Pages 前端 + 已部署后端）：
  ```powershell
  $env:E2E_BASE_URL='https://byte-git-hub.github.io/NinjaNight/'
  npx playwright test tests/e2e/effect-100.spec.ts tests/e2e/victory-countdown.spec.ts
  ```

## 开发（npm scripts）

| 命令 | 用途 |
|---|---|
| `npm run dev` / `npm run dev:server` | 前端 :5173 / 后端 :3000（开发联调） |
| `npm run typecheck` / `npm test` | 类型检查 / 全量单测集成（49 文件，e2e 除外） |
| `npm run build` / `npm run build:server` / `npm run build:check` | Pages 构建 / 后端构建 / 构建后断无 dev 泄漏 |
| `npm run test:e2e` | Playwright 全量 e2e（32 spec，自动起 :3000+:5173，workers=1） |
| `npm run test:watch` | 单测监听模式 |
| `npm start` | 生产入口（读 PORT，默认 3000） |
| `npm run bench` | 6J-1 性能基准 → `docs/06J_BENCH.md` |
| `npm run certs` | 生成 `certs/` 自签证书（语音 https 用） |
| `npm run simulate:winrates` | 确定性种子 Bot 胜率报表 |
| `npm run assets:optimize` | 压缩生产图片资源 |

## 目录导航

| 路径 | 说明 |
|---|---|
| `docs/00_DEV_PLAN.md` | 开发计划与进度（阶段 0–6H 凭据） |
| `docs/06I-6J_TASKS.md` | 6I/6J 任务凭据（部署/种子/加固） |
| `docs/DEPLOY.md` | 部署手册（Pages + Railway 唯一操作指南） |
| `docs/01_GAME_RULES.md` | 规则与三类账本 |
| `docs/02_ARCHITECTURE.md` | 模块与信息可见性 |
| `docs/03_STATE_MACHINE.md` | 状态机 |
| `docs/04_PROTOCOL.md` | 联机协议 |
| `docs/05_TEST_PLAN.md` | 测试计划 |
| `docs/06_ART_PIPELINE.md` | 美术管线（44 牌 → 16 视觉单元） |
| `docs/07_LLM.md` | 社交 LLM 边界（只做社交文本，不参与决策） |
| `docs/08_PHRASES.md` | 23 条快捷短语 + TTS 对应表 |
| `docs/06J_BENCH.md` / `docs/06J_MOBILE.md` | 性能基准 / 手机测试 |
| `src/shared` | 类型 / 协议 / 超时常量（两端唯一共用层） |
| `src/data` | 卡牌/令牌/阶段/短语静态定义（无对局状态） |
| `src/core` | 权威规则：校验指令、推进结算、产出事件（含纯函数 Bot） |
| `src/server` | 权威房间 + 日志脱敏（不广播暗牌）；`bot/` 为 LLM/社交 Bot |
| `src/net` | Socket 客户端（只传指令收视图，无规则） |
| `src/ui` | 原生 DOM（含移动端断点）；子系统：`audio` 音效/BGM、`effects` 特效、`voice` 语音、`social` 标记/短语、`achievements`、`highlights` |
| `src/dev` | LocalAdapter（不进生产） |
| `scripts/` | `dev-server`/`prod-server`、`simulate-winrates`、`bench/`、`gen-assets/`（生图/切割） |
| `tests/` | core / integration / ui / unit / server / e2e（32 spec） |

## 贡献

本项目采用 AGPL-3.0-or-later 许可证（见 `LICENSE`）。外部贡献者提交 PR 前
必须阅读 `CLA.md`，并在 PR 描述中逐字声明：

```text
I have read and agree to the Contributor License Agreement in CLA.md.
```

未声明的 PR 不予合并。

## 附录：全量环境变量

唯一来源 `src/shared/timeouts.ts`（另有 `bot-scheduler.ts` 的 Bot 延迟项），
示例见 `.env.example`。

| 变量 | 默认 | 含义 |
|---|---|---|
| `NINJA_WINDOW_MS` | 60000 | 决策窗口超时（毫秒） |
| `NINJA_EMPTY_ROOM_TTL_MS` | 300000 | 空房清理 |
| `NINJA_ENDED_ROOM_TTL_MS` | 600000 | 结束后房间保留 |
| `NINJA_COMMAND_RATE_PER_SEC` | 10 | 单 socket 每秒指令上限 |
| `NINJA_DISCONNECT_RETAIN_MS` | 300000 | 断线座位保留 |
| `NINJA_VICTORY_AUTO_MS` | 10000 | 胜利结算展示后单人房自动进下一轮 |
| `PORT` | 3000 | 服务端端口 |
| `NINJA_SEED` | 留空 | 固定对局种子（0–2³²-1，留空每局随机） |
| `NINJA_MEDIA_ANNOUNCED_IP` | 留空（自动探测） | 语音对外宣告 IP |
| `NINJA_MEDIA_LISTEN_IP` | 0.0.0.0 | 语音监听地址 |
| `NINJA_MEDIA_PORT_MIN` / `NINJA_MEDIA_PORT_MAX` | 40000 / 40100 | 语音 RTC UDP 端口段 |
| `MEDIASOUP_SKIP_WORKER_PREBUILT_DOWNLOAD` | true | 离线安装时本地编译 worker |
| `NINJA_TLS` | 0 | 1 = 局域网 https（需先 `npm run certs`） |
| `NINJA_CORS_ORIGIN` | 留空（全放行） | Socket.IO CORS 白名单，生产设前端域名 |
| `NINJA_VOICE` | 1 | 语音总开关（0 = 彻底禁用） |
| `VITE_API_BASE_URL` | 留空（同源） | 前端构建时注入的后端地址 |
| `BOT_DELAY_MS` / `BOT_JITTER_MS` | 1000 / 1000 | Bot 拟人延迟基线/抖动 |
| `NINJA_EFFECT_BATCH_MS` | 50 | 特效合并发送窗口 |
| `NINJA_EFFECT_BATCH_MAX` | 64 | 单批最多压缩条目 |
| `NINJA_EFFECT_MAX_COUNT` | 1000 | 单条压缩记录最多粒子数 |
| `NINJA_EFFECT_PAYLOAD_MAX_BYTES` | 262144 | 特效 payload 硬上限 |
| `NINJA_EFFECT_PARTICLE_MAX` | 200 | Canvas 粒子池上限 |
| `NINJA_MARK_PER_SEAT_MAX` | 2 | 每人最多怀疑标记数 |
| `NINJA_REACTION_RATE_PER_SEC` | 30 | reaction 独立限频（超限静默丢弃） |
| `LLM_ENABLED` | false | 社交 LLM 总开关 |
| `LLM_ENDPOINT` / `LLM_MODEL` / `LLM_API_KEY` | 见示例 | LLM 服务配置（key 只存服务端内存） |
| `LLM_TIMEOUT_MS` | 8000 | LLM 单次调用超时 |
| `LLM_MAX_CALLS_PER_ROUND` | 3 | 每轮最多调用次数 |
| `LLM_MIN_INTERVAL_MS` | 5000 | 调用最小间隔 |
| `LLM_THINKING_TYPE` / `LLM_REASONING_EFFORT` | enabled / low | 思考模式/强度 |
| `MIMO_API_KEY` | — | 离线 TTS 生成脚本用 |
