# 01 — 游戏规则与裁定账本

status: skeleton  
updated: 2026-09-16  
来源基准：Brotherwise Games 官方 Core Rulebook + FAQ（英文，4–11 人，不含 2P 变体）

---

## 使用说明

每条规则必须落入且仅落入一类：

| 标记 | 含义 |
|---|---|
| **官方** | 规则书/FAQ/卡面明确 |
| **网页版** | 线上化交互约定，可改，需在 UI 可发现 |
| **待确认** | 缺少官方来源，实现前需用户裁定或实物资料 |

不得为了让程序容易实现而静默删牌、改效果或改胜负规则。

---

## A. 官方账本（骨架）

### A.1 盒内物与人数

- [ ] 33 Ninja cards  
- [ ] 11 House cards（莲花/仙鹤 1–5 + 浪人）  
- [ ] 35 Honor tokens（+5 extra）；面值 2/3/4  
- [ ] 4–11 人；奇数人数含浪人  

### A.2 回合流程

- [ ] Start of Round  
- [ ] Ninja Draft（3 → 传 2 → 再选 1 → 弃 1）  
- [ ] Night 五阶段：Spy → Mystic → Trickster → Blind Assassin → Shinobi  
- [ ] House Reveal  
- [ ] End of Round / 胜利检查  

### A.3 牌效表

| 英文标识 | 中文名 | 阶段 | 编号 | 效果 | 目标规则 | 可见性 | 数量 |
|---|---|---|---|---|---|---|---|
| Spy | 密探 | Spy | 待确认张数 | 查看另一玩家 HOUSE | another player | 私密 → 可公开说 | 待确认 |
| Mystic | 隐士 | Mystic | 待确认 | 查看 HOUSE + 一张 NINJA | another player | 私密 | 待确认 |
| Shapeshifter | 变身者 | Trickster | 1 | 查看两人 HOUSE，可秘密对调 | 两名玩家 | 私密；对方不得再看新 HOUSE | 1? |
| Grave Digger | 掘墓人 | Trickster | 2 | 看两张已弃 NINJA，选一立刻或保留 | 中央弃牌 | 私密 | 1? |
| Troublemaker | 捣乱者 | Trickster | 3 | 查看 HOUSE，可公开 | another player | 可选公共 | 1? |
| Spirit Merchant | 灵商 | Trickster | 4 | 查看 HONOR 或 HOUSE，可换令牌 | another player | 私密 | 1? |
| Thief | 盗贼 | Trickster | 5 | 亮 HOUSE；从枚数更多者拿 1 令牌 | 枚数更多者 | HOUSE 公开；令牌面值仍私密 | 1? |
| Judge | 判官 | Trickster | 6 | 亮 HOUSE；杀死一人；Mirror/Martyr 无效 | 任一玩家？ | HOUSE 公开 | 1? |
| Blind Assassin | 盲眼刺客 | Blind Assassin | 待确认 | 直接杀死 | 任一玩家？ | — | 待确认 |
| Shinobi | 上忍 | Shinobi | 待确认 | 查看 HOUSE 后可杀 | 任一玩家？ | 查看私密 | 待确认 |
| Mirror Monk | 镜僧 | react | — | 被 BA/Shinobi 杀时反杀 | — | 翻开后公共 | 1? |
| Martyr | 殉道者 | react | — | 被杀时获得令牌 | — | 翻开后公共 | 1? |
| Mastermind | 幕后主脑 | reveal | — | 存活至 Reveal 则本方获胜；浪人则无阵营胜 | — | 公开 | 1? |

> 编号仅卡面示例已见（如 Spy 2/3/4/5、Shinobi 2/4、BA 2、Mystic 6）。**完整表待阶段 1 补齐。**

### A.4 结算

- [ ] 地位 1 最高；逐级比较  
- [ ] 完全平局：无阵营胜，每名存活者 +1 令牌  
- [ ] 获胜阵营全员（含已死）各摸 1；数字朝下  
- [ ] 浪人存活 +1  
- [ ] ≥10 分在回合结束检查；同轮多高：高分胜，仍平共享  
- [ ] Thief 偷到过线不立即赢  

### A.5 FAQ 已确认

- [ ] 查看可说谎  
- [ ] Mystic 随机看两张中的一张  
- [ ] Shapeshifter 后不可自由再看，但可用其他角色牌  
- [ ] Grave Digger 可立即或延后  
- [ ] Ronin+Mastermind：自己得分、他人本轮不得分  
- [ ] Spirit Merchant 任意对换  
- [ ] 乱序打出：收回且公开信息  
- [ ] 揭示前被杀：该 NINJA 不揭示  

---

## B. 网页版交互约定（骨架）

| 约定 | 说明 |
|---|---|
| 声明后统一公开 | 阶段先收集出牌/跳过，再按编号结算 |
| 结算时选目标 | 不要求回合开始锁定全部目标 |
| 同阶段多牌 | 合法时支持 |
| 反应窗呈现 | 显示「有人受到致命威胁」，不暴露谁持反应牌 |
| 超时 | 未响应 60s 自动 pass；房主可 `room.forceAdvance` |
| 断线 | 暂停等待或房主终止；首版无完整重同步 |
| 聊天 | 公共文本；死亡玩家仍可发言；纯文本渲染 |

---

## C. 待确认裁定（骨架）

| ID | 问题 | 阻塞 | 需要 |
|---|---|---|---|
| TBD-01 | 33 张牌各类型/编号张数 | 规则完整性宣称 | 实物清单或照片 |
| TBD-02 | 令牌 2/3/4 分布与 +5 extra | 发牌公平性对齐实体 | 实物点数 |
| TBD-03 | 全灭是否发奖、如何胜 | 计分边界 | 用户裁定 |
| TBD-04 | 技能/击杀能否指向自己 | 目标校验 | 用户裁定 |
| TBD-05 | 能否指向已死亡/身份已公开者 | 目标校验 | 用户裁定 |
| TBD-06 | 同次死亡可否同时 Mirror+Martyr | 反应链 | 用户裁定 |
| TBD-07 | 被 Mirror 反杀者能否再反应 | 反应链 | 用户裁定 |

---

## 变更记录

- 2026-09-16：建立骨架；官方规则书/FAQ 已核验主路径。
