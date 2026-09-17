import { describe, expect, it } from 'vitest';
import { projectView } from '../../src/core/project-view';
import { makeAdapter } from '../fixtures/game';

/** 6F-1：座位手牌张数投影（Q1：hand + draftHand，不含 reserved） */
describe('6F-1 projectView.handCount', () => {
  it('他人 handCount = hand + draftHand，不含 reserved，不重复计 declared', () => {
    const a = makeAdapter(101);
    const st = a.mutableState();
    const s0 = st.seats[0]!;
    const s1 = st.seats[1]!;
    s0.hand = [
      { instanceId: 'h1', cardId: 'spy-1', number: 1 },
      { instanceId: 'h2', cardId: 'mystic-2', number: 2 },
    ];
    s0.draftHand = [{ instanceId: 'd1', cardId: 'thief-3', number: 3 }];
    s0.reserved = [
      { instanceId: 'r1', cardId: 'shinobi-1', number: 1 },
      { instanceId: 'r2', cardId: 'judge', number: null },
    ];
    // declared 是 hand 子集（引擎行为：declare 时 copy，不移出 hand 直到 reveal）
    s0.declared = [{ instanceId: 'h1', cardId: 'spy-1', number: 1 }];

    const view = projectView(st, s1.seatId)!;
    const seat0 = view.seats.find((s) => s.seatId === s0.seatId)!;
    expect(seat0.handCount).toBe(3);
  });

  it('投影不泄露他人暗信息：无手牌明细/面值/未公开身份', () => {
    const a = makeAdapter(102);
    const st = a.mutableState();
    const s0 = st.seats[0]!;
    const s1 = st.seats[1]!;
    s0.houseRevealed = false;
    s0.tokens.push({ instanceId: 'tok-secret', value: 4 });
    s0.hand = [{ instanceId: 'secret-h', cardId: 'spy-5', number: 5 }];

    const view = projectView(st, s1.seatId)!;
    const seat0 = view.seats.find((s) => s.seatId === s0.seatId)!;
    const raw = JSON.stringify(seat0);
    expect(seat0.publicHouseId).toBeUndefined();
    expect(seat0.honorTokenCount).toBe(s0.tokens.length);
    expect(raw).not.toContain('secret-h');
    expect(raw).not.toContain('spy-5');
    expect(raw).not.toContain('tok-secret');
    // 面值 4 是巧合风险：改用完整 token 实例结构断言
    expect(raw).not.toContain('instanceId');
  });

  it('草稿期 draftHand 计入张数，身份公开后 publicHouseId 可见', () => {
    const a = makeAdapter(103);
    const st = a.mutableState();
    const s0 = st.seats[0]!;
    const s1 = st.seats[1]!;
    s0.hand = [];
    s0.draftHand = [
      { instanceId: 'd1', cardId: 'spy-1', number: 1 },
      { instanceId: 'd2', cardId: 'spy-2', number: 2 },
      { instanceId: 'd3', cardId: 'spy-3', number: 3 },
    ];
    s0.houseRevealed = true;

    const view = projectView(st, s1.seatId)!;
    const seat0 = view.seats.find((s) => s.seatId === s0.seatId)!;
    expect(seat0.handCount).toBe(3);
    expect(seat0.publicHouseId).toBe(s0.house);
  });
});
