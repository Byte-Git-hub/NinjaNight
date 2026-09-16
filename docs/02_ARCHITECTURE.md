# 02 — 架构与信息可见性

status: skeleton  
updated: 2026-09-16

---

## 模块职责

| 模块 | 职责 | 禁止 |
|---|---|---|
| `data` | 静态卡牌/令牌/阶段定义 | 对局状态 |
| `core` | 权威状态、Command 校验、规则推进、Event/PendingDecision | DOM/Socket/全局时间/全局随机 |
| `ui` | PlayerView 渲染、收集 Command | 直接改权威状态 |
| `net` | 传输、连接 | 第二套规则 |
| `server` | 房间、会话、调度、按人视图 | 广播完整 GameState |
| `shared` | 类型与常量 | 业务逻辑 |
| `dev` | 本地全知/换座/固定牌局 | 生产构建 |

## 核心概念

- `GameState`：真实完整状态（仅 server/测试/dev）  
- `PlayerView`：获准可见投影（`src/shared/types.ts`）  
- `Command` / `GameEvent` / `PendingDecision`：见 shared  
- 牌区分离：`undrawn` / `hands` / `draftDiscard` / `revealedInPlay` / `reserved` / `spent`  

## 信息可见性矩阵

| 信息 | 本人 | 他人 | 公共日志 | 仅服务器 |
|---|---|---|---|---|
| 自己 HOUSE | 是* | 否 | 否 | 是 |
| 他人 HOUSE | 仅技能私密记录 | 否 | 否 | 是 |
| 自己手牌 | 是 | 否 | 否 | 是 |
| 他人手牌 | 否 | 否 | 否 | 是 |
| 已打出牌 | 公共 | 公共 | 公共 | 是 |
| **令牌枚数** | 是 | **公开可见** | **可见** | 是 |
| **令牌面值 / 总分** | 是 | **否** | **否** | 是 |
| 牌堆顺序 / 种子 | 否 | 否 | 否 | 是 |
| 反应牌是否在手 | 否 | 否 | 仅「发生反应」事件 | 是 |

\* Shapeshifter 调换后按 FAQ 不得自由查看（`canViewOwnHouse=false`）。

### 补充：Thief 比较口径

Thief「取走比你多者的令牌」中的「多」以**令牌枚数**比较，不以面值总和比较。目标展示应使用枚数。

### Shapeshifter 知识规则

- 不发送「身份已变化」提示。  
- `knownHouseHistory` 保存「当时看到的内容」，不自动更新为真实新 HOUSE。  
- 公共事件不得因交换成功而广播。

---

## 随机与时间

core 不调用 `Math.random()` / `Date.now()`。  
服务端注入 RNG 与 clock；测试注入固定种子与固定时刻。

---

## 变更记录

- 2026-09-16：骨架；纳入令牌枚数公开 / 面值私密；Thief 以枚数比较。
