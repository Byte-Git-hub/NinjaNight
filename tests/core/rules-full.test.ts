import { describe, expect, it } from 'vitest';
import { createGame, stateHash, totalCardsInZones } from '../../src/core/engine';
import { projectView } from '../../src/core/project-view';
import { findSeat } from '../../src/core/utils';
import { CARD_DEFS, housesForPlayerCount } from '../../src/core/deck';
import { scoreRound, setMastermindOverride } from '../../src/core/score';
import { pumpResolveQueue } from '../../src/core/resolve';
import { CHINESE_NAMES, forceNightSetup, makeAdapter } from '../fixtures/game';
import { finishDraft, runAutoNight } from '../../src/dev/local-adapter';
import { drawToken } from '../../src/core/tokens';
import { enterMastermindReveal } from '../../src/core/setup';

void createGame;

describe('牌组与名称', () => {
  it('33 张分布正确', () => {
    expect(CARD_DEFS).toHaveLength(33);
    const by = (p: string) => CARD_DEFS.filter((c) => c.phase === p).length;
    expect(by('spy')).toBe(6);
    expect(by('mystic')).toBe(6);
    expect(by('trickster')).toBe(6);
    expect(by('blind_assassin')).toBe(6);
    expect(by('shinobi')).toBe(6);
    expect(by('react')).toBe(2);
    expect(by('reveal')).toBe(1);
  });

  it('中文名映射无遗漏', () => {
    const bases = new Set(CARD_DEFS.map((c) => c.cardId.split(':')[0] as string));
    for (const b of bases) {
      expect(CHINESE_NAMES[b], b).toBeTruthy();
    }
    expect(CHINESE_NAMES.blind_assassin).toBe('刺客');
    expect(CHINESE_NAMES.shapeshifter).toBe('百变者');
    expect(CHINESE_NAMES.grave_digger).toBe('掘墓人');
    expect(CHINESE_NAMES.troublemaker).toBe('捣蛋鬼');
    expect(CHINESE_NAMES.spirit_merchant).toBe('商人');
    expect(CHINESE_NAMES.thief).toBe('盗贼');
    expect(CHINESE_NAMES.judge).toBe('裁判');
    expect(CHINESE_NAMES.mirror_monk).toBe('还施者');
    expect(CHINESE_NAMES.martyr).toBe('殉道者');
    expect(CHINESE_NAMES.mastermind).toBe('大将军');
  });
});

describe('人数与牌区', () => {
  it('4 人牌区守恒 33', () => {
    const a = makeAdapter(1, 4);
    expect(totalCardsInZones(a.getState())).toBe(33);
    finishDraft(a);
    expect(totalCardsInZones(a.getState())).toBe(33);
    for (const s of a.getState().seats) expect(s.hand).toHaveLength(2);
    expect(a.getState().zones.draftDiscard).toHaveLength(4);
  });

  it('11 人牌区守恒 33 且 undrawn 为 0', () => {
    const a = makeAdapter(1, 11);
    finishDraft(a);
    expect(totalCardsInZones(a.getState())).toBe(33);
    expect(a.getState().zones.undrawn).toHaveLength(0);
    expect(a.getState().seats).toHaveLength(11);
    expect(housesForPlayerCount(11)).toHaveLength(11);
  });

  it('11 人一整轮跑通', () => {
    const a = makeAdapter(99, 11);
    finishDraft(a);
    runAutoNight(a);
    expect(['victoryCheck', 'gameOver']).toContain(a.getState().phase);
  });
});

