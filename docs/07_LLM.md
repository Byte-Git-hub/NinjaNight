# Bot 社交专家与可选 LLM

Bot 社交分为两层：**Layer 1 本地启发式始终可用**，根据 bot 自己的投影视图、性格、阶段和触发时机选择模板；**Layer 2 LLM 增强可选**，只生成一条短社交文本，失败或限频时自动回退 Layer 1。LLM 不参与出牌、目标选择、胜负或任何游戏决策。

## Layer 1：性格、触发器与模板

每个 bot 开局时在 `aggressive`（激进）、`cautious`（保守）、`deceptive`（欺骗）中抽取一个性格；性格只保存在社交调度器，不进入 `GameState` 和 `stateHash`。触发器来自 bot 自己的 `PlayerView` 投影：

| 时机 | 条件 | 触发概率（激进 / 保守 / 欺骗） |
|---|---|---|
| 每轮开局 | 观察到新 round | 85% / 35% / 55% |
| 有人被击杀 | 收到公开 `night.playerDied` | 90% / 30% / 60% |
| 自己被查看 | 投影事件显示自己是目标 | 75% / 25% / 50% |
| 自己被交换 | 投影事件确认自己是交换目标 | 75% / 25% / 50% |
| 反应窗开启 | 收到 `react.opened` | 80% / 20% / 50% |
| House Reveal 前 | 进入 `nightShinobi` | 70% / 30% / 60% |
| 自己被击杀 | 收到自己的死亡事件 | 100%（只发一次） |

模板库位于 `src/server/bot/templates.ts`，每种性格 10 条，并为“被查看 / 被交换 / 有人被击杀 / 遗言”等时机提供专用句式：

- 激进：这轮我不会手软；别躲了，出来对线；今晚就看他了；这一刀，我记下了；别拦我，我要去找师父重练了；来吧，看谁先眨眼；马上揭晓，别急着跑；人不多了，该分个高下。
- 保守：先观察一下；我暂时没有结论；大家别急着下判断；这一下值得再想想；我先退场，大家小心；等反应结束再说；等亮牌后再下结论；人少了，更要谨慎。
- 欺骗：这轮也许会有惊喜；也许目标选错了；我建议大家再想想；这未必是表面看到的；我倒下了，谜还没解开；猜猜接下来会怎样；答案也许和你想的不一样；最后几个人才最难猜。

Layer 1 根据自己的手牌、阵营、存活人数和阶段选择模板，然后复用现有 `phrase.event`、`event.reaction`、`effect.batch` 或 `chat.event` 中的一种发送。它不读取其他玩家身份、手牌或历史知识。

## Layer 2：LLM prompt 与隐私边界

system prompt 模板：

> 你是《忍者之夜》的社交助手。根据性格和局面生成一句自然的中文短句，最多 30 个字。激进型偏挑衅，保守型偏观察，欺骗型可模糊暗示。只返回一句文本，不返回 JSON 或解释。你不负责游戏决策。

user prompt 是以下白名单 JSON 的字符串化结果：

```json
{
  "personality": "aggressive",
  "trigger": "roundStart",
  "round": 2,
  "phase": "nightSpy",
  "step": "chooseTarget",
  "aliveCount": 4,
  "self": { "houseId": "仅 bot 自己可见时填写", "alive": true }
}
```

请求在 `src/server/bot/llm-client.ts` 中重新按白名单组装，因此不会携带其他玩家的 HOUSE、手牌或 `knownHouseHistory`。本需求不添加脏话、URL、命令注入等内容过滤；只检查响应结构、非空和最多 30 个字，失败时回退 Layer 1。

## 配置

服务端环境变量：

```dotenv
LLM_ENABLED=false
LLM_ENDPOINT=https://api.deepseek.com
LLM_MODEL=deepseek-flash
LLM_API_KEY=sk-REPLACE_ME
LLM_TIMEOUT_MS=8000
LLM_MAX_CALLS_PER_ROUND=3
LLM_MIN_INTERVAL_MS=5000
LLM_THINKING_TYPE=enabled
LLM_REASONING_EFFORT=low
```

DeepSeek 默认使用 OpenAI Chat Completions 兼容接口：`POST {LLM_ENDPOINT}/chat/completions`，请求使用 `stream:false`、`max_tokens:50`。思考模式参数为 `thinking.type`（`enabled`/`disabled`）和 `reasoning_effort`（`low`/`high`/`max`）；使用 OpenAI SDK 时 `thinking` 应放在 `extra_body`。思考模式下 `temperature`、`presence_penalty`、`frequency_penalty` 不生效，`top_p` 下限为 0.95。社交 bot 推荐 `enabled + low`；最低延迟可设 `disabled`。

已用房主提供的 key 对真实 `deepseek-flash` 做过协议冒烟：`thinking=disabled` 在约 1.7 秒返回 6 字中文短句；`thinking=enabled + low + max_tokens=50` 会出现只有 reasoning、正文为空的情况，因为短预算被思考消耗。客户端遇到这种空正文会在同一次社交调用内自动重试一次 `thinking=disabled`，仍受 8 秒总超时、每轮次数和熔断约束，避免玩家看到机械的本地回退。

本地 OpenAI 兼容服务也已实测通过：将 `LLM_ENDPOINT` 设为 `http://127.0.0.1:8045/v1`、`LLM_MODEL` 设为 `gemini-3.8-flash-tiered` 后，真实请求返回 HTTP 200；直接请求约 3.95 秒，经过项目客户端约 3.28 秒，返回了自然的中文社交短句。该 key 只在进程环境中临时注入，未写入仓库或日志。

