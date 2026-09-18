import {
  REACTION_EMOJI_MAX_LEN,
  REACTION_MAX_COUNT,
} from '../shared/timeouts';
import { REACTION_EMOJI_IDS, type ReactionEmojiId, type ReactionKind } from '../shared/protocol';

const KINDS = new Set<ReactionKind>(['egg', 'flower', 'emoji']);

export interface ValidatedReaction {
  targetSeatId: string;
  kind: ReactionKind;
  emoji?: string;
  emojiId?: ReactionEmojiId;
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
  const rawEmojiId = r['emojiId'];
  if (kind === 'emoji') {
    const hasText = typeof rawEmoji === 'string' && rawEmoji.length > 0;
    const hasId = typeof rawEmojiId === 'string' && (REACTION_EMOJI_IDS as readonly string[]).includes(rawEmojiId);
    if (hasText === hasId) return null;
    if (hasText && (rawEmoji as string).length > REACTION_EMOJI_MAX_LEN) return null;
  } else if (rawEmoji !== undefined && typeof rawEmoji !== 'string') {
    return null;
  } else if (rawEmojiId !== undefined) {
    return null;
  }
  return {
    targetSeatId: r['targetSeatId'],
    kind,
    ...(typeof rawEmoji === 'string' && rawEmoji.length > 0 ? { emoji: rawEmoji } : {}),
    ...(typeof rawEmojiId === 'string' && (REACTION_EMOJI_IDS as readonly string[]).includes(rawEmojiId)
      ? { emojiId: rawEmojiId as ReactionEmojiId }
      : {}),
    count: rawCount,
  };
}
