# 00 — 开发计划与进度

status: in-progress  
updated: 2026-09-16  
阶段: **1（规则规格冻结）— 本回合完成文档与 git**  

---

## 开工前修订

以下修订已由用户确认，优先于冲突表述。

### 1. PendingDecision / ReactWindow 骨架提前到阶段 2

- 阶段 2 必须搭出 `ResolveQueue` + `PendingDecision` 队列 + `ReactWindow` 空壳。  
- 至少用 Spy 走完整链路。  
- 阶段 3 只加牌，**不得重构**。  

### 2. 阶段 0 已在 `src/shared/` 冻结类型骨架

`Command` / `GameEvent` / `PlayerView` / `PendingDecision` 共用于 LocalAdapter 与 SocketAdapter。

### 3. 信息可见性：令牌枚数公开，面值/总分私密；Thief 比枚数

详见 `docs/02_ARCHITECTURE.md` §3。

### 4. 阶段 4 最小超时：`room.forceAdvance` + 60s 自动 pass

完整默认目标策略仍在阶段 5。

### 5. 项目路径与 git

- `$ROOT` = `D:\Datum\nuclearBomb\NinjaNight`  
- 包名 `ninja-night`  
- **已** `git init`；阶段 0 提交 `6137253`；每阶段一提交  

---

## 进度

### 阶段 0 — 项目骨架 — **完成**

- [x] npm + TS strict + Vite + Vitest  
- [x] 目录骨架  
- [x] AGENTS.md / README  
- [x] docs 骨架  
- [x] shared/types.ts  
- [x] 验收命令通过  
- [x] commit: `chore: 阶段 0 项目骨架`  

### 阶段 1 — 规则规格冻结 — **本回合完成（待用户确认进入阶段 2）**

- [x] `docs/01_GAME_RULES.md` 三类账本 + 33 张临时表 + FAQ  
- [x] `docs/03_STATE_MACHINE.md` 完整状态机  
- [x] `docs/02_ARCHITECTURE.md` 完整可见性矩阵  
- [x] 本文件进度更新  
- [x] git 提交（见下）  
- [ ] 用户确认规则表与待确认项处理方式  
- [ ] 用户提供实物 33 张清单（阶段 3 结束前硬性）  

### 阶段 2 — 最小核心 + Spy 闭环 — **完成（待用户确认进入阶段 3）**

- [x] 裁定 A/B/C 写入 01/03（commit `96734f5`）  
- [x] shared 类型补全（Command 含 roomCode 等）  
- [x] core：rng / setup(draft) / resolve / score / projectView / engine  
- [x] LocalAdapter + dev smoke  
- [x] 测试 15 项全绿；typecheck/build 通过  
- [ ] 骗徒 / Mirror / Martyr / Mastermind / Shapeshifter  
- [ ] 超时（阶段 4）  

### 阶段 3 — 完整规则单机版 — **完成（用户已确认进入阶段 4）**

- [x] 牌组冻结 6×5+3、中文名  
- [x] 裁定 TBD-03/06/07/08/09/10/11  
- [x] 六骗徒 + 还施者/殉道者 + 大将军 + 浪人  
- [x] 4–11 人 setup  
- [x] 测试 40 项全绿；typecheck/build 通过  
- [ ] Socket 联机（阶段 4）  
- [ ] 超时（阶段 4）  

### 阶段 3 遗留检查（2026-09-16）

| 检查项 | 结果 |
|---|---|
| 01 §0.1 D 是否写入 TBD-03/06/07/08/11 | **是**，五条均已写入 |
| 01 §11 TBD 表是否标记已裁定 | **是**，TBD-01/03–11 均已关闭；TBD-02/12 仍开放 |
| 03 §0.2 是否有对应裁定 | **是**（排序/死者队列/ReactWindow/同开/反应嵌套/Mastermind/掘墓） |
| 上轮 3 条 String replace 未命中 | 实际文件已含目标内容；本轮补写商人/掘墓澄清与本检查节 |

### 阶段 4 — 房间联机版 — **完成（待用户确认进入阶段 5）**

- [x] 文档一致性检查（阶段 3 遗留检查节）  
- [x] 澄清 A 商人二选一 / 澄清 B 掘墓跨阶段（commit `c4654c2` + 本阶段）  
- [x] 04_PROTOCOL 冻结（事件/原因码/超时常量）  
- [x] server：Express + Socket.IO 房间/会话/权威/超时/限频/消毒  
- [x] net 客户端封装 + 轻量 DOM UI（大厅/对局/聊天/forceAdvance）  
- [x] 集成测试 4 项 + e2e 2 项通过  
- [x] typecheck / test 49 / build 无 dev / test:e2e 2 passed  
- [ ] 手动双隐私窗口完整一局（用户侧验收）  

