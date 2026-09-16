# 忍者之夜（ninja-night）

中文网页多人联机：4–11 人，浏览器完成一整局基础规则对战。

## 当前阶段

**阶段 5 — 稳定性与可部署**

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

- 创建房间后把 **6 位房间码** 发给朋友；需 **4–11** 人全员准备后房主点「开始」。
- 端口：后端 `PORT` 环境变量，默认 `3000`。

### 超时/清理（可选环境变量）

见 `.env.example`：

| 变量 | 默认 | 含义 |
|---|---|---|
| `NINJA_WINDOW_MS` | 60000 | 决策窗口超时 |
| `NINJA_EMPTY_ROOM_TTL_MS` | 300000 | 空房清理 |
| `NINJA_ENDED_ROOM_TTL_MS` | 600000 | 结束后保留 |
| `NINJA_COMMAND_RATE_PER_SEC` | 10 | 指令限频 |
| `NINJA_DISCONNECT_RETAIN_MS` | 300000 | 断线座位保留 |
| `PORT` | 3000 | 服务端端口 |

开发调试可用短超时，例如 PowerShell：

```powershell
$env:NINJA_WINDOW_MS=5000; npm run dev:server
```

## 生产构建

```powershell
npm run build
npm start          # 读取 PORT，默认 3000；静态资源由生产服务器托管或 vite preview
npm run build:check  # 构建后断言 dist 不含 dev/local-adapter/omniscient
```

> `npm start` 仅启动游戏服务端；前端静态页可用 `npm run preview` 或任意静态托管指向 `dist/`。

## 验证

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## 目录导航

| 路径 | 说明 |
|---|---|
| `docs/00_DEV_PLAN.md` | 开发计划与进度 |
| `docs/01_GAME_RULES.md` | 规则与三类账本 |
| `docs/02_ARCHITECTURE.md` | 模块与信息可见性 |
| `docs/03_STATE_MACHINE.md` | 状态机 |
| `docs/04_PROTOCOL.md` | 联机协议 |
| `docs/05_TEST_PLAN.md` | 测试计划 |
| `src/shared` | 类型 / 协议 / 超时常量 |
| `src/core` | 规则核心 |
| `src/server` | 权威房间 + 日志脱敏 |
| `src/net` | Socket 客户端 |
| `src/ui` | 原生 DOM（含移动端断点） |
| `src/dev` | LocalAdapter（不进生产） |
| `tests/` | core / integration / e2e |