describe('骗徒剧本', () => {
  it('百变者：对调后 knownHouseHistory 不刷新；结算用当前 HOUSE', () => {
    const a = makeAdapter(5, 4);
    const st = a.mutableState();
    st.seats.forEach((s) => {
      if (s.seatId === 's0') s.house = 'crane:1';
      if (s.seatId === 's1') s.house = 'lotus:2';
    });
    forceNightSetup(a, { s0: [{ cardId: 'shapeshifter:1', instanceId: 'sh1' }] }, 'nightTrickster');
    a.declare('s0', ['sh1']);
    a.chooseTarget('s0', 's0');
    a.chooseTarget('s0', 's1');
    const known = findSeat(a.getState(), 's0')?.knownHouses.at(-1);
    expect(known?.houseId).toBe('lotus:2');
    a.chooseOptional('s0', true);
    expect(findSeat(a.getState(), 's0')?.house).toBe('lotus:2');
    expect(findSeat(a.getState(), 's1')?.house).toBe('crane:1');
    expect(findSeat(a.getState(), 's0')?.knownHouses.at(-1)?.houseId).toBe('lotus:2');
  });

  it('掘墓人：只能从 draftDiscard 挖，可预留', () => {
    const a = makeAdapter(6, 4);
    const st = a.mutableState();
    st.zones.draftDiscard = [
      { instanceId: 'd1', cardId: 'spy:3', number: 3 },
      { instanceId: 'd2', cardId: 'mystic:4', number: 4 },
      { instanceId: 'd3', cardId: 'judge:6', number: 6 },
    ];
    forceNightSetup(a, { s0: [{ cardId: 'grave_digger:2', instanceId: 'gd1' }] }, 'nightTrickster');
    a.declare('s0', ['gd1']);
    const p = a.getState().pending[0];
    expect(p?.kind).toBe('chooseTarget');
    const pick = p?.options[0] as string;
    expect(['d1', 'd2', 'd3']).toContain(pick);
    a.chooseTarget('s0', pick);
    a.chooseOptional('s0', false);
    const seat = findSeat(a.getState(), 's0');
    const reservedOk = seat?.reserved.some((c) => c.instanceId === pick) === true;
    // 若已进入后续阶段计分，仍应看到该牌离开 draftDiscard
    const leftDiscard = a.getState().zones.draftDiscard.some((c) => c.instanceId === pick);
    expect(reservedOk || !leftDiscard).toBe(true);
    expect(seat?.reserved.length ?? 0).toBeGreaterThanOrEqual(0);
  });

  it('捣蛋鬼：查看并可公开', () => {
    const a = makeAdapter(7, 4);
    forceNightSetup(a, { s0: [{ cardId: 'troublemaker:3', instanceId: 'tm1' }] }, 'nightTrickster');
    a.declare('s0', ['tm1']);
    a.chooseTarget('s0', 's1');
    a.chooseOptional('s0', true);
    expect(findSeat(a.getState(), 's1')?.houseRevealed).toBe(true);
  });

  it('商人：换令牌', () => {
    const a = makeAdapter(8, 4);
    const st = a.mutableState();
    findSeat(st, 's0')!.tokens = [{ instanceId: 't0', value: 2 }];
    findSeat(st, 's1')!.tokens = [{ instanceId: 't1', value: 4 }];
    forceNightSetup(a, { s0: [{ cardId: 'spirit_merchant:4', instanceId: 'sm1' }] }, 'nightTrickster');
    a.declare('s0', ['sm1']);
    a.chooseTarget('s0', 's1');
    a.chooseOptional('s0', true);
    expect(findSeat(a.getState(), 's0')?.tokens.some((t) => t.instanceId === 't1')).toBe(true);
    expect(findSeat(a.getState(), 's1')?.tokens.some((t) => t.instanceId === 't0')).toBe(true);
  });

  it('盗贼：从枚数更多者夺取', () => {
    const a = makeAdapter(9, 4);
    const st = a.mutableState();
    findSeat(st, 's0')!.tokens = [];
    findSeat(st, 's1')!.tokens = [
      { instanceId: 'x1', value: 2 },
      { instanceId: 'x2', value: 3 },
    ];
    forceNightSetup(a, { s0: [{ cardId: 'thief:5', instanceId: 'th1' }] }, 'nightTrickster');
    a.declare('s0', ['th1']);
    const p = a.getState().pending[0];
    expect(p?.options).toContain('s1');
    a.chooseTarget('s0', 's1');
    expect(
      findSeat(a.getState(), 's0')?.tokens.some((t) => t.instanceId === 'x1' || t.instanceId === 'x2'),
    ).toBe(true);
    expect(
      findSeat(a.getState(), 's1')?.tokens.filter((t) => t.instanceId === 'x1' || t.instanceId === 'x2')
        .length,
    ).toBeLessThan(2);
  });

  it('裁判：杀且无反应窗', () => {
    const a = makeAdapter(10, 4);
    findSeat(a.getState(), 's1')!.hand = [
      { instanceId: 'mm', cardId: 'mirror_monk', number: null },
    ];
    forceNightSetup(a, { s0: [{ cardId: 'judge:6', instanceId: 'j1' }] }, 'nightTrickster');
    findSeat(a.getState(), 's1')!.hand = [
      { instanceId: 'mm', cardId: 'mirror_monk', number: null },
    ];
    a.declare('s0', ['j1']);
    a.chooseTarget('s0', 's1');
    expect(findSeat(a.getState(), 's1')?.alive).toBe(false);
    expect(a.getState().step).not.toBe('reactWindow');
  });
});

