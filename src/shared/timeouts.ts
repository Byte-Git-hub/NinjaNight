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
/** 6G-2a 特效：单批上限（条） */
export const EFFECT_BATCH_MAX = envInt('NINJA_EFFECT_BATCH_MAX', 10);
/** 6G-2a 特效：客户端镜像限频（条/秒，超限只本地渲染不发网，回退） */
export const EFFECT_MIRROR_PER_SEC = envInt('NINJA_EFFECT_MIRROR_PER_SEC', 10);
/** 6G-2a 特效：comboId 分组窗口（毫秒；同目标同物品归一组，服务端透传） */
export const EFFECT_COMBO_WINDOW_MS = 1500;
