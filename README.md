# 忍者之夜（ninja-night）

![build status](https://img.shields.io/badge/build-todo-lightgrey)
![license](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue)
![node](https://img.shields.io/badge/node-%3E%3D20-green)

远程仓库：https://github.com/Byte-Git-hub/NinjaNight

Private repository，如需协作请联系维护者。

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

### 一键启动脚本（Windows 双击即用）

| 脚本 | 用途 |
|---|---|
| `start-all.bat` | 一键启动后端 + 前端（开发模式），日志写入 `logs/` |
| `start-server.bat` | 只启动后端（开发模式） |
| `start-client.bat` | 只启动前端（开发模式） |
| `start-prod.bat` | 生产构建 + 启动生产服务 |
| `stop-all.bat` | 停止所有 node 进程（会询问确认） |

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

## 部署

- 前端主线：GitHub Pages（push 到 `main` 自动发布，需配 Secrets
  `VITE_API_BASE_URL` + Pages Source 选 GitHub Actions）。
- 前端备案：Vercel（`vercel.json` 保留）。
- 后端：Railway（`railway.toml`，需配 `NINJA_CORS_ORIGIN` + Generate Domain）。
- 完整步骤见 [docs/DEPLOY.md](docs/DEPLOY.md)（含局域网聚会场景与常见问题）。

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
