# 06G 视觉审查报告（6G-4b）

基线：20 张截图（`docs/06G_screenshots/desktop-*.png` ×14 + `mobile-*.png` ×6），桌面 1440×900 / 移动 390×844。
维度：A 尺寸比例 / B 间距留白 / C 对齐 / D 层级遮挡 / E 色彩对比 / F 动画过渡 / G 一致性。
风格锚点：浮世绘 + 水墨 + 金箔，清晰优先于华丽，总体已成型，以下为逐项问题。

| # | 截图 | 维度 | 问题 | 严重度 | 建议修复 | 状态 |
|---|---|---|---|---|---|---|
| C1 | desktop-draft-picking / night-known / combo-10 / emoji-5 / suspect-2 / chat-expanded / mobile 全套 | E | 中央公共区空态白字（"本轮暂无打出"）落在米色 washi 底上，几乎不可读；washi 整体过亮，与暗色面板割裂 | critical | 中央区加暗叠加 + 空态/标题改浅金 | 已解决（night-known 重拍验证可读） |
| C2 | desktop-game-over / mobile-gameover | D | 结算排名被"你的身份"新轮弹窗覆盖（终局仍弹身份 modal，层级/时机错误） | critical | gameOver/completed 时抑制身份弹窗 | 已解决（临时验证 spec：终局+3s 无弹窗，通过后删除） |
| R1 | desktop-react-window（补拍发现，6F 遗留） | G/功能 | 反应面板四按钮：裸英文 react/decline 与发动/放弃重复；且点"react"误发 decline（服务端 options 为 ['react','decline']，委托只认 __true） | critical | 压住通用渲染，只留发动/放弃对（__true/__false 约定保持不动） | 已解决（typecheck + 慢驱动全程通过） |
| M1 | desktop-trickster-merchant / assassin-target / react-window / night-known | G | 四张未拍到真实态：merchant/assassin/react 三文件字节相同（均为胜负态兜底），night-known 与 draft 相同（仍在选牌） | major | 慢步进补拍（4 次尝试） | 部分解决：night/react 已拍到真实态并重拍落盘；merchant/assassin 4 次自动尝试未命中（人类需持有并声明商人/刺客，随机发牌导致），标"需手动截图"，不阻塞 |
| M2 | desktop 全套（自家座位卡） | B | 令牌行三行换行拥挤："令牌面值：[无]·点击卡背查看身份 / 看身份 / 令牌:0" | major | CSS 限行 + 字号/行高收紧（不动文案与选择器） | 已解决 |
| M3 | desktop-lobby-waiting / chat-expanded | E | 语音"开麦中"禁用态灰字在暗底上对比不足 | major | disabled 态提亮（opacity/颜色） | 已解决 |
| M4 | desktop 全套右栏 / lobby-waiting 中栏 | B | 聊天/日志空态大面积空白，无任何提示文案 | major | 空态加"暂无消息"类提示（查 e2e 无相关断言后加） | 已解决 |
| M5 | desktop-round-banner / 商户兜底图 | D | "已发送强制推进请求…"toast 压住底部内容 | minor | 降级：标准 fixed toast 瞬态行为，不改 | 记录 |
| M6 | mobile-draft / mobile-combo | C | 移动端座位卡 ×3/×0 徽章与卡背重叠拥挤 | major | 移动端缩小堆叠徽章/间距 | 已解决 |
| m1 | desktop-combo-10 / emoji-5 | F | 连击粒子在截图瞬间已不可见（疑寿命短或时机问题，非功能故障） | minor | 确认粒子时长；记录，不阻塞 | 记录 |
| m2 | desktop 全套 fx-bar | A | 12 表情小图标在 20px 下细节难辨 | minor | 记录（6G-4a 已约束上限，不再放大） | 记录 |
| m3 | desktop-lobby-empty | B | 表单下面板下大面积留白 | minor | 记录，可接受 | 记录 |
| m4 | desktop-round-banner | B | 本轮横幅长文本换行局促 | minor | 顺手修（行高/内边距） | 已解决 |
| m5 | mobile 顶栏 | B | 标题+房间+座位+返回大厅换行两排 | minor | 记录，可接受 | 记录 |
| m6 | 全套按钮 | F/G | 金箔/霓虹总体克制，hover/active 一致 | — | 通过，无需改 | 通过 |

## 汇总
- critical ×3（C1 中央对比、C2 结算遮挡、R1 反应面板裸英文+误发）：已解决 3
- major ×6（M1 补拍、M2 令牌行、M3 禁用对比、M4 空态、M6 移动堆叠）：已解决 5，M1 部分（merchant/assassin 需手动截图）；M5 已降级为 minor
- minor ×6（含 M5）：m4 已解决，其余记录

## 已知问题对照（任务书 10 项）
1. 粒子遮挡中央区：未观察到遮挡（m1 时机问题）， narratives 保持。
2. 座位卡痕迹/怀疑/麦克风拥挤：M2/M6 覆盖。
3. 身份弹窗过渡：C2 覆盖；弹窗本身 backdrop 自然。
4. 移动端手牌/决策重叠：未复现（6G-1-fix 有效）。
5. 金箔/霓虹：m6 通过，克制。
6. 深色文字对比：C1/M3 覆盖。
7. webp 缩放：卡面清晰，通过。
8. 大厅/对局底纹连贯：连贯（水墨夜景→牌桌和纸），通过。
9. 阶段切换跳变：截图无法判断，记录（手测）。
10. 按钮反馈一致：通过。
