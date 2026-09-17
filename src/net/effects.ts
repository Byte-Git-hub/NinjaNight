/**
 * 6G-2a 互动特效发送封装（复用 Socket.IO，不另建连接；纯社交层）。
 * - 本地 50ms 窗口合并发送，最多 10 条/批（EFFECT_BATCH_WINDOW_MS / EFFECT_BATCH_MAX）
 * - 客户端镜像限频 EFFECT_MIRROR_PER_SEC/秒：超限只本地渲染、不发网（回退）
 * - comboId：同目标+同物品 1.5s 内归为一组（EFFECT_COMBO_WINDOW_MS），服务端透传
 */
import {
  EFFECT_BATCH_MAX,
  EFFECT_BATCH_WINDOW_MS,
  EFFECT_COMBO_WINDOW_MS,
  EFFECT_MIRROR_PER_SEC,
} from '../shared/timeouts';
import { EV, OUT, isEffectItemId, type EffectBatchItem } from '../shared/protocol';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * EffectNet 只依赖 GameNet 的这三个成员（结构化类型，不直引 ./client，
 * 避免 node 工程（vitest/server 单测）把浏览器侧 client.ts 拉入检查）。
 * app 侧传入完整 GameNet（结构兼容）。
 */
export interface EffectSocket {
  onSocketEvent(event: string, handler: (...args: never[]) => void): void;
  offSocketEvent(event: string, handler: (...args: never[]) => void): void;
  emitVoice(event: string, payload: Record<string, unknown>): void;
  readonly isSocketConnected: boolean;
}

export interface EffectNetOptions {
  now?: () => number;
}

export type BatchHandler = (items: EffectBatchItem[]) => void;

export class EffectNet {
  private net: EffectSocket;
  private now: () => number;
  private queue: Array<{ targetSeatId: string; itemId: string; comboId: string }> = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private batchHandlers = new Set<BatchHandler>();
  private bound = false;
  /** combo 分组：key=`target|item` → { comboId, lastAt } */
  private combos = new Map<string, { comboId: string; lastAt: number }>();
  private comboSeq = 0;
  /** 镜像限频：最近 1s 内已发网条数时间戳 */
  private sentAt: number[] = [];

  private onBatch = (p: unknown): void => {
    if (isRecord(p) && Array.isArray(p['items'])) {
      this.batchHandlers.forEach((h) => h(p['items'] as EffectBatchItem[]));
    }
  };

  constructor(net: EffectSocket, opts?: EffectNetOptions) {
    this.net = net;
    this.now = opts?.now ?? (() => Date.now());
  }

  /** 挂载 effect.batch 监听（mount 时一次） */
  attach(): void {
    if (this.bound) return;
    this.bound = true;
    this.net.onSocketEvent(OUT.effectBatch, this.onBatch as (...args: never[]) => void);
  }

  detach(): void {
    if (!this.bound) return;
    this.bound = false;
    this.net.offSocketEvent(OUT.effectBatch, this.onBatch as (...args: never[]) => void);
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.queue = [];
  }

  onBatchArrive(h: BatchHandler): () => void {
    this.batchHandlers.add(h);
    return () => this.batchHandlers.delete(h);
  }

  /**
   * 发送一个特效（先本地渲染，后合并发网）。
   * @returns 'sent' 已入队待发网；'local-only' 镜像限频/离线，仅本地渲染回退
   */
  send(targetSeatId: string, itemId: string): 'sent' | 'local-only' {
    if (typeof targetSeatId !== 'string' || targetSeatId === '' || !isEffectItemId(itemId)) {
      return 'local-only';
    }
    const t = this.now();
    const key = `${targetSeatId}|${itemId}`;
    let combo = this.combos.get(key);
    if (!combo || t - combo.lastAt > EFFECT_COMBO_WINDOW_MS) {
      this.comboSeq += 1;
      combo = { comboId: `c${t.toString(36)}-${this.comboSeq.toString(36)}`, lastAt: t };
      this.combos.set(key, combo);
    } else {
      combo.lastAt = t;
    }
    if (!this.net.isSocketConnected) return 'local-only';
    this.sentAt = this.sentAt.filter((ts) => t - ts < 1000);
    if (this.sentAt.length >= EFFECT_MIRROR_PER_SEC) return 'local-only';
    this.sentAt.push(t);
    this.queue.push({ targetSeatId, itemId, comboId: combo.comboId });
    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => this.flush(), EFFECT_BATCH_WINDOW_MS);
    }
    return 'sent';
  }

  /** 待发队列长度（单测/调试用） */
  get pendingCount(): number {
    return this.queue.length;
  }

  private flush(): void {
    this.flushTimer = null;
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, EFFECT_BATCH_MAX);
    // 队列超长（极端连点）时丢弃溢出部分：社交层允许丢，保 10 条/批上限
    if (this.queue.length > 0) this.queue.splice(0, this.queue.length);
    if (!this.net.isSocketConnected) return;
    this.net.emitVoice(EV.effectSend, { items: batch });
  }
}
