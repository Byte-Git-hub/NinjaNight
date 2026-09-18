import { getHonorTokenPath } from '../assets';

/** Ephemeral visual feedback; never reads hidden state or replaces game controls. */
export class TableMoments {
  private nodes = new Set<HTMLElement>();
  private reduced(): boolean { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  private add(className: string, lifetime: number): HTMLElement | null {
    if (this.reduced()) return null;
    const el = document.createElement('div');
    el.className = `table-moment ${className}`;
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    this.nodes.add(el);
    const remove = () => { el.remove(); this.nodes.delete(el); };
    el.addEventListener('animationend', e => { if (e.target === el) remove(); });
    window.setTimeout(remove, lifetime);
    return el;
  }
  phase(label: string): void {
    const el = this.add('moment-phase', 1500);
    if (el) el.textContent = label;
  }
  kill(): void { this.add('moment-kill', 650); }
  award(from: DOMRect, target: HTMLElement, count: number, offset: number): void {
    const to = target.getBoundingClientRect();
    for (let i = 0; i < Math.min(12, count); i++) {
      const delay = (offset + i) * 150;
      const el = this.add('moment-token', delay + 850);
      if (!el) return;
      const img = document.createElement('img'); img.src = getHonorTokenPath(); img.alt = ''; el.appendChild(img);
      el.style.setProperty('--from-x', `${from.left + from.width / 2 - 20}px`);
      el.style.setProperty('--from-y', `${from.top + from.height / 2 - 20}px`);
      el.style.setProperty('--to-x', `${to.left + to.width / 2 - 20}px`);
      el.style.setProperty('--to-y', `${to.top + to.height / 2 - 20}px`);
      el.style.animationDelay = `${delay}ms`;
      el.addEventListener('animationend', () => {
        if (!target.isConnected) return;
        target.classList.remove('card-arrival'); void target.offsetWidth; target.classList.add('card-arrival');
        window.setTimeout(() => target.classList.remove('card-arrival'), 420);
      }, { once: true });
    }
  }
  victory(label: string): void {
    const el = this.add('moment-victory', 3200);
    if (!el) return;
    const text = document.createElement('strong'); text.textContent = label; el.appendChild(text);
    for (let i = 0; i < 48; i++) {
      const foil = document.createElement('i');
      foil.style.setProperty('--foil-x', `${(i * 37) % 100}%`);
      foil.style.setProperty('--foil-delay', `${(i % 9) * 75}ms`);
      foil.style.setProperty('--foil-turn', `${i % 2 ? 460 : -380}deg`);
      el.appendChild(foil);
    }
    // Click-through presentation: any deliberate input dismisses the flourish.
    const dismiss = () => { el.remove(); this.nodes.delete(el); };
    document.addEventListener('pointerdown', dismiss, { once:true });
    window.setTimeout(() => document.removeEventListener('pointerdown', dismiss), 3200);
  }
  clear(): void { for (const el of this.nodes) el.remove(); this.nodes.clear(); }
}
