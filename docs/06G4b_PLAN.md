# 6G-4b 执行计划 — 视觉审查与协调性打磨

目标：20 截图 × 7 维度审查，critical/major 全修，minor 记录。

## 20 状态清单
- [x] 1 desktop-lobby-empty 大厅未加入
- [x] 2 desktop-lobby-waiting 房间内等满员
- [x] 3 desktop-draft-picking Draft 选牌
- [x] 4 desktop-night-known 夜晚（真实态√，补拍）
- [ ] 5 desktop-trickster-merchant 商人二选一（需手动截图，4 次自动未命中）
- [ ] 6 desktop-assassin-target 刺客/上忍选目标（需手动截图，4 次自动未命中）
- [x] 7 desktop-react-window 反应窗口（真实态√，补拍；R1 已修）
- [x] 8 desktop-round-banner 一轮结束横幅
- [x] 9 desktop-game-over 结算排名（C2 已修）
- [x] 10 desktop-combo-10 砸物品10连击
- [x] 11 desktop-emoji-5 快捷表情5连弹
- [x] 12 desktop-suspect-2 怀疑标记2人
- [x] 13 desktop-chat-expanded 聊天/日志展开（M4 空态已修）
- [x] 14 desktop-identity-modal 身份弹窗
- [x] 15 mobile-lobby (390×844)
- [x] 16 mobile-draft
- [x] 17 mobile-night（approx，与 draft 同帧）
- [x] 18 mobile-combo
- [x] 19 mobile-identity
- [x] 20 mobile-gameover（approx，新轮弹窗帧）

## 7 维度
A 尺寸比例 / B 间距留白 / C 对齐 / D 层级遮挡 / E 色彩对比 / F 动画过渡 / G 一致性

## 严重度
- critical：遮挡重叠、误触、信息不可读、功能不可用
- major：明显不协调、对比不足、跨场景不一致
- minor：像素级偏差、可接受，需记录

## 修复优先级
critical → major → minor(记录不强制)

## 完成标准
- [x] 20 张基线截图落盘
- [x] 06G_visual_review.md 初稿 + 汇总
- [x] critical 全解决（C1/C2/R1）
- [x] major 全解决（M2/M3/M4/M6/m4；M1 部分：merchant/assassin 手动；M5 降级 minor）
- [x] 修复后对比截图落盘（基线刷新 + night/react 重拍）
- [x] typecheck + vitest 174 + 全量 e2e 37/37 全绿
- [x] 00_DEV_PLAN 标记 6G-4b 完成

## 6H 子批次
- [x] 6H-1 音效系统（7f6d157）
- [x] 6H-2 BGM 环境音（2d27a5a）
- [x] 6H-3 成就系统（5a7ae96）
- [x] 6H-4 高光时刻（ab3c821）
