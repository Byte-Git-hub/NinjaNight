/**
 * 6G-4a 尺寸常量锁定：所有物品/表情尺寸从 EFFECT_ICON_SIZE 取，不散落。
 */
import { describe, expect, it } from 'vitest';
import { EFFECT_ICON_SIZE, EFFECT_ITEMS } from '../../src/ui/effects/items';

describe('EFFECT_ICON_SIZE', () => {
  it('粒子 32 / 连击上限 48 / 预览 96 / 徽章 20', () => {
    expect(EFFECT_ICON_SIZE.particle).toBe(32);
    expect(EFFECT_ICON_SIZE.particleMax).toBe(48);
    expect(EFFECT_ICON_SIZE.preview).toBe(96);
    expect(EFFECT_ICON_SIZE.badge).toBe(20);
  });

  it('连击上限大于常规粒子（放大有意义）', () => {
    expect(EFFECT_ICON_SIZE.particleMax).toBeGreaterThan(EFFECT_ICON_SIZE.particle);
  });

  it('9 物品全部走切图（无 emoji 字段残留）', () => {
    expect(EFFECT_ITEMS).toHaveLength(9);
    for (const m of EFFECT_ITEMS) {
      expect(m.img).toMatch(/^\/assets\/items\/\w+\.webp$/);
      expect((m as unknown as Record<string, unknown>)['emoji']).toBeUndefined();
    }
  });
});
