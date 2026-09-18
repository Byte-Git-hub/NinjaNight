import {
  REACTION_EMOJI_MAX_LEN,
  REACTION_MAX_COUNT,
} from '../shared/timeouts';
import type { ReactionKind } from '../shared/protocol';

const KINDS = new Set<ReactionKind>(['egg', 'flower', 'emoji']);

export interface ValidatedReaction {
  targetSeatId: string;
  kind: ReactionKind;
  emoji?: string;
  count: number;
}

/** 校验并归一化 room.reaction；不触碰 GameState，也不记录历史。 */
export function validateReaction(
  body: unknown,
  isSeatInRoom: (seatId: string) => boolean,
): ValidatedReaction | null {
  const r = (body ?? {}) as Record<string, unknown>;
  if (typeof r['targetSeatId'] !== 'string' || !isSeatInRoom(r['targetSeatId'])) return null;
  if (typeof r['kind'] !== 'string' || !KINDS.has(r['kind'] as ReactionKind)) return null;
  const kind = r['kind'] as ReactionKind;
  const rawCount = r['count'] === undefined ? 1 : r['count'];
  if (typeof rawCount !== 'number' || !Number.isInteger(rawCount) || rawCount < 1 || rawCount > REACTION_MAX_COUNT) {
    return null;
  }
  const rawEmoji = r['emoji'];
  if (kind === 'emoji') {
    if (typeof rawEmoji !== 'string' || rawEmoji.length < 1 || rawEmoji.length > REACTION_EMOJI_MAX_LEN) return null;
  } else if (rawEmoji !== undefined && typeof rawEmoji !== 'string') {
    return null;
  }
  return {
    targetSeatId: r['targetSeatId'],
    kind,
    ...(typeof rawEmoji === 'string' && rawEmoji.length > 0 ? { emoji: rawEmoji } : {}),
    count: rawCount,
  };
}
