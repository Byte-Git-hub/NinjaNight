# 04 — 联机协议

status: skeleton  
updated: 2026-09-16  
实现阶段：4  

---

## 原则

- 服务端权威；客户端只提交意图。  
- 不下发完整 `GameState`、牌堆序、种子、未获准暗牌、令牌面值。  
- `commandId` 幂等；`windowId` 防旧窗口。  
- 房间码仅用于 join；鉴权用 `seatToken`。  

## 房间生命周期

create → join → ready → start → 对局 → gameOver →（可选回大厅）→ 清理  

- 对局开始后默认禁止中途加入。  
- 空房间与结束房间定时清理。  
- 同玩家多开：以 `seatToken` 抢占（网页约定）。  

## Command 列表（骨架）

| type | 发送者 | 字段 | 确认 |
|---|---|---|---|
| room.create | 任何人 | nickname | ack + roomCode + seatToken |
| room.join | 任何人 | roomCode, nickname | 同上 |
| room.ready | 座位 | ready | public presence |
| room.start | 房主 | — | gameStarted |
| room.chat | 座位 | text | 公共消息（消毒） |
| room.forceAdvance | 房主 | — | 结束当前窗口（阶段 4） |
| draft.pick | 座位 | cardInstanceId | ack 或 reject |
| draft.discard | 座位 | cardInstanceId | 同上 |
| night.declare | 座位 | cardInstanceIds | 同上 |
| night.passPhase | 座位 | — | 同上 |
| night.chooseTarget | 座位 | targetSeatId | 同上 |
| night.chooseOptional | 座位 | choose | 同上 |
| react.decide | 座位 | react | 同上 |

## 出站消息（骨架）

| 消息 | 内容 |
|---|---|
| view.snapshot | `PlayerView` |
| event.public / event.private | `GameEvent` |
| command.ack | commandId |
| command.reject | commandId + reasonCode |
| room.presence | 座位/连接/准备 |

## 拒绝原因码（预留）

`unauthorized` · `staleWindow` · `duplicate` · `illegalTarget` · `notYourTurn` · `phaseMismatch` · `roomFull` · `gameStarted` · `invalidPayload` · `rateLimited`

---

## 变更记录

- 2026-09-16：骨架。
