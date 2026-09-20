import { describe, expect, it } from 'vitest';
import { findSeat } from '../../src/core/utils';
import { setMastermindOverride } from '../../src/core/score';
import { enterMastermindReveal } from '../../src/core/setup';
import { makeAdapter } from '../fixtures/game';

describe('score.mastermindRevealed（结算分步展示用）', () => {
  it('有持有者时发出 public 事件，family 与判定一致', () => {
    const a = makeAdapter(101, 4);
    const st = a.mutableState();
    const s0 = findSeat(st, 's0');
    if (!s0) throw new Error('no s0');
    s0.hand = [{ instanceId: 'mmx', cardId: 'mastermind', number: null }];
    s0.alive = true;
    setMastermindOverride(null);
    enterMastermindReveal(st);
    const evs = st.events.filter((e) => e.type === 'score.mastermindRevealed');
    expect(evs).toHaveLength(1);
    expect(evs[0]?.visibility).toBe('public');
    const fam = s0.house.includes('crane') ? 'crane' : 'lotus';
    expect(evs[0]?.payload).toMatchObject({ seatId: 's0', family: fam });
    // 恒在旧 roundWinner 之前一位
    const idxMm = st.events.indexOf(evs[0]!);
    const idxRw = st.events.findIndex((e) => e.type === 'score.roundWinner');
    expect(idxMm).toBe(idxRw - 1);
  });

  it('无持有者时不发', () => {
    const a = makeAdapter(102, 4);
    const st = a.mutableState();
    setMastermindOverride(null);
    enterMastermindReveal(st);
    expect(st.events.filter((e) => e.type === 'score.mastermindRevealed')).toHaveLength(0);
  });
});
