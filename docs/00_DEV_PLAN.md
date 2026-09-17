# 00 — 开发计划与进度

status: 6F.8 完成  
updated: 2026-09-18  
阶段: **6（桌游布局 6F.8 完成，已推 GitHub private，HEAD `f7cb2e1`）**  
资产口径: **22 项（16 视觉单元 + 2 卡背 + 3 UI 素材 + 1 令牌）**（历史记录中的 16/20 为旧口径，保留原样；当前总量以此处为准）

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

### 阶段 6A — 美术资产管线架构与 Prompt 重构 — **完成**

- [x] One-Shot 风格基线冻结（水墨+金箔金缮+浮世绘、2:3、留白 12%/22%）
- [x] 从 47 条牌 prompt 重构为 16 个卡牌视觉单元（降本 60%+）+ 3 个 UI 单元
- [x] `scripts/gen-assets/prompts.ts` 与 `preview-prompts.ts`
- [x] `docs/06_ART_PIPELINE.md` 锁定 `--model "Gemini 3.8 Flash (High)"`

### 阶段 6B — 图片生成与 UI 资源映射 — **完成**

- [x] 6B 前置：修正拼写与 prompt 完整性（commit `24418f7`）
- [x] 6B-1：UI 资源映射与编号渲染（commit `b618691`）
  - `src/ui/assets.ts` 映射表与降级渲染
  - `.card-placeholder` 与 `.card-number` 顶部 12% 留白区悬浮层
  - 单元测试 `tests/ui/assets.test.ts` 全绿
- [x] 6B-2：16 个卡牌视觉单元生成与全量入库
  - agy-auto-generation 5 张（`spy`, `shapeshifter`, `mystic`, `grave_digger`, `troublemaker`）
  - manual-web-generation 11 张（`blind_assassin`, `crane`, `judge`, `lotus`, `martyr`, `mastermind`, `mirror_monk`, `ronin`, `shinobi`, `spirit_merchant`, `thief`）
  - 全部 16 张严格保持 2:3 纵向比例（0.6709）
- [x] 6B-3：UI 材质与背景图生成全量入库
  - `lobby-bg.jpg`（16:9）
  - `table-texture.jpg`（16:9）
  - `button-primary.jpg`（1:1）
  - `honor-token.jpg`（2:3 荣誉标记）
- [x] 资产清单登记：`scripts/gen-assets/manifest.json` 记录全部 20 项素材来源与尺寸
- [x] 全量验证：typecheck、vitest (66)、build、playwright e2e (6) 全部通过

### 阶段 6B.5 — Bot 人机对手 — **完成**

- [x] `src/core/bot.ts` 纯函数 + `src/server/bot-scheduler.ts` 调度（`d00ec2d`）

### 阶段 6C — UI 主题沉浸重构与资产优化 — **完成**

- [x] 图片后处理：jpg → webp（`assets:optimize`，`9cffcde`）；生产只读 webp
- [x] UI 素材沉浸式接入：大厅水墨夜景背景、牌桌和纸质感底纹、主按钮金缮材质板
- [x] 仓库体积：全量原图约 41 MB（历史陈述，口径见头部 22 项），webp 后生产资产约 1.4 MB

### 阶段 6D — UI 可用性修复 — **完成**

- [x] 房间生命周期修复（`roomTerminated`、返回大厅/终止本局）+ 视觉提亮（`54ae5bc`）

### 阶段 6E — 状态同步与声明卡面修复 — **完成**

- [x] 修 `scheduleWindowTimeout` 未 `setState` 导致的 phase/日志割裂 + `declareCards` 卡面化（`ce2be2d`，见 `docs/06E_DIAGNOSIS.md`）

### 阶段 6E.5 — 真实环境全链路诊断 — **完成（只观测不修码）**

- [x] DEV 钩子 + 六结论判定矩阵（见 `docs/06E5_DIAGNOSIS.md`）

### 阶段 6E.6 — 6E.7 资产归位 — **完成**

- [x] 2 张卡背归位 + 统一归档策略：原图 `_originals/`（gitignore），生产只读 webp，`manifest.json` 的 `file` 统一写 `.webp`（`23b6cfe` / `f5a9c7a`，见 `docs/06_ART_PIPELINE.md` §六）

### 阶段 6E.7 — 联机 bug 三连修 — **完成**

