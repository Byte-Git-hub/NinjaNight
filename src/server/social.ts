/**
 * 6G-2 怀疑标记：纯社交层状态（marker { from, target }），不进 core。
 * 规则：每人最多 MARK_PER_SEAT_MAX 个；重复点同一目标 = 取消；超限时淘汰最早的一个。
 * 每次变更全房广播 mark.state 快照；断线/离开/房间重置时清理相关座位。
 */
import type { MarkPair } from '../shared/protocol';
import { OUT } from '../shared/protocol';
import { MARK_PER_SEAT_MAX } from '../shared/timeouts';
import { PHRASES, normalizePhraseId } from '../data/phrases';
import { logger } from './logger';

/**
 * 6G-3 快捷短语校验（纯函数）：下标合法返回对应文本，否则 null（调用方整条拒收）。
 * 服务端只做长度/频率校验后广播，不存储、不记历史。
 */
export function validatePhrase(v: unknown): string | null {
  const id = normalizePhraseId(v);
  if (id === null) return null;
  return PHRASES[id];
}

type IoLike = {
  to(room: string): { emit(event: string, payload: unknown): void };
};

export class SocialMarks {
  private io: IoLike;
  private rooms = new Map<string, MarkPair[]>();

  constructor(io: IoLike) {
    this.io = io;
  }

  snapshot(roomCode: string): MarkPair[] {
    return [...(this.rooms.get(roomCode) ?? [])];
  }

  /** 打标：已存在同对则取消；否则加入（超限淘汰 from 最早的一个）。返回变更后快照。 */
  setMark(roomCode: string, from: string, target: string): MarkPair[] {
    const marks = this.rooms.get(roomCode) ?? [];
    const idx = marks.findIndex((m) => m.from === from && m.target === target);
    if (idx >= 0) {
      marks.splice(idx, 1);
    } else {
      const own = marks.filter((m) => m.from === from);
      if (own.length >= MARK_PER_SEAT_MAX) {
        const oldest = marks.findIndex((m) => m.from === from);
        if (oldest >= 0) marks.splice(oldest, 1);
      }
      marks.push({ from, target });
    }
    this.rooms.set(roomCode, marks);
    logger.info('social.mark_set', { roomCode, seatId: from });
    this.broadcastState(roomCode);
    return this.snapshot(roomCode);
  }

  /** 取消：删除该对（不存在则无操作，仍广播以便对齐）。返回变更后快照。 */
  clearMark(roomCode: string, from: string, target: string): MarkPair[] {
    const marks = this.rooms.get(roomCode) ?? [];
    const next = marks.filter((m) => !(m.from === from && m.target === target));
    this.rooms.set(roomCode, next);
    logger.info('social.mark_clear', { roomCode, seatId: from });
    this.broadcastState(roomCode);
    return [...next];
  }

  broadcastState(roomCode: string): void {
    this.io.to(`room:${roomCode}`).emit(OUT.markState, { roomCode, marks: this.snapshot(roomCode) });
  }

  /** 移除与该座位相关的所有标记（断线/离开/踢出时调；有变更才广播） */
  removeSeat(roomCode: string, seatId: string): void {
    const marks = this.rooms.get(roomCode);
    if (!marks || marks.length === 0) return;
    const next = marks.filter((m) => m.from !== seatId && m.target !== seatId);
    if (next.length === marks.length) return;
    this.rooms.set(roomCode, next);
    this.broadcastState(roomCode);
  }

  cleanupRoom(roomCode: string): void {
    this.rooms.delete(roomCode);
  }
}
