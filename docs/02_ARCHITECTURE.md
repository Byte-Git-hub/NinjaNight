# 02 — 架构与信息可见性

status: frozen-for-implementation-v0  
updated: 2026-09-16  
阶段: 1

---

## 1. 模块职责

| 模块 | 职责 | 禁止 |
|---|---|---|
| `src/data` | 静态卡牌/令牌/阶段定义（可配置 deck 表） | 对局可变状态 |
| `src/core` | 权威 GameState、Command 校验、规则推进、Event/PendingDecision | DOM、Socket、浏览器存储、服务器框架；`Date.now()` / `Math.random()` |
| `src/ui` | 渲染 PlayerView、收集 Command | 直接改阵营/手牌/死亡/积分/结算 |
| `src/net` | 指令发送、视图接收、连接状态 | 第二套游戏规则 |
| `src/server` | 房间、会话、权限、调度、超时、按人视图 | 广播完整 GameState |
| `src/shared` | 类型与常量（两端共用） | 业务逻辑 |
| `src/dev` | 座位切换、全知视图、固定牌局 | 生产构建；正式 UI |

本地：LocalAdapter → 同一 `core`。  
联机：Socket → server → 同一 `core`。

---

## 2. 核心数据边界

| 概念 | 定义 | 谁可见 |
|---|---|---|
| GameState | 真实完整状态 | 仅 server / 测试 / dev |
| PlayerView | 按座位投影 | 该玩家客户端 |
| Command | 意图信封 | server 校验 |
| GameEvent | 规则事实 + visibility | 按 visibility 分发 |
| PendingDecision | 挂起选择 | 座位本人（+UI 提示） |
| Rng / Clock | 显式注入 | server/测试 |

### 2.1 牌区（禁止混堆）

| 区 | 含义 |
|---|---|
| undrawn | 本轮 set aside |
| hands | draft 后持有的 2 张 |
| draftDiscard | 中央弃牌 |
| revealedInPlay | 已打出 |
| reserved | Grave Digger 留用 |
| spent | 已消耗 |

### 2.2 令牌

| 维度 | 建模 |
|---|---|
| 实例 | `HonorTokenInstance { id, value: 2\|3\|4 }` |
| 公开 | 每座位**枚数** |
| 私密 | 本人面值列表；总分仅本人与服务器 |
| 比较 | Thief 等按**枚数** |

---

## 3. 信息可见性矩阵（完整）

| 信息 | 本人 | 他人 | 公共日志 | 仅服务器 |
|---|---|---|---|---|
| **自己当前 HOUSE** | 是* | 否 | 否 | 是 |
| **他人 HOUSE** | 仅当技能查看成功 | 否 | 仅 Troublemaker/Thief/Judge/Reveal 等公开时刻 | 是 |
| **自己 NINJA 手牌** | 是 | 否 | 否 | 是 |
| **他人 NINJA 手牌** | 否 | 否 | 否 | 是 |
| （Mystic 查看的对方 1 张） | 施术者：是 | 否 | 否 | 是 |
| **已打出的牌** | 公共 | 公共 | 公共 | 是 |
| **令牌【枚数】** | 是 | **是（公开可见）** | **是** | 是 |
| **令牌【面值 / 总分】** | 是 | **否** | **否** | 是 |
| **牌堆顺序 / 随机种子** | 否 | 否 | 否 | 是 |
| **反应牌是否在手** | 是 | 否 | 否（仅「已反应/未反应」事件） | 是 |
| 反应窗正在开启 | 是（被杀者+公共提示） | 公共仅知「有人遭威胁」 | 是 | 是 |
| 选牌候选手牌（draft） | 本人当前手 | 否 | 最终扣置后否 | 是 |
| 连接/准备/座位昵称 | 是 | 是 | 是 | 是 |
| 胜利时自己的面值 | 是 | 否（宣称胜利时公开超出部分？） | **网页版：宣称胜利后公开其令牌** | 是 |
| 胜利时他人的面值 | 否 | 否 | 未宣称者否 | 是 |

\* 见 Shapeshifter 例外。

### 3.1 令牌可见性说明（修订条目）

1. **枚数**对所有人可见，并写入公共日志（如 Spirit Merchant/Thief 导致增减）。  
2. **面值与总分**永不进入他人 PlayerView，也不进公共事件，除非该玩家**主动宣称胜利**亮出令牌。  
3. **Thief「比你多」= 枚数更多**，不是分数更高。合法目标过滤使用 `honorTokenCount`。  

### 3.2 Shapeshifter 知识快照语义

| 规则 | 要求 |
|---|---|
| 不泄露交换 | 成功对调后**不**向任何人发送「身份已变更」提示 |
| 历史快照 | `PlayerView.self.knownHouses` / 查看记录是 **当时看到的值** 的 append-only 列表 |
| 禁止投影别名 | 不得实现为 `houses[seat].map(...)` 活引用；必须拷贝快照 |
| 禁止自动刷新 | 任何 UI/知识库不得在真实 `GameState.houses` 变化时重写旧记录 |
| 自由查看限制 | 被调换者 `canViewOwnHouse=false`，直至其用其他技能再查看 |
| 公共信息 | Reveal 阶段存活者亮出的是**当前真实** HOUSE；与历史私密记录可不一致（符合桌游） |

---

## 4. 随机与时间

| 需求 | 做法 |
|---|---|
| 洗牌/摸令牌/Mystic 随机看牌 | `Rng` 接口由 core 参数注入；测试用固定种子 |
| 超时截止 | Clock 注入的单调时间；不读全局 Date.now |
| 客户端倒计时 | 仅 UI 展示，以服务器窗口为准 |

---

## 5. 服务端权威底线

1. 客户端不得提交：分数、阵营结果、抽牌结果、完整状态。  
2. 不得把完整 GameState 推给所有客户端再靠 CSS 遮挡。  
3. 错误消息不得夹带未授权暗牌内容。  
4. 重连快照 = 重新 `projectView`，与在线推送同一路径。  

---

## 6. 阶段 2 附加架构约束（开工前修订）

core 内必须具备（名称可调，语义不可缺）：

| 组件 | 最小行为 |
|---|---|
| ResolveQueue | 按当前 phase 声明结果排序并逐步弹出 |
| PendingDecision | 见 shared types |
| ReactWindow | 空壳：可打开、可 decline、可 apply 反杀/殉道；阶段 2 可不接全牌 |
| Spy 实例链路 | 阶段 2 验收剧本见 03 §4.3 |

---

## 7. 变更记录

- 2026-09-16：阶段 1 冻结可见性矩阵；Shapeshifter 快照；令牌枚数/面值；Thief 枚数比较。
