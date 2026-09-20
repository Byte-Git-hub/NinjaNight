import { CARD_DESCRIPTION_ZH, CARD_PHASE_ZH } from '../../data/card-text';
import type { GameEvent, PlayerView } from '../../shared/types';
import { CARD_CN, getCardDisplayName, renderCardHtml } from '../assets';

/**
 * EffectPresenter：night.cardResolved 的中央聚光灯展示。
 * TableMoments 风格：fire-and-forget（queueFromEvents 内 `void presentNext()`）、
 * reduced-motion 门控、backdrop 节点追踪、clear() 清理。
 * 可见性：只读传入的 events + view 公开字段（seats 昵称、events 公开 payload），
 * 严禁读取手牌/令牌面值/种子等隐藏状态。
 */
export interface ResolvedSpotlightItem {
  seq: number;
  actorSeatId: string;
  actorName: string;
  cardId: string;
  instanceId: string;
  /** 展示用编号：取自同轮 night.cardsDeclared.cards[].number，缺失为 null */
  number: number | null;
  /** 全名（含编号），经 getCardDisplayName（CARD_CN 为唯一来源） */
  cardName: string;
  /** 经 CARD_DESCRIPTION_ZH，不硬编码中文 */
  description: string;
  /** 经 CARD_PHASE_ZH，不硬编码中文 */
  phaseZh: string;
}

interface DeclaredFace {
  number: number | null;
}

const SPOTLIGHT_TIMEOUT_MS = 1500;

export class EffectPresenter {
  private queue: ResolvedSpotlightItem[] = [];
  private presenting = false;
  private backdrop: HTMLElement | null = null;
  private cancelCurrent: (() => void) | null = null;

  private reduced(): boolean {
    if (typeof matchMedia !== 'function') return false;
    try {
      return matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  /** 从一次快照的新事件中按 cardResolved.seq 升序组 playlist 并 fire-and-forget 展示。 */
  queueFromEvents(events: GameEvent[], view: PlayerView): void {
    // reduced-motion 时直接丢弃，降级由现有横幅承担。
    if (this.reduced()) return;
    if (!events || events.length === 0) return;
    const faces = this.declaredFaceMap(view.events, events);
    const fresh = events
      .filter((e) => e.type === 'night.cardResolved')
      .slice()
      .sort((a, b) => a.seq - b.seq);
    for (const e of fresh) {
      const item = this.toItem(e, view, faces);
      if (item) this.queue.push(item);
    }
    if (this.queue.length > 0) void this.presentNext();
  }

  /** 串行展示：前一个完成（确认/ESC/超时）才下一个；队列空或展示中则直接返回。 */
  async presentNext(): Promise<void> {
    if (this.presenting || this.queue.length === 0) return;
    const item = this.queue.shift();
    if (!item) return;
    this.presenting = true;
    try {
      await this.showItem(item);
    } finally {
      this.presenting = false;
    }
    if (this.queue.length > 0) return this.presentNext();
  }

  /** 换轮/离房调用：清空队列并移除模态（含进行中的一次展示）。 */
  clear(): void {
    this.queue.length = 0;
    const cancel = this.cancelCurrent;
    this.cancelCurrent = null;
    if (cancel) cancel();
    else this.removeModal();
  }

  // -- 私有 ---------------------------------------------------------------

  /** instanceId -> 牌面（number），取自公开的 night.cardsDeclared.cards 数组。 */
  private declaredFaceMap(...lists: GameEvent[][]): Map<string, DeclaredFace> {
    const map = new Map<string, DeclaredFace>();
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const e of list) {
        if (e.type !== 'night.cardsDeclared') continue;
        const cards = (e.payload as Record<string, unknown>)['cards'];
        if (!Array.isArray(cards)) continue;
        for (const c of cards) {
          if (typeof c !== 'object' || c === null) continue;
          const rec = c as Record<string, unknown>;
          if (typeof rec['instanceId'] !== 'string') continue;
          map.set(rec['instanceId'], {
            number: typeof rec['number'] === 'number' ? rec['number'] : null,
          });
        }
      }
    }
    return map;
  }

