# GitHub Pages 部署审计（6I）

> 本文件记录 Pages 子路径部署的只读审计与构建验证，供部署会话与 UI 重构会话共享结论，避免重复验证与文件冲突。

## 平台配置值（已确认，2026-09-18）

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/Byte-Git-hub/NinjaNight |
| 前端线上 URL | https://byte-git-hub.github.io/NinjaNight/ |
| Vite 线上 base | `/NinjaNight/` |
| 后端 | https://ninjanight-production.up.railway.app |
| `VITE_API_BASE_URL`（Actions Secret） | `https://ninjanight-production.up.railway.app` |
| Pages Source | GitHub Actions |
| Railway 待配 | `NINJA_CORS_ORIGIN=https://byte-git-hub.github.io`（不带路径、不带引号、全小写） |

## CSS 子路径 rebase 验证

### 构建命令与结果

```powershell
$env:GITHUB_PAGES_BASE="/NinjaNight/"; npm run build
```

- 结果：成功（`tsc -b` + `vite build`，155 modules，2.30s）。
- `dist/index.html`：`<script src="/NinjaNight/assets/index-*.js">` ✅，
  `<link href="/NinjaNight/assets/index-*.css">` ✅，前缀正确。

### 源 CSS url() 与 dist 实际值对照表

| # | 源文件位置 | 源值 | dist CSS 实际值 | 结论 |
|---|---|---|---|---|
| 1 | `src/ui/style.css:29` | `url('/assets/ui/lobby-bg.webp')` | `url(/NinjaNight/assets/ui/lobby-bg.webp)` | ✅ rebase 成功 |
| 2 | `src/ui/style.css:36` | `url('/assets/ui/table-texture.webp')` | `url(/NinjaNight/assets/ui/table-texture.webp)` | ✅ rebase 成功 |
| 3 | `src/ui/style.css:331` | `url('/assets/ui/button-primary.webp')` | `url(/NinjaNight/assets/ui/button-primary.webp)` | ✅ rebase 成功 |
| 4 | `src/ui/style.css:1047` | `url('/assets/ui/washi-central-bg.webp')` | `url(/NinjaNight/assets/ui/washi-central-bg.webp)` | ✅ rebase 成功 |
| 5 | `src/ui/style.css:1112` | `url('/assets/ui/identity-modal-bg.webp')` | `url(/NinjaNight/assets/ui/identity-modal-bg.webp)` | ✅ rebase 成功 |
| 6 | `src/ui/style.css:1500` | `url('/assets/ui/washi-central-bg.webp')`（与 #4 同一资源） | 同上（去重后 dist 共 6 个 url） | ✅ rebase 成功 |
| 7 | `src/ui/arena.css:2` | `url('/assets/ui/table-arena-v2.webp')` | `url(/NinjaNight/assets/ui/table-arena-v2.webp)` | ✅ rebase 成功 |

附加检查：

- `dist/assets/ui/` 含全部 7 个 `.webp`（public 原样拷贝）✅
- JS 包内硬编码 `"/assets/`（无前缀）数量为 0；运行时图片路径经 `assetUrl()` + `BASE_URL` 拼接 ✅
- `public/404.html` 不存在，但本应用无 path 路由（仅同路径 `?room=` query），不需要 ✅

### 判定：全部 rebase 成功 ✅

Vite 构建已按 `base=/NinjaNight/` 自动重写 CSS 中指向 `public/` 的绝对路径。
**`src/ui/**` 无需任何改动，不存在 CSS 子路径问题清单。**

### 对 UI 重构会话的约束（共享结论）

- 新增 CSS 背景图可继续使用 `url('/assets/...')` 绝对路径写法（Vite 会自动 rebase），或走 `assetUrl()`；
  禁止写死 `/NinjaNight/` 前缀，禁止使用相对路径跳出 `src/ui/` 引用 `public/`。
- TS/JS 生成的 `img.src` 必须继续走 `src/ui/assets.ts` 的 `assetUrl()`，禁止字符串拼接 `/assets/`。
