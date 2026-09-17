/**
 * 6G-2 Canvas 粒子层：独立 <canvas> 覆盖（pointer-events:none），rAF 按需驱动。
 * - ParticlePool：对象池复用粒子记录，无 DOM，可单测
 * - ComboTracker：连击本地累计（EFFECT_COMBO_WINDOW_MS 窗口），无 DOM，可单测
 * - EffectLayer：DOM/Canvas 绑定（创建/rAF/绘制/自适应降级），e2e 覆盖
 * 约束：粒子上限 EFFECT_PARTICLE_MAX，超限合并为 +N 飘字；帧 dt>24ms 时生成减半。
 */
import {
  EFFECT_COMBO_WINDOW_MS,
  EFFECT_PARTICLE_MAX,
} from '../../shared/timeouts';
import { EMOJI_IDS, getEmojiPath } from '../assets';
import { EFFECT_ITEMS, type EffectItemMeta } from './items';

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  /** 文字粒子（fillText 绘制，连击数/+N 飘字用）；图片/普通粒子为 '' */
  char: string;
  /** 图片粒子源（drawImage 绘制，/assets/{items,emoji}/*.webp）；'' 则按普通圆点绘制 */
  img: string;
  grav: number;
}

/** 对象池：固定容量复用，spawn 满时返回 false（调用方转 +N 飘字） */
export class ParticlePool {
  private pool: Particle[] = [];
  private live = 0;

  constructor(capacity: number = EFFECT_PARTICLE_MAX) {
    for (let i = 0; i < capacity; i += 1) {
      this.pool.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1, size: 2, color: '#fff', char: '', img: '', grav: 0,
      });
    }
  }

  get capacity(): number {
    return this.pool.length;
  }

  get aliveCount(): number {
    return this.live;
  }

  spawn(p: Omit<Particle, 'active' | 'life'> & { life?: number }): boolean {
    const slot = this.pool.find((s) => !s.active);
    if (!slot) return false;
    slot.active = true;
    slot.x = p.x;
    slot.y = p.y;
    slot.vx = p.vx;
    slot.vy = p.vy;
    slot.maxLife = p.maxLife;
    slot.life = p.life ?? p.maxLife;
    slot.size = p.size;
    slot.color = p.color;
    slot.char = p.char;
    slot.img = p.img;
    slot.grav = p.grav;
    this.live += 1;
    return true;
  }

  /** 推进 dtMs 毫秒；返回存活数 */
  update(dtMs: number): number {
    const dt = dtMs / 1000;
    for (const s of this.pool) {
      if (!s.active) continue;
      s.life -= dtMs;
      if (s.life <= 0) {
        s.active = false;
        this.live -= 1;
        continue;
      }
      s.vy += s.grav * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    return this.live;
  }

  clear(): void {
    for (const s of this.pool) s.active = false;
    this.live = 0;
  }

  /** 遍历存活粒子（绘制用；回调内不得改池结构） */
  forEachAlive(cb: (s: Readonly<Particle>) => void): void {
    for (const s of this.pool) {
      if (s.active) cb(s);
    }
  }
}

/** 连击累计：同 key 在窗口内连续 hit 返回递增计数，超窗重置为 1 */
export class ComboTracker {
  private last = new Map<string, { count: number; at: number }>();

  hit(key: string, nowMs: number): number {
    const prev = this.last.get(key);
    const count = prev && nowMs - prev.at <= EFFECT_COMBO_WINDOW_MS ? prev.count + 1 : 1;
    this.last.set(key, { count, at: nowMs });
    return count;
  }

  get(key: string): number {
    return this.last.get(key)?.count ?? 0;
  }

  clear(): void {
    this.last.clear();
  }
}

