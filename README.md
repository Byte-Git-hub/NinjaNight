# 忍者之夜（ninja-night）

中文网页多人联机：4–11 人，浏览器完成一整局基础规则对战。

## 当前阶段

**阶段 4 — 房间联机版**（Socket.IO 权威服务端、大厅/对局 UI、超时与 forceAdvance、e2e）

## 如何运行

```powershell
npm install
npm run dev:server    # 终端 A：Socket.IO :3000
npm run dev           # 终端 B：Vite :5173（/socket.io 已代理）
```

浏览器打开 `http://127.0.0.1:5173`，创建房间并把 6 位房间码发给朋友（需 ≥4 人）。

## 如何验证

```powershell
npm run typecheck
npm test              # core + integration
npm run build         # 产物不含 src/dev
npm run test:e2e      # Playwright（自动起 server + vite）
```

## 目录导航

| 路径 | 说明 |
|---|---|
| `docs/00_DEV_PLAN.md` | 开发计划与进度 |
| `docs/01_GAME_RULES.md` | 规则与三类账本 |
| `docs/02_ARCHITECTURE.md` | 模块与信息可见性 |
| `docs/03_STATE_MACHINE.md` | 状态机 |
| `docs/04_PROTOCOL.md` | 联机协议（冻结） |
| `docs/05_TEST_PLAN.md` | 测试计划 |
| `src/shared` | 共享类型 + 协议 + 超时常量 |
| `src/core` | 规则核心（单机/联机共用） |
| `src/server` | Express + Socket.IO 权威房间 |
| `src/net` | Socket.IO 客户端封装 |
| `src/ui` | 原生 DOM 界面 |
| `src/dev` | LocalAdapter（不进生产） |
| `tests/` | core / integration / e2e |
