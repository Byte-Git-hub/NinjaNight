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
