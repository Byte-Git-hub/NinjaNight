/**
 * High-throughput item flight renderer.
 *
 * This layer deliberately does not create one DOM node per item.  A single
 * fixed canvas and a pair of small object pools are used so a burst of
 * hundreds (or a replay with thousands) can be rendered without layout work.
 * The owner only needs to mount the layer once and call launch for each
 * broadcast event.
 */
import { getEmojiPath, getItemPath } from '../assets';
import { getEffectItem } from './items';

export interface FlightPoint {
  x: number;
  y: number;
}

export type FlightAnchor = DOMRect | FlightPoint;

export interface ItemFlightLaunch {
  /** Start anchor (a DOMRect is converted to its centre). */
  from: FlightAnchor;
  /** Destination anchor (a DOMRect is converted to its centre). */
  to: FlightAnchor;
  /** One of the nine item ids in public/assets/items. */
  itemId: string;
  /** Seat id passed to onHit when the item arrives. */
  targetSeatId?: string;
  /** Number of individual items to launch (default 1, capped at 2,000). */
  count?: number;
  /** Optional per-event callback; useful when one event has a local owner. */
  onHit?: (seatId: string | undefined, strength: number) => void;
}

export interface ItemFlightLayerOptions {
  maxFlights?: number;
  /** Called for every item arrival. strength is 1..4 for a capped combo. */
  onHit?: (seatId: string | undefined, strength: number) => void;
  /** Set false only for diagnostics; reduced motion still wins. */
  prefersReducedMotion?: boolean;
}

export interface ItemFlightMetrics {
  activeFlights: number;
  activeParticles: number;
  activeEmojiPops: number;
  frames: number;
  droppedFlights: number;
  lastFrameMs: number;
  lastUpdateMs: number;
  lastDrawMs: number;
  peakFlights: number;
  launched: number;
  hits: number;
  emojiLaunched: number;
}

interface Flight {
  active: boolean;
  startAt: number;
  duration: number;
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  angle: number;
  spin: number;
  size: number;
  src: string;
  color: string;
  color2: string;
  targetSeatId?: string;
  onHit?: (seatId: string | undefined, strength: number) => void;
  hit: boolean;
}

interface Spark {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
}

interface EmojiPop {
  active: boolean;
  x: number;
  y: number;
  src: string;
  age: number;
  life: number;
  scale: number;
  spin: number;
  angle: number;
  targetSeatId?: string;
}

const MAX_FLIGHTS = 2000;
const MAX_SPARKS = 5000;
const MAX_EMOJI_POPS = 160;
const STAGGER_MS = 80;
const MAX_STAGGER_MS = 1200;
const DEFAULT_DURATION_MS = 620;

