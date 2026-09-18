# 04 — 联机协议

status: frozen-for-stage-4  
updated: 2026-09-18
实现阶段：6G / 6F 互动层

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

### 社交互动（不进入 GameState）

互动广播只在房间内即时消费，不写入对局状态、数据库或历史快照；重连不会补播旧互动。

#### 物品飞行

| 事件 | 方向 | payload | 说明 |
|---|---|---|---|
| `effect.send` | C→S | `{ seatToken, items }` | `items` 为 1–64 条压缩记录 |
| `effect.batch` | S→房间 | `{ roomCode, items }` | 服务端校验后广播给房间内所有连接 |

单条记录为：

```ts
{
  targetSeatId: string,
  itemId: 'egg' | 'sakura' | 'geta' | 'rotten_pill' | 'basket' |
           'secret_letter' | 'tea' | 'snowball' | 'shuriken',
  comboId: string,
  count?: number // 省略按 1；整数 1–1000
}
```

`count` 用于把大量相同物品压缩成一条记录，客户端按目标座位播放对应数量/强度的飞行与命中特效。物品广播使用独立社交链路，不占用 `command.send` 的游戏限频，也不会因正常物品连发返回游戏 `RATE_LIMITED`。

下行条目会附带服务端解析出的 `fromSeatId`、`fromNickname`；`count: 1` 可省略。服务端同时限制单批条目数（默认 64）和 JSON payload 大小（默认 256 KiB）。

#### 图片表情、文字表情与鲜花/鸡蛋

| 事件 | 方向 | payload | 说明 |
|---|---|---|---|
| `room.reaction` | C→S | `{ seatToken, targetSeatId, kind, count, emoji?, emojiId?, commandId? }` | 纯互动请求 |
| `event.reaction` | S→房间 | `{ fromSeatId, targetSeatId, kind, count, emoji?, emojiId?, sentAt }` | 即时房间广播，不保存历史 |

`kind` 只能是 `egg`、`flower`、`emoji`；`count` 为整数 1–10（省略按 1）。`kind: 'emoji'` 时必须在文本 `emoji` 与图片 `emojiId` 中**二选一**：文本长度最多 4 个 UTF-16 code units；图片 id 只能是以下 12 个资源名：

```text
swords  kunai  ninja_head  noh_mask  flame  water
moon    star   tea_cup     bamboo    kitsune_mask  scroll
```

`egg`/`flower` 不得携带 `emoji` 或 `emojiId`。目标座位必须属于当前房间。格式或目标校验失败返回 `command.reject { commandId, reasonCode: 'INVALID_REACTION' }`；reaction 的保护性超限静默丢弃，不污染游戏指令拒绝提示。

reaction 保护桶默认每 socket 每秒 30 条（`NINJA_REACTION_RATE_PER_SEC` 可调）；它只保护服务端，不改变游戏指令的 `COMMAND_RATE_PER_SEC`。

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
INVALID_REACTION
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
