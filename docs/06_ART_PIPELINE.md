# 06 — 美术资产管线（Art Pipeline）

status: draft-for-stage-6A  
updated: 2026-09-17  
实现阶段：6A  

---

## 统一风格 Baseline

所有 44 张卡面及衍生美术资产统一遵循以下视觉基线：

### 风格前缀（所有卡面共用）

> Modern ukiyo-e character illustration as the main subject, ink wash painting (sumi-e) background depicting night atmosphere, with minimal neon accents or gold foil (kintsugi) highlights on key skill elements and faction crests. Palette: ink black and deep indigo for base, with restrained neon/gold accents. Top 12% and bottom 22% of the composition reserved as plain color margins for text overlay, no visual elements in those regions. Original artwork, not imitating any existing published illustration.

### 阵营配色（Faction Palette）

- **莲花 Lotus**：青金（deep lapis lazuli blue）+ 银白点缀
- **仙鹤 Crane**：朱红（vermilion red）+ 金箔点缀
- **浪人 Ronin**：灰白（ash grey / off-white），无点缀

### 构图与留白约定

- 画幅比例：`2:3` 纵向竖版卡牌构图。
- 顶部保留 12%、底部保留 22% 的纯色/水墨渐变空白区域，作为卡名、效果文案与数值的叠加安全区，禁止出现主体与复杂视觉元素。
- 负面提示词（统一）：`text, watermark, logo, typography, border, frame, extra limbs, low quality, blurry, deformed hands`

---

## 一、生图工具链

生图工具由用户在本地实测验证确定：

- **生图工具**：Antigravity CLI 1.2.4，agent 模式。
- **调用方式**：在 agy 的 TUI（终端用户界面）中，使用自然语言指示 agent 调用内置的 `generate_image` 工具。**不使用** `agy -p` CLI 参数模式。
- **已实测结论**：
  1. agy agent 能够精准理解自然语言描述并触发内部 `generate_image` 工具调用。
  2. 输出格式：`jpg`。
  3. 输出路径：`~/.gemini/antigravity-cli/brain/{uuid}/{filename}.jpg`（uuid 目录每次不同，filename 含时间戳不可预测）。
  4. 一张图一次调用，agent 产出时通常附带简短的视觉说明（风格/配色/比例）。
- **本项目定位**：不编写自动生图脚本。6B 的批量生成采用「人工驱动 agy agent」方式。6A 产出完整的 prompts 数据与工作流文档，使操作者能直接按文档逐条投喂给 agy。

---

## 二、One-Shot 风格锚点

用户已在本地通过 Antigravity CLI 生成一张「荣誉标记（Honor Token）」实物概念图，作为整个《忍者之夜》美术资产管线的终极视觉锚点：

![one-shot](06_assets/one-shot-kintsugi-token.jpg)

### Prompt 原文（一字不改记录）

```text
A small circular token, ink dot base with gold foil flecks (kintsugi style), minimal design, deep indigo and gold on off-white paper texture, 2:3 aspect ratio
```

### 生成结果视觉描述

> Vertical 2:3 composition. A single circular token rests centered on textured off-white washi paper with visible deckled edges, shot top-down. The token is a deep indigo ink-wash disc with irregular gold foil cracks radiating from its center (kintsugi style) and a thin gold-foil rim. The paper sits on a weathered wooden surface visible at the top and bottom edges of the frame. Lighting is soft and natural, revealing paper fibers and the metallic sheen of the gold. Minimalist composition with generous negative space; no text, no watermark.

### 用途说明

1. **6B 生成基准**：在 6B 生成其余 43 张卡面时，本图作为唯一风格参照基准。生成第 1 张（如 `spy-1`）必须先与此图对比质感、光影与和纸留白，风格一致方可继续。
2. **直接复用为最终素材**：6B 启动后，此图可直接复制为 `public/assets/tokens/honor-token.jpg` 作为荣誉令牌的实际游戏素材，无需重新生成。
3. **可复现性**：若后续需要增补或重新生成令牌，仅需保持上述同一 prompt 即可。

---

## 三、卡面与 UI 素材规划清单

全项目共定义 **47** 项视觉素材：

1. **33 张忍者牌（33 张卡面）**：
   - 密探（Spy 1–6）：6 张
   - 隐士（Mystic 1–6）：6 张
   - 骗徒（Tricksters）：6 张（百变者 1、掘墓人 2、捣蛋鬼 3、商人 4、盗贼 5、裁判 6）
   - 刺客（Blind Assassin 1–6）：6 张
   - 上忍（Shinobi 1–6）：6 张
   - 反应牌（React）：还施者（Mirror Monk）、殉道者（Martyr）各 1 张
   - 亮身份（Reveal）：大将军（Mastermind）1 张
2. **11 张身份牌（House Cards）**：
   - 仙鹤 Crane 1–5：5 张（朱红 + 金箔）
   - 莲花 Lotus 1–5：5 张（青金 + 银白）
   - 浪人 Ronin：1 张（灰白，无点缀）
3. **3 条 UI 质感素材（预留槽位）**：
   - `ui-lobby-bg`：水墨夜色 + 远景灯笼，中心大留白
   - `ui-table-texture`：和纸底纹 + 墨渍边缘
   - `ui-button-primary`：霓虹边缘 + 金箔底板

---

## 四、6B 批量生成工作流（操作手册）

6B 启动时，由人工按以下六步标准化流程执行：

1. **导出 prompt 任务清单**：
   ```powershell
   npm run gen:preview > .work/prompts.md
   ```
2. **逐条投喂 agy agent**：
   在 Antigravity TUI 对话中，将对应卡项的 `promptEn` 复制给 agent，指示其调用 `generate_image`。
3. **素材提取与归档**：
   生成完成后，从 agent 回显的 `~/.gemini/antigravity-cli/brain/{uuid}/{filename}.jpg` 路径提取图片，复制并重命名为：
   `public/assets/cards/{id}.jpg`（UI 素材归档到 `public/assets/ui/{id}.jpg`）。
4. **小步试跑与对照**：
   首批只跑 3 张典型牌：
   - `spy-1`（暗部水墨与金箔眼）
   - `shapeshifter-1`（面具与双影霓虹）
   - `mastermind`（高台棋局与大景深）
   与 `docs/06_assets/one-shot-kintsugi-token.jpg` 对比，确认水墨质感、和纸留白、金箔光泽统一后，再推进剩余 41 张卡牌。
5. **资产清单登记**：
   每张图落盘后，在 `manifest.json` 中追加一条记录：
   ```json
   {
     "id": "spy-1",
     "file": "public/assets/cards/spy-1.jpg",
     "sourcePath": "C:/Users/.../brain/.../spy_1_12345.jpg",
     "generatedAt": "2026-09-17T00:00:00Z",
     "note": "one-shot matched"
   }
   ```
   （允许手工维护，无需额外脚本）
6. **柔性批次与重试**：
   不要求单次全量生成；允许随时中断、分批推进；单张瑕疵可直接复制该项 `promptEn` 重新让 agent 生成覆盖。

---

## 五、不做事项（本阶段硬约定）

1. 不调用任何外部未受控生图 API。
2. 不在 6A 阶段生成任何图片文件（除用户手工粘贴的 One-Shot 图外）。
3. 不修改前端代码中的卡面图片路径（保持现态，6B 或 6C 再接入）。
4. 不做运行时动态生图。
5. 不在 6A 引入 `sharp`（6B 处理缩放裁剪时再安装）。
6. 不引入额外的生图 SDK 依赖。
