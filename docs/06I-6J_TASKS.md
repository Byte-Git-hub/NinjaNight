# 06I–6J 任务清单（bot 修复 + 种子 + 部署 + 加固）

status: in_progress
updated: 2026-09-18
HEAD 起点：d401701（6G-4b + 6H-1~4 完成，已 push）

> 本文件是任务完整性的唯一凭据。每一轮修复/调整前后读此文件确认没跑偏。
> 中途不删除。全部完成后追加「完成记录」章节，状态改为 completed，
> commit：docs: 06I-6J 任务完成。

## 用户反馈（已收录）

- [x] 反馈 1（真 bug）：AI-1 (s1) 打出「百变者 1」后游戏卡死 → 任务 1
- [x] 反馈 2：BGM/音效通过，不动 → 6H 不碰
- [x] 反馈 3：局域网 2 机验证已由用户手动完成 → 从 00_DEV_PLAN 移除该项 + AGENTS 相关约定移除 → 任务 0

## 任务 0：文档清理（局域网 2 机验证移除）

- [x] 00_DEV_PLAN.md：移除所有「局域网 2 机手工验证（待用户环境）」待办行（6G-1 / 6G-3 / 6G-4b / 6H-4 四处）
- [x] AGENTS.md：检查并移除相关约定（如有）→ 无相关约定，无需改
- [x] commit：docs: 移除局域网 2 机待办（用户已手动验证）
- commit hash：0b6eec3

## 任务 1：bot 骗徒牌决策修复

诊断（先输出再修）：
- [x] 读 src/core/bot.ts shapeshifter 分支
- [x] 读 src/core/resolve.ts 百变者完整步骤（targetA / targetB / swapOrNot）
- [x] 找出 botDecide 在哪一步返回 null / 非法 Command
- [x] 输出诊断：卡在哪一步、什么原因

诊断结论（2026-09-18 实测）：
bot 各分支齐全，根因不在 bot 缺分支，而在两处：
1. resolve.ts targetB 下发 options = 全体座位（含 targets[0] 本身），而
   applyTargetChoice 明确 `targets[0] === target → illegalTarget`。
   bot 按 options 随机命中（概率 1/N，4 人局 25%）→ engine reject。
2. scheduler 消费 schedKey 后永不重试（handleBotCommand reject 只 warn）；
   若房主 forceAdvance，applyAllDefaults 默认 options[0] 恰为 targets[0]
   （targetA 常选 s0 = options[0]）同样非法 → 直接移除 pending，
   resolveContext 悬空、resolveQueue 非空、pending 为空 → 永久卡死。
   这就是「AI-1 打出百变者 1 后游戏卡死」。

修复：
- [x] 百变者 targetB：非法选项（重复 targets[0]）不再下发；bot 侧防御
- [x] 掘墓人 grave_digger（gravePick 选牌 + graveImmediate 立即打出/保留）：确认每步有决策
- [x] 捣蛋鬼 troublemaker（troubleReveal 公开/隐藏）：确认
- [x] 商人 spirit_merchant（merchantChoose 二选一 + merchantGive/Take 交换）：确认
- [x] 盗贼 thief / 裁判 judge（chooseTarget）：确认
- [x] scheduler：被 reject 的 bot 决策可重试，不永久卡死（defense-in-depth）
- [x] 回归：typecheck + 相关 vitest + e2e 子集
- [x] commit：fix: bot 骗徒牌决策补全
- commit hash：

## 任务 2：种子机制（可复现对局）

- [ ] 启动时读 env NINJA_SEED（无则随机）
- [ ] 超时/env 唯一来源：src/shared/timeouts.ts（+ .env.example）
- [ ] dev / test 可用固定 seed 复现任意对局
- [ ] UI 大厅隐藏入口（URL query ?seed=xxx 或设置面板），显示当前 seed
- [ ] 服务端开局日志打印 seed（脱敏：seed 允许记？AGENTS 禁记种子——注意冲突，需处理：只记 seed 是否来自 env / 哈希，不记原始值；或修订约定。先按“不记原始种子值”实现）
- [ ] 集成测试：同一 seed 跑 3 次，局面完全一致
- [ ] commit：feat: 种子机制（可复现对局）
- commit hash：

## 任务 3：6I 线上部署（Vercel + Railway，允许语音降级）

- [ ] 6I-1：vercel.json（build / dist / SPA fallback）+ socket 读 VITE_API_BASE_URL + vite preview 本地验证
- [ ] 6I-2：railway.toml（构建/启动/PORT）+ docs/DEPLOY.md 环境变量清单 + CORS 读环境变量 + mediasoup try-catch 降级（voiceEnabled=false，前端显示“语音暂不可用”）
- [ ] 6I-3：本地模拟生产（后端 3000 + preview 4173）+ Playwright 走完一局 + 降级文案验证
- [ ] 6I-4：docs/DEPLOY.md 完整步骤 + README 部署章节 + 本地局域网部署说明
- [ ] 约束：不实际部署（无账号，只写配置）；不生图；不改 core/bot；允许 mediasoup 降级
- [ ] commit：6I: Vercel + Railway 部署配置
- commit hash：

## 任务 4：6J 加固与基准

- [ ] 6J-1：scripts/bench/run.ts（11 人房整局耗时/内存/吞吐；10 连击首帧/FPS/粒子峰值）→ docs/06J_BENCH.md；commit：6J-1: 性能基准
- [ ] 6J-2：前端错误边界（onerror/toast、img 占位、断线横幅、Audio 静默、麦克风降级检查）；commit：6J-2: 前端错误边界
- [ ] 6J-3：安全加固（XSS textContent/escape + 测试；限频审计 + 测试；房间码空间/失败限频）；commit：6J-3: 安全加固
- [ ] 6J-4：手机真机测试（Playwright 移动模拟 + 触摸，5 关键流程）→ docs/06J_MOBILE.md；commit：6J-4: 手机真机测试
- [ ] 6J-5：README 完善（截图/玩法/部署/开发/结构）；commit：6J-5: README 完善
- [ ] 约束：不引新依赖；不改 core/bot；每子批次独立 commit
- commit hashes：6J-1： / 6J-2： / 6J-3： / 6J-4： / 6J-5：

## 统一自检（每子批次完成后必做）

- [ ] 核心功能手工验证一次
- [ ] 相关 e2e 子集无回归
- [ ] typecheck + test 全绿
- [ ] 有问题立即修，不攒到最后

## 最终汇报（唯一停止点：全部完成后）

- [ ] 所有 commit hash
- [ ] 每个任务完成状态
- [ ] bot 卡死根因 + 修复后实测
- [ ] 种子机制用法示例
- [ ] 全量测试输出（typecheck / vitest / build:check / e2e）
- [ ] 截图（06H 已有 / 06J 若有）
- [ ] 意外与处理 / 剩余 minor 清单 / DEPLOY.md 摘要
- [ ] 停下等用户审阅
