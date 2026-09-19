/** 超时与限频常量（阶段 4 集中定义；阶段 5 支持环境变量） */
// 6G-1：浏览器侧（ui/voice）也会 import 本模块，process 访问必须加卫语句
function envInt(name: string, fallback: number): number {
  const raw =
    typeof process !== 'undefined' ? process.env?.[name] : undefined;
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envStr(name: string, fallback: string): string {
  const raw =
    typeof process !== 'undefined' ? process.env?.[name] : undefined;
  return raw === undefined ? fallback : raw;
}

export const DEFAULT_WINDOW_MS = envInt('NINJA_WINDOW_MS', 60_000);
export const EMPTY_ROOM_TTL_MS = envInt('NINJA_EMPTY_ROOM_TTL_MS', 5 * 60_000);
export const ENDED_ROOM_TTL_MS = envInt('NINJA_ENDED_ROOM_TTL_MS', 10 * 60_000);
export const COMMAND_RATE_PER_SEC = envInt('NINJA_COMMAND_RATE_PER_SEC', 10);
/** 断线后 seat 保留可重绑时长（阶段 5） */
export const DISCONNECT_RETAIN_MS = envInt('NINJA_DISCONNECT_RETAIN_MS', 5 * 60_000);
/** victoryCheck 轮间停留时单人房自动进下一轮的延迟（6E.7；多人房只等房主手动） */
export const VICTORY_AUTO_ADVANCE_MS = envInt('NINJA_VICTORY_AUTO_MS', 5_000);
/** Bot 社交旁路：仅调度发言，不延迟游戏 Command。密钥配置只存在服务端。 */
export const BOT_SOCIAL_ROUND_START_MIN_MS = 2000;
export const BOT_SOCIAL_ROUND_START_MAX_MS = 5000;
export const LLM_TIMEOUT_MS = envInt('LLM_TIMEOUT_MS', 8000);
export const LLM_MAX_CALLS_PER_ROUND = envInt('LLM_MAX_CALLS_PER_ROUND', 3);
export const LLM_MIN_INTERVAL_MS = envInt('LLM_MIN_INTERVAL_MS', 5000);
export const LLM_MAX_CONCURRENT = 5;
export const LLM_FAILURE_THRESHOLD = 3;
export const LLM_CIRCUIT_BREAK_MS = 300000;

export const IDEMPOTENCY_CACHE_SIZE = 50;
export const MAX_NICKNAME_LEN = 16;
export const MAX_CHAT_LEN = 200;
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 11;

/** 6G-1 语音：服务端 mediasoup 监听地址（固定 0.0.0.0） */
export const VOICE_LISTEN_IP = envStr('NINJA_MEDIA_LISTEN_IP', '0.0.0.0');
/** 6G-1 语音：对外宣告的局域网 IP（未配则启动时自动探测 192.168/10.x 兜底） */
export const VOICE_ANNOUNCED_IP = envStr('NINJA_MEDIA_ANNOUNCED_IP', '');
/** 6G-1 语音：mediasoup RTC UDP 端口段（Windows 防火墙需放行） */
export const VOICE_PORT_MIN = envInt('NINJA_MEDIA_PORT_MIN', 40000);
export const VOICE_PORT_MAX = envInt('NINJA_MEDIA_PORT_MAX', 40100);
/** 6G-1 语音：speaking 广播节流窗口（毫秒，客户端限频用） */
export const VOICE_SPEAKING_THROTTLE_MS = 1000;
/** 6G-2a 特效：客户端合并发送窗口（毫秒） */
export const EFFECT_BATCH_WINDOW_MS = envInt('NINJA_EFFECT_BATCH_MS', 50);
/** 6G-2a 特效：单个 effect.send/effect.batch 最多携带的压缩条目。 */
export const EFFECT_BATCH_MAX = envInt('NINJA_EFFECT_BATCH_MAX', 64);
/** 6G-2a 特效：单条压缩记录代表的最多粒子数。 */
export const EFFECT_MAX_COUNT = envInt('NINJA_EFFECT_MAX_COUNT', 1000);
/** 6G-2a 特效：payload 的硬上限（避免恶意大包；正常批量使用 count 压缩）。 */
export const EFFECT_PAYLOAD_MAX_BYTES = envInt('NINJA_EFFECT_PAYLOAD_MAX_BYTES', 256 * 1024);
/** 6G-2a 特效：comboId 分组窗口（毫秒；同目标同物品归一组，服务端透传） */
export const EFFECT_COMBO_WINDOW_MS = 1500;
/** 6G-2b 特效：Canvas 粒子池上限（超限合并为 +N 飘字） */
export const EFFECT_PARTICLE_MAX = envInt('NINJA_EFFECT_PARTICLE_MAX', 200);
/** 6G-2b 怀疑标记：每人最多标记数（重复点同一目标 = 取消） */
export const MARK_PER_SEAT_MAX = envInt('NINJA_MARK_PER_SEAT_MAX', 2);
/** 6F-B2：reaction 独立限频（每 socket 每秒）与 payload 上限。 */
/** reaction 仅做保护性限频，超限静默丢弃，不产生游戏 RATE_LIMITED 横幅。 */
export const REACTION_RATE_PER_SEC = envInt('NINJA_REACTION_RATE_PER_SEC', 30);
export const REACTION_MAX_COUNT = 10;
export const REACTION_EMOJI_MAX_LEN = 4;

/** 6J 种子机制：种子须为 0–2^32-1 整数；非法返回 null（两端共用校验） */
export function parseGameSeed(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw >= 0 && raw <= 0xffffffff ? raw >>> 0 : null;
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!/^\d{1,10}$/.test(s)) return null;
    const n = Number(s);
    return Number.isSafeInteger(n) && n <= 0xffffffff ? n : null;
  }
  return null;
}

/** 6J：NINJA_SEED 固定对局种子（dev/复现用；未设则每局随机） */
export const FIXED_GAME_SEED: number | null = (() => {
  const raw = typeof process !== 'undefined' ? process.env?.['NINJA_SEED'] : undefined;
  if (raw === undefined || raw === '') return null;
  return parseGameSeed(raw);
})();
