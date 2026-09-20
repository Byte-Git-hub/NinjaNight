/**
 * 叐的丌传牌飞行卡牌动效 (P2)
 */
import { getNinjaCardBackPath } from '../assets';

export interface CardFlightOptions {
  stagger?: number;
  duration?: number;
  /** 飞行卡背图，默认忍者卡背 */
  backImage?: string;
}

export class CardFlightLayer {
  private container: HTMLElement | null = null;
  private defaultBackImage?: string;

  constructor(defaultBackImage?: string) {
    this.defaultBackImage = defaultBackImage;
  }

  mount(container: HTMLElement): void {
    this.container = container;
  }


  unmount(): void {
    this.container = null;
  }

  private isReducedMotion(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private resolveBackImage(explicit?: string): string {
    if (explicit) return explicit;
    if (this.defaultBackImage) return this.defaultBackImage;
    return getNinjaCardBackPath();
  }


  async playDealAnimation(seatIds: string[], options: CardFlightOptions = {}): Promise<void> {
    if (this.isReducedMotion() || !this.container || seatIds.length === 0) return;

    const drawPileEl = this.container.querySelector<HTMLElement>('.draw-pile-container');
    const fromRect = drawPileEl ? drawPileEl.getBoundingClientRect() : {
      left: window.innerWidth / 2 - 32,
      top: window.innerHeight / 2 - 45,
      width: 64,
      height: 90,
    };

    const stagger = options.stagger ?? 150;
    const duration = options.duration ?? 500;
    const backImage = this.resolveBackImage(options.backImage);

    const animations = seatIds.map((seatId, index) => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const targetEl = this.container?.querySelector<HTMLElement>(`.seat-card[data-seat="${seatId}"]`);
          if (!targetEl) {
            resolve();
            return;
          }
          const toRect = targetEl.getBoundingClientRect();
          this.flyCard(fromRect, toRect, duration, backImage).then(resolve);
        }, index * stagger);
      });
    });

    await Promise.all(animations);
  }


  async playPassAnimation(fromSeatId: string, toSeatId: string, count = 2): Promise<void> {
    if (this.isReducedMotion() || !this.container) return;
    const fromEl = this.container.querySelector<HTMLElement>(`.seat-card[data-seat="${fromSeatId}"]`);
    const toEl = this.container.querySelector<HTMLElement>(`.seat-card[data-seat="${toSeatId}"]`);
    if (!fromEl || !toEl) return;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const duration = 700;
    const stagger = 120;

    const passes = Array.from({ length: Math.max(1, count) }).map((_, i) => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          this.flyCard(fromRect, toRect, duration).then(resolve);
        }, i * stagger);
      });
    });

    await Promise.all(passes);
  }


  async playPassAround(seatIdsInOrder: string[], count = 2, options: CardFlightOptions = {}): Promise<void> {
    if (this.isReducedMotion() || !this.container) return;
    if (!seatIdsInOrder || seatIdsInOrder.length < 2) return;

    const n = seatIdsInOrder.length;
    const duration = options.duration ?? 700;
    const stagger = options.stagger ?? 120;
    const backImage = this.resolveBackImage(options.backImage);
    const perPair = Math.max(1, count);

    const animations: Array<Promise<void>> = [];
    for (let i = 0; i < n; i += 1) {
      const fromSeatId = seatIdsInOrder[(i + 1) % n];
      const toSeatId = seatIdsInOrder[i];
      if (fromSeatId === undefined || toSeatId === undefined) continue;
      const fromEl = this.container.querySelector<HTMLElement>(`.seat-card[data-seat="${fromSeatId}"]`);
      const toEl = this.container.querySelector<HTMLElement>(`.seat-card[data-seat="${toSeatId}"]`);
      if (!fromEl || !toEl) continue;
      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();
      for (let k = 0; k < perPair; k += 1) {
        animations.push(
          new Promise<void>((resolve) => {
            setTimeout(() => {
              this.flyCard(fromRect, toRect, duration, backImage).then(resolve);
            }, k * stagger);
          }),
        );
      }
    }

    await Promise.all(animations);
  }


  private flyCard(
    fromRect: { left: number; top: number; width: number; height: number },
    toRect: { left: number; top: number; width: number; height: number },
    duration: number,
    backImage?: string,
  ): Promise<void> {
    return new Promise((resolve) => {
      if (typeof document === 'undefined') {
        resolve();
        return;
      }
      const flyer = document.createElement('div');
      flyer.className = 'card-flight-flyer';
      flyer.style.overflow = 'hidden';
      const img = document.createElement('img');
      img.src = this.resolveBackImage(backImage);
      img.alt = '';
      img.draggable = false;
      img.style.position = 'absolute';
      img.style.inset = '0';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.style.borderRadius = 'inherit';
      img.style.pointerEvents = 'none';
      img.onerror = (): void => {
        img.remove();
      };
      flyer.appendChild(img);
      const startX = fromRect.left + fromRect.width / 2 - 32;
      const startY = fromRect.top + fromRect.height / 2 - 45;
      const targetX = toRect.left + toRect.width / 2 - 32;
      const targetY = toRect.top + toRect.height / 2 - 45;

      flyer.style.left = `${startX}px`;
      flyer.style.top = `${startY}px`;
      flyer.style.transform = 'scale(0.6) rotate(-10deg)';
      flyer.style.opacity = '0';
      flyer.style.transition = `all ${duration}ms cubic-bezier(0.25, 1, 0.5, 1)`;

      document.body.appendChild(flyer);

      requestAnimationFrame(() => {
        flyer.style.opacity = '1';
        flyer.style.transform = `translate(${targetX - startX}px, ${targetY - startY}px) scale(1) rotate(0deg)`;
      });

      setTimeout(() => {
        flyer.remove();
        resolve();
      }, duration + 50);
    });
  }
}

export function initCardFlightLayer(container: HTMLElement): CardFlightLayer {
  const layer = new CardFlightLayer();
  layer.mount(container);
  return layer;
}
