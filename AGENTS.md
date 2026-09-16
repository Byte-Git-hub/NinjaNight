# AGENTS.md — ninja-night

稳定工作约定。进度、临时问题见 `docs/00_DEV_PLAN.md`。

## 项目标识

- 包名 / 项目名：`ninja-night`（不要写成 `ninjia-night` 等其它拼写）
- 中文名：忍者之夜
- 包管理器：仅 npm + `package-lock.json`
- 运行环境：Node.js 20+；命令在 Windows PowerShell 下验证

## 目录边界

| 目录 | 职责 | 禁止 |
|---|---|---|
| `src/data` | 卡牌/令牌/阶段等静态定义 | 对局可变状态 |
| `src/core` | 权威规则：状态、校验 Command、推进、产出 Event/PendingDecision | 依赖 DOM、Socket、浏览器存储、服务器框架；调用 `Date.now()` / `Math.random()` 等全局源 |
| `src/ui` | 渲染 PlayerView，收集并提交 Command | 直接修改阵营、手牌、死亡、积分、结算 |
| `src/net` | 指令发送、视图接收、连接状态 | 另一套游戏规则 |
| `src/server` | 房间、会话、权限、权威状态、调度、按人下发视图 | 广播完整 `GameState`；向客户端下发未获准暗牌/牌堆序/令牌面值 |
| `src/shared` | 两端共用类型与常量 | 业务逻辑 |
| `src/dev` | 本地调试：切换座位、全知视图、固定牌局 | 进入生产构建；出现在正式联机 UI |
| `tests/core` | 纯规则与可见性 | — |
| `tests/integration` | 适配器/指令集成 | — |
| `tests/e2e` | 多浏览器联机 | — |
| `docs` | 计划、规则、架构、协议、测试计划 | 替代代码中的权威类型 |

## 随机与时间

- 核心判定不得直接调用 `Math.random()`、`Date.now()`。
- 随机与截止时间作为显式输入或 `GameState` 字段注入。
- 联机随机结果由服务端掌握；测试使用固定种子。

## 验证命令

在项目根目录执行：

```powershell
npm run typecheck
npm test
npm run build
```

阶段完成前上述命令必须通过。

## 禁止事项（摘要）

1. `core` 不得依赖 DOM/Socket/时间/全局随机  
2. `ui` 不得直接改权威状态；`net` 不得实现规则逻辑  
3. `server` 不得广播完整 `GameState`（硬约定）；不得 `import` `ui`  
4. `core` 不得 `import` socket.io / express  
5. `dev` 不得进入生产构建  
6. 不为程序方便静默删牌、改效果或改胜负规则  
7. 未确认规则必须标记「待确认」，不得当成官方规则实现  

## 技术选型（已冻结）

TypeScript strict · Vite · 原生 DOM/CSS · Node + Socket.IO · Vitest · Playwright · 单仓单进程 · 内存房间 · 无游戏引擎 · 无微服务/Redis/数据库

## 阶段 4 起命令

```powershell
npm run dev:server    # :3000 Socket.IO + health
npm run dev           # :5173 前端（/socket.io 代理到 3000）
npm run test:e2e      # Playwright（自动起 server + vite）
```
