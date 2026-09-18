/**
 * 6G-2a 互动特效中继：只广播、不存、不记历史、不进 core。
 * 校验（条数/物品 id/目标座位合法性）为纯函数，可单测；广播走调用方传入的 io。
 */
import { EFFECT_BATCH_MAX, EFFECT_MAX_COUNT, EFFECT_PAYLOAD_MAX_BYTES } from '../shared/timeouts';
import { isEffectItemId, OUT, type EffectBatchItem } from '../shared/protocol';

type IoLike = {
  to(room: string): { emit(event: string, payload: unknown): void };
};

export interface ValidatedEffect {
  targetSeatId: string;
  itemId: string;
  comboId: string;
  count?: number;
}

const COMBO_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * 校验 effect.send 的 items 数组。
 * @param body 上行 payload（items）
 * @param isSeatInRoom 目标座位是否在本房（lobby 或对局座位均可，纯社交层）
 * @returns 合法条目（最多 EFFECT_BATCH_MAX 条），或 null（整批丢弃）
 */
export function validateEffectItems(
  body: unknown,
  isSeatInRoom: (seatId: string) => boolean,
): ValidatedEffect[] | null {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > EFFECT_BATCH_MAX) return null;
  // 防止未受控的超大 JSON；高密度互动应使用 count 压缩，而不是重复发粒子记录。
  try {
    if (JSON.stringify(items).length > EFFECT_PAYLOAD_MAX_BYTES) return null;
  } catch {
    return null;
  }
  const out: ValidatedEffect[] = [];
  for (const it of items) {
    const r = (it ?? {}) as Record<string, unknown>;
    if (typeof r['targetSeatId'] !== 'string' || !isSeatInRoom(r['targetSeatId'])) return null;
    if (!isEffectItemId(r['itemId'])) return null;
    if (typeof r['comboId'] !== 'string' || !COMBO_RE.test(r['comboId'])) return null;
    const rawCount = r['count'] === undefined ? 1 : r['count'];
    if (
      typeof rawCount !== 'number' ||
      !Number.isInteger(rawCount) ||
      rawCount < 1 ||
      rawCount > EFFECT_MAX_COUNT
    ) return null;
    out.push({
      targetSeatId: r['targetSeatId'],
      itemId: r['itemId'],
      comboId: r['comboId'],
      ...(rawCount > 1 ? { count: rawCount } : {}),
    });
  }
  return out;
}

export class EffectRelay {
  private io: IoLike;

  constructor(io: IoLike) {
    this.io = io;
  }

  /** 广播一批特效（不存不记，仅透传；调用方已做限频） */
  broadcast(
    roomCode: string,
    channel: string,
    fromSeatId: string,
    fromNickname: string,
    items: ValidatedEffect[],
  ): void {
    if (items.length === 0) return;
    const batch: EffectBatchItem[] = items.map((it) => ({
      fromSeatId,
      fromNickname,
      targetSeatId: it.targetSeatId,
      itemId: it.itemId,
      comboId: it.comboId,
      ...((it.count ?? 1) > 1 ? { count: it.count } : {}),
    }));
    this.io.to(channel).emit(OUT.effectBatch, { roomCode, items: batch });
  }
}