- [x] bug1 阶段校验三层加固（`61bb1e1`）
- [x] bug2 `startNextRound` + victoryCheck 流转（单人房 5s 自动推进 `NINJA_VICTORY_AUTO_MS`）（`39e6110`）
- [x] bug3 计分脱敏：`roundWinner` 只公开枚数，`victory` 总分公开（`9588cd2`）
- [x] fix6a 恢复 `roomTerminated` 监听修 lifecycle:40 + Issue1/2 验证记录（`f331934`，见 `docs/06E7_VERIFICATION.md`：e2e 18/18 + vitest 92）
- [x] 6F.5-fix1–3：日志溢出 / 卡名 tooltip / `knownHouses` 跨轮清空 + `CHOOSE_OPTIONAL_TRUE` 显式映射（`6d1edab` / `225c732` / `c88a830`）

### 阶段 6F.1–8 — 桌游布局 — **完成**

- [x] 6F-1 数据层：`handCount` 投影（`hand + draftHand`，不含 reserved）（`40666b4`）
- [x] 6F-2 座位区重构：环绕卡片 + 桌徽 + 手牌背堆叠（`25824cf`）
- [x] 6F-3 中央公共出牌区：按阶段分组 + 署名 + washi 底（`12293ce`）
- [x] 6F-4 身份牌交互：开局弹窗 + 卡背翻转（`eab962f`）
- [x] 6F-34-fix：座位数据源优先 view + 中央区空组收起（`69d1501`）
- [x] 6F-5 底部决策区与折叠面板：聊天/日志 + 中文日志行（`6804304`）
- [x] 6F-6 移动端响应式：统一断点 + snap + mini 缩小（`4a1545e`）
- [x] 6F-7 收尾与 6F e2e：身份/堆叠/中央/移动端（`77710f3`）
- [x] 6F-8 Draft 第二次选牌后自动弃牌（`b1a104f`）

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
| D13/Q1 | `handCount = hand.length + draftHand.length`，不含 reserved | 6F 规划对话裁定 |
| D14/Q2 | 座位环绕：CSS Grid 固定槽位 | 6F 规划对话裁定 |
| D15/Q3 | 翻转交互：单击 + CSS rotateY 250ms | 6F 规划对话裁定 |
| D16/Q4 | `chooseOptional` 走 `CHOOSE_OPTIONAL_TRUE` 显式映射表，禁 `__true` 暗语 | 6F 规划对话裁定（`3e4728b`，AGENTS 硬约定互引） |
| D17/Q5 | `score.roundWinner` 只公开枚数，`score.victory` 总分公开 | 6F 规划对话裁定（`9588cd2`） |
| D18/Q6 | 移动端座位：横向滚动 | 6F 规划对话裁定 |
| D19/Q7 | 身份弹窗：自动弹出 2.5s 关闭 + 点击关闭 | 6F 规划对话裁定 |
| D20/Q8 | 翻转关闭：再次点击卡背 + 点外部关闭 | 6F 规划对话裁定 |
| D21/Q-A | TBD-02 保持 12×2+12×3+11×4=35 临时表，待实物确认 | 6F 规划对话裁定（见 `06E7_VERIFICATION.md`） |
| D22/Q-B | Issue 验证可用 e2e + 单测替代整局手玩，省时裁剪需声明 | 6F 规划对话裁定（见 `06E7_VERIFICATION.md`） |

---

## 遗留待确认（转自 01 §11；状态已同步至 6F.8）

| ID | 摘要 | 状态 |
|---|---|---|
| TBD-01 | ~~33 张精确分布~~ | **已关闭**：已冻结 6×5+3 |
| TBD-02 | 令牌面值分布 | **仍开放**：临时表 12×2+12×3+11×4=35，待实物确认（Q-A） |
| TBD-03 | ~~全灭~~ | **已关闭**：01 §0.1 D |
| TBD-04 | ~~自选目标~~ | **已关闭**：01 §0.1 A |
| TBD-05 | ~~死亡/已公开目标~~ | **已关闭**：01 §0.1 B |
| TBD-06 | ~~Mirror+Martyr~~ | **已关闭**：01 §0.1 D（Issue 2 已验证关闭） |
| TBD-07 | ~~反应链~~ | **已关闭**：01 §0.1 D |
| TBD-08 | ~~已揭示牌死亡~~ | **已关闭**：01 §0.1 D |
| TBD-09 | ~~令牌池耗尽~~ | **已关闭**：本轮不发 |
| TBD-10 | ~~令牌是否归还重洗~~ | **已关闭**：同 TBD-09 |
| TBD-11 | ~~set aside 可否被掘墓~~ | **已关闭**：01 §0.1 D |
| TBD-12 | ~~同号顺序~~ | **已关闭**：网页版默认（座位序） |

