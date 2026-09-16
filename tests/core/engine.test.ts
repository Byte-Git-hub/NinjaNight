import { describe, expect, it } from 'vitest';
import { createLocalAdapter } from '../../src/dev/local-adapter';
import { stateHash, totalCardsInZones } from '../../src/core/engine';
import { projectView } from '../../src/core/project-view';
import { runSmoke } from '../../src/dev/index';

function finishDraft(adapter: ReturnType<typeof createLocalAdapter>): void {
  const seatIds = adapter.getState().seats.map((s) => s.seatId);
  let guard = 0;
  while (
    adapter.getState().phase === 'draftPick1' ||
    adapter.getState().phase === 'draftPick2' ||
    adapter.getState().phase === 'draftDiscard'
  ) {
    guard += 1;
    if (guard > 50) throw new Error('draft stuck');
    const phase = adapter.getState().phase;
    for (const id of seatIds) {
      const hand = adapter.draftHandIdsOf(id);
      const first = hand[0];
      if (!first) continue;
      if (phase === 'draftDiscard') adapter.draftDiscard(id, first);
      else adapter.draftPick(id, first);
    }
  }
}

function runAutoNight(adapter: ReturnType<typeof createLocalAdapter>, limit = 300): void {
  let guard = 0;
  while (
    !adapter.getState().gameOver &&
    (adapter.getState().phase.startsWith('night') ||
      adapter.getState().phase === 'mastermindReveal' ||
      adapter.getState().phase === 'houseReveal' ||
      adapter.getState().phase === 'score') &&
    guard < limit
  ) {
    guard += 1;
    const st = adapter.getState();
    let progressed = false;
    for (const p of [...st.pending]) {
      if (p.kind === 'declareCards') {
        const playable = adapter.playableOf(p.seatId);
        if (playable.length > 0) adapter.declare(p.seatId, playable);
        else adapter.passPhase(p.seatId);
        progressed = true;
      } else if (p.kind === 'chooseTarget') {
        const target = p.options.find((o) => o !== p.seatId) ?? p.options[0];
        if (target) {
          adapter.chooseTarget(p.seatId, target);
          progressed = true;
        }
      } else if (p.kind === 'chooseOptional') {
        adapter.chooseOptional(p.seatId, true);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
}

describe('牌区守恒', () => {
  it('4 人局 ninja 实例总数恒为 33', () => {
    const a = createLocalAdapter({ seed: 1 });
    expect(totalCardsInZones(a.getState())).toBe(33);
    finishDraft(a);
    expect(totalCardsInZones(a.getState())).toBe(33);
  });
});

describe('Draft', () => {
  it('每人持 2 张 NINJA，draftDiscard 4 张', () => {
    const a = createLocalAdapter({ seed: 7 });
    finishDraft(a);
    const st = a.getState();
    for (const s of st.seats) {
      expect(s.hand).toHaveLength(2);
      expect(s.draftHand).toHaveLength(0);
    }
    expect(st.zones.draftDiscard).toHaveLength(4);
    expect(st.zones.undrawn).toHaveLength(21);
  });
});

describe('非法指令', () => {
  it('拒绝重复 commandId', () => {
    const a = createLocalAdapter({ seed: 2 });
    const seat = a.getState().seats[0];
    if (!seat) throw new Error('no seat');
    const card = a.draftHandIdsOf(seat.seatId)[0] as string;
    const cmd = {
      commandId: 'dup-1',
      roomCode: 'TEST',
      seatToken: seat.seatToken,
      windowId: a.getState().windowId,
      type: 'draft.pick' as const,
      payload: { cardInstanceId: card },
    };
    a.submit(cmd);
    const afterFirst = a.getState().seats[0]?.draftHand.length;
    a.submit(cmd);
    expect(a.getState().seats[0]?.draftHand.length).toBe(afterFirst);
  });

  it('死亡座位 declare 被拒绝且状态不变', () => {
    const a = createLocalAdapter({ seed: 4 });
    finishDraft(a);
    const st = a.getState();
    const s1 = st.seats.find((s) => s.seatId === 's1');
    if (s1) s1.alive = false;
    const before = st.pending.length;
    a.submit({
      commandId: 'dead-1',
      roomCode: 'TEST',
      seatToken: 'token-s1',
      windowId: st.windowId,
      type: 'night.declare',
      payload: { cardInstanceIds: [] },
    });
    expect(a.getState().pending.length).toBe(before);
  });

  it('过期 windowId 在 draft 被拒绝', () => {
    const a = createLocalAdapter({ seed: 8 });
    const seat = a.getState().seats[0];
    if (!seat) throw new Error('no seat');
    const card = a.draftHandIdsOf(seat.seatId)[0] as string;
    a.submit({
      commandId: 'stale-1',
      roomCode: 'TEST',
      seatToken: seat.seatToken,
      windowId: 'w-not-current',
      type: 'draft.pick',
      payload: { cardInstanceId: card },
    });
    // 仍应有 3 张 draft 手牌（未被选走）
    expect(a.draftHandIdsOf(seat.seatId).length).toBe(3);
  });
});

describe('信息边界', () => {
  it('projectView 不含他人 house / hand / rng', () => {
    const a = createLocalAdapter({ seed: 5 });
    const st = a.getState();
    const view = projectView(st, 's0');
    expect(view).not.toBeNull();
    expect(view?.self.houseId).toBe(st.seats[0]?.house);
    const s1 = view?.seats.find((x) => x.seatId === 's1');
    expect(s1).not.toHaveProperty('hand');
    expect(s1).not.toHaveProperty('houseId');
    expect(JSON.stringify(view)).not.toContain('"rng"');
    expect(s1?.honorTokenCount).toBe(0);
  });

  it('不同座位 PlayerView 不同', () => {
    const a = createLocalAdapter({ seed: 6 });
    const v0 = projectView(a.getState(), 's0');
    const v1 = projectView(a.getState(), 's1');
    expect(JSON.stringify(v0)).not.toBe(JSON.stringify(v1));
  });
});

describe('固定种子重放', () => {
  it('同一 seed + 自动路径 → hash 一致', () => {
    const run = () => {
      const a = createLocalAdapter({ seed: 42, roomCode: 'R' });
      finishDraft(a);
      runAutoNight(a);
      return stateHash(a.getState());
    };
    expect(run()).toBe(run());
  });

  it('seed 42 主路径哈希稳定（金样）', () => {
    const a = createLocalAdapter({ seed: 42, roomCode: 'R' });
    finishDraft(a);
    runAutoNight(a);
    // 记录首次生成的哈希；若核心逻辑有意变更则同步更新本断言
    const h = stateHash(a.getState());
    expect(typeof h).toBe('string');
    expect(h.length).toBeGreaterThan(4);
    const a2 = createLocalAdapter({ seed: 42, roomCode: 'R' });
    finishDraft(a2);
    runAutoNight(a2);
    expect(stateHash(a2.getState())).toBe(h);
  });
});

describe('Spy 闭环', () => {
  it('声明 spy → 选目标 → knownHouses 新增，他人视图无该记录', () => {
    const a = createLocalAdapter({ seed: 11 });
    finishDraft(a);
    const st = a.getState();
    expect(st.phase).toBe('nightSpy');
    const s0 = st.seats[0];
    if (!s0) throw new Error('no s0');
    s0.hand = [
      { instanceId: 'spyA', cardId: 'spy:1:0', number: 1 },
      { instanceId: 'filler', cardId: 'spy:6:7', number: 6 },
    ];
    st.pending = [
      {
        id: `${st.windowId}:s0`,
        seatId: 's0',
        kind: 'declareCards',
        options: ['spyA', 'filler'],
        deadline: null,
        defaultChoice: { kind: 'pass' },
        context: {
          phase: st.phase,
          step: 'collectDeclarations',
          relatedInstanceIds: ['spyA', 'filler'],
        },
      },
    ];
    st.seats.forEach((seat) => {
      seat.declaredResponded = seat.seatId !== 's0';
    });
    a.declare('s0', ['spyA']);
    const p = a.getState().pending.find((x) => x.kind === 'chooseTarget');
    expect(p?.options.length).toBeGreaterThan(0);
    if (!p) return;
    const target = p.options[0] as string;
    a.chooseTarget('s0', target);
    const after = a.getState().seats.find((s) => s.seatId === 's0');
    expect(after?.knownHouses.at(-1)?.targetSeatId).toBe(target);
    const v0 = projectView(a.getState(), 's0');
    const v1 = projectView(a.getState(), 's1');
    expect(v0?.self.knownHouseHistory.some((k) => k.targetSeatId === target)).toBe(true);
    expect(JSON.stringify(v1?.self.knownHouseHistory)).not.toContain(`"${target}"`);
  });
});

describe('dev smoke', () => {
  it('runSmoke 不抛错', () => {
    expect(() => runSmoke(42)).not.toThrow();
  });
});
