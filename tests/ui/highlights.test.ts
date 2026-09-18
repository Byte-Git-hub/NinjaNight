import { describe, expect, it } from 'vitest';
import { buildHighlight } from '../../src/ui/highlights/summary';

const nameOf = (id: string): string => ({ s0: '截图员', s1: 'AI-1', s2: 'AI-2' })[id] ?? id;

describe('6H-4 高光聚合', () => {
  it('空事件 → 空摘要', () => {
    expect(buildHighlight([], nameOf)).toEqual({ lines: [], full: [] });
  });

  it('击杀 + 获胜行', () => {
    const h = buildHighlight(
      [
        { type: 'night.playerDied', payload: { seatId: 's1' } },
        { type: 'score.roundWinner', payload: { winner: 'tie', awarded: [{ seatId: 's0', count: 1 }] } },
      ],
      nameOf,
    );
    expect(h.lines).toContain('💀 AI-1 出局');
    expect(h.lines.some((l) => l.includes('截图员+1'))).toBe(true);
  });

  it('平局文案中文', () => {
    const h = buildHighlight(
      [{ type: 'score.roundWinner', payload: { winner: 'tie', awarded: [] } }],
      nameOf,
    );
    expect(h.lines).toContain('🏆 本轮平局（存活者各得）获胜');
  });

  it('镜僧反杀/殉道文案', () => {
    const h = buildHighlight(
      [
        { type: 'night.playerDied', payload: { seatId: 's1', by: 'mirror_monk' } },
        { type: 'night.playerDied', payload: { seatId: 's2', by: 'martyr' } },
      ],
      nameOf,
    );
    expect(h.lines).toContain('💀 AI-1 被镜僧反杀');
    expect(h.lines).toContain('💀 AI-2 殉道而死');
  });

  it('查看类不进横幅、进完整日志', () => {
    const h = buildHighlight(
      [
        { type: 'night.targetChosen', payload: { actorSeatId: 's0', targetSeatId: 's1', cardId: 'spy:3' } },
        { type: 'night.cardsDeclared', payload: { cards: [{ actorSeatId: 's0', cardId: 'spy:3' }] } },
      ],
      nameOf,
    );
    expect(h.lines).toHaveLength(0);
    expect(h.full.length).toBeGreaterThan(0);
  });

  it('非查看行动进横幅（刺客），行数上限 5', () => {
    const evs = Array.from({ length: 6 }, (_, i) => ({
      type: 'night.targetChosen',
      payload: { actorSeatId: 's0', targetSeatId: 's1', cardId: `blind_assassin:${i + 1}` },
    }));
    const h = buildHighlight(evs, nameOf);
    expect(h.lines.length).toBeLessThanOrEqual(5);
    expect(h.lines[0]).toContain('刺客');
    expect(h.full).toHaveLength(6);
  });
});
