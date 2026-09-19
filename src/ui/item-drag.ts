/**
 * 物品拖拽控制器（支持触摸与鼠标）
 * 选中物品与数量后，可直接按住物品拖拽到目标座位释放。
 * 拖动期间显示跟随手指/光标的半透明预览与数量徽标。
 */
import { getItemPath } from "./assets";
import { getEffectItem } from "./effects/items";

const DRAG_THRESHOLD = 6;

export interface ItemDropPayload {
  itemId: string;
  count: number;
  targetSeatId: string;
}

export interface ItemDragOptions {
  getCount: () => number;
  getSelectedItem?: () => string;
  onDrop: (payload: ItemDropPayload) => void;
}

interface PendingPointer {
  pointerId: number;
  startX: number;
  startY: number;
  source: HTMLElement;
  itemId: string;
}

interface ActiveDrag {
  pointerId: number;
  itemId: string;
  count: number;
  ghost: HTMLElement;
  targetSeat: HTMLElement | null;
}

export class ItemDragController {
  private mounted = false;
  private pending: PendingPointer | null = null;
  private active: ActiveDrag | null = null;
  private suppressNextClick = false;

  private readonly root: HTMLElement;
  private readonly options: ItemDragOptions;

  constructor(root: HTMLElement, options: ItemDragOptions) {
    this.root = root;
    this.options = options;
  }

  public mount(): this {
    if (this.mounted) return this;
    this.mounted = true;
    this.root.addEventListener("pointerdown", this.onPointerDown);
    document.addEventListener("pointermove", this.onPointerMove, { passive: false });
    document.addEventListener("pointerup", this.onPointerUp, { passive: false });
    document.addEventListener("pointercancel", this.onPointerCancel, { passive: false });
    document.addEventListener("click", this.onClickCapture, true);
    return this;
  }

  public destroy(): void {
    this.cancel();
    if (this.mounted) {
      this.root.removeEventListener("pointerdown", this.onPointerDown);
      document.removeEventListener("pointermove", this.onPointerMove);
      document.removeEventListener("pointerup", this.onPointerUp);
      document.removeEventListener("pointercancel", this.onPointerCancel);
      document.removeEventListener("click", this.onClickCapture, true);
    }
    this.mounted = false;
  }

  public cancel(): void {
    if (this.active) {
      this.active.ghost.remove();
      this.active.targetSeat?.classList.remove("drag-target");
      this.root.classList.remove("dragging-item");
      this.active = null;
    }
    this.pending = null;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.pending || this.active || event.button !== 0) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>(".fx-btn[data-fx]") : null;
    if (!target || !this.root.contains(target)) return;

    const itemId = target.dataset["fx"];
    if (!itemId || !getEffectItem(itemId)) return;

    this.pending = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      source: target,
      itemId,
    };
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.pending && this.pending.pointerId === event.pointerId && !this.active) {
      const dist = Math.hypot(event.clientX - this.pending.startX, event.clientY - this.pending.startY);
      if (dist >= DRAG_THRESHOLD) {
        this.beginDrag(this.pending, event);
      }
    }

    if (this.active && this.active.pointerId === event.pointerId) {
      event.preventDefault();
      this.positionGhost(event.clientX, event.clientY);
      this.updateDropTarget(event.clientX, event.clientY);
    }
  };

  private beginDrag(pending: PendingPointer, event: PointerEvent): void {
    try {
      pending.source.setPointerCapture(event.pointerId);
    } catch {}

    const count = Math.max(1, this.options.getCount());
    const ghost = this.createGhost(pending.itemId, count);
    this.active = {
      pointerId: pending.pointerId,
      itemId: pending.itemId,
      count,
      ghost,
      targetSeat: null,
    };
    this.positionGhost(event.clientX, event.clientY);
    this.root.classList.add("dragging-item");
    this.suppressNextClick = true;
  }

  private createGhost(itemId: string, count: number): HTMLElement {
    const item = getEffectItem(itemId);
    const ghost = document.createElement("div");
    ghost.className = "item-drag-ghost";
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.position = "fixed";
    ghost.style.left = "0";
    ghost.style.top = "0";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "1900";
    ghost.style.transform = "translate3d(var(--item-drag-x), var(--item-drag-y), 0) translate(-50%, -50%)";
    ghost.innerHTML = `
      <div class="item-ghost-inner">
        <img src="${getItemPath(itemId)}" alt="${item?.name ?? ""}" />
        <span class="item-ghost-count">×${count}</span>
      </div>
    `;
    document.body.appendChild(ghost);
    return ghost;
  }

  private positionGhost(x: number, y: number): void {
    if (!this.active) return;
    this.active.ghost.style.setProperty("--item-drag-x", `${x}px`);
    this.active.ghost.style.setProperty("--item-drag-y", `${y}px`);
  }

  private updateDropTarget(x: number, y: number): void {
    if (!this.active) return;
    const elements = document.elementsFromPoint(x, y);
    let matchedSeat: HTMLElement | null = null;
    for (const el of elements) {
      if (!(el instanceof HTMLElement)) continue;
      const seat = el.closest<HTMLElement>(".seat-card");
      if (seat && this.root.contains(seat)) {
        matchedSeat = seat;
        break;
      }
    }

    if (this.active.targetSeat !== matchedSeat) {
      this.active.targetSeat?.classList.remove("drag-target");
      matchedSeat?.classList.add("drag-target");
      this.active.targetSeat = matchedSeat;
    }
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.pending && this.pending.pointerId === event.pointerId) {
      try {
        this.pending.source.releasePointerCapture(event.pointerId);
      } catch {}
      this.pending = null;
    }

    if (!this.active || this.active.pointerId !== event.pointerId) return;

    const { itemId, count, targetSeat } = this.active;
    const targetSeatId = targetSeat?.dataset["seat"];

    this.cancel();

    if (targetSeatId) {
      this.options.onDrop({ itemId, count, targetSeatId });
    }
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.pending?.pointerId === event.pointerId) {
      try {
        this.pending.source.releasePointerCapture(event.pointerId);
      } catch {}
      this.pending = null;
    }
    if (this.active?.pointerId === event.pointerId) {
      this.cancel();
    }
  };

  private readonly onClickCapture = (event: MouseEvent): void => {
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      event.stopPropagation();
      event.preventDefault();
    }
  };
}
