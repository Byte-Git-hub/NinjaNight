# 6G-4b 执行计划 — 视觉审查与协调性打磨

目标：20 截图 × 7 维度审查，critical/major 全修，minor 记录。

## 20 状态清单
- [ ] 1 desktop-lobby-empty 大厅未加入
- [ ] 2 desktop-lobby-waiting 房间内等满员
- [ ] 3 desktop-draft-picking Draft 选牌
- [ ] 4 desktop-night-known 夜晚已知身份有内容
- [ ] 5 desktop-trickster-merchant 商人二选一
- [ ] 6 desktop-assassin-target 刺客/上忍选目标
- [ ] 7 desktop-react-window 反应窗口
- [ ] 8 desktop-round-banner 一轮结束横幅
- [ ] 9 desktop-game-over 结算排名
- [ ] 10 desktop-combo-10 砸物品10连击
- [ ] 11 desktop-emoji-5 快捷表情5连弹
- [ ] 12 desktop-suspect-2 怀疑标记2人
- [ ] 13 desktop-chat-expanded 聊天/日志展开
- [ ] 14 desktop-identity-modal 身份弹窗
- [ ] 15 mobile-lobby (390×844)
- [ ] 16 mobile-draft
- [ ] 17 mobile-night
- [ ] 18 mobile-combo
- [ ] 19 mobile-identity
- [ ] 20 mobile-gameover

## 7 维度
A 尺寸比例 / B 间距留白 / C 对齐 / D 层级遮挡 / E 色彩对比 / F 动画过渡 / G 一致性

## 严重度
- critical：遮挡重叠、误触、信息不可读、功能不可用
- major：明显不协调、对比不足、跨场景不一致
- minor：像素级偏差、可接受，需记录

## 修复优先级
critical → major → minor(记录不强制)

## 完成标准
- [ ] 20 张基线截图落盘
- [ ] 06G_visual_review.md 初稿 + 汇总
- [ ] critical 全解决
- [ ] major 全解决
- [ ] 修复后对比截图落盘
- [ ] typecheck + vitest + 相关e2e 全绿
- [ ] 00_DEV_PLAN 标记 6G-4b 完成
