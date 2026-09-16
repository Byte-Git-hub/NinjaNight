/** 超时与限频常量（阶段 4 集中定义；阶段 5 支持环境变量） */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const DEFAULT_WINDOW_MS = envInt('NINJA_WINDOW_MS', 60_000);
export const EMPTY_ROOM_TTL_MS = envInt('NINJA_EMPTY_ROOM_TTL_MS', 5 * 60_000);
export const ENDED_ROOM_TTL_MS = envInt('NINJA_ENDED_ROOM_TTL_MS', 10 * 60_000);
export const COMMAND_RATE_PER_SEC = envInt('NINJA_COMMAND_RATE_PER_SEC', 10);
/** 断线后 seat 保留可重绑时长（阶段 5） */
export const DISCONNECT_RETAIN_MS = envInt('NINJA_DISCONNECT_RETAIN_MS', 5 * 60_000);

export const IDEMPOTENCY_CACHE_SIZE = 50;
export const MAX_NICKNAME_LEN = 16;
export const MAX_CHAT_LEN = 200;
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 11;
