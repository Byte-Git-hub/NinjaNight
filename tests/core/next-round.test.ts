import { describe, expect, it } from 'vitest';
import { applyAllDefaults, totalCardsInZones } from '../../src/core/engine';
import { scoreRound } from '../../src/core/score';
import { forceNightSetup, makeAdapter } from '../fixtures/game';

describe('Bug2: victoryCheck 下一轮循环', () => {
  it('无人达 10 分 → applyAllDefaults 开启新一轮（round+1，tokens 保留，重发牌）', () => {
    const a = makeAdapter(21);
    const st = a.mutableState();
    st.pending = []; // 模拟已打完一轮（生产路径经 houseReveal 进来时 pending 为空）
    scoreRound(st);
    expect(st.phase).toBe('victoryCheck');
    expect(st.gameOver).toBe(false);
    expect(st.pending).toHaveLength(0);
    const tokensBefore = st.seats.map((s) => s.tokens.map((t) => t.value).sort());
    const totalBefore = tokensBefore.map((t) => t.reduce((x, y) => x + y, 0));

    const r = applyAllDefaults(st);
    expect(r.ok).toBe(true);
    expect(st.round).toBe(2);
    expect(st.phase).toBe('draftPick1');
    expect(st.pending.length).toBeGreaterThan(0);
    // tokens 原样保留
    st.seats.forEach((s, i) => {
      expect(s.tokens.map((t) => t.value).sort()).toEqual(tokensBefore[i]);
    });
    expect(
      st.seats.reduce((n, s) => n + s.tokens.reduce((x, t) => x + t.value, 0), 0),
    ).toBe(totalBefore.reduce((x, y) => x + y, 0));
    // 座位重置：存活、身份重发、draftHand 3 张、牌区守恒 33
    for (const s of st.seats) {
      expect(s.alive).toBe(true);
      expect(s.houseRevealed).toBe(false);
      expect(s.hand).toHaveLength(0);
      expect(s.draftHand).toHaveLength(3);
    }
    expect(totalCardsInZones(st)).toBe(33);
    expect(st.winners).toEqual([]);
  });

  it('已 gameOver 时 applyAllDefaults 不开新轮', () => {
    const a = makeAdapter(22);
    const st = a.mutableState();
    st.pending = [];
    st.seats[0]!.tokens.push(
      { instanceId: 't1', value: 4 },
      { instanceId: 't2', value: 4 },
      { instanceId: 't3', value: 4 },
    );
    scoreRound(st);
    expect(st.gameOver).toBe(true);
    expect(st.phase).toBe('gameOver');
    const r = applyAllDefaults(st);
    expect(r.ok).toBe(true);
    expect(st.round).toBe(1);
    expect(st.phase).toBe('gameOver');
  });

  it('上忍 optionalKill：choose=true 击杀，choose=false 放过', () => {
    const a = makeAdapter(23);
    forceNightSetup(
      a,
      { s0: [{ cardId: 'shinobi:2', instanceId: 'sk-1' }] },
      'nightShinobi',
    );
    a.declare('s0', ['sk-1']);
    a.chooseTarget('s0', 's1');
    const st = a.mutableState();
    expect(st.step).toBe('chooseOptional');
    a.chooseOptional('s0', true);
    expect(a.getState().seats[1]!.alive).toBe(false);

    const b = makeAdapter(24);
    forceNightSetup(b, { s0: [{ cardId: 'shinobi:2', instanceId: 'sk-2' }] }, 'nightShinobi');
    b.declare('s0', ['sk-2']);
    b.chooseTarget('s0', 's1');
    b.chooseOptional('s0', false);
    expect(b.getState().seats[1]!.alive).toBe(true);
  });
});
