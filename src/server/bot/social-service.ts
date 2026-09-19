import type { Server } from 'socket.io';
import { OUT, type ReactionEmojiId } from '../../shared/protocol';
import { PHRASES } from '../../data/phrases';
import { validateEffectItems, type EffectRelay } from '../effects';
import type { RoomRuntime } from '../room';
import { createLlmClient } from './llm-client';
import { readLlmConfig } from './llm-config';
import { createBotSocialScheduler, type SocialAction } from './social-scheduler';

type IoLike = Pick<Server, 'to'>;

function nicknameOf(room: RoomRuntime, seatId: string): string {
  return room.state?.seats.find((s) => s.seatId === seatId)?.nickname
    ?? room.lobby.find((s) => s.seatId === seatId)?.nickname
    ?? seatId;
}

export function createBotSocialService(io: IoLike, effects: EffectRelay) {
  const llm = createLlmClient(readLlmConfig());
  const scheduler = createBotSocialScheduler({
    relay(room, botSeatId, action) {
      relayAction(room, botSeatId, action);
    },
    enhance: ({ roomCode, botSeat, summary, signal, apiKeyOverride }) =>
      llm.generate({
        roomCode,
        botSeat,
        round: summary.round,
        personality: summary.personality,
        trigger: summary.trigger,
        summary,
        apiKeyOverride,
        signal,
      }),
  });

  function relayAction(room: RoomRuntime, botSeatId: string, action: SocialAction): void {
    const channel = room.roomChannel();
    const nickname = nicknameOf(room, botSeatId);
    if (action.kind === 'chat') {
      io.to(channel).emit(OUT.chatEvent, {
        seatId: botSeatId, nickname, text: action.text, ts: Date.now(),
      });
      return;
    }
    if (action.kind === 'phrase') {
      const text = PHRASES[action.phraseId];
      if (typeof text !== 'string') return;
      io.to(channel).emit(OUT.phraseEvent, {
        seatId: botSeatId, nickname, text, ts: Date.now(),
      });
      return;
    }
    if (action.kind === 'reaction') {
      io.to(channel).emit(OUT.reactionEvent, {
        fromSeatId: botSeatId,
        targetSeatId: action.targetSeatId,
        kind: 'emoji',
        emojiId: action.emojiId as ReactionEmojiId,
        count: 1,
        sentAt: Date.now(),
      });
      return;
    }
    const targetOk = room.state?.seats.some((s) => s.seatId === action.targetSeatId)
      ?? room.lobby.some((s) => s.seatId === action.targetSeatId);
    if (!targetOk) return;
    const items = validateEffectItems({
      items: [{
        targetSeatId: action.targetSeatId,
        itemId: action.itemId,
        comboId: `bot-${botSeatId}-${Date.now()}`,
        count: 1,
      }],
    }, (seatId) => (room.state?.seats.some((s) => s.seatId === seatId)
      ?? room.lobby.some((s) => s.seatId === seatId)));
    if (items) effects.broadcast(room.code, channel, botSeatId, nickname, items);
  }

  return {
    sync(room: RoomRuntime): void { scheduler.sync(room); },
    clear(room: RoomRuntime): void { scheduler.clear(room); llm.clearRoom(room.code); },
    invalidate(room: RoomRuntime): void { scheduler.invalidate(room); llm.invalidateRoom(room.code); },
    close(): void { llm.dispose(); },
  };
}


