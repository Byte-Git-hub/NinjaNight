# AGENTS.md — ninja-night

> 包名 `ninja-night`（勿拼成 `ninjia-night`）。进度见 `docs/00_DEV_PLAN.md`；规则以 `docs/01_GAME_RULES.md`、可见性以 `docs/02_ARCHITECTURE.md`、协议以 `docs/04_PROTOCOL.md` 为准。npm + `package-lock.json`，Node.js 20+，命令在 Windows PowerShell 下验证。

## 命令

```powershell
npm run typecheck
npm test                    # vitest，只跑 tests/**/*.test.ts，已排除 tests/e2e
npm run build
npm run build:check         # 动 ui/server/dev 后跑：断言 dist 无 dev 泄漏
npm run test:e2e            # 动联机/UI 后跑：自动起 :3000 + :5173，workers=1，别手动再起
npx vitest run tests/core/engine.test.ts   # 单文件
$env:NINJA_WINDOW_MS=5000; npm run dev:server  # 短超时调试
```

- 联调：`npm run dev:server`（:3000 Socket.IO + `/health`）+ `npm run dev`（:5173，`/socket.io` 代理到 3000）。
- **无 lint/format 脚本**；门禁就是 `typecheck` → `test` →（动 UI/server/dev 时）`build:check` / `test:e2e`。
- 超时/限频唯一来源 `src/shared/timeouts.ts`，env 覆盖见 `.env.example`。服务端启动只加载 **`.env.local`**（`src/server/load-env.ts`，不是 `.env`；已部署环境变量优先）。
- 入口：前端 `src/main.ts` → `net/client` + `ui/app`；后端 `scripts/dev-server.ts` / `scripts/prod-server.ts` → `src/server/index.ts`（`createGameServer`）；规则入口 `src/core/engine.ts`（`createGame` / `applyCommand`）。Vitest 配置嵌在 `vite.config.ts`（无独立 vitest.config）。
- 单测夹具：`tests/fixtures/game.ts`（LocalAdapter）。e2e 线上验收设 `E2E_BASE_URL` 只跑 `effect-100` / `victory-countdown`；`deploy-preview.spec.ts` 需 `NINJA_DEPLOY_CHECK=1`，日常跳过。

## 目录边界

| 目录 | 职责 | 禁止 |
|---|---|---|
| `src/data` | 卡牌/令牌/阶段静态定义 | 对局可变状态 |
| `src/core` | 权威规则：校验 Command、推进、产出 Event/PendingDecision | DOM/Socket/express/socket.io、`Math.random()`（随机经 `Rng` 注入）；`Date.now()` 仅允许写事件 timestamp |
| `src/ui` | 渲染 `PlayerView`、收集 Command | 直接改阵营/手牌/死亡/积分/结算 |
| `src/net` | 指令发送、视图接收、连接状态 | 另一套规则 |
| `src/server` | 房间/会话/权限/超时/调度、按座位 `projectView` 下发 | 广播完整 `GameState`、下发他人暗牌/牌堆序/种子/令牌面值；`import` `ui` |
| `src/shared` | 两端共用类型/协议/超时常量 | 业务逻辑 |
| `src/dev` | 切座位/全知视图/固定牌局（`main.ts` 仅 `import.meta.env.DEV` 下动态 `import('./dev/inspect')`） | 被生产构建引用（`scripts/check-dist.mjs` 拦 `local-adapter/omniscientView/runAutoNight/finishDraft/forceNightSetup/src/dev`） |

`omniscientView` 在 `src/core/project-view.ts`（测试/调试用），同样不得进 dist。

## 硬约定（踩中即错）

