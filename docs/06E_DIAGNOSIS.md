# 阶段 6E 诊断报告：状态同步与声明渲染问题分析

**诊断日期**：2026-09-17  
**环境**：Node.js 20+ / Windows PowerShell / Vite + Socket.IO  
**诊断目标**：针对 6D 实测发现的 3 个 Blocker 级 Bug 进行根本原因诊断并制定修复方案。

---

## 1. 客户端状态消费链路诊断

### 1.1 链路梳理
1. **网络层接收**：[`src/net/client.ts:94`](file:///D:/Datum/nuclearBomb/NinjaNight/src/net/client.ts#L94)
   ```ts
   this.socket.on(OUT.viewSnapshot, (v: PlayerView) => this.handlers.onView?.(v));
   ```
2. **UI 层消费**：[`src/ui/app.ts:100-103`](file:///D:/Datum/nuclearBomb/NinjaNight/src/ui/app.ts#L100-L103)
   ```ts
   onView: (v) => {
     this.view = v;
     this.render();
   }
   ```
3. **渲染判定**：
   - `this.render()` 会重新全量构造 DOM 并调用 `this.bind()` 绑定事件。
   - `this.view` 为新对象时，所有字段（`phase`、`step`、`self.hand`、`pendingDecision`、`events`）均被全量替换并参与重绘，不存在“只更新部分字段”的客户端缓存问题。

**结论**：客户端状态消费链路本身是完整的，收到新 `view.snapshot` 时会全量渲染。

---

## 2. Bug A（UI 状态卡在旧阶段，日志已到 score.roundWinner）根因诊断

### 2.1 现象重现与分析
- 用户实测截图显示：对局主界面标题仍显示为「隐士」（`nightMystic`），但底部日志区已有 `score.roundWinner`，`view.phase` 严重落后于服务端真实推进状态。
- 通过编写并在服务端运行诊断脚本 [`scripts/diagnose-sync.ts`](file:///D:/Datum/nuclearBomb/NinjaNight/scripts/diagnose-sync.ts) 及 Playwright 真实浏览器对局发现以下关键漏洞：

### 2.2 核心根因：`scheduleWindowTimeout` 中遗漏 `room.state = result.state`
在 [`src/server/index.ts:107-118`](file:///D:/Datum/nuclearBomb/NinjaNight/src/server/index.ts#L107-L118)：
```ts
const beforeSeq = room.state.eventSeq;
const result = applyAllDefaults(room.state);
if (result.ok) {
  const newEvents = result.state.events.slice(beforeSeq);
  room.broadcastPublicEvents(newEvents.filter((e) => e.visibility === 'public'));
  room.broadcastPrivateEvents(newEvents);
  room.broadcastView(); // <-- 严重漏洞！
  if (room.state.pending.length > 0) { ... }
}
```
1. `applyAllDefaults(room.state)` 是纯函数，返回 `{ ok: true, state: result.state }`，产生了包含推进到计分乃至 `score.roundWinner` 的新 `result.state`。
2. **致命缺陷**：服务端**从未执行** `room.setState(result.state)` 或 `room.state = result.state`！
3. `room.broadcastPublicEvents(newEvents)` 将 `score.roundWinner` 等公有事件广播到了房间通道；
4. 随后调用的 `room.broadcastView()` 从 `this.state` 生成快照——由于 `room.state` 未更新，下发的快照依然是**旧状态**（如 `nightMystic`）！
5. 结果：客户端收到了旧 `phase`（隐士）的视图，但在公有事件流或残留事件中看到了 `score.roundWinner`，造成“phase 滞后但日志已走完”的割裂。

### 2.3 选定修复方案（方案 1 + 补充）
1. 在 [`src/server/index.ts`](file:///D:/Datum/nuclearBomb/NinjaNight/src/server/index.ts) 中：
   - 修复 `scheduleWindowTimeout`：`result = applyAllDefaults(room.state)` 成功后，必须立即 `room.setState(result.state)`，并统一走 `afterStateChange(room)`。
2. 在每个 Phase 推进及状态转移后，确保无缝通过 `room.broadcastView()` 下发最新视图。

---

## 3. Bug B（「待你决策」面板显示 card#12 纯文本，无卡面）根因诊断

### 3.1 核心根因
在 [`src/ui/app.ts:331-361`](file:///D:/Datum/nuclearBomb/NinjaNight/src/ui/app.ts#L331-L361) 中：
```ts
if (pending.kind === 'draftPick' || pending.kind === 'draftDiscard') {
  opts = pending.options.map(... renderCardHtml ...);
} else if (pending.kind === 'chooseTarget') {
  ...
} else {
  // declareCards 掉入此分支！
  opts = pending.options
    .map((o: string) => `<button class="opt" data-opt="${escapeHtml(o)}" type="button">${escapeHtml(optLabel(o, v))}</button>`)
    .join('');
}
```
1. 当 `pending.kind === 'declareCards'` 时，`pending.options` 包含当前手牌中属于本阶段可打出的卡牌实例 ID（如 `['card#12']`）。
2. 因为未对 `declareCards` 做卡面渲染分支，它直接落入 `else` 分支。
3. `optLabel('card#12', v)` 无法匹配任何特殊关键字，直接 `return o`，生成了 `<button class="opt" data-opt="card#12">card#12</button>` 纯文本按钮。
4. 此外，卡牌多选事件仅绑定在 `.hand .card[data-iid]`，待办面板中的按钮既不是卡面，点击也不会将卡牌加入 `this.selected`，导致玩家不知如何操作。

### 3.2 选定修复方案
1. 在 `pendingPanel` 中为 `declareCards` 增加专门卡牌渲染分支：
   - 从 `v.self.hand` 中找到对应的卡牌定义（`cardId`、`instanceId`、`number`）。
   - 调用 `renderCardHtml(card.cardId, card.instanceId, true, 'opt declare-opt', card.instanceId)` 渲染 2:3 完整立绘及编号徽章。
   - 若该卡已被选中（`this.selected.has(card.instanceId)`），追加 `.sel` 样式类（高亮青色霓虹边框）。
2. 交互绑定完善：
   - 点击待办区候选卡面即可切换选中/取消（与手牌区双向同步高亮）。
   - 保留「确认打出选中」(`night.declare`) 与「跳过」(`night.passPhase`) 按钮。
3. 对所有展示已公开声明卡牌处做卡面化，彻底杜绝裸露内部英文 ID。

---

## 4. Bug C（点击 forceAdvance 无反应，UI 卡在「等待其他玩家」不动）根因诊断

### 4.1 核心根因
1. **发送路径**：
   - 客户端：`#btn-fa` 触发 `client.forceAdvance()` -> 发送 `EV.roomForceAdvance`。
   - 服务端：`socket.on(EV.roomForceAdvance)` 检查房主身份并执行 `room.applyGameCommand(cmd)`。
2. **核心阻塞点 1：`applyAllDefaults` 在 `pending.length === 0` 时空转**：
   在 [`src/core/engine.ts:84-86`](file:///D:/Datum/nuclearBomb/NinjaNight/src/core/engine.ts#L84-L86)：
   ```ts
   export function applyAllDefaults(state: GameState): EngineResult {
     if (state.pending.length === 0) {
       return { ok: true, state };
     }
   ```
   - 当 UI 处于「等待其他玩家」（即当前玩家没有待办，但游戏处于 `victoryCheck` 或是无待办的中间态，或者超时阶段），`state.pending.length === 0`。
   - 此时房主点击「强制推进」，`applyAllDefaults` 直接返回原状态，新事件数组为空，状态未发生任何前进！
3. **核心阻塞点 2：一轮结束后 `victoryCheck` 死锁未开启新轮次**：
   在 [`src/core/score.ts:156`](file:///D:/Datum/nuclearBomb/NinjaNight/src/core/score.ts#L156)：
   - 当计分结束且无人达到 10 分时，状态机停在 `state.phase = 'victoryCheck'`，且 `state.pending = []`。
   - 状态机没有将 `victoryCheck` 推进到下一轮的发身份/选牌阶段（即未执行 `dealHouses / startNextRound`）。
   - 导致所有玩家看到的都是 `等待其他玩家…`，房主点强制推进又因 `pending.length === 0` 而无法触发任何轮次转换。

### 4.2 选定修复方案
1. **轮次自动流转或推进支撑**：
   - 当 `victoryCheck` 完成且无胜出者（未 `gameOver`）时，自动触发新一轮准备或在房主点击「强制推进」时支持从 `victoryCheck` 流转到新一轮 `dealHouses` / `draftPick1`。
2. **`forceAdvance` 增强容错**：
   - 若 `state.pending.length === 0` 且游戏未 `gameOver` 但处于停滞状态（如 `victoryCheck`），允许 `forceAdvance` 触发下一阶段推进。
   - 服务端在 reject 时确保客户端触发 toast 提示与日志输出。

---

## 5. 日志可观测性规划（顺带）

1. **客户端**：在 `onView(v)` 中追加 `console.log('[view]', { phase: v.phase, step: v.step, pending: v.pendingDecision?.kind });`。
2. **服务端**：在 `broadcastView` 时通过 logger 记录 `[broadcast] roomCode=${room.code} phase=${state.phase} pendingSeats=${...}`。

---

**报告确认**：诊断完成，根因明确，接下来进入代码修复与测试验证阶段。