### 6F 遗留三件套（均已关闭，无残留技术债）

- 掘墓人署名：6F-3 中央区署名 + 掘墓 pending 牌面映射（`035e260`）→ 完成
- `lifecycle:67`：现为"选牌渲染完整卡面"断言（`.card-art` + `.card-number`），通过 → 完成
- `targetChosen` / `cardResolved` 裸 JSON：`app.ts` 已有中文行，仅 `default` 分支与 `honorAwarded` 异常分支保留 `JSON.stringify` 兜底 → 已收口

### 技术债处理约定

- 当前无残留技术债。
- 未来独立技术债可用 sub-agent 并行推进，前提：(a) 每个子任务改动文件集互不重叠 (b) 每个子任务独立 commit (c) 主 agent 负责合并与最终验证（OpenCode Task 工具支持并行 sub-agent，此约定有效；AGENTS.md 硬约定互引）。

### 6G-3 快捷短语定稿（15 条）

| # | 定稿短语 |
|---|---|
| 1 | 快点啊，鸡都要叫了 |
| 2 | 不要走，决战到天亮 |
| 3 | 你的忍术，是百变者教的吧 |
| 4 | 我俩是一伙的，相信我 |
| 5 | 我是浪人，别杀我 |
| 6 | 隐士先别动，让我来 |
| 7 | 我等的花都谢了 |
| 8 | 你确定你抽到的是忍者牌，不是菜鸟牌？ |
| 9 | 别拦我，我要去找师父重练了 |
| 10 | 别吵了，专心忍术 |
| 11 | 这一刀，我记下了 |
| 12 | 密探看了我，我是清白的 |
| 13 | 谁在骗我，我已经知道了 |
| 14 | 上忍已出，各位小心 |
| 15 | 这局我必活到最后 |

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

### 2026-09-17 — 阶段 6B.5 / 6C / 6D / 6E / 6E.7 / 6F.1–8

- Bot（`d00ec2d`）→ 6C webp 化（`9cffcde`）→ 6D 生命周期修复（`54ae5bc`）→ 6E 同步修复（`ce2be2d`）→ 6E.7 三连修 + fix6a（见 `06E7_VERIFICATION.md`）。
- 6F-verify 全量 e2e 18/18 + vitest 92（`9fd1f7a`）；6F-1–8 桌游布局完成（`40666b4` → `b1a104f`）。
- 详见本文件各阶段小节；Q1–Q8/D13–D22 与 TBD 关闭状态已同步。

### 2026-09-18 — 文档同步至 6F.8

- 本文件头部 + 6B.5–6F.8 小节 + D13–D22 + TBD 状态 + 三件套关闭 + 短语定稿 + 技术债约定；commit `docs: 同步 00_DEV_PLAN 至 6F.8`。

### 阶段 6G-1 — 语音连麦（mediasoup 集成） — **完成**

- [x] mediasoup 3.27.1（预编译 worker 正常，无需降级）+ mediasoup-client；SFU 纯音频 Opus，信令复用 Socket.IO（`voice.*`），游戏 Command 链路零依赖
- [x] 服务端 `src/server/voice.ts`（状态 + 懒启动 worker/router）+ `src/server/index.ts` 语音信令接线 + `certs/` 自签 https（`NINJA_TLS=1`，默认 http 降级）
- [x] 客户端 `src/net/voice.ts` + `src/ui/voice/`（编排/SVG 图标/控制条）+ 座位卡徽章 + speaking 光效 + 降级三件套横幅
- [x] 超时/端口常量进 `src/shared/timeouts.ts`（浏览器安全卫语句）；`.env.example` 补媒体端口段与防火墙注释
- [x] 测试：`tests/integration/voice-state.test.ts`（6）+ `tests/e2e/voice-nomic.spec.ts`（无麦克风不阻塞开局）；typecheck + vitest 107 + e2e 23/23 全绿
- [ ] 局域网 2 机手工验证（待用户环境）：开/闭麦同步、全局不听、杀 worker 降级

