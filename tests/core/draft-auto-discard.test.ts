import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from '../../src/core/engine';
import type { GameState } from '../../src/core/game-state';

/** 用 options[0] 逐座位走完当前 draft pending，直到离开 draftPick1/2 */
function driveDraftPick(st: GameState): { state: GameState; visited: string[] } {
  let cur = st;
  const visited: string[] = [cur.phase];
  let guard = 0;
  while ((cur.phase === 'draftPick1' || cur.phase === 'draftPick2') && guard < 50) {
    guard += 1;
    for (const p of [...cur.pending]) {
      if (p.kind !== 'draftPick') continue;
      const seat = cur.seats.find((s) => s.seatId === p.seatId);
      if (!seat) continue;
      const opt = p.options[0];
      if (!opt) continue;
      const r = applyCommand(cur, {
        commandId: `t-${cur.phase}-${p.seatId}-${cur.eventSeq}`,
        roomCode: cur.roomCode,
        seatToken: seat.seatToken,
        windowId: p.id,
        type: 'draft.pick',
        payload: { cardInstanceId: opt },
      });
      if (!r.ok) throw new Error(`draft.pick rejected: ${JSON.stringify(r)}`);
      cur = r.state;
    }
    if (!visited.includes(cur.phase)) visited.push(cur.phase);
  }
  return { state: cur, visited };
}

describe('6F-8：第二次选牌后自动弃牌', () => {
  it('4 人局走完 draftPick2：每座位弃 1 张、无 pending、直进夜晚', () => {
    const { state: st, visited } = driveDraftPick(createGame({ seed: 3, playerCount: 4 }));
    // 从未进入 draftDiscard 阶段
    expect(visited).not.toContain('draftDiscard');
    // 直进夜晚
    expect(st.phase.startsWith('night')).toBe(true);
    // 无 draft 相关待办（进夜晚后 nightSpy 的 declareCards pending 属于下一阶段，允许存在）
    expect(st.pending.some((p) => p.kind === 'draftPick' || p.kind === 'draftDiscard')).toBe(false);
    // 每座位手牌 2 张、draftHand 清空、弃牌区共 4 张（1 张/座位）
    for (const s of st.seats) {
      expect(s.hand).toHaveLength(2);
      expect(s.draftHand).toHaveLength(0);
    }
    expect(st.zones.draftDiscard).toHaveLength(4);
    // 弃牌事件与座位一一对应
    const discards = st.events.filter((e) => e.type === 'draft.cardDiscarded');
    expect(discards).toHaveLength(4);
    expect(new Set(discards.map((e) => (e.payload as { seatId: string }).seatId)).size).toBe(4);
  });

  it('旧 draft.discard 指令在新流程下被 phaseMismatch 拒绝', () => {
    const { state: st } = driveDraftPick(createGame({ seed: 3, playerCount: 4 }));
    const seat = st.seats[0];
    if (!seat) throw new Error('no seat');
    const r = applyCommand(st, {
      commandId: 't-stale-discard',
      roomCode: st.roomCode,
      seatToken: seat.seatToken,
      windowId: st.windowId,
      type: 'draft.discard',
      payload: { cardInstanceId: 'whatever' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('phaseMismatch');
  });
});