房主可在创建房间时填写自己的 key，也可在大厅的“社交专家 / LLM”面板保存或撤回。房主 key 只保存在该房间的服务端内存中，不写入数据库、日志、localStorage、视图或广播；房间结束、重置、销毁时清除。房主 key 覆盖服务端默认 key，撤回后恢复使用服务端 key。

## 调用与节奏

- 所有房间共享并发池，最多 5 个请求。
- 每房间每轮最多 3 次 LLM 调用，两次调用至少间隔 5 秒。
- 单次请求超时 8 秒；网络错误、非 2xx、无效响应均回退 Layer 1。
- 思考模式正文为空时，仅对该次社交请求切换为 `thinking.disabled` 重试一次；不会增加房间的 LLM 调用配额。
- 连续失败 3 次触发本房间熔断，Layer 2 暂停 5 分钟，期间全部使用 Layer 1；成功调用后失败计数清零。
- 异步请求不阻塞游戏推进，社交输出不进入 `GameState`、`stateHash` 或重放数据。

社交旁路与另一会话实现的 bot 决策延迟分开：`src/server/bot-scheduler.ts` 继续负责游戏 Command 的延迟和重试；`src/server/bot/social-scheduler.ts` 只排社交消息，使用投影视图和自己的 `setTimeout`，不再叠加 Command 延迟。

发送给模型的 JSON 使用字段白名单：只保留性格、触发、轮数、阶段、存活人数与 bot 自己的阵营/存活状态，不包含他人 house、手牌或 `knownHouseHistory`。按本次需求不做脏话、URL、HOUSE 名称等输出内容过滤；只校验响应结构与 1–30 字长度，不符合时回退模板。日志仅记录房间、bot 座位、延迟和成功/失败标记，不记录 key、prompt 或模型原文。

## 协议

社交消息复用现有 `chat.event`、`phrase.event`、`event.reaction` 和 `effect.batch`，不新增 bot 专用事件。房主配置使用 `room.llmConfig`：携带 `apiKey` 保存，携带 `null` 或空字符串撤回，省略 `apiKey` 查询状态；响应只返回 `enabled`、`source` 和 `hasRoomKey`。

房主可在大厅创建表单输入 key，也可在大厅或对局中的“社交专家 / LLM”折叠面板中保存或撤回；输入框为 password 类型，服务端只返回状态。撤回、房间结束、房主离开、房间销毁和服务关闭都会清理内存中的覆盖 key。

## 随机种子平衡报告

社交人格不进入核心决策，因此不会改变种子重放或胜负哈希；平衡工具会给每个种子确定性地贴上人格标签，同时记录初始身份。运行：

```text
npx tsx scripts/simulate-winrates.ts --seed 42 --players 4
npx tsx scripts/simulate-winrates.ts --from 1 --to 100 --players 6
npx tsx scripts/simulate-winrates.ts --from 1 --to 100 --players 6 --json
# 10,000 个确定性种子（只保留汇总，避免 JSON 过大）
npx tsx scripts/simulate-winrates.ts --from 1 --count 10000 --players 6 --no-per-seed --progress
```

报告分别给出：

- `round`：每个座位每轮获得胜利结算的比例；
- `game`：整局结束时获胜的比例；
- 维度包括 `aggressive / cautious / deceptive`、初始 HOUSE，以及人格 × 初始 HOUSE；
- `perSeed` 保留每个种子的座位、人格、初始 HOUSE 和赢家，便于复盘单个极端种子。
- 每个比例附带 Wilson 95% 置信区间（`ci95.low/high`）。区间用于判断差异是否可能只是抽样噪声，不能替代真实玩家局测。
- `--progress` 把进度写到 stderr，不会污染 `--json` 输出；跑 1000 个以上种子时建议加 `--no-per-seed`。

示例（seed=42、4 人）会同时显示人格与身份的“单轮 / 整局”两列；单个种子的比例样本很小，调参应优先看 100 个以上种子的汇总。
平衡检查建议先看 10,000 种子：同一玩家数下，三种人格的整局胜率差异若超过约 5 个百分点，再检查对应 HOUSE 组合的置信区间是否重叠；若区间明显分离，才考虑调整本地决策权重。单轮胜率受每局轮数与平局结算影响，应与整局胜率一起观察。

本次基线实测（1–10,000 种子、6 人、约 40 秒）结果：三种人格的单轮胜率分别为 aggressive 52.2%、cautious 51.8%、deceptive 51.9%；整局胜率分别为 18.4%、18.2%、18.5%，95% 置信区间均明显重叠。初始 HOUSE 的整局胜率范围为 17.5%–19.2%，人格 × HOUSE 范围为 17.1%–19.4%，没有达到触发重平衡的差异。

同一脚本在 4 人和 8 人配置各跑 5,000 个种子作交叉检查：4 人时三种人格整局胜率为 26.4%–27.0%，8 人时为 13.8%–14.4%，区间同样重叠。当前建议保留人格权重；后续若真实玩家局显示某类发言导致目标选择偏斜，再单独调社交触发概率，不改核心胜负模型。

## 明确不做

- LLM 不参与游戏决策或胜负判断；
- 不做跨局 bot 记忆；
- 不生成图片；快捷短语的语音只使用浏览器本地 Web Speech API，默认关闭，不上传文本；不做玩家与 bot 私聊。