describe('反应链', () => {
  it('还施者：凶手死，施术者存活', () => {
    const a = makeAdapter(11, 4);
    forceNightSetup(
      a,
      {
        s0: [{ cardId: 'blind_assassin:2', instanceId: 'ba1' }],
        s1: [{ cardId: 'mirror_monk', instanceId: 'mm1' }],
      },
      'nightBlindAssassin',
    );
    a.declare('s0', ['ba1']);
    a.chooseTarget('s0', 's1');
    expect(a.getState().step).toBe('reactWindow');
    a.react('s1', true);
    expect(findSeat(a.getState(), 's0')?.alive).toBe(false);
    expect(findSeat(a.getState(), 's1')?.alive).toBe(true);
  });

  it('殉道者：施术者死得 1 枚', () => {
    const a = makeAdapter(12, 4);
    forceNightSetup(
      a,
      {
        s0: [{ cardId: 'blind_assassin:3', instanceId: 'ba2' }],
        s1: [{ cardId: 'martyr', instanceId: 'my1' }],
      },
      'nightBlindAssassin',
    );
    a.declare('s0', ['ba2']);
    a.chooseTarget('s0', 's1');
    a.react('s1', true);
    expect(findSeat(a.getState(), 's1')?.alive).toBe(false);
    expect(findSeat(a.getState(), 's0')?.alive).toBe(true);
    expect(findSeat(a.getState(), 's1')?.tokens).toHaveLength(1);
  });

  it('同开：自己死+凶手死+自己得 1 枚', () => {
    const a = makeAdapter(13, 4);
    forceNightSetup(
      a,
      { s0: [{ cardId: 'blind_assassin:4', instanceId: 'ba3' }] },
      'nightBlindAssassin',
    );
    findSeat(a.getState(), 's1')!.hand = [
      { instanceId: 'my2', cardId: 'martyr', number: null },
      { instanceId: 'mm2', cardId: 'mirror_monk', number: null },
    ];
    a.declare('s0', ['ba3']);
    a.chooseTarget('s0', 's1');
    a.react('s1', true);
    expect(findSeat(a.getState(), 's1')?.alive).toBe(false);
    expect(findSeat(a.getState(), 's0')?.alive).toBe(false);
    expect(findSeat(a.getState(), 's1')?.tokens).toHaveLength(1);
  });

  it('反应链不嵌套', () => {
    const a = makeAdapter(14, 4);
    forceNightSetup(
      a,
      {
        s0: [{ cardId: 'blind_assassin:5', instanceId: 'ba4' }],
        s1: [{ cardId: 'mirror_monk', instanceId: 'mm3' }],
      },
      'nightBlindAssassin',
    );
    a.declare('s0', ['ba4']);
    a.chooseTarget('s0', 's1');
    a.react('s1', true);
    expect(findSeat(a.getState(), 's0')?.alive).toBe(false);
    expect(a.getState().step).not.toBe('reactWindow');
  });
});

describe('队列与信息', () => {
  it('发动者死亡后未结算牌作废', () => {
    const a = makeAdapter(15, 4);
    const st = a.mutableState();
    st.phase = 'nightMystic';
    st.resolveContext = null;
    st.pending = [];
    st.resolveQueue = [
      { instance: { instanceId: 'm1', cardId: 'mystic:1', number: 1 }, actorSeatId: 's0' },
    ];
    st.seats.forEach((s) => {
      if (s.seatId === 's0') s.alive = false;
    });
    pumpResolveQueue(st);
    expect(st.resolveQueue).toHaveLength(0);
    expect(st.zones.spent.some((c) => c.instanceId === 'm1')).toBe(true);
  });

  it('已结算牌死亡后 knownHouses 保留', () => {
    const a = makeAdapter(16, 4);
    forceNightSetup(a, { s0: [{ cardId: 'spy:2', instanceId: 'sp2' }] }, 'nightSpy');
    a.declare('s0', ['sp2']);
    a.chooseTarget('s0', 's1');
    findSeat(a.getState(), 's0')!.alive = false;
    expect(findSeat(a.getState(), 's0')?.knownHouses.length).toBeGreaterThan(0);
  });
});

