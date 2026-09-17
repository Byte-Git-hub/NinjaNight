# 06E7 验证报告（Issue 1 / Issue 2）

> 标准场景替代说明：用户裁定可用标准场景自验证；为省时，采用“已有 e2e 真机用例 + 核心单测”验证，
> 未做整局 1 人 + 3 bot 手玩走查。`bug1-dimmed` 本身即在真实 Chromium 里建房、加 bot、开局、
> 到夜晚声明阶段后断言 `.dim` 与点击无反应，覆盖 Q-B 要求的 UI 层验证。

## Issue 1：跨阶段出牌（通过）

- e2e：`tests/e2e/bug1-dimmed.spec.ts` —— 1 passed（14.2s，真实浏览器）
  - 断言：`declareCards` 时手牌中非本阶段牌带 `.dim`，点击不选中。
- 单测：`tests/core/engine-declare-phase.test.ts`（在手非本阶段 → `phaseMismatch`；`card#nope` → `notInHand`）
- 集成：`tests/integration/server-declare-guard.test.ts`（服务端预校验顺序一致）
- 结论：三层防护生效，Issue 1 关闭。若后续实测复现，需附 `room.error` payload + UI 截图另开 issue。

## Issue 2：反制牌触发（通过）

- 单测：`tests/core/rules-full.test.ts` —— 36 passed
  - 裁判击杀持有 mirror 者：目标仍死且 `step != reactWindow`（无反应窗）
  - BA 击杀：正常开窗 / 反杀 / 同开 / 不嵌套
- 实现位置：`src/core/resolve.ts:576-590`（judge 直杀）、`:809-848`（仅 `!fromJudge` 开窗）
- 结论：与规则一致，Issue 2 关闭。未在浏览器里手构 judge 杀场景（省时裁剪）；
  若实测不符，按 Q-B 记录差异重开。

## TBD-02（Q-A）

- 保持 12×2 + 12×3 + 11×4 = 35；`docs/01_GAME_RULES.md` 待确认总表已补两来源说明。

## Step 7 收尾（6F 全量结果）

- 全量 e2e：18/18 通过（1.7 分钟，`npx playwright test`）
  - bug2-next-round、bug3-victory、lifecycle:40 均通过；此前 P5 全量时的 3 失败未复现
  - lifecycle:40 根因：6E.5 工作区删了 `src/net/client.ts` 的 `OUT.roomTerminated` 监听，
    `onTerminated` 永不触发 → 一行恢复后通过（commit 6F-fix6a）
  - bug2/bug3：隔离复跑 4/4 通过 + 全量 1/1；判定 P5 时失败为全量串行负载下偶发超时，
    forceAdvance→startNextRound 链路本身正常（srv.log 有 `room.forceAdvance … victoryCheck → draftPick1` 为证）
- vitest：15 文件 92 测试全绿；`npm run build:check`：dist 干净
- 省时裁剪声明（用户明确要求去掉费时操作）：
  - 未做整局 1 人 + 3 bot 手玩走查、未做逐点 before/after 截图 → `docs/06F_screenshots/` 空目录已删除
  - Issue 2 未在浏览器手构 judge 杀场景（以 36 单测为准）；Fix5 横幅/提示条以 bug1 回归 e2e smoke 为准，未逐阶段截图
