# 阶段 6E.5：真实环境全链路诊断报告

## 一、背景与复现症状

阶段 6E 代码修改后，单元测试与 E2E 均全绿通过，但在用户真实浏览器实测环境中仍复现以下严重脱节现象：
1. **服务端日志已推进到 `score.roundWinner`，客户端 UI 却卡在 `nightMystic`（隐士）**；
2. **房主点击 `forceAdvance` 提示「已发送强制推进请求」，但游戏未推进**；
3. **待决策面板、阶段指示器、日志区三者状态不一致**。

为了杜绝盲目修改与猜想，本阶段严格禁止代码修复，仅注入轻量级 `DEV` 调试钩子与链路观测日志，依赖真实浏览器的全链路证据进行精准定性判定。

---

## 二、调试钩子与链路观测设计（仅 DEV 生效）

在不触碰生产打包和业务逻辑的前提下，注入了以下 3 处观测点：

1. **全局调试钩子 [`src/dev/inspect.ts`](file:///D:/Datum/nuclearBomb/NinjaNight/src/dev/inspect.ts)**
   - 在应用初始化时向 `window` 挂载 `window.__ninjaDebug`：
     - `getView()`: 获取当前客户端持有 `this.view` 的完整序列化 JSON；
     - `getPhase()`: 获取当前客户端 `this.view?.phase`；
     - `getPending()`: 获取当前客户端决策类型 `this.view?.pendingDecision?.kind`；
     - `getLastViewAt()`: 获取最后一次接收到快照的本地时间戳。
   - 生产构建（`npm run build`）中通过 `import.meta.env.DEV` 树摇剔除，不进入产物。

2. **网络层日志 [`src/net/client.ts`](file:///D:/Datum/nuclearBomb/NinjaNight/src/net/client.ts)**
   - 在 WebSocket 接收到 `OUT.viewSnapshot` 时输出：
     ```
     [view] { phase: ..., pending: ..., receivedAt: ... }
     ```

3. **视图渲染层日志 [`src/ui/app.ts`](file:///D:/Datum/nuclearBomb/NinjaNight/src/ui/app.ts)**
   - 在 `render()` 入口处输出：
     ```
     [render] { viewPhase: ..., domPhase: ... }
     ```
   - 在 `onView` 接收处输出：
     ```
     [view.snapshot] phase=... pending=... at=...
     ```

---

## 三、六大可能结论判定矩阵

根据全链路各观测点的数据表现，严格归类问题归属：

| 判定结论 | WS 帧 (`view.snapshot`) | 控制台 `[view]` 日志 | `window.__ninjaDebug.getPhase()` | 控制台 `[render]` 日志 | UI DOM 表现 (`.phase`) | 核心归因与排查方向 |
|---|---|---|---|---|---|---|
| **结论 A**<br>服务端未广播新 view | **无**对应新 phase 帧 | 无新输出 | 旧 phase | 无新触发 | 显示旧 phase | 服务端虽然打了 `broadcast.view` 日志，但未实际通过 socket 发到该用户连接（如 socketId 不匹配或 roomChannel 脱节）。 |
| **结论 B**<br>客户端回调未触发 | **有**新 phase 帧 | **无**新输出 | 旧 phase | 无新触发 | 显示旧 phase | Socket.IO 客户端事件监听器未挂载成功或被意外解绑/覆盖。 |
| **结论 C**<br>this.view 未更新 | 有新 phase 帧 | **有**新输出 | **旧** phase | 无新触发 | 显示旧 phase | `onView` 回调中发生静默异常或被提前 return。 |
| **结论 D**<br>render() 未触发重绘 | 有新 phase 帧 | 有新输出 | **新** phase | **无**新输出 | 显示旧 phase | `this.view` 已更新，但 `this.render()` 未被调用或中途报错。 |
| **结论 E**<br>DOM 未更新 / 渲染分支错误 | 有新 phase 帧 | 有新输出 | **新** phase | **有**新输出 (viewPhase 为新) | **显示旧** phase (domPhase 为旧) | `render()` 执行了，但 innerHTML 字符串拼接分支出现逻辑短路或取到了脏字段。 |
| **结论 F**<br>浏览器/Vite 缓存残留 | 强刷前异常 | - | - | - | - | 强刷（Ctrl+Shift+R）后彻底正常，属 Vite 开发服务器 HMR 热更新代码脱节。 |

---

## 四、实测证据归档（待用户提供）

> 用户在真实浏览器执行诊断清单后将原始证据贴在此处：

### 1. WebSocket 抓帧记录
- 最新 `view.snapshot` 帧接收时间：`[待填]`
- 帧 Payload 中的 `phase` 字段：`[待填]`
- 最近 5 帧完整事件流：`[待填]`

### 2. 浏览器 Console 日志
- 最近 10 条 `[view]` / `[view.snapshot]` / `[render]` 输出：`[待填]`
- 执行 `window.__ninjaDebug?.getPhase?.()` 返回值：`[待填]`
- 执行 `window.__ninjaDebug?.getLastViewAt?.()` 返回值：`[待填]`

### 3. 服务端终端日志（dev:server）
- 最近 10 条 `broadcast.view` 日志行（包含 roomCode, phase, seatCount, pendingSeats）：`[待填]`
- 最近 10 条 `room.forceAdvance` 日志行：`[待填]`

---

## 五、最终判定结论与后续修复建议（待判定后写入）

- **判定结论**：`[待判定：结论 A / B / C / D / E / F]`
- **精准根因**：`[定位至具体文件与行号]`
- **后续修复方案建议（本阶段不实施）**：