### 阶段 5 — 稳定性与可部署 — **完成（待用户确认进入美术资产管线）**

- [x] 商人完整效果（merchantChoose / merchantExchange）  
- [x] forceAdvance 语义文档确认  
- [x] 断线保留 + 房主踢出 / 终止本局  
- [x] 超时环境变量 + .env.example  
- [x] 移动端 <1024px 布局  
- [x] 错误处理 + 日志脱敏 logger  
- [x] README Windows 启动  
- [x] build:check CI 断言  
- [x] 稳定性测试（10 房间 / 断线踢出 / TTL）  
- [x] e2e：移动 / 断线 / 商人流程  
- [ ] 真机手测一轮 4 人局（需用户）  

### 阶段 6+ — 美术资产管线（未开始）

---

## 本阶段决策记录

| ID | 决策 | 理由 |
|---|---|---|
| D1 | 33 张分布使用可配置临时表（见 01 §7.3） | 官方未公布；不阻塞架构 |
| D2 | Blind Assassin=直接杀；Shinobi=看后杀 | 卡面原文，防对调 |
| D3 | 令牌枚数公开、面值不公开 | 用户修订 |
| D4 | Thief 按枚数比较 | 用户修订 |
| D5 | ~~自选目标/死亡目标等采用保守默认~~ | 已由阶段 2 裁定 A/B/C 覆盖（01 §0.1） |
| D6 | 已揭示牌在结算前死亡：默认继续结算 | 队列一致性；标待确认 |
| D7 | 同号多牌稳定序=座位序 | 可测可重现 |
| D8 | Grave Digger 默认不可看 set aside 牌 | discarded ≠ set aside |
| D9 | 商人先二选一 HONOR/HOUSE 再可选交换【官方】 | 卡面「或」；澄清 A |
| D10 | 掘墓过去阶段立即打出；未来阶段 reserved【网页版】 | 澄清 B |
| D11 | 大厅不预建 GameState；start 时按实际人数 createGame | 避免空座发牌 |
| D12 | forceAdvance/超时走 applyAllDefaults | 统一默认策略 |

---

## 遗留待确认（转自 01 §11）

| ID | 摘要 | 阶段门禁 |
|---|---|---|
| TBD-01 | 33 张精确分布 | 阶段 3 结束前 |
| TBD-02 | 令牌面值分布 | 同上（可延后到 4） |
| TBD-03 | 全灭 | 阶段 3 前实现口径 |
| TBD-04 | ~~自选目标~~ | 已裁定 01 §0.1 A |
| TBD-05 | ~~死亡/已公开目标~~ | 已裁定 01 §0.1 B |
| TBD-06 | Mirror+Martyr | 阶段 3 |
| TBD-07 | 反杀后再反应 | 阶段 3 |
| TBD-08 | 已揭示后死亡是否继续结算 | 阶段 2–3 |
| TBD-09 | 令牌池耗尽 | 阶段 3–4 |
| TBD-10 | 令牌是否归还重洗 | 阶段 3–4 |
| TBD-11 | set aside 可否被掘墓 | 阶段 3 |
| TBD-12 | 同号顺序 | 已按网页版默认 |

---

## 原计划摘要（A–F）

**目标**：4–11 人浏览器完整一局；中文；房间码；服务端权威；隐藏信息是规则的一部分。  

**技术**：TypeScript strict · Vite · 原生 DOM/CSS · Socket.IO · Vitest · Playwright · npm · 内存房间。  

**分阶段**：0 骨架 → 1 规则 → 2 最小核心（含队列/Spy）→ 3 完整规则 → 4 联机 → 5 稳定部署。  

**首版不做**：账号、匹配、排位、观战、AI、语音、付费、复杂动画、扩容、DB、重启恢复、完整回放、双人变体、官方插画。  

---

## 进度日志

### 2026-09-16 — 阶段 0

- 建立骨架与验收；commit `6137253`。  

### 2026-09-16 — 阶段 1

- 全量规则账本、状态机、架构可见性冻结。  
- git：初始 commit + 本阶段 commit（见 git log）。  

### 2026-09-16 — 阶段 3

- 牌组冻结；骗徒/反应/大将军/计分/TBD 裁定落地。  
- seed42 自动局 draft 后 `2e410bc7`，整轮 `4e4f8dd`（随后续逻辑可能变）。  
- 测试 40 通过。  

### 2026-09-16 — 阶段 2

- 前置裁定 A/B/C；core 最小闭环（Draft + 四牌夜晚 + 计分 + 视图）。  
- seed=42 自动局哈希（冒烟）：draft 后 `3c63975f`，整轮后 `a68a014d`（可能随后续逻辑变更）。  
- 测试：`tests/core/engine.test.ts` + `validate.test.ts` 共 15 通过。  
- 待用户确认后进入阶段 3。  

