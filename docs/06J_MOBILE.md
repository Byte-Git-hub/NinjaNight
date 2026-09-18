# 06J 手机真机测试（6J-4，Playwright Pixel 7 模拟 + 真实触摸）

spec：`tests/e2e/mobile-flows.spec.ts`（2 用例，20s 通过）。
截图：`docs/06J_screenshots/mobile-lobby.png` / `mobile-game.png`。

## 覆盖的 5 关键流程（全 tap 驱动）

| # | 流程 | 断言 |
|---|---|---|
| 1 | 加入房间 | tap 建房 → `.room` 可见 |
| 2 | 选牌 | tap `.opt` 卡面推进选牌 |
| 3 | 出牌（多选 + 确认） | tap 2 张 `.declare-opt` + `#btn-declare`（无牌可出走 `#btn-pass`） |
| 4 | 选择目标 | tap `.pending .opt[data-opt]` 首选项 |
| 5 | 砸物品（连续点击） | 选 Bot 目标后连 tap 5 次 `[data-fx="egg"]` |

## 手势

| 手势 | 手法 | 结果 |
|---|---|---|
| 点击 | `tap()` | 通过 |
| 滑动 | CDP `Input.dispatchTouchEvent` 上滑序列 | 页面不断线，`.phase` 仍可见 |
| 长按 | CDP touchStart + 700ms + touchEnd（长按定义所需真实时长） | 无报错 toast、无卡死 |
| 双指缩放 | CDP 双触点收分序列 | 布局仍在，无崩溃 |

## 交互异常记录

- 无阻塞异常。两项过程发现（已修）：
  1. `CDPSession` 方法名为 `send` 非 `dispatch`（初版报错，已修）。
  2. 全局 poll 首次返回非终局值即退出——poll 回调须每轮只做一个动作并循环到终局（已修）。
- 说明：模拟器软件渲染 + 默认 Bot 延迟（500–1500ms），全流程约 9s；
  真机 GPU 只会更快；`mobile-hand.spec.ts` 的遮挡断言依然全绿（未动布局）。
