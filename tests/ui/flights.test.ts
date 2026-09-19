/** High-volume item flight smoke tests.  The renderer itself is Canvas based;
 * these tests keep a tiny host mock so they run in Vitest's node environment.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ItemFlightLayer } from '../../src/ui/effects/flights';

interface FakeCanvas {
  isConnected: boolean;
  style: Record<string, string>;
  dataset: Record<string, string>;
  className: string;
  removed: boolean;
  setAttribute: () => void;
  getContext: () => null;
  remove: () => void;
}

function installDomMock(): { canvas: FakeCanvas; host: { appendChild: (el: FakeCanvas) => void } } {
  const canvas: FakeCanvas = {
    isConnected: false,
    style: {},
    dataset: {},
    className: '',
    removed: false,
    setAttribute: () => undefined,
    getContext: () => null,
    remove: () => { canvas.removed = true; canvas.isConnected = false; },
  };
  const host = { appendChild: (el: FakeCanvas) => { el.isConnected = true; } };
  vi.stubGlobal('document', { createElement: () => canvas });
  vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => setTimeout(() => cb(Date.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  return { canvas, host };
}

afterEach(() => vi.unstubAllGlobals());

describe('ItemFlightLayer', () => {
  it('caps a burst at 2,000 and reduced motion reports immediate hits without RAF', () => {
    const { canvas, host } = installDomMock();
    const hit = vi.fn();
    const layer = new ItemFlightLayer({ onHit: hit });
    layer.mount(host as unknown as HTMLElement);
    layer.launch({ from: { x: 10, y: 10 }, to: { x: 100, y: 100 }, itemId: 'egg', targetSeatId: 's1', count: 2500 });
    const metrics = layer.getMetrics();
    expect(metrics.launched).toBe(2000);
    expect(metrics.hits).toBe(2000);
    expect(hit).toHaveBeenCalledTimes(2000);
    expect(metrics.activeFlights).toBe(0);
    expect(canvas.dataset.activeFlights).toBe('0');
    layer.destroy();
    expect(canvas.removed).toBe(true);
  });

  it('clear cancels queued work and emoji pops remain a separate metric', () => {
    const { host } = installDomMock();
    const layer = new ItemFlightLayer({ prefersReducedMotion: true });
    layer.mount(host as unknown as HTMLElement);
    layer.emojiPop({ x: 20, y: 20 }, 'scroll', 9);
    expect(layer.getMetrics().emojiLaunched).toBe(9);
    layer.clear();
    expect(layer.getMetrics().activeEmojiPops).toBe(0);
  });

  it('handles 2000 capacity dropper pool smoothly without throwing', () => {
    const { host } = installDomMock();
    const layer = new ItemFlightLayer({ maxFlights: 2000, prefersReducedMotion: false });
    layer.mount(host as unknown as HTMLElement);
    layer.launch({ from: { x: 10, y: 10 }, to: { x: 100, y: 100 }, itemId: 'egg', count: 1999 });
    expect(layer.getPoolTotal()).toBe(1999);

    // 1999 + 1000 => top up to 2000
    layer.launch({ from: { x: 10, y: 10 }, to: { x: 100, y: 100 }, itemId: 'egg', count: 1000 });
    expect(layer.getPoolTotal()).toBe(2000);

    // Further launch at capacity does not throw
    expect(() => {
      layer.launch({ from: { x: 10, y: 10 }, to: { x: 100, y: 100 }, itemId: 'egg', count: 100 });
    }).not.toThrow();
    expect(layer.getPoolTotal()).toBe(2000);
    layer.destroy();
  });
});
