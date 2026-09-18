import { describe, expect, it } from 'vitest';
import { validateReaction } from '../../src/server/reactions';

const inRoom = (id: string) => ['s0', 's1'].includes(id);

describe('reaction payload validation', () => {
  it('normalizes omitted count to one', () => {
    expect(validateReaction({ targetSeatId: 's1', kind: 'egg' }, inRoom)).toEqual({
      targetSeatId: 's1',
      kind: 'egg',
      count: 1,
    });
  });

  it('accepts emoji up to four UTF-16 code units', () => {
    expect(validateReaction({ targetSeatId: 's1', kind: 'emoji', emoji: '🎉', count: 3 }, inRoom)?.count).toBe(3);
    expect(validateReaction({ targetSeatId: 's1', kind: 'emoji', emoji: '12345', count: 1 }, inRoom)).toBeNull();
  });

  it('rejects invalid target, kind and count', () => {
    expect(validateReaction({ targetSeatId: 's9', kind: 'egg', count: 1 }, inRoom)).toBeNull();
    expect(validateReaction({ targetSeatId: 's1', kind: 'stone', count: 1 }, inRoom)).toBeNull();
    expect(validateReaction({ targetSeatId: 's1', kind: 'flower', count: 11 }, inRoom)).toBeNull();
  });
});
