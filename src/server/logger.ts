/**
 * 结构化日志 + 脱敏硬约定。
 * 禁止写入：HONOR 面值、玩家 HOUSE、手牌内容、seatToken、随机对局种子。
 * 允许：roomCode、seatId、command.type、reasonCode、error message。
 * 例外（6J 种子机制）：`fixedSeed` 仅用于人工显式固定的复现对局
 * （房主 ?seed=xxx 或 NINJA_SEED），随机局只记 seedSource，不记值。
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  roomCode?: string;
  seatId?: string;
  type?: string;
  reasonCode?: string;
  error?: string;
  [key: string]: unknown;
}

const SENSITIVE_KEYS = new Set([
  'honorFace',
  'honorFaces',
  'honorToken',
  'honorTokens',
  'houseId',
  'house',
  'hand',
  'cards',
  'cardId',
  'seatToken',
  'token',
  'tokens',
  'seed',
  'knownHouses',
  'view',
  'payload',
  'apiKey',
  'llmApiKey',
  'llmOverrideKey',
  'LLM_API_KEY',
  'authorization',
  'Authorization',
  'prompt',
  'messages',
  'output',
  'content',
  'reasoning_content',
]);

function sanitize(fields: LogFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SENSITIVE_KEYS.has(k)) continue;
    if (v === undefined) continue;
    if (typeof v === 'string' && v.length > 200) {
      out[k] = v.slice(0, 200);
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function log(level: LogLevel, msg: string, fields: LogFields = {}): void {
  const line = JSON.stringify({
    level,
    timestamp: new Date().toISOString(),
    msg,
    ...sanitize(fields),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, f?: LogFields) => log('debug', msg, f),
  info: (msg: string, f?: LogFields) => log('info', msg, f),
  warn: (msg: string, f?: LogFields) => log('warn', msg, f),
  error: (msg: string, f?: LogFields) => log('error', msg, f),
};
