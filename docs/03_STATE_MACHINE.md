# 03 — 状态机

status: skeleton  
updated: 2026-09-16

---

## 主路径状态列表

| 状态 | 谁操作 | 允许 Command | 推进条件 |
|---|---|---|---|
| roomLobby | 房主/玩家 | join/ready/start/leave/chat | 4–11 人且全员 ready 后 start |
| dealHouses | 自动 | — | 发完进入 draft |
| draftPick1 | 各座位 | draft.pick | 全员完成或超时 |
| draftPass2 | 自动 | — | 传完进入 draftPick2 |
| draftPick2 | 各座位 | draft.pick | 全员完成 |
| draftDiscard | 各座位 | draft.discard | 全员完成进入夜晚 |
| nightSpy | 各存活座位 | night.declare / night.passPhase | 声明收集完 → 公开 → resolveQueue |
| nightMystic | 同上 | 同上 | 同上 |
| nightTrickster | 同上 | 同上 | 同上 |
| nightBlindAssassin | 同上 | 同上 | 同上 |
| nightShinobi | 同上 | 同上 | 同上 |
| mastermindReveal | 自动/可选翻开 | — | 进入 houseReveal |
| houseReveal | 存活者自动亮 | — | 进入 score |
| score | 自动 | — | 发令牌 |
| victoryCheck | 自动 | — | 有≥10 分则 gameOver，否则 next round |
| gameOver | 房主可选 | room.*（后置） | — |

## 夜晚子状态

```
CollectDeclarations → RevealDeclared → ResolveQueue
  → chooseTarget / chooseOptional / reactWindow → 应用 → 下一项
  → 队列空 → 下一 Phase
```

| 子状态 | 说明 |
|---|---|
| collectDeclarations | 每人可出多张本阶段牌或跳过 |
| revealDeclared | 公开所有已声明牌，按编号排序 |
| resolveQueue | 逐张结算；可挂起 PendingDecision |
| chooseTarget | 当前牌选择合法目标 |
| chooseOptional | 可选放弃类效果 |
| reactWindow | Mirror/Martyr 声明；对他人隐藏持牌者 |

## 开工前修订约束

- ResolveQueue + PendingDecision + ReactWindow 空壳在 **阶段 2** 必须存在，并至少用 Spy 跑通。  
- 阶段 3 只增牌，不重构。  

## 超时（阶段 4 起）

- 默认 60s 自动 pass / decline（可配置）。  
- 房主 `room.forceAdvance` 立即结束当前窗口。  

---

## 变更记录

- 2026-09-16：骨架主路径。
