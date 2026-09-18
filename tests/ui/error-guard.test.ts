import { describe, expect, it } from 'vitest';
import { ErrToastGate, shouldHandleImg } from '../../src/ui/error-guard';

describe('6J-2 错误边界纯逻辑', () => {
  it('ErrToastGate：5s 节流，只弹一次', () => {
    const g = new ErrToastGate(5000);
    expect(g.allow(1000)).toBe(true);
    expect(g.allow(2000)).toBe(false);
    expect(g.allow(5999)).toBe(false);
    expect(g.allow(6000)).toBe(true);
  });

  it('shouldHandleImg：卡面不管，其余兜底', () => {
    expect(shouldHandleImg('card-art')).toBe(false);
    expect(shouldHandleImg('card card-art sel')).toBe(false);
    expect(shouldHandleImg('face back')).toBe(true);
    expect(shouldHandleImg('fx-btn-img')).toBe(true);
    expect(shouldHandleImg('')).toBe(true);
  });
});
