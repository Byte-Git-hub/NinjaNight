/**
 * 6G-2 怀疑标记发送封装（复用 Socket.IO；纯社交层，不进 core）。
 * 状态全量由服务端 mark.state 下发，本地只存快照；打标/取消即时发，不合并。
 */
import { EV, OUT, type MarkPair } from '../shared/protocol';
import type { GameNet } from './client';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export type MarksHandler = (marks: MarkPair[]) => void;

export class SocialNet {
  private net: GameNet;
  private marksHandlers = new Set<MarksHandler>();
  private bound = false;

  private onMarks = (p: unknown): void => {
    if (isRecord(p) && Array.isArray(p['marks'])) {
      this.marksHandlers.forEach((h) => h(p['marks'] as MarkPair[]));
    }
  };

  constructor(net: GameNet) {
    this.net = net;
  }

  /** 挂载 mark.state 监听（mount 时一次） */
  attach(): void {
    if (this.bound) return;
    this.bound = true;
    this.net.onSocketEvent(OUT.markState, this.onMarks as (...args: never[]) => void);
  }

  detach(): void {
    if (!this.bound) return;
    this.bound = false;
    this.net.offSocketEvent(OUT.markState, this.onMarks as (...args: never[]) => void);
  }

  onMarksChange(h: MarksHandler): () => void {
    this.marksHandlers.add(h);
    return () => this.marksHandlers.delete(h);
  }

  /** 打标（服务端重复点同一目标视为取消；自标/非法目标由服务端拒收） */
  setMark(targetSeatId: string): void {
    if (typeof targetSeatId !== 'string' || targetSeatId === '') return;
    this.net.emitVoice(EV.markSet, { targetSeatId });
  }

  clearMark(targetSeatId: string): void {
    if (typeof targetSeatId !== 'string' || targetSeatId === '') return;
    this.net.emitVoice(EV.markClear, { targetSeatId });
  }

  /** 拉全量快照（入房/重连后对齐用，服务端单播回 mark.state） */
  sync(): void {
    this.net.emitVoice(EV.markSync, {});
  }
}