- **可见性**：令牌**枚数公开、面值/总分私密**（宣称胜利亮牌除外）；Thief 比**枚数**；Shapeshifter 对调不广播；`knownHouses` 是同一轮内的知识快照——单轮内 append-only（拷贝、禁活引用、禁自动刷新，对调后不刷新），`startNextRound` 时清空，UI 投影按当前 round 过滤（双保险）；`room.error` / reject 不得夹带未授权暗牌。
- **日志脱敏**：只走 `src/server/logger.ts`；禁止记 HONOR 面值、HOUSE、手牌、`seatToken`、种子、视图 payload，只记 roomCode / seatId / command.type / reasonCode。
- **断线**：仅保留 seat 映射至 `DISCONNECT_RETAIN_MS`（默认 5min）；重连凭 `localStorage` 的 `seatToken` 抢占式重绑并重下发最新单人 `view.snapshot`，**不回放、不恢复对局状态**，过期回大厅表单。
- **Bot**：`src/core/bot.ts` 保持纯函数（输入仅自身 `PlayerView` + 窗口 id + 注入 `Rng`）；调度走 `src/server/bot-scheduler.ts`（`projectView` + 内部 `setTimeout`，`BOT_DELAY_MS` 默认 1000 / `BOT_JITTER_MS` 默认 1000），严禁服务端开本地 Socket 连自己、严禁碰完整 `GameState`。
- **规则**：标记优先级 官方 > 已确认决策 > 网页版 > 待确认；未确认必须标「待确认」，不得静默删牌/改效果/改胜负；`docs` 不替代 `src/shared` 权威类型。
- **联机**：房间码 6 位（`sanitizeRoomCode`）；鉴权靠 `seatToken`；4–11 人、全员 ready 房主才能 `room.start`，开局后禁加入；`commandId` 幂等缓存 50，旧 `windowId` 回 `STALE_WINDOW`；单 socket 限频 10/s；`room.forceAdvance` / 超时对所有未响应座位走 `applyAllDefaults`（有 `defaultChoice.autoPick` 用之，否则 `draftPick/discard/chooseTarget→options[0]`、`declareCards→night.passPhase`、`chooseOptional/react→false`）。
- **UI 选项映射**：`chooseOptional` 的选项→boolean 必须走 `app.ts` 的 `CHOOSE_OPTIONAL_TRUE` 显式映射表（`kill/swap/reveal/play_now→true`，其余 false），新增 options 必须登记，禁止 `__true` 暗语；`reactDecide` 的 `__true/__false` 保持不动。
- **e2e 前置检查**：跑 `npm run test:e2e` 前先确认 `:3000` 无残留 node 进程（`Get-Process node` 或 `netstat -ano | findstr :3000`，有残留先杀掉），避免 Playwright `reuseExistingServer` 复用旧服务端代码导致验证失效。
- **部署**：前端 GitHub Pages（`GITHUB_PAGES_BASE` 由 workflow 注入）+ 后端 Railway。Railway 构建**必须 `npm install`，禁用 `npm ci`**（Railpack 缓存层 `EBUSY rmdir`）。前端连后端靠构建时 `VITE_API_BASE_URL`；生产 CORS 设 `NINJA_CORS_ORIGIN`。详见 `docs/DEPLOY.md`。
- **技术债并行**：独立技术债可用 sub-agent 并行推进，前提：(a) 每个子任务的改动文件集互不重叠 (b) 每个子任务独立 commit (c) 主 agent 负责合并与最终验证。
- **大文件不进 git**：`public/assets/**/_originals/` 保持 gitignore；`docs/06_assets/screenshots/`（e2e 自动重存产物）不进版本控制；生图原稿放 `docs/06_assets/` 的 `.jpg`/`.png` 可提交，但单个需 <1MB；`.env`/`.env.*` 不提交（仅 `.env.example` 可跟踪）。

## 贡献流程

AGPL-3.0-or-later。外部贡献者提交 PR 前必须阅读 `CLA.md`，并在 PR 描述中逐字声明：

```text
I have read and agree to the Contributor License Agreement in CLA.md.
```

未声明的 PR 不予合并。

## 技术选型（已冻结）

TypeScript strict（`tsc -b`）· Vite · 原生 DOM/CSS · Node + Socket.IO · Vitest · Playwright · 单进程内存房间 · 无 DB/Redis/引擎/微服务。
