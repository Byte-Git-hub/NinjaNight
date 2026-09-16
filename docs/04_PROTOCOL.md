# 04 — 联机协议

status: frozen-for-stage-4  
updated: 2026-09-16  
实现阶段：4  

---

## 原则

- 服务端权威；客户端只提交意图。  
- 不下发完整 `GameState`、牌堆序、种子、未获准暗牌、令牌面值。  
- `commandId` 幂等；`windowId` 防旧窗口。  
- 房间码仅用于 join；鉴权用 `seatToken`。  
- 全部走 Socket.IO；输入消毒 + 简易限频。  

---

## 事件清单（冻结）

### 房间生命周期（客户端 → 服务端）

| 事件 | payload | 响应 | 说明 |
|---|---|---|---|
| `room.create` | `{ nickname }` | ack `{ roomCode, seatToken, seatId }` | 创建房间，创建者为房主 |
| `room.join` | `{ roomCode, nickname }` | ack `{ seatToken, seatId }` | 加入已有房间 |
| `room.leave` | `{ seatToken }` | ack | 离开/断开座位 |
| `room.ready` | `{ seatToken, ready }` | presence | 大厅准备 |
| `room.start` | `{ seatToken }` | 开局事件 | 仅房主；≥4 人且全员 ready |
| `room.forceAdvance` | `{ seatToken }` | 超时默认 | 仅房主；跳过当前窗口 |

### 服务端 → 客户端（房间）

| 事件 | 范围 | 内容 |
|---|---|---|
| `room.presence` | 房间广播 | `{ roomCode, seats: [{ seatId, nickname, connected, ready, isHost }], phase, hostSeatId }` |
| `room.error` | 单人 | `{ reasonCode, message? }` |
| `room.started` | 房间广播 | `{ seed? no, roomCode }` |

### 对局内（客户端 → 服务端）

| 事件 | payload | 说明 |
|---|---|---|
| `command.send` | `{ commandId, seatToken, windowId, type, payload }` | 统一指令入口 |

`type` / `payload` 与 `Command` 一致：

| type | payload |
|---|---|
| `draft.pick` | `{ cardInstanceId }` |
| `draft.discard` | `{ cardInstanceId }` |
| `night.declare` | `{ cardInstanceIds }` |
| `night.passPhase` | `{}` |
| `night.chooseTarget` | `{ targetSeatId }`（可为 `view_honor` / `view_house` / 牌实例 id） |
| `night.chooseOptional` | `{ choose }` |
| `react.decide` | `{ react }` |
| `room.forceAdvance` | `{}` |

### 服务端 → 客户端（对局）

| 事件 | 范围 | 内容 |
|---|---|---|
| `command.ack` | 单人 | `{ commandId }` |
| `command.reject` | 单人 | `{ commandId, reasonCode }` |
| `view.snapshot` | 单人 | 完整 `PlayerView`（按座位投影） |
| `event.public` | 房间广播 | `GameEvent[]` 增量或全量公开事件 |
| `event.private` | 单人 | `GameEvent[]` 私密事件 |

### 聊天

| 事件 | 方向 | payload |
|---|---|---|
| `chat.send` | C→S | `{ seatToken, text }` |
| `chat.event` | 房间广播 | `{ seatId, nickname, text, ts }` |

---

## 幂等与窗口

- 服务端为每个 `seatToken` 缓存最近 **N=50** 条 `commandId`。  
- 重复 `commandId` → 直接 `command.ack`，不重复执行。  
- `windowId` 与当前 `state.windowId` 及活跃 pending id 均不匹配 → `command.reject { reasonCode: 'STALE_WINDOW' }`。  

---

## 超时

常量集中于 `src/shared/timeouts.ts`：

| 常量 | 默认 | 说明 |
|---|---|---|
| `DEFAULT_WINDOW_MS` | 60000 | PendingDecision / Draft 窗口 |
| `EMPTY_ROOM_TTL_MS` | 300000 | 空房 5 分钟清理 |
| `ENDED_ROOM_TTL_MS` | 600000 | 结束后 10 分钟清理 |
| `COMMAND_RATE_PER_SEC` | 10 | 单 socket 每秒指令上限 |

defaultChoice：

| pending kind | 超时默认 |
|---|---|
| `draftPick` / `draftDiscard` | `autoPick` options[0] |
| `declareCards` | `pass` |
| `chooseTarget` | `autoPick` options[0] |
| `chooseOptional` | `decline`（false） |
| `reactDecide` | `decline`（false） |

房主 `room.forceAdvance` 立即对当前**所有未响应座位**应用上述默认（多人 declare/draft/merchant 一并应用；不修改为「仅当前活跃」）。

---

## 拒绝原因码（枚举，冻结）

```
NOT_YOUR_TURN
WRONG_WINDOW
STALE_WINDOW
DEAD_SEAT
ILLEGAL_TARGET
DUPLICATE_COMMAND
NOT_HOST
ROOM_FULL
ROOM_NOT_FOUND
GAME_IN_PROGRESS
INVALID_PAYLOAD
UNAUTHORIZED
RATE_LIMITED
PHASE_MISMATCH
NOT_IN_HAND
NO_ACTIVE_WINDOW
UNKNOWN_COMMAND
```

与 core `RejectReason` 的映射见 `src/shared/protocol.ts`。

---

## 鉴权与会话

- `seatToken`：服务端 UUID，映射 `seatToken → { roomCode, seatId }`。  
- 同一 `seatToken` 新连接可抢占并踢掉旧连接。  
- 对局开始后禁止中途加入。  
- **断线重连与 seatToken 复用【阶段 6 裁定 1】**：
  - 客户端 `localStorage` 保存 `seatToken`（key: `ninja-night:seatToken:{roomCode}`，以及当前房间索引 `ninja-night:lastRoomCode`）。
  - 页面刷新 / 断线重连时，Socket 握手 `auth: { seatToken }` 带上 `seatToken`。
  - 服务端保留期内（5 分钟 / `DISCONNECT_RETAIN_MS`）复用同一 `seatId`，重新绑定 socket 并下发 `room.ack`，已开局则重新下发当前 `view.snapshot`（大厅则广播更新后的 `room.presence`）。
  - **不做状态重同步**（不回放历史，直接下发最新单人投影视图）。
  - 超期或未知 token 则返回 `room.error`：`{ reasonCode: 'UNAUTHORIZED', message: '座位已过期，请重新加入' }`，客户端清除该本地 token 并回退至大厅表单。  

---

## 输入消毒

- 昵称：长度 1–16，纯文本，去除控制字符。  
- 聊天：长度 ≤200，纯文本，不做 HTML。  
- payload：手写校验，格式错误 → `INVALID_PAYLOAD`。  

---

## 硬约定

- **严禁** broadcast 完整 `GameState`。  
- 每个座位仅收到 `projectView(state, seatId)`。  
- `server` 不得 `import` `ui`。  
- `core` 不得依赖 socket.io / express。  

---

## 变更记录

- 2026-09-16：阶段 4 冻结完整事件表、原因码、超时常量。  
