/**
 * 全 LLM 对局仿真：所有座位的每个 pending 决策都发往 OpenAI 兼容的本地模型，
 * 解析 JSON 后校验并提交；失败/超时/非法时回退启发式 bot 并记账。
 *
 * 读-only 引擎 + 网络调用；不启动 server；结果只写 --out 目录（默认 TEMPDIR）。
 * Key 只从环境变量 LLM_API_KEY 读取，永不落盘、永不进日志。
 *
 *   $env:LLM_API_KEY='...'; npx tsx scripts/simulate-llm-games.ts --players 4 --from 1 --count 2
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { botDecide } from '../src/core/bot';
import { baseOf } from '../src/core/deck';
import { applyAllDefaults, applyCommand } from '../src/core/engine';
import { createGame } from '../src/core/setup';
import { createRng } from '../src/core/rng';
import { projectView } from '../src/core/project-view';
import { findSeat } from '../src/core/utils';
import { CARD_DESCRIPTION_ZH } from '../src/data/card-text';
import { getCardDisplayName } from '../src/ui/assets';
import type { GameState } from '../src/core/game-state';
import type { Command, PendingDecision, PlayerView } from '../src/shared/types';

interface Cfg {
  endpoint: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
  promptV: string;
  concurrency: number;
}

function arg(args: string[], name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] as string : fallback;
}

function houseZh(h: string): string {
  if (h === 'ronin') return '浪人';
  const m = /^(crane|lotus):(\d)$/.exec(h);
  if (!m) return h;
  return `${m[1] === 'crane' ? '仙鹤' : '莲花'}·地位${m[2]}`;
}

const PHASE_ZH: Record<string, string> = {
  draftPick1: '选牌1', draftPick2: '选牌2', nightSpy: '密探', nightMystic: '隐士',
  nightTrickster: '骗徒', nightBlindAssassin: '刺客', nightShinobi: '上忍',
  houseReveal: '亮身份', score: '结算', victoryCheck: '胜负判定',
};

const KIND_ZH: Record<string, string> = {
  draftPick: '选牌：选1张留下',
  draftDiscard: '弃牌：弃1张',
  declareCards: '声明：选0张以上本阶段牌打出（空=跳过）',
  chooseTarget: '选目标座位',
  chooseOptional: '二选一',
  merchantChoose: '商人：二选一查看',
  merchantExchange: '商人：交换',
  reactDecide: '反应：是否发动',
};

const OPT_ZH: Record<string, string> = {
  view_house: '查看身份', view_honor: '查看令牌', no_swap: '不交换',
  seen: '刚看的那枚', random: '随机一枚', swap: '交换身份', keep: '保持',
  kill: '击杀', spare: '放过', reveal: '公开身份', hide: '不公开',
  play_now: '立即打出', reserve: '预留',
};

function optLabel(view: PlayerView, p: PendingDecision, o: string): string {
  if (/^s\d+$/.test(o)) {
    const s = view.seats.find((x) => x.seatId === o);
    if (s) return `${s.nickname}(${o})${s.alive ? '' : '[已死]'} 令牌${s.honorTokenCount}${s.publicHouseId ? ` 已亮${houseZh(s.publicHouseId)}` : ''}`;
    return o;
  }
  const grave = p.context.graveChoices?.find((g) => g.instanceId === o);
  if (grave) return `弃牌堆:${getCardDisplayName(grave.cardId)}`;
  const tok = view.self.honorTokens.find((t) => t.instanceId === o);
  if (tok) return `己方令牌${tok.value}分`;
  const dh = (view.self.draftHand ?? []).find((c) => c.instanceId === o)
    ?? view.self.hand.find((c) => c.instanceId === o);
  if (dh) return `${getCardDisplayName(dh.cardId)}`;
  return OPT_ZH[o] ?? o;
}

function cardDesc(cardId: string): string {
  return CARD_DESCRIPTION_ZH[baseOf(cardId)] ?? '';
}

function buildUser(view: PlayerView, p: PendingDecision): string {
  const me = view.self;
  const hand = me.hand.map((c) => ({
    id: c.instanceId, 牌: getCardDisplayName(c.cardId), 编号: c.number, 效果: cardDesc(c.cardId),
  }));
  return JSON.stringify({
    轮: view.round,
    阶段: PHASE_ZH[view.phase] ?? view.phase,
    你: {
      座位: me.seatId,
      身份: me.canViewOwnHouse ? houseZh(me.houseId) : '未知（曾被对调后不可自看）',
      手牌: hand,
      预留: me.reserved.map((c) => getCardDisplayName(c.cardId)),
      令牌分值: me.honorTokens.map((t) => t.value),
      已知他人身份: me.knownHouseHistory.map((k) => `${k.targetSeatId}=${houseZh(k.houseId)}`),
    },
    座位: view.seats.filter((s) => s.seatId !== me.seatId).map((s) => ({
      座位: s.seatId, 存活: s.alive, 令牌数: s.honorTokenCount,
      公开身份: s.publicHouseId ? houseZh(s.publicHouseId) : null,
    })),
    待决策: {
      类型: KIND_ZH[p.kind] ?? p.kind,
      合法选项: p.options.map((o) => ({ 值: o, 说明: optLabel(view, p, o) })),
      输出格式:
        p.kind === 'declareCards' ? '{"choice":["牌实例id",...]}（空数组=跳过）'
        : p.kind === 'chooseOptional' ? '{"choice":true/false}'
        : p.kind === 'reactDecide' ? '{"choice":true=发动/false=放弃}'
        : '{"choice":"选项值（精确复制“值”）"}',
    },
  });
}

const SYSTEM_BASE = '你是《忍者之夜》玩家，目标是让自己阵营获胜并拿高分。阶段顺序：密探→隐士→骗徒→刺客→上忍，同阶段按编号从小到大结算。杀人牌：刺客直接杀、上忍看后可杀、裁判亮身份杀（无反应）。反应牌被刺客/上忍选中可反杀或拿分。盗贼从令牌更多者偷1枚（比枚数）。商人先看后换。回合结束阵营比存活者地位（1最大），胜方每人摸1枚令牌（含死者）；先到10分者胜。只返回一个JSON对象，无解释。';

function systemFor(promptV: string): string {
  if (promptV === 'v2-cautious') {
    return `${SYSTEM_BASE}风格：谨慎，优先保命和拿信息；身份不明不乱杀；领先时求稳。`;
  }
  return SYSTEM_BASE;
}

class Semaphore {
  n = 0;
  q: Array<() => void> = [];
  cap: number;
  constructor(cap: number) {
    this.cap = cap;
  }
  async take(): Promise<() => void> {
    if (this.n < this.cap) {
      this.n += 1;
      return () => this.rel();
    }
    await new Promise<void>((r) => this.q.push(r));
    this.n += 1;
    return () => this.rel();
  }
  rel(): void {
    this.n -= 1;
    const next = this.q.shift();
    if (next) next();
  }
}

interface CallStats {
  calls: number; ok: number; retryOk: number;
  fbTimeout: number; fbHttp: number; fbParse: number; fbInvalid: number; fbReject: number;
  latencies: number[];
  badSamples: Array<{ kind: string; user: string; raw: string }>;
}

function extractChoice(text: string): unknown {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return undefined;
  try {
    return (JSON.parse(m[0]) as { choice?: unknown }).choice;
  } catch {
    return undefined;
  }
}

async function llmChoose(
  cfg: Cfg, view: PlayerView, p: PendingDecision, stats: CallStats, sem: Semaphore,
): Promise<{ value: unknown; via: 'llm' | 'retry' | 'fallback'; reason?: string }> {
  const fallback = { value: undefined, via: 'fallback' as const };
  const user = buildUser(view, p);
  const body = (u: string): string => JSON.stringify({
    model: cfg.model,
    messages: [
      { role: 'system', content: systemFor(cfg.promptV) },
      { role: 'user', content: u },
    ],
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
    stream: false,
  });
  const post = async (u: string): Promise<string> => {
    const release = await sem.take();
    const t0 = Date.now();
    try {
      const res = await fetch(`${cfg.endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: body(u),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      const data = await res.json() as { choices?: { message?: { content?: unknown } }[] };
      const c = data.choices?.[0]?.message?.content;
      if (typeof c !== 'string' || !c.trim()) throw new Error('EMPTY');
      stats.latencies.push(Date.now() - t0);
      return c;
    } finally {
      release();
    }
  };
  stats.calls += 1;
  try {
    const raw = await post(user);
    const v = extractChoice(raw);
    if (v === undefined) {
      stats.fbParse += 1;
      // 格式重试一次
      try {
        const raw2 = await post(`${user}\n上次格式错误。请只返回JSON，如 {"choice":"值"}，不要解释。`);
        stats.calls += 1;
        const v2 = extractChoice(raw2);
        if (v2 === undefined) {
          stats.fbParse += 1;
          if (stats.badSamples.length < 5) stats.badSamples.push({ kind: p.kind, user: user.slice(0, 800), raw: raw2.slice(0, 300) });
          return { ...fallback, reason: 'parse' };
        }
        stats.retryOk += 1;
        return { value: v2, via: 'retry' };
      } catch (e) {
        if (stats.badSamples.length < 5) stats.badSamples.push({ kind: p.kind, user: user.slice(0, 800), raw: `(retry failed: ${e instanceof Error ? e.message : String(e)})` });
        return { ...fallback, reason: 'parse-retry-fail' };
      }
    }
    stats.ok += 1;
    return { value: v, via: 'llm' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/timeout|aborted|Timeout|ABORT/i.test(msg)) stats.fbTimeout += 1;
    else stats.fbHttp += 1;
    return { ...fallback, reason: msg.slice(0, 40) };
  }
}

function toCommand(view: PlayerView, p: PendingDecision, value: unknown): Command | null {
  const base = {
    commandId: `llm-${view.self.seatId}-${p.id}`,
    roomCode: view.roomCode,
    seatToken: '',
    windowId: view.windowId,
  };
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  switch (p.kind) {
    case 'draftPick':
    case 'draftDiscard': {
      const id = str(value);
      if (!id || !p.options.includes(id)) return null;
      return { ...base, type: p.kind === 'draftPick' ? 'draft.pick' : 'draft.discard', payload: { cardInstanceId: id } };
    }
    case 'declareCards': {
      const arr = Array.isArray(value) ? value : [];
      if (!arr.every((x) => typeof x === 'string' && p.options.includes(x))) return null;
      if (arr.length === 0) return { ...base, type: 'night.passPhase', payload: {} };
      return { ...base, type: 'night.declare', payload: { cardInstanceIds: arr } };
    }
    case 'chooseTarget':
    case 'merchantChoose':
    case 'merchantExchange': {
      const t = str(value);
      if (!t || !p.options.includes(t)) return null;
      return { ...base, type: 'night.chooseTarget', payload: { targetSeatId: t as never } };
    }
    case 'chooseOptional': {
      // 与 UI CHOOSE_OPTIONAL_TRUE 同表：kill/swap/reveal/play_now → true
      const TRUE = new Set(['kill', 'swap', 'reveal', 'play_now']);
      let b: boolean | null = null;
      if (typeof value === 'boolean') b = value;
      else if (typeof value === 'string' && p.options.includes(value)) b = TRUE.has(value);
      else if (value === 'true') b = true;
      else if (value === 'false') b = false;
      if (b === null) return null;
      return { ...base, type: 'night.chooseOptional', payload: { choose: b } };
    }
    case 'reactDecide': {
      const b = typeof value === 'boolean' ? value : value === 'true' ? true : value === 'false' ? false : null;
      if (b === null) return null;
      return { ...base, type: 'react.decide', payload: { react: b } };
    }
    default:
      return null;
  }
}

export interface LlmGameResult {
  seed: number; players: number; completed: boolean; rounds: number;
  winners: string[]; steps: number; wallMs: number;
  calls: number; llmOk: number; retryOk: number; fallbacks: number;
  fbTimeout: number; fbHttp: number; fbParse: number; fbInvalid: number; fbReject: number;
  avgLatencyMs: number; maxLatencyMs: number;
  badSamples: CallStats['badSamples'];
}

export async function driveLlmGame(
  cfg: Cfg, seed: number, players: number, sem: Semaphore, maxSteps = 900,
): Promise<LlmGameResult> {
  const t0 = Date.now();
  let state: GameState = createGame({ seed, seedFixed: true, playerCount: players });
  const stats: CallStats = {
    calls: 0, ok: 0, retryOk: 0, fbTimeout: 0, fbHttp: 0, fbParse: 0, fbInvalid: 0, fbReject: 0,
    latencies: [], badSamples: [],
  };
  const drng = new Map(state.seats.map((s, i) => [s.seatId, createRng((seed ^ 0x51f15e + i * 7919) >>> 0)]));
  let step = 0;
  let maxRound = 1;
  while (!state.gameOver && step < maxSteps) {
    step += 1;
    maxRound = Math.max(maxRound, state.round);
    if (state.pending.length === 0) {
      const r = applyAllDefaults(state);
      if (r.state === state && state.pending.length === 0 && !state.gameOver) break;
      state = r.state;
      continue;
    }
    // 同窗并行问模型（只读快照），再串行提交
    const snapshot = state;
    const tasks = [...snapshot.pending].map(async (pd) => {
      const view = projectView(snapshot, pd.seatId);
      if (!view) return null;
      const r = await llmChoose(cfg, view, pd, stats, sem);
      return { id: pd.id, seatId: pd.seatId, kind: pd.kind, view, ...r };
    });
    const decided = await Promise.all(tasks);
    let progressed = false;
    for (const d of decided) {
      if (!d) continue;
      const cur = state.pending.find((x) => x.id === d.id);
      if (!cur) continue; // 已被同窗推进带走
      const seat = findSeat(state, d.seatId);
      if (!seat) continue;
      let cmd: Command | null = null;
      if (d.via !== 'fallback') {
        cmd = toCommand(d.view, cur, d.value);
        if (!cmd) {
          stats.fbInvalid += 1;
          if (stats.badSamples.length < 8) {
            stats.badSamples.push({ kind: d.kind, user: buildUser(d.view, cur).slice(0, 600), raw: JSON.stringify(d.value)?.slice(0, 200) ?? '?' });
          }
        }
      }
      if (!cmd) {
        const fb = botDecide(projectView(state, d.seatId)!, cur.id, drng.get(d.seatId));
        if (!fb) {
          state = applyAllDefaults(state).state;
          progressed = true;
          break;
        }
        fb.seatToken = seat.seatToken;
        fb.commandId = `llm-fb-${seed}-${step}-${cur.id}`;
        cmd = fb;
      } else {
        cmd.seatToken = seat.seatToken;
        cmd.commandId = `llm-${seed}-${step}-${cur.id}`;
      }
      const r = applyCommand(state, cmd);
      state = r.state;
      if (!r.ok) {
        stats.fbReject += 1;
        state = applyAllDefaults(state).state;
      }
      progressed = true;
    }
    if (!progressed) break;
  }
  const lat = stats.latencies;
  return {
    seed, players, completed: state.gameOver, rounds: maxRound,
    winners: [...state.winners], steps: step, wallMs: Date.now() - t0,
    calls: stats.calls, llmOk: stats.ok, retryOk: stats.retryOk,
    fallbacks: stats.fbTimeout + stats.fbHttp + stats.fbParse + stats.fbInvalid + stats.fbReject,
    fbTimeout: stats.fbTimeout, fbHttp: stats.fbHttp, fbParse: stats.fbParse,
    fbInvalid: stats.fbInvalid, fbReject: stats.fbReject,
    avgLatencyMs: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0,
    maxLatencyMs: lat.length ? Math.max(...lat) : 0,
    badSamples: stats.badSamples,
  };
}

// ---- CLI ----
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('usage: simulate-llm-games.ts --players N --from A --count K [--concurrency N] [--timeout MS] [--tune LABEL] [--prompt v1|v2-cautious] [--temp X] [--maxTokens N] [--out DIR]');
  process.exit(0);
}
const players = Number(arg(args, '--players', '4'));
const from = Number(arg(args, '--from', '1'));
const count = Number(arg(args, '--count', '2'));
const tune = arg(args, '--tune', 't0');
const outDir = arg(args, '--out', 'D:/Datum/TEMPDIR/opencode/llm-campaign');
const apiKey = process.env.LLM_API_KEY ?? '';
if (!apiKey) {
  console.error('LLM_API_KEY 未设置（key 只走环境变量，不落盘）');
  process.exit(1);
}
const cfg: Cfg = {
  endpoint: process.env.LLM_ENDPOINT ?? 'http://127.0.0.1:8045/v1',
  model: process.env.LLM_MODEL ?? 'gemini-3.8-flash-tiered',
  apiKey,
  timeoutMs: Number(arg(args, '--timeout', '25000')),
  maxTokens: Number(arg(args, '--maxTokens', '80')),
  temperature: Number(arg(args, '--temp', '0.2')),
  promptV: arg(args, '--prompt', 'v1'),
  concurrency: Number(arg(args, '--concurrency', '10')),
};
mkdirSync(outDir, { recursive: true });
const sem = new Semaphore(cfg.concurrency);
const seeds = Array.from({ length: count }, (_, i) => from + i);
console.log(`LLM campaign tune=${tune} players=${players} seeds=[${seeds[0]}..${seeds[seeds.length - 1]}] prompt=${cfg.promptV} temp=${cfg.temperature} conc=${cfg.concurrency}`);
const t0 = Date.now();
const results = await Promise.all(seeds.map((s) => driveLlmGame(cfg, s, players, sem)));
const line = (r: LlmGameResult): string => JSON.stringify({ tune, prompt: cfg.promptV, temp: cfg.temperature, ...r });
for (const r of results) appendFileSync(join(outDir, `players-${players}.jsonl`), `${line(r)}\n`);
const done = results.filter((r) => r.completed).length;
const calls = results.reduce((a, r) => a + r.calls, 0);
const fb = results.reduce((a, r) => a + r.fallbacks, 0);
const avgLat = Math.round(results.reduce((a, r) => a + r.avgLatencyMs * r.calls, 0) / Math.max(1, calls));
console.log(`BATCH players=${players} completed=${done}/${results.length} calls=${calls} fallbacks=${fb} (t/o=${results.reduce((a, r) => a + r.fbTimeout, 0)} http=${results.reduce((a, r) => a + r.fbHttp, 0)} parse=${results.reduce((a, r) => a + r.fbParse, 0)} invalid=${results.reduce((a, r) => a + r.fbInvalid, 0)} reject=${results.reduce((a, r) => a + r.fbReject, 0)}) avgLat=${avgLat}ms wall=${Math.round((Date.now() - t0) / 1000)}s`);
for (const r of results.filter((x) => !x.completed)) console.log(`  INCOMPLETE seed=${r.seed} steps=${r.steps} rounds=${r.rounds}`);
const bad = results.flatMap((r) => r.badSamples.map((b) => ({ seed: r.seed, ...b }))).slice(0, 3);
for (const b of bad) {
  console.log(`  BADSAMPLE seed=${b.seed} kind=${b.kind} raw=${b.raw}`);
  writeFileSync(join(outDir, `bad-${tune}-p${players}-s${b.seed}-${b.kind}.txt`), `USER:\n${b.user}\n\nRAW:\n${b.raw}\n`);
}
