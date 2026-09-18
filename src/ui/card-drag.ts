/** Pointer-driven card drag interaction for the single-screen table.
 *
 * The controller intentionally owns only interaction state.  Rendering and
 * game decisions remain in app.ts through the onDrop callback.  The source
 * card may be replaced during a snapshot render; a detached ghost and the
 * original HTML/rect keep the gesture stable until pointerup.
 */

export interface CardDropPayload {
  instanceId: string;
  targetSeatId?: string;
  central: boolean;
  sourceRect: DOMRect;
  html: string;
}

export interface CardDragOptions {
  canStart: (el: HTMLElement) => boolean;
  onDrop: (payload: CardDropPayload) => void;
}

interface PendingPointer {
  pointerId: number;
  source: HTMLElement;
  sourceRect: DOMRect;
  instanceId: string;
  html: string;
  startX: number;
  startY: number;
}

interface ActiveDrag extends PendingPointer {
  target: HTMLElement | null;
  ghost: HTMLElement | null;
}

const DRAG_THRESHOLD = 6;

function isReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Adds card dragging without requiring a framework or a per-card listener. */
export class CardDragController {
  private readonly root: HTMLElement;
  private readonly options: CardDragOptions;
  private pending: PendingPointer | null = null;
  private active: ActiveDrag | null = null;
  private suppressNextClick = false;
  private mounted = false;
  private destroyed = false;

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.destroyed || this.pending || this.active || event.button !== 0) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('.card[data-iid]:not(.dim)') : null;
    if (!target || !this.root.contains(target)) return;
    if (!this.options.canStart(target)) return;
    const iid = target.dataset.iid;
    if (!iid) return;
    this.pending = {
      pointerId: event.pointerId,
      source: target,
      sourceRect: target.getBoundingClientRect(),
      instanceId: iid,
      html: target.outerHTML,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const pending = this.pending;
    const active = this.active;
    if (pending && pending.pointerId === event.pointerId && !active) {
      if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) < DRAG_THRESHOLD) return;
      this.beginDrag(pending);
      this.pending = null;
    }
    if (!this.active || this.active.pointerId !== event.pointerId) return;
    event.preventDefault();
    this.positionGhost(event.clientX, event.clientY);
    this.setTarget(this.hitTest(event.clientX, event.clientY));
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.pending && this.pending.pointerId === event.pointerId) {
      this.pending = null;
      return;
    }
    const active = this.active;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    const target = active.target;
    // A drag gesture must never fall through to the card's click handler,
    // including when it ended over empty table space.
    this.suppressNextClick = true;
    if (target) {
      const central = target.matches('.central') || Boolean(target.closest('.central'));
      const seat = target.matches('.seat-card') ? target : target.closest<HTMLElement>('.seat-card');
      this.options.onDrop({
        instanceId: active.instanceId,
        targetSeatId: seat?.dataset.seat,
        central,
        sourceRect: active.sourceRect,
        html: active.html,
      });
    }
    this.finishDrag();
  };

  /** Pointer cancellation (touch interruption, capture loss) must cancel;
   * unlike pointerup it must never submit a drop payload. */
  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.pending?.pointerId === event.pointerId) {
      this.pending = null;
      return;
    }
    if (this.active?.pointerId !== event.pointerId) return;
    this.suppressNextClick = true;
    this.finishDrag();
  };

  /** Cards contain images and some browsers start native HTML drag before the
   * pointer has crossed our threshold. Keep the gesture in this controller. */
  private readonly onNativeDragStart = (event: DragEvent): void => {
    if (this.pending || this.active) event.preventDefault();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && (this.pending || this.active)) {
      event.preventDefault();
      this.cancel();
    }
  };

  private readonly onClickCapture = (event: MouseEvent): void => {
    if (!this.suppressNextClick) return;
    this.suppressNextClick = false;
    event.preventDefault();
    event.stopPropagation();
  };

  constructor(root: HTMLElement, options: CardDragOptions) {
    this.root = root;
    this.options = options;
  }

  mount(): this {
    if (this.destroyed || this.mounted) return this;
    this.mounted = true;
    this.root.addEventListener('pointerdown', this.onPointerDown);
    this.root.addEventListener('dragstart', this.onNativeDragStart, true);
    document.addEventListener('pointermove', this.onPointerMove, { passive: false });
    document.addEventListener('pointerup', this.onPointerUp, { passive: false });
    document.addEventListener('pointercancel', this.onPointerCancel, { passive: false });
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('click', this.onClickCapture, true);
    return this;
  }

  cancel(): void {
    this.pending = null;
    this.finishDrag();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.cancel();
    if (this.mounted) {
      this.root.removeEventListener('pointerdown', this.onPointerDown);
      this.root.removeEventListener('dragstart', this.onNativeDragStart, true);
      document.removeEventListener('pointermove', this.onPointerMove);
      document.removeEventListener('pointerup', this.onPointerUp);
      document.removeEventListener('pointercancel', this.onPointerCancel);
      document.removeEventListener('keydown', this.onKeyDown);
      document.removeEventListener('click', this.onClickCapture, true);
    }
    this.mounted = false;
    this.destroyed = true;
  }

  private beginDrag(pending: PendingPointer): void {
    const ghost = isReducedMotion() ? null : this.makeGhost(pending);
    this.active = { ...pending, ghost, target: null };
    pending.source.classList.add('drag-source');
    this.root.classList.add('dragging-card');
  }

  private makeGhost(pending: PendingPointer): HTMLElement {
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.innerHTML = pending.html;
    ghost.style.position = 'fixed';
    ghost.style.left = '0';
    ghost.style.top = '0';
    ghost.style.width = `${pending.sourceRect.width}px`;
    ghost.style.height = `${pending.sourceRect.height}px`;
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '160';
    ghost.style.transformOrigin = '50% 50%';
    ghost.style.transform = 'translate3d(var(--drag-x), var(--drag-y), 0) translate(-50%, -50%) rotate(var(--drag-rotation, 0deg))';
    ghost.style.setProperty('--drag-x', `${pending.startX}px`);
    ghost.style.setProperty('--drag-y', `${pending.startY}px`);
    document.body.appendChild(ghost);
    return ghost;
  }

  private positionGhost(x: number, y: number): void {
    const ghost = this.active?.ghost;
    if (!ghost) return;
    ghost.style.setProperty('--drag-x', `${x}px`);
    ghost.style.setProperty('--drag-y', `${y}px`);
    ghost.style.setProperty('--drag-rotation', `${Math.max(-8, Math.min(8, (x - (this.active?.startX ?? x)) * 0.025))}deg`);
  }

  private hitTest(x: number, y: number): HTMLElement | null {
    const elements = document.elementsFromPoint(x, y);
    for (const el of elements) {
      if (!(el instanceof HTMLElement)) continue;
      const seat = el.closest<HTMLElement>('.seat-card');
      if (seat && this.root.contains(seat)) return seat;
      const central = el.closest<HTMLElement>('.central');
      if (central && this.root.contains(central)) return central;
    }
    return null;
  }

  private setTarget(next: HTMLElement | null): void {
    const current = this.active?.target;
    if (current === next) return;
    current?.classList.remove('drag-target');
    next?.classList.add('drag-target');
    if (this.active) this.active.target = next;
  }

  private finishDrag(): void {
    const active = this.active;
    if (!active) return;
    active.ghost?.remove();
    active.target?.classList.remove('drag-target');
    active.source.classList.remove('drag-source');
    this.root.classList.remove('dragging-card');
    this.active = null;
  }
}

export default CardDragController;
