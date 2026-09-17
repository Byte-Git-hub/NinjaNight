/**
 * 6G-2 EffectNet 批处理单测（node 环境，无 DOM）：
 * 50ms 合并 / 10 条上限 / comboId 分组 / 镜像限频回退。setTimeout 用 fake timers 驱动。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EffectNet, type EffectSocket } from '../../src/net/effects';

function makeNet(connected = true) {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  let now = 1_000_000;
  const net: EffectSocket = {
    isSocketConnected: connected,
    onSocketEvent: vi.fn(),
    offSocketEvent: vi.fn(),
    emitVoice: vi.fn((event: string, payload: Record<string, unknown>) => {
      emitted.push({ event, payload });
    }),
  };
  const fx = new EffectNet(net, { now: () => now });
  return {
    fx,
    emitted,
    net,
    setNow: (t: number) => {
      now = t;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('EffectNet batching', () => {
  it('50ms 窗口合并：3 连点只发一次 effect.send，3 条一批', () => {
    const { fx, emitted } = makeNet();
    fx.attach();
    expect(fx.send('s1', 'egg')).toBe('sent');
    expect(fx.send('s1', 'sakura')).toBe('sent');
    expect(fx.send('s2', 'tea')).toBe('sent');
    expect(fx.pendingCount).toBe(3);
    expect(emitted).toHaveLength(0);
    vi.advanceTimersByTime(50);
    expect(emitted).toHaveLength(1);
    const payload = emitted[0]!.payload as { items: unknown[] };
    expect(emitted[0]!.event).toBe('effect.send');
    expect(payload.items).toHaveLength(3);
    expect(fx.pendingCount).toBe(0);
  });

  it('单批上限 10 条：12 条入队只发 10 条，溢出丢弃', () => {
    const { fx, emitted, setNow } = makeNet();
    fx.attach();
    for (let i = 0; i < 10; i += 1) {
      expect(fx.send('s1', 'egg')).toBe('sent');
    }
    // 滑过 1s 镜像窗后追加 2 条（镜像放行），队列积压 12 条
    setNow(1_000_000 + 1001);
    expect(fx.send('s1', 'egg')).toBe('sent');
    expect(fx.send('s1', 'egg')).toBe('sent');
    expect(fx.pendingCount).toBe(12);
    vi.advanceTimersByTime(50);
    expect(emitted).toHaveLength(1);
    const payload = emitted[0]!.payload as { items: unknown[] };
    expect(payload.items).toHaveLength(10);
    expect(fx.pendingCount).toBe(0);
  });

  it('同目标同物品 1.5s 内同 comboId，超窗换新组', () => {
    const { fx, emitted, setNow } = makeNet();
    fx.attach();
    fx.send('s1', 'egg');
    vi.advanceTimersByTime(50);
    setNow(1_000_000 + 1000);
    fx.send('s1', 'egg');
    vi.advanceTimersByTime(50);
    setNow(1_000_000 + 3000);
    fx.send('s1', 'egg');
    vi.advanceTimersByTime(50);
    const combos = emitted.flatMap((e) => {
      const p = e.payload as { items: Array<{ comboId: string }> };
      return p.items.map((i) => i.comboId);
    });
    expect(combos).toHaveLength(3);
    expect(combos[0]).toBe(combos[1]);
    expect(combos[2]).not.toBe(combos[0]);
  });

  it('镜像限频：1s 内第 11 条只本地渲染（local-only），不发网', () => {
    const { fx, emitted } = makeNet();
    fx.attach();
    for (let i = 0; i < 10; i += 1) {
      expect(fx.send('s1', 'egg')).toBe('sent');
    }
    expect(fx.send('s1', 'egg')).toBe('local-only');
    vi.advanceTimersByTime(50);
    const total = emitted.flatMap((e) => (e.payload as { items: unknown[] }).items);
    expect(total).toHaveLength(10);
  });

  it('离线/非法物品 → local-only，不发网', () => {
    const off = makeNet(false);
    off.fx.attach();
    expect(off.fx.send('s1', 'egg')).toBe('local-only');
    const { fx, emitted } = makeNet();
    fx.attach();
    expect(fx.send('s1', 'nuke' as 'egg')).toBe('local-only');
    expect(fx.send('', 'egg')).toBe('local-only');
    vi.advanceTimersByTime(200);
    expect(emitted).toHaveLength(0);
    expect(off.emitted).toHaveLength(0);
  });
});