  private toItem(
    e: GameEvent,
    view: PlayerView,
    faces: Map<string, DeclaredFace>,
  ): ResolvedSpotlightItem | null {
    const p = e.payload as Record<string, unknown>;
    if (
      typeof p['actorSeatId'] !== 'string' ||
      typeof p['cardId'] !== 'string' ||
      typeof p['instanceId'] !== 'string'
    ) {
      return null;
    }
    const actorSeatId = p['actorSeatId'];
    const cardId = p['cardId'];
    const instanceId = p['instanceId'];
    const base = cardId.split(/[:-]/)[0] ?? cardId;
    const seat = view.seats.find((s) => s.seatId === actorSeatId);
    return {
      seq: e.seq,
      actorSeatId,
      actorName: seat?.nickname ?? actorSeatId,
      cardId,
      instanceId,
      number: faces.get(instanceId)?.number ?? null,
      cardName: getCardDisplayName(cardId),
      description: CARD_DESCRIPTION_ZH[base] ?? '',
      phaseZh: CARD_PHASE_ZH[base] ?? '',
    };
  }

  private showItem(item: ResolvedSpotlightItem): Promise<void> {
    return new Promise<void>((resolve) => {
      if (typeof document === 'undefined' || !document.body) {
        resolve();
        return;
      }
      let done = false;
      let timer: number | null = null;
      const finish = () => {
        if (done) return;
        done = true;
        if (timer !== null) window.clearTimeout(timer);
        document.removeEventListener('keydown', onKey);
        this.cancelCurrent = null;
        this.removeModal();
        resolve();
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') finish();
      };
      this.cancelCurrent = finish;

      // 骨架复用 help-modal / identity-modal-backdrop 视觉：深色底 + 金边（见 presenter.css）。
      const backdrop = document.createElement('div');
      backdrop.className = 'effect-spotlight-backdrop identity-modal-backdrop';
      const panel = document.createElement('div');
      panel.className = 'effect-spotlight help-modal';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', item.cardName);

      // 卡面大图：renderCardHtml 输出来自受信数据源；用户昵称等一律走 textContent（等价于 help.ts esc）。
      const art = document.createElement('div');
      art.className = 'effect-spotlight-art';
      art.innerHTML = renderCardHtml(item.cardId, item.instanceId, false);

      const title = document.createElement('h3');
      title.className = 'effect-spotlight-title';
      title.textContent = item.cardName;

      const actor = document.createElement('p');
      actor.className = 'effect-spotlight-actor';
      const base = item.cardId.split(/[:-]/)[0] ?? item.cardId;
      const baseName = CARD_CN[base] ?? base;
      actor.textContent =
        item.number !== null
          ? `${item.actorName} 发动了 ${baseName} ${item.number}`
          : `${item.actorName} 发动了 ${baseName}`;

      const phase = document.createElement('p');
      phase.className = 'effect-spotlight-phase';
      phase.textContent = item.phaseZh;

      const desc = document.createElement('p');
      desc.className = 'effect-spotlight-desc';
      desc.textContent = item.description;

      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.className = 'effect-spotlight-confirm';
      confirm.textContent = '确认';
      confirm.addEventListener('click', finish);

      panel.append(art, title, actor, phase, desc, confirm);
      backdrop.appendChild(panel);
      document.body.appendChild(backdrop);
      this.backdrop = backdrop;

      document.addEventListener('keydown', onKey);
      timer = window.setTimeout(finish, SPOTLIGHT_TIMEOUT_MS);
      confirm.focus();
    });
  }

  private removeModal(): void {
    if (this.backdrop) {
      this.backdrop.remove();
      this.backdrop = null;
    }
  }
}
