# 部署指南（6I：GitHub Pages 前端 + Railway 后端）

> 配置已写好，由用户手动执行部署。本文件是唯一操作手册。
> 游戏核心（规则/Bot/特效/短语）零依赖语音；语音不可用时自动降级。

## 1. 部署目标与备案

| 端 | 主线 | 备案 |
|---|---|---|
| 前端 | GitHub Pages（`.github/workflows/deploy-pages.yml`） | Vercel（`vercel.json` 保留，不删不改） |
| 后端 | Railway（`railway.toml`，用户已 `railway up` 成功） | — |

- 后端现状（用户已验证，无需重做）：端口 8080（Railway 注入 PORT），
  启动日志 `voice="on"`（mediasoup 成功初始化，无降级），`seedMode="random"`。
- Socket.IO 连接地址优先级（`src/main.ts`）：`?server=` 调试覆盖 >
  `VITE_API_BASE_URL`（构建时注入）> 同源。
- 后端 `createApp()` 在 `dist/` 存在时兼 serve 静态文件 +
  SPA fallback（`/*` → `/index.html`，`/socket.io` 与 `/health` 除外）。
- 子路径说明：GitHub Pages 项目站地址形如
  `https://<user>.github.io/<repo>/`，`vite.config.ts` 的
  `base: process.env.GITHUB_PAGES_BASE || '/'` 已处理；
  前端静态资源统一经 `assetUrl()`（`import.meta.env.BASE_URL`）拼接，
  CSS `url()` 由 Vite 构建自动 rebase。

## 2. GitHub Pages 步骤（前端主线）

1. 仓库 Settings → Pages → Source 选 **GitHub Actions**。
2. 仓库 Settings → Secrets → Actions → New repository secret：
   - Name：`VITE_API_BASE_URL`
   - Value：Railway 公网地址（见第 3 节，如 `https://xxx.up.railway.app`，
     无尾斜杠）。
3. push 到 `main`（或 Actions 页手动 rerun `Deploy Pages`），
   workflow 自动 `npm ci` → 构建（含 `GITHUB_PAGES_BASE=/<repo>/`
   与 `VITE_API_BASE_URL` 注入）→ 上传 `dist` → 发布。
4. 访问地址：`https://<user>.github.io/<repo>/`。
5. 调试时可用 `?server=http://127.0.0.1:3000` 临时指向本地后端。

## 3. Railway 步骤（后端，用户已部署成功，待收尾）

已完成：`railway up`，Deploy complete。
待用户在 Railway 控制台手动完成：

1. Service → Settings → Networking → **Generate Domain** 生成公网地址，
   把该地址填回 GitHub Secrets 的 `VITE_API_BASE_URL`。
2. Service → Variables 配置环境变量：

| 变量 | 值 | 说明 |
|---|---|---|
| `PORT` | （自动注入） | 不用手填 |
| `NINJA_TLS` | `0` | Railway 自带 TLS 终结，server 只跑 ws；客户端用 `wss://` 连即可 |
| `NINJA_CORS_ORIGIN` | `https://<user>.github.io` | 生产只放行 Pages 域名；留空=全放行（仅开发/局域网） |
| `NINJA_VOICE` | （不设/1） | 本次实测 mediasoup 初始化成功，保持启用；若日后语音异常再设 `0` |
| `NINJA_MEDIA_ANNOUNCED_IP` | （留空） | 动态公网 IP 下留空走自动探测 |
| `NINJA_SEED` | （不设） | 设了则所有对局同一种子（仅调试复现用） |

注意事项（已记入 `docs/00_DEV_PLAN.md` 技术债）：
- `railway.toml` 有 deprecation 警告，**2026-12-01 前需迁移到
  `.railway/railway.ts`**。
- Railway 免费层每月 500 小时额度，不活跃约 15 分钟会休眠，
  首次唤醒有 5-10 秒延迟（前端表现为首次建房稍慢，属正常）。

## 4. 本地局域网部署（朋友聚会场景）

1. 主机：`npm ci` 后 `npm start`（:3000，监听 0.0.0.0）。
2. 同 Wi-Fi 的手机/电脑浏览器打开 `http://<主机局域网IP>:3000`
   （后端兼 serve 前端 `dist/`，需先 `npm run build`）。
   前后端分离调试时：`npm run dev:server`（:3000）+ `npm run dev`（:5173）。
3. 麦克风需要 https 或 localhost：局域网语音先 `npm run certs` 再
   `NINJA_TLS=1` 启动，并用 `https://<IP>:3000` 访问；
   否则语音自动降级，游戏照玩。

## 5. 常见问题

| 现象 | 原因 | 解法 |
|---|---|---|
| 前端刷不出房间/连不上 | `VITE_API_BASE_URL` 未设或写错 | Secrets 重设后重跑 workflow（构建时注入，改完必须重构建） |
| `CORS error` / 握手 400 | `NINJA_CORS_ORIGIN` 与 Pages 域名不一致 | 改为 `https://<user>.github.io`（无尾斜杠，无仓库子路径） |
| 静态资源 404（图片不显示） | 旧构建未带 base | 重跑 workflow（`GITHUB_PAGES_BASE` 已由 workflow 注入） |
| 一直「语音暂不可用」 | UDP 不通或 `NINJA_VOICE=0` | 预期内降级，游戏照玩；三层防护见下 |
| 首次建房慢 5-10 秒 | Railway 休眠唤醒 | 正常，唤醒后恢复 |
| `npm start` 报找不到 tsx | 旧 lockfile | 重新 `npm ci`（`tsx` 已在 dependencies） |

### mediasoup 降级处理（三层防护，游戏不受影响）

1. `VoiceManager.ensureRouter()` try-catch：失败记 `voice.worker_failed`，
   `isAvailable()` 变 false。
2. `NINJA_VOICE=0`：启动即 `voice.disable()`，`voice.join` 直接回
   `voice.unavailable`。
3. 前端 `VoiceClient` 收 `voice.unavailable` 显示「语音暂不可用」，
   其余按钮静默失败（`join/推流` 均有 fail 文案）。
   启动日志 `server.start` 会打印 `voice: on/off`，照此确认。

## 6. 本地模拟验证：未完成（6I-3 DEFERRED，已跳过）

- 原因：本地 preview（:4173）+ 生产入口后端（:3000）联调 spec
  半小时未跑通（固定 sleep 等待过长）；且部署目标已转 GitHub Pages，
  本地模拟是加分项——线上 CORS/网络机制不同，本地跑不通不代表线上跑不通。
- 替代验证（已通过）：`tests/integration/seed.test.ts`
  （固定种子开局 / `gameSeed` 可见性 / 非法种子忽略）全绿；
  生产入口 `scripts/prod-server.ts` 启动验证（`/health` OK，
  `NINJA_VOICE=0` 时 `voice.disabled` + `server.start voice: off` 日志正常）。
- 手动补跑（可选）：`tests/e2e/deploy-preview.spec.ts`
  （`NINJA_DEPLOY_CHECK` 门控，日常 `test:e2e` 跳过）：

```powershell
$env:VITE_API_BASE_URL="http://127.0.0.1:3000"; npm run build
node --import tsx scripts/prod-server.ts          # :3000（生产入口）
npx vite preview --port 4173 --strictPort         # :4173（生产产物）
$env:DEPLOY_FRONT="http://127.0.0.1:4173"; $env:NINJA_DEPLOY_CHECK="1"
$env:BOT_DELAY_MS="10"; $env:BOT_JITTER_MS="0"
npx playwright test tests/e2e/deploy-preview.spec.ts
```