function random(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function center(anchor: FlightAnchor): FlightPoint {
  if ('width' in anchor) {
    return { x: anchor.left + anchor.width / 2, y: anchor.top + anchor.height / 2 };
  }
  return { x: anchor.x, y: anchor.y };
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}

function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * A fixed, pointer-transparent Canvas for item projectiles and emoji pops.
 * It is intentionally independent of app.ts render cycles: mounting once is
 * enough and no render operation can remove an in-flight animation.
 */
export class ItemFlightLayer {
  private readonly canvas: HTMLCanvasElement;
  private readonly maxFlights: number;
  private readonly flights: Flight[] = [];
  private readonly sparks: Spark[] = [];
  private readonly emojiPops: EmojiPop[] = [];
  private readonly images = new Map<string, HTMLImageElement>();
  private ctx: CanvasRenderingContext2D | null = null;
  private host: HTMLElement | null = null;
  private rafId = 0;
  private lastTs = 0;
  private mounted = false;
  private destroyed = false;
  private frameCount = 0;
  private dropped = 0;
  private lastFrame = 0;
  private lastUpdate = 0;
  private lastDraw = 0;
  private hitCount = 0;
  private peakFlightCount = 0;
  private sparkCursor = 0;
  private launchedCount = 0;
  private emojiLaunchedCount = 0;
  private readonly reducedMotionOverride?: boolean;
  private readonly resizeHandler = (): void => this.resize();
  onHit?: (seatId: string | undefined, strength: number) => void;

  constructor(options: ItemFlightLayerOptions = {}) {
    this.maxFlights = Math.max(1, Math.min(MAX_FLIGHTS, Math.floor(options.maxFlights ?? MAX_FLIGHTS)));
    this.onHit = options.onHit;
    this.reducedMotionOverride = options.prefersReducedMotion;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'item-flight-layer';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.position = 'fixed';
    this.canvas.style.inset = '0';
    this.canvas.style.width = '100vw';
    this.canvas.style.height = '100vh';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '120';
  }

  /** Add the persistent canvas to a host, idempotently. */
  mount(host: HTMLElement): this {
    if (this.destroyed) return this;
    this.host = host;
    if (!this.canvas.isConnected) host.appendChild(this.canvas);
    this.mounted = true;
    this.resize();
    try {
      this.ctx = this.canvas.getContext('2d');
    } catch {
      this.ctx = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.resizeHandler);
      window.addEventListener('resize', this.resizeHandler, { passive: true });
    }
    this.preloadItems();
    return this;
  }

  get element(): HTMLCanvasElement {
    return this.canvas;
  }

  /** Attach or replace the arrival callback after construction. */
  setOnHit(handler: ((seatId: string | undefined, strength: number) => void) | undefined): this {
    this.onHit = handler;
    return this;
  }

  /** Current counters, exposed for diagnostics and performance probes. */
  getMetrics(): ItemFlightMetrics {
    return {
      activeFlights: this.flights.reduce((n, f) => n + (f.active ? 1 : 0), 0),
      activeParticles: this.sparks.reduce((n, p) => n + (p.active ? 1 : 0), 0),
      activeEmojiPops: this.emojiPops.reduce((n, p) => n + (p.active ? 1 : 0), 0),
      frames: this.frameCount,
      droppedFlights: this.dropped,
      lastFrameMs: this.lastFrame,
      lastUpdateMs: this.lastUpdate,
      lastDrawMs: this.lastDraw,
      peakFlights: this.peakFlightCount,
      launched: this.launchedCount,
      hits: this.hitCount,
      emojiLaunched: this.emojiLaunchedCount,
    };
  }

  /** Launch one or many item projectiles along a quadratic Bezier arc. */
  launch(event: ItemFlightLaunch): void {
    if (this.destroyed) return;
    const from = center(event.from);
    const to = center(event.to);
    const count = Math.max(1, Math.min(this.maxFlights, Math.floor(event.count ?? 1)));
    this.launchedCount += count;
    if (this.reducedMotion) {
      for (let i = 0; i < count; i += 1) this.emitHit(event.targetSeatId, Math.min(4, 1 + Math.floor(i / 4)), event.onHit);
      this.updateDebugAttrs();
      return;
    }
    const item = getEffectItem(event.itemId);
    const src = item?.img ?? getItemPath(event.itemId);
    const color = item?.color ?? '#fde68a';
    const color2 = item?.color2 ?? '#f59e0b';
    const t0 = nowMs();
    // A cap prevents count=2,000 from creating a 160-second queue while
    // retaining the requested 80 ms rhythm for the first 15 projectiles.
    for (let i = 0; i < count; i += 1) {
      const slot = this.takeFlightSlot();
      if (!slot) {
        this.dropped += 1;
        continue;
      }
      const ox = random(-15, 15);
      const oy = random(-15, 15);
      const sx = from.x + ox;
      const sy = from.y + oy;
      const ex = to.x + random(-15, 15);
      const ey = to.y + random(-15, 15);
      const dx = ex - sx;
      const dy = ey - sy;
      const distance = Math.hypot(dx, dy);
      const arc = Math.max(55, Math.min(260, distance * 0.32 + random(-16, 16)));
      slot.active = true;
      slot.startAt = t0 + Math.min(i * STAGGER_MS, MAX_STAGGER_MS);
      slot.duration = DEFAULT_DURATION_MS + random(-45, 80);
      slot.x0 = sx;
      slot.y0 = sy;
      slot.cx = (sx + ex) / 2;
      slot.cy = (sy + ey) / 2 - arc;
      slot.x1 = ex;
      slot.y1 = ey;
      slot.angle = Math.atan2(dy, dx);
      slot.spin = random(-Math.PI * 2, Math.PI * 2);
      slot.size = Math.max(22, Math.min(46, 26 + distance / 22));
      slot.src = src;
      slot.color = color;
      slot.color2 = color2;
      slot.targetSeatId = event.targetSeatId;
      slot.onHit = event.onHit;
      slot.hit = false;
    }
    this.kick();
  }

  /** Emoji are short dramatic pops at the target, never long-distance flights. */
  emojiPop(target: FlightAnchor, emojiId: string, count = 1, targetSeatId?: string): void {
    if (this.destroyed) return;
    const p = center(target);
    const n = Math.max(1, Math.min(24, Math.floor(count)));
    this.emojiLaunchedCount += n;
    if (this.reducedMotion) return;
    const src = getEmojiPath(emojiId);
    for (let i = 0; i < n; i += 1) {
      const slot = this.takeEmojiSlot();
      if (!slot) break;
      slot.active = true;
      slot.x = p.x + random(-14, 14);
      slot.y = p.y - random(4, 20);
      slot.src = src;
      slot.age = 0;
      slot.life = 620 + random(0, 280);
      slot.scale = 0.6 + random(0, 0.25);
      slot.spin = random(-0.5, 0.5);
      slot.angle = random(-0.28, 0.28);
      slot.targetSeatId = targetSeatId;
    }
    this.kick();
  }

  /** Cancel all projectiles and clear the pixel buffer. */
  clear(): void {
    for (const f of this.flights) f.active = false;
    for (const s of this.sparks) s.active = false;
    for (const p of this.emojiPops) p.active = false;
    this.flights.length = 0;
    this.sparks.length = 0;
    this.emojiPops.length = 0;
    this.stopRaf();
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.updateDebugAttrs();
  }

  /** Remove canvas and listeners. A destroyed layer cannot be remounted. */
  destroy(): void {
    if (this.destroyed) return;
    this.clear();
    if (typeof window !== 'undefined') window.removeEventListener('resize', this.resizeHandler);
    this.canvas.remove();
    this.host = null;
    this.ctx = null;
    this.mounted = false;
    this.destroyed = true;
  }

  private get reducedMotion(): boolean {
    return this.reducedMotionOverride === true || prefersReducedMotion();
  }

  private resize(): void {
    if (typeof window === 'undefined') return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
    this.canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
  }

  private preloadItems(): void {
    if (typeof Image === 'undefined') return;
    for (const id of ['egg', 'sakura', 'geta', 'rotten_pill', 'basket', 'secret_letter', 'tea', 'snowball', 'shuriken']) {
      this.cacheImage(getItemPath(id));
    }
  }

  private cacheImage(src: string): HTMLImageElement | undefined {
    if (typeof Image === 'undefined') return undefined;
    const found = this.images.get(src);
    if (found) return found;
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
    this.images.set(src, image);
    return image;
  }

  private takeFlightSlot(): Flight | undefined {
    const free = this.flights.find((f) => !f.active);
    if (free) return free;
    if (this.flights.length >= this.maxFlights) return undefined;
    const fresh: Flight = {
      active: false, startAt: 0, duration: 0,
      x0: 0, y0: 0, cx: 0, cy: 0, x1: 0, y1: 0,
      angle: 0, spin: 0, size: 30, src: '', color: '#fde68a', color2: '#f59e0b', hit: false,
    };
    this.flights.push(fresh);
    return fresh;
  }

  private takeSparkSlot(): Spark | undefined {
    // Round-robin free-slot scan avoids restarting at index zero for every
    // impact in a 1,000-item burst (which otherwise becomes quadratic).
    const length = this.sparks.length;
    for (let i = 0; i < length; i += 1) {
      const index = (this.sparkCursor + i) % length;
      const slot = this.sparks[index];
      if (slot && !slot.active) {
        this.sparkCursor = (index + 1) % Math.max(1, length);
        return slot;
      }
    }
    if (this.sparks.length >= MAX_SPARKS) return undefined;
    const fresh: Spark = { active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, size: 2, color: '#fff' };
    this.sparks.push(fresh);
    this.sparkCursor = this.sparks.length % MAX_SPARKS;
    return fresh;
  }

  private takeEmojiSlot(): EmojiPop | undefined {
    const free = this.emojiPops.find((p) => !p.active);
    if (free) return free;
    if (this.emojiPops.length >= MAX_EMOJI_POPS) return undefined;
    const fresh: EmojiPop = { active: false, x: 0, y: 0, src: '', age: 0, life: 0, scale: 1, spin: 0, angle: 0 };
    this.emojiPops.push(fresh);
    return fresh;
  }

  private emitHit(seatId: string | undefined, strength: number, callback?: (seatId: string | undefined, strength: number) => void): void {
    this.hitCount += 1;
    const hit = callback ?? this.onHit;
    hit?.(seatId, strength);
  }

  private kick(): void {
    if (!this.mounted || this.rafId !== 0) return;
    this.lastTs = nowMs();
    this.rafId = requestAnimationFrame((ts) => this.frame(ts));
  }

  private stopRaf(): void {
    if (this.rafId !== 0) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private frame(timestamp: number): void {
    this.rafId = 0;
    const rawDt = Math.max(0, timestamp - this.lastTs);
    const dt = Math.min(80, rawDt);
    this.lastTs = timestamp;
    // Keep the unmodified RAF interval for diagnostics; physics uses the
    // capped dt above so a tab resume cannot teleport every projectile.
    this.lastFrame = rawDt;
    this.frameCount += 1;
    const updateStarted = nowMs();
    this.update(dt, timestamp);
    this.lastUpdate = Math.max(0, nowMs() - updateStarted);
    const drawStarted = nowMs();
    this.draw();
    this.lastDraw = Math.max(0, nowMs() - drawStarted);
    this.updateDebugAttrs();
    if (this.hasActive()) this.rafId = requestAnimationFrame((ts) => this.frame(ts));
  }

  private update(dt: number, timestamp: number): void {
    const dtSeconds = dt / 1000;
    let activeFlights = 0;
    for (const f of this.flights) {
      if (!f.active) continue;
      if (timestamp < f.startAt) {
        activeFlights += 1;
        continue;
      }
      const t = Math.min(1, (timestamp - f.startAt) / f.duration);
      if (t >= 1) {
        f.active = false;
        if (!f.hit) {
          f.hit = true;
          const strength = Math.min(4, Math.max(1, 1 + Math.floor(this.hitCount % 4)));
          this.emitHit(f.targetSeatId, strength, f.onHit);
          this.spawnImpact(f.x1, f.y1, f.color, f.color2, strength);
        }
        continue;
      }
      activeFlights += 1;
    }
    if (activeFlights > this.peakFlightCount) this.peakFlightCount = activeFlights;
    for (const s of this.sparks) {
      if (!s.active) continue;
      s.age += dt;
      if (s.age >= s.life) {
        s.active = false;
        continue;
      }
      s.vy += 520 * dtSeconds;
      s.x += s.vx * dtSeconds;
      s.y += s.vy * dtSeconds;
    }
    for (const p of this.emojiPops) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        continue;
      }
      p.y -= 20 * dtSeconds;
      p.angle += p.spin * dtSeconds;
    }
    void activeFlights;
  }

  private spawnImpact(x: number, y: number, color: string, color2: string, strength: number): void {
    const amount = Math.min(14, 6 + strength * 2);
    for (let i = 0; i < amount; i += 1) {
      const spark = this.takeSparkSlot();
      if (!spark) break;
      const angle = random(0, Math.PI * 2);
      const speed = random(35, 170) * (0.8 + strength * 0.08);
      spark.active = true;
      spark.x = x + random(-3, 3);
      spark.y = y + random(-3, 3);
      spark.vx = Math.cos(angle) * speed;
      spark.vy = Math.sin(angle) * speed - 30;
      spark.age = 0;
      spark.life = random(260, 620);
      spark.size = random(1.5, 4.5);
      spark.color = i % 2 === 0 ? color : color2;
    }
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx || typeof window === 'undefined') return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    for (const f of this.flights) {
      if (!f.active) continue;
      if (this.lastTs < f.startAt) continue;
      const t = Math.min(1, Math.max(0, (this.lastTs - f.startAt) / f.duration));
      const inv = 1 - t;
      const x = inv * inv * f.x0 + 2 * inv * t * f.cx + t * t * f.x1;
      const y = inv * inv * f.y0 + 2 * inv * t * f.cy + t * t * f.y1;
      const alpha = Math.min(1, t < 0.08 ? t / 0.08 : (t > 0.88 ? (1 - t) / 0.12 : 1));
      const scale = 0.72 + Math.sin(Math.PI * t) * 0.23;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate(f.angle + f.spin * t);
      ctx.scale(scale, scale);
      const image = this.images.get(f.src) ?? this.cacheImage(f.src);
      if (image?.complete && image.naturalWidth > 0) {
        ctx.drawImage(image, -f.size / 2, -f.size / 2, f.size, f.size);
      } else {
        ctx.fillStyle = f.color;
        ctx.shadowColor = f.color2;
        ctx.shadowBlur = 9;
        ctx.beginPath();
        ctx.arc(0, 0, f.size * 0.34, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.sparks) {
      if (!s.active) continue;
      const alpha = Math.max(0, 1 - s.age / s.life);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * (0.7 + alpha * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const p of this.emojiPops) {
      if (!p.active) continue;
      const alpha = Math.min(1, p.age / 100, (p.life - p.age) / 220);
      const image = this.images.get(p.src) ?? this.cacheImage(p.src);
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      const scale = p.scale * (0.85 + Math.min(0.3, p.age / 280));
      ctx.scale(scale, scale);
      if (image?.complete && image.naturalWidth > 0) ctx.drawImage(image, -22, -22, 44, 44);
      else {
        ctx.fillStyle = '#fef3c7';
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  private hasActive(): boolean {
    return this.flights.some((f) => f.active) || this.sparks.some((s) => s.active) || this.emojiPops.some((p) => p.active);
  }

  private updateDebugAttrs(): void {
    const metrics = this.getMetrics();
    this.canvas.dataset.activeFlights = String(metrics.activeFlights);
    this.canvas.dataset.activeParticles = String(metrics.activeParticles);
    this.canvas.dataset.activeEmoji = String(metrics.activeEmojiPops);
    this.canvas.dataset.frames = String(metrics.frames);
    this.canvas.dataset.droppedFlights = String(metrics.droppedFlights);
    this.canvas.dataset.launched = String(metrics.launched);
    this.canvas.dataset.hits = String(metrics.hits);
    this.canvas.dataset.emojiLaunched = String(metrics.emojiLaunched);
    this.canvas.dataset.peakFlights = String(metrics.peakFlights);
    this.canvas.dataset.lastFrameMs = String(metrics.lastFrameMs);
    this.canvas.dataset.lastUpdateMs = String(metrics.lastUpdateMs);
    this.canvas.dataset.lastDrawMs = String(metrics.lastDrawMs);
  }
}

export default ItemFlightLayer;