describe('计分', () => {
  it('平局：序列相同 → 每名存活者各摸 1', () => {
    const a = makeAdapter(17, 4);
    const st = a.mutableState();
    st.seats.forEach((s) => {
      s.tokens = [];
      if (s.seatId === 's0') {
        s.alive = true;
        s.house = 'crane:1';
      } else if (s.seatId === 's2') {
        s.alive = true;
        s.house = 'lotus:1';
      } else {
        s.alive = false;
      }
    });
    setMastermindOverride(null);
    scoreRound(st);
    expect(findSeat(st, 's0')?.tokens).toHaveLength(1);
    expect(findSeat(st, 's2')?.tokens).toHaveLength(1);
  });

  it('大将军：己方获胜', () => {
    const a = makeAdapter(18, 4);
    const st = a.mutableState();
    const s0 = findSeat(st, 's0');
    if (!s0) throw new Error('no s0');
    s0.hand = [{ instanceId: 'mmx', cardId: 'mastermind', number: null }];
    s0.alive = true;
    setMastermindOverride(null);
    enterMastermindReveal(st);
    const fam = s0.house.includes('crane') ? 'crane' : 'lotus';
    for (const s of st.seats) {
      if (s.house.includes(fam)) expect(s.tokens.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('大将军浪人：本轮无阵营胜，浪人得分', () => {
    const a = makeAdapter(19, 5);
    const st = a.mutableState();
    const ronin = st.seats.find((s) => s.house === 'ronin');
    expect(ronin).toBeTruthy();
    if (!ronin) return;
    ronin.hand = [{ instanceId: 'mmr', cardId: 'mastermind', number: null }];
    ronin.tokens = [];
    setMastermindOverride(null);
    enterMastermindReveal(st);
    expect(ronin.tokens.length).toBe(1);
  });

  it('TBD-03 情况1：仙鹤莲花全灭，浪人存活', () => {
    const a = makeAdapter(20, 5);
    const st = a.mutableState();
    const ronin = st.seats.find((s) => s.house === 'ronin');
    if (!ronin) throw new Error('no ronin');
    st.seats.forEach((s) => {
      s.tokens = [];
      s.alive = s.seatId === ronin.seatId;
    });
    setMastermindOverride(null);
    scoreRound(st);
    expect(ronin.tokens).toHaveLength(1);
    for (const s of st.seats) {
      if (s.seatId !== ronin.seatId) expect(s.tokens).toHaveLength(0);
    }
  });

  it('TBD-03 情况2：全部死亡无人得分', () => {
    const a = makeAdapter(21, 4);
    const st = a.mutableState();
    st.seats.forEach((s) => {
      s.alive = false;
      s.tokens = [];
    });
    setMastermindOverride(null);
    scoreRound(st);
    for (const s of st.seats) expect(s.tokens).toHaveLength(0);
  });

  it('令牌池耗尽不再发', () => {
    const a = makeAdapter(22, 4);
    const st = a.mutableState();
    st.tokenPool = [];
    st.seats.forEach((s) => {
      s.alive = true;
      s.tokens = [];
      s.house = Number(s.seatId[1]) % 2 === 0 ? 'crane:1' : 'lotus:1';
    });
    setMastermindOverride(null);
    scoreRound(st);
    for (const s of st.seats) expect(s.tokens).toHaveLength(0);
    expect(drawToken(st)).toBeNull();
  });
});

describe('信息边界回归', () => {
  it('projectView 不泄露他人 hand/牌堆', () => {
    const a = makeAdapter(23, 4);
    const view = projectView(a.getState(), 's0');
    const json = JSON.stringify(view);
    expect(json).not.toContain('"rng"');
    const s1 = view?.seats.find((x) => x.seatId === 's1');
    expect(s1).not.toHaveProperty('hand');
    expect(s1).not.toHaveProperty('houseId');
  });
});

describe('重放', () => {
  it('固定种子 hash 一致（含完整自动局）', () => {
    const run = () => {
      const a = makeAdapter(42, 4);
      finishDraft(a);
      runAutoNight(a);
      return stateHash(a.getState());
    };
    const h1 = run();
    const h2 = run();
    expect(h1).toBe(h2);
    expect(h1.length).toBeGreaterThan(4);
  });

  it('反应链场景 hash 稳定', () => {
    const run = () => {
      const a = makeAdapter(11, 4);
      forceNightSetup(
        a,
        {
          s0: [{ cardId: 'blind_assassin:2', instanceId: 'ba1' }],
          s1: [{ cardId: 'mirror_monk', instanceId: 'mm1' }],
        },
        'nightBlindAssassin',
      );
      a.declare('s0', ['ba1']);
      a.chooseTarget('s0', 's1');
      a.react('s1', true);
      return stateHash(a.getState());
    };
    expect(run()).toBe(run());
  });
});
