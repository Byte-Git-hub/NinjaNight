/**
 * 6G-2 粒子纯逻辑单测（node 环境，无 DOM）：
 * ParticlePool 对象池复用 + ComboTracker 连击窗口。
 * Canvas 绘制由 e2e 覆盖（不测像素）。
 */
import { describe, expect, it } from 'vitest';
import { ComboTracker, ParticlePool } from '../../src/ui/effects/particles';
import { EFFECT_COMBO_WINDOW_MS, EFFECT_PARTICLE_MAX } from '../../src/shared/timeouts';

function dot() {
  return {
    x: 0, y: 0, vx: 0, vy: 0,
    maxLife: 1000, size: 2, color: '#fff', char: '', img: '', grav: 0,
  };
}

describe('ParticlePool', () => {
  it('对象池复用：容量固定，满时 spawn 返回 false', () => {
    const pool = new ParticlePool(4);
    expect(pool.capacity).toBe(4);
    expect(pool.spawn(dot())).toBe(true);
    expect(pool.spawn(dot())).toBe(true);
    expect(pool.spawn(dot())).toBe(true);
    expect(pool.spawn(dot())).toBe(true);
    expect(pool.aliveCount).toBe(4);
    expect(pool.spawn(dot())).toBe(false);
  });

  it('update 推进生命：到期回收槽位，可复用', () => {
    const pool = new ParticlePool(2);
    pool.spawn(dot());
    pool.spawn({ ...dot(), maxLife: 100 });
    expect(pool.update(50)).toBe(2);
    expect(pool.update(60)).toBe(1);
    expect(pool.aliveCount).toBe(1);
    // 回收后可再 spawn
    expect(pool.spawn(dot())).toBe(true);
    expect(pool.aliveCount).toBe(2);
  });

  it('默认容量 = EFFECT_PARTICLE_MAX（200），超限由调用方转 +N', () => {
    const pool = new ParticlePool();
    expect(pool.capacity).toBe(EFFECT_PARTICLE_MAX);
  });

  it('clear 一键清空', () => {
    const pool = new ParticlePool(4);
    pool.spawn(dot());
    pool.spawn(dot());
    pool.clear();
    expect(pool.aliveCount).toBe(0);
    expect(pool.spawn(dot())).toBe(true);
  });
});

describe('ComboTracker', () => {
  it('窗口内连续 hit 递增，超窗重置为 1', () => {
    const t = new ComboTracker();
    expect(t.hit('k', 1000)).toBe(1);
    expect(t.hit('k', 1000 + EFFECT_COMBO_WINDOW_MS - 1)).toBe(2);
    expect(t.hit('k', 1000 + EFFECT_COMBO_WINDOW_MS * 2)).toBe(1);
  });

  it('不同 key 独立计数', () => {
    const t = new ComboTracker();
    expect(t.hit('a', 0)).toBe(1);
    expect(t.hit('b', 0)).toBe(1);
    expect(t.hit('a', 100)).toBe(2);
    expect(t.get('b')).toBe(1);
    expect(t.get('none')).toBe(0);
  });
});
