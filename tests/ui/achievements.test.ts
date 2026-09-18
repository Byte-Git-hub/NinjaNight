import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../../src/ui/achievements/definitions';
import { loadAchievements, saveAchievements } from '../../src/ui/achievements/store';
import { AchievementTracker } from '../../src/ui/achievements/tracker';

function mem(initial?: string) {
  const data: Record<string, string> = {};
  if (initial !== undefined) data['ninja-night:achievements'] = initial;
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe('6H-3 成就定义与存储', () => {
  it('8 成就齐备', () => {
    expect(ACHIEVEMENTS).toHaveLength(8);
    expect(ACHIEVEMENTS.map((a) => a.id)).toContain('master');
  });

  it('空存储/坏 JSON 回空', () => {
    expect(loadAchievements(mem())).toEqual({ unlocked: {}, wins: 0 });
    expect(loadAchievements(mem('xxx'))).toEqual({ unlocked: {}, wins: 0 });
  });

  it('未知 id 不读入', () => {
    const s = loadAchievements(mem('{"unlocked":{"hacker":1},"wins":3}'));
    expect(s.unlocked).toEqual({});
    expect(s.wins).toBe(3);
  });

  it('保存可读回', () => {
    const st = mem();
    saveAchievements({ unlocked: { 'first-win': 123 }, wins: 1 }, st);
    expect(loadAchievements(st)).toEqual({ unlocked: { 'first-win': 123 }, wins: 1 });
  });
});

describe('6H-3 成就判定', () => {
  it('查看 3 个不同玩家 → 眼睛', () => {
    const t = new AchievementTracker(mem());
    expect(t.handleEvent('night.houseViewed', { viewerSeatId: 's0', targetSeatId: 's1' }, 's0', true)).toEqual([]);
    expect(t.handleEvent('night.ninjaViewed', { viewerSeatId: 's0', targetSeatId: 's2' }, 's0', true)).toEqual([]);
    expect(t.handleEvent('night.houseViewed', { viewerSeatId: 's0', targetSeatId: 's3' }, 's0', true)).toEqual(['eye-spy']);
    // 重复解锁不再触发
    expect(t.handleEvent('night.houseViewed', { viewerSeatId: 's0', targetSeatId: 's4' }, 's0', true)).toEqual([]);
  });

  it('他人查看不计入自己', () => {
    const t = new AchievementTracker(mem());
    expect(t.handleEvent('night.houseViewed', { viewerSeatId: 's1', targetSeatId: 's2' }, 's0', true)).toEqual([]);
  });

  it('刺客结算后他人死亡 → 初次见血；两次 → 双重刺客', () => {
    const t = new AchievementTracker(mem());
    expect(t.handleEvent('night.cardResolved', { actorSeatId: 's0', cardId: 'blind_assassin' }, 's0', true)).toEqual([]);
    expect(t.handleEvent('night.playerDied', { seatId: 's1' }, 's0', true)).toEqual(['first-kill']);
    expect(t.handleEvent('night.cardResolved', { actorSeatId: 's0', cardId: 'shinobi' }, 's0', true)).toEqual([]);
    expect(t.handleEvent('night.playerDied', { seatId: 's2' }, 's0', true)).toEqual(['double-kill']);
  });

  it('可选击杀直接计（上忍放过不计）', () => {
    const t = new AchievementTracker(mem());
    expect(t.handleEvent('night.optionalResolved', { actorSeatId: 's0', killed: true }, 's0', true)).toEqual(['first-kill']);
  });

  it('自己死亡不计击杀', () => {
    const t = new AchievementTracker(mem());
    t.handleEvent('night.cardResolved', { actorSeatId: 's0', cardId: 'shinobi' }, 's0', false);
    expect(t.handleEvent('night.playerDied', { seatId: 's0' }, 's0', false)).toEqual([]);
  });

  it('被砸 5 次 → 众矢之的', () => {
    const t = new AchievementTracker(mem());
    let out: string[] = [];
    for (let i = 0; i < 5; i += 1) out = t.hitByEffect();
    expect(out).toEqual(['target-dummy']);
  });

  it('终局：获胜 → 初胜 + wins 累计；10 分 → 富贵；未出牌存活 → 隐者', () => {
    const t = new AchievementTracker(mem());
    const out = t.handleEvent(
      'score.victory',
      { winners: ['s0'], scores: [{ seatId: 's0', score: 12 }] },
      's0',
      true,
    );
    expect(out).toContain('first-win');
    expect(out).toContain('rich');
    expect(out).toContain('hermit');
    expect(t.wins).toBe(1);
  });

  it('出过牌则无隐者；未获胜不计 wins', () => {
    const t = new AchievementTracker(mem());
    t.handleEvent('night.cardsDeclared', { cards: [{ actorSeatId: 's0', cardId: 'spy' }] }, 's0', true);
    const out = t.handleEvent('score.victory', { winners: ['s1'], scores: [{ seatId: 's0', score: 4 }] }, 's0', true);
    expect(out).not.toContain('hermit');
    expect(out).not.toContain('first-win');
    expect(t.wins).toBe(0);
  });

  it('累计 10 胜 → 忍界宗师', () => {
    const st = mem('{"unlocked":{},"wins":9}');
    const t = new AchievementTracker(st);
    const out = t.handleEvent('score.victory', { winners: ['s0'], scores: [] }, 's0', true);
    expect(out).toContain('master');
    expect(t.wins).toBe(10);
  });

  it('resetGame 清本局计数', () => {
    const t = new AchievementTracker(mem());
    t.hitByEffect();
    t.handleEvent('game.started', {}, 's0', true);
    let out: string[] = [];
    for (let i = 0; i < 4; i += 1) out = t.hitByEffect();
    expect(out).toEqual([]);
  });
});