export interface BurstOptions {
  /** 自适应降级中（上一帧 dt>24ms）：生成数减半 */
  degraded?: boolean;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** DOM/Canvas 绑定层（e2e 覆盖绘制触发；不测像素） */
export class EffectLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private pool = new ParticlePool();
  readonly combos = new ComboTracker();
  private rafId = 0;
  private lastTs = 0;
  private degraded = false;
  private onResize = (): void => this.resize();
  /** 累计 burst 次数（含表情/飘字；e2e 断言绘制触发用，不测像素） */
  bursts = 0;
  /** 图片缓存（物品 9 + 表情 12，mount 时预加载；未就绪时画圆点降级，不保留 emoji 兜底） */
  private images = new Map<string, HTMLImageElement>();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'fx-layer';
    this.canvas.setAttribute('aria-hidden', 'true');
  }

  /** 预加载全部物品/表情切图（fire-and-forget；失败则绘制时圆点降级） */
  preload(): void {
    if (typeof Image === 'undefined') return;
    const srcs = [
      ...EFFECT_ITEMS.map((m) => m.img),
      ...EMOJI_IDS.map((id) => getEmojiPath(id)),
    ];
    for (const src of srcs) {
      if (this.images.has(src)) continue;
      const im = new Image();
      im.src = src;
      this.images.set(src, im);
    }
  }

  /** 挂载到 root（#ui 之外，render 重绘不销毁）；幂等 */
  mount(parent: HTMLElement): void {
    if (!this.canvas.isConnected) {
      parent.appendChild(this.canvas);
      this.resize();
    }
    this.preload();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onResize);
      window.addEventListener('resize', this.onResize);
    }
    try {
      this.ctx = this.canvas.getContext('2d');
    } catch {
      this.ctx = null;
    }
  }

  get element(): HTMLCanvasElement {
    return this.canvas;
  }

  get isDegraded(): boolean {
    return this.degraded;
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
  }

  private centerOf(el: Element): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  private noteBurst(): void {
    this.bursts += 1;
    try {
      const w = window as unknown as Record<string, unknown>;
      w['__ninjaFxBursts'] = (typeof w['__ninjaFxBursts'] === 'number' ? w['__ninjaFxBursts'] : 0) + 1;
    } catch {
      /* 非浏览器/测试环境忽略 */
    }
  }

  /** 物品命中：物品切图主粒子 + 彩色碎屑；满池溢出转 +N 飘字 */
  burstAt(el: Element, item: EffectItemMeta, opts?: BurstOptions): void {
    const { x, y } = this.centerOf(el);
    const half = opts?.degraded || this.degraded;
    let overflow = 0;
    const dots = half ? 6 : 12;
    for (let i = 0; i < dots; i += 1) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(40, 160);
      const ok = this.pool.spawn({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        maxLife: rand(500, 800),
        size: rand(2, 4.5),
        color: i % 2 === 0 ? item.color : item.color2,
        char: '',
        img: '',
        grav: 320,
      });
      if (!ok) overflow += 1;
    }
    const okMain = this.pool.spawn({
      x, y: y - 8,
      vx: rand(-12, 12), vy: -46,
      maxLife: 900, size: 30,
      color: '#fff', char: '', img: item.img, grav: -18,
    });
    if (!okMain) overflow += 1;
    if (overflow > 0) this.textAtPoint(x, y - 44, `+${overflow}`);
    this.noteBurst();
    this.kick();
  }

  /** 快捷表情：座位卡上方浮 3s 淡出（复用同一 Canvas 层；切图绘制） */
  emojiAt(el: Element, emojiId: string): void {
    const { x, y } = this.centerOf(el);
    const r = el.getBoundingClientRect();
    const ok = this.pool.spawn({
      x, y: y - r.height / 2 - 14,
      vx: rand(-8, 8), vy: -30,
      maxLife: 3000, size: 34,
      color: '#fff', char: '', img: getEmojiPath(emojiId), grav: -6,
    });
    if (!ok) this.textAtPoint(x, y - 40, '!');
    this.noteBurst();
    this.kick();
  }

  /** 飘字（连击数/+N）：座位卡上方短暂停留后淡出 */
  textAt(el: Element, text: string): void {
    const { x, y } = this.centerOf(el);
    this.textAtPoint(x, y - 52, text);
    this.noteBurst();
    this.kick();
  }

  private textAtPoint(x: number, y: number, text: string): void {
    const ok = this.pool.spawn({
      x, y, vx: 0, vy: -34,
      maxLife: 1200, size: 15,
      color: '#fde68a', char: `\u2009${text}`, img: '', grav: 0,
    });
    if (!ok) {
      // 池满极端情况：丢弃最老一帧的绘制（社交层允许丢）
    }
  }

  clear(): void {
    this.pool.clear();
    if (this.rafId !== 0) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private kick(): void {
    if (this.rafId !== 0 || this.pool.aliveCount === 0) return;
    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame((ts) => this.frame(ts));
  }

  private frame(ts: number): void {
    this.rafId = 0;
    const dt = Math.min(ts - this.lastTs, 100);
    this.lastTs = ts;
    // rAF 自适应降级：帧耗时 >24ms 则后续生成减半，<20ms 恢复
    if (dt > 24) this.degraded = true;
    else if (dt < 20) this.degraded = false;
    const alive = this.pool.update(dt);
    this.draw();
    if (alive > 0) {
      this.rafId = requestAnimationFrame((t) => this.frame(t));
    } else {
      this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /** 缓存命中且已解码则居中绘制（边长 = size*2），返回是否绘制成功 */
  private drawImageCached(src: string, s: Readonly<Particle>): boolean {
    const ctx = this.ctx;
    const im = this.images.get(src);
    if (!ctx || !im || !im.complete || im.naturalWidth === 0) return false;
    const d = s.size * 2;
    ctx.drawImage(im, s.x - d / 2, s.y - d / 2, d, d);
    return true;
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 按需重绘存活粒子（aliveCount>0 时才进 frame，主线程空闲零占用）
    this.pool.forEachAlive((s) => {
      const alpha = Math.max(s.life / s.maxLife, 0);
      ctx.globalAlpha = Math.min(alpha * 1.4, 1);
      if (s.char !== '') {
        ctx.font = `${s.size}px sans-serif`;
        ctx.fillStyle = s.color;
        ctx.fillText(s.char, s.x, s.y);
      } else if (s.img !== '' && this.drawImageCached(s.img, s)) {
        /* drawImageCached 内绘制 */
      } else {
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * alpha + 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
