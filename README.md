# 忍者之夜（ninja-night）

中文网页多人联机：4–11 人，浏览器完成一整局基础规则对战。

## 当前阶段

**阶段 3 — 完整规则单机**（4–11 人、六骗徒、反应、大将军、计分；无 UI、无 Socket）

## 如何验证

在项目根目录（PowerShell）：

```powershell
npm install
npm run typecheck
npm test
npm run build
```

## 目录导航

| 路径 | 说明 |
|---|---|
| `docs/00_DEV_PLAN.md` | 开发计划、开工前修订、进度 |
| `docs/01_GAME_RULES.md` | 规则与三类账本 |
| `docs/02_ARCHITECTURE.md` | 模块与信息可见性 |
| `docs/03_STATE_MACHINE.md` | 状态机 |
| `docs/04_PROTOCOL.md` | 联机协议 |
| `docs/05_TEST_PLAN.md` | 测试计划 |
| `src/shared` | 共享类型（Command / GameEvent / PlayerView / PendingDecision） |
| `src/core` | 规则核心（阶段 2 骨架） |
| `src/ui` | 界面（待实现） |
| `src/net` | 网络适配（待实现） |
| `src/server` | 房间服务（待实现） |
| `src/data` | 静态数据（阶段 2 在 `src/core/deck.ts`） |
| `src/dev` | LocalAdapter / smoke（不进生产） |
| `tests/` | core / integration / e2e |

## 阶段 0 范围外

不实现卡牌效果、GameState、发牌结算、UI 页面、Socket.IO、git 初始化。
