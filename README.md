# 忍者之夜（ninja-night）

中文网页多人联机：4–11 人，浏览器完成一整局基础规则对战。

## 当前阶段

**阶段 1 — 规则规格冻结**（规则/状态机/可见性文档；无玩法规则实现、无 UI、无联机）

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
| `src/core` | 规则核心（待实现） |
| `src/ui` | 界面（待实现） |
| `src/net` | 网络适配（待实现） |
| `src/server` | 房间服务（待实现） |
| `src/data` | 静态数据（待实现） |
| `src/dev` | 本地调试（待实现，不进生产） |
| `tests/` | core / integration / e2e |

## 阶段 0 范围外

不实现卡牌效果、GameState、发牌结算、UI 页面、Socket.IO、git 初始化。
