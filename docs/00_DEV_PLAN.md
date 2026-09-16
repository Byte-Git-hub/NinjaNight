# 00 — 开发计划与进度

status: in-progress  
updated: 2026-09-16  
阶段: 0（骨架）

---

## 开工前修订

以下修订已由用户确认，优先于下方原计划中的冲突表述。

### 1. PendingDecision / ReactWindow 骨架提前到阶段 2

- 阶段 2 必须搭出 `ResolveQueue` + `PendingDecision` 队列 + `ReactWindow` 空壳。
- 至少用一张最简单的牌（如 Spy）走完整链路：声明 → 公开 → 入队结算 → 选目标 → 应用效果 → 队列结束。
- 阶段 3 只是往队列里加牌，**不得重构**该架构。

### 2. 阶段 0 在 `src/shared/` 冻结类型骨架

必须定义且 LocalAdapter 与 SocketAdapter 共用：

| 类型 | 必要字段 |
|---|---|
| `Command` | `commandId` / `seatToken` / `windowId` / `type` / `payload` |
| `GameEvent` | 可见范围 `public` \| `seats[]` \| `server` |
| `PlayerView` | 玩家可见状态 |
| `PendingDecision` | 谁在选、选什么、截止、超时默认 |

阶段 0 可只写类型、无实现；结构后续变更需记录于此。

### 3. 信息可见性矩阵补充（写入 `02_ARCHITECTURE.md`）

| 信息 | 本人 | 他人 | 公共日志 |
|---|---|---|---|
| 令牌**枚数** | 是 | **公开可见** | 可见 |
| 令牌**面值 / 总分** | 是 | **否** | **否** |

说明：Thief 的「比你多」比较以**枚数**为准，不是分数。

### 4. 阶段 4 最小超时机制（不推迟到阶段 5）

- 房主可发送 `room.forceAdvance`，强制跳过当前窗口。
- 未响应窗口默认 **60s** 自动 pass（策略可配置）。
- 完整的按牌种默认目标策略仍留阶段 5。

### 5. 项目路径与命名（开工确认）

- `$ROOT` = `D:\Datum\nuclearBomb\NinjaNight`
- 包名固定 `ninja-night`
- 不初始化 git，待用户确认后再做

---

## 阶段 0 任务清单

- [x] 目录与 npm/TS strict/Vite/Vitest 配置  
- [x] `AGENTS.md` 稳定约定  
- [x] `docs/00`–`05` 骨架  
- [x] `src/shared/types.ts` 类型骨架  
- [x] `README.md`  
- [x] 验收：`npm install` / `typecheck` / `test` / `build`  

---

## 原计划（A–F 摘要，实施时展开到各分册）

### 目标

朋友通过浏览器完成 4–11 人一整局；中文界面；房间码邀请；服务端权威；隐藏信息是规则的一部分。

### 技术选型（冻结）

TypeScript strict · Vite + 原生 DOM/CSS · Node + Socket.IO · Vitest · Playwright · 单仓单进程 · 内存房间 · npm + package-lock · 无引擎/微服务/Redis/DB。

### 架构底线

`core` / `ui` / `net` / `server` / `data` / `dev` 分离；单机与联机共用 core；随机与时间显式注入。

### 分阶段

| 阶段 | 目标 | 进入下阶段条件 |
|---|---|---|
| 0 骨架 | 工具链 + 文档 + shared 类型 | 验收命令通过 |
| 1 规则规格 | 规则表冻结、牌组/令牌表 | 用户确认规则表 |
| 2 最小核心 | 状态机 + Spy 链路 + 信息边界测试 | 4 人一轮闭环 + 泄露测试 |
| 3 完整规则 | 全牌种 + 4/11 人 | 核心测试全绿 |
| 4 房间联机 | Socket + 房间 + e2e 一局 | e2e 通过、无完整状态广播 |
| 5 稳定部署 | 断线策略、移动端、生产构建 | 验收清单签字 |

### 待确认（阶段 1 要补齐）

- 33 张忍者牌精确张数分布  
- 35 枚荣誉令牌 2/3/4 分布、「+5 extra」用途  
- 全灭发奖、自选目标、死亡/已公开目标、多重反应链等裁定  

### 首版不做

账号、公开匹配、排位、观战、AI、内置语音、付费、复杂动画、扩容、DB、重启恢复、完整回放、双人变体、官方插画。

---

## 进度日志

### 2026-09-16 — 阶段 0

- 创建 `$ROOT` 与包名 `ninja-night`。
- 落地 TypeScript/Vite/Vitest 空壳与目录骨架。
- 写入「开工前修订」与共享类型骨架。
- 未初始化 git；未实现玩法规则 / UI / Socket。
