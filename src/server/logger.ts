/**
 * 结构化日志 + 脱敏硬约定。
 * 禁止写入：HONOR 面值、玩家 HOUSE、手牌内容、seatToken。
 * 允许：roomCode、seatId、command.type、reasonCode、error message。
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
