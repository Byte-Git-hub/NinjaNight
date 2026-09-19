import { describe, expect, it } from 'vitest';
import { botDecide } from '../../src/core/bot';
import { applyAllDefaults, stateHash } from '../../src/core/engine';
import { projectView } from '../../src/core/project-view';
import { findSeat } from '../../src/core/utils';
import type { LocalAdapter } from '../../src/dev/local-adapter';
import type { Command, SeatId } from '../../src/shared/types';
import { forceNightSetup, makeAdapter } from '../fixtures/game';

/**
 * 骗徒 6 牌全分支横扫 + 跨角色关键链 + 多种子整局不变式。
 * 只新增断言，不改任何实现（实现修复另起 commit）。
 */

function tokenOf(a: LocalAdapter, seatId: string): string {
  const seat = findSeat(a.getState(), seatId);
  if (!seat) throw new Error('no seat');
  return seat.seatToken;
}

function rejectsOf(a: LocalAdapter): string[] {
  const out: string[] = [];
  a.onReject((_id, reason) => out.push(reason));
  return out;
}

/** night.chooseTarget 原始提交（座位 / view_honor / tokenId / seen / random / no_swap 通吃） */
function rawChoose(a: LocalAdapter, seatId: string, opt: string, tag: string): void {
  const st = a.getState();
  const cmd: Command = {
    commandId: `sweep-${tag}-${seatId}-${opt}-${st.eventSeq}`,
    roomCode: st.roomCode,
    seatToken: tokenOf(a, seatId),
    windowId: st.windowId,
    type: 'night.chooseTarget',
    payload: { targetSeatId: opt as SeatId },
  };
  a.submit(cmd);
}

function rawOptional(a: LocalAdapter, seatId: string, choose: boolean, tag: string): void {
  const st = a.getState();
  const cmd: Command = {
    commandId: `sweep-${tag}-${seatId}-opt-${choose}-${st.eventSeq}`,
    roomCode: st.roomCode,
    seatToken: tokenOf(a, seatId),
    windowId: st.windowId,
    type: 'night.chooseOptional',
    payload: { choose },
  };
  a.submit(cmd);
}

function rawReact(a: LocalAdapter, seatId: string, react: boolean, tag: string): void {
  const st = a.getState();
  const cmd: Command = {
    commandId: `sweep-${tag}-${seatId}-react-${react}-${st.eventSeq}`,
    roomCode: st.roomCode,
    seatToken: tokenOf(a, seatId),
    windowId: st.windowId,
    type: 'react.decide',
    payload: { react },
  };
  a.submit(cmd);
}

function pendingKind(a: LocalAdapter): string | null {
  return a.getState().pending[0]?.kind ?? null;
}

/**
 * 刹车牌：s2 持上忍（骗徒/刺客阶段不可打出、无待办），本牌结算后引擎级联
 * 会停在上忍 déclar 窗口，不会一路冲进结算发分，令牌断言保持干净。
 */
const BRAKE = { cardId: 'shinobi:2', instanceId: 'brk-shinobi' };
type HandMap = Record<string, Array<{ cardId: string; instanceId: string }>>;
function braked(hands: HandMap): HandMap {
  return { ...hands, s2: [...(hands.s2 ?? []), BRAKE] };
}

function totalTokens(a: LocalAdapter): number {
  const st = a.getState();
  return st.seats.reduce((n, s) => n + s.tokens.length, 0) + st.tokenPool.length;
}

describe('骗徒横扫：百变者', () => {
  function setupShape() {
    const a = makeAdapter(5, 4);
    forceNightSetup(a, braked({ s0: [{ cardId: 'shapeshifter:1', instanceId: 'sh1' }] }), 'nightTrickster');
    const rejects = rejectsOf(a);
    a.declare('s0', ['sh1']);
    rawChoose(a, 's0', 's1', 'A');
    rawChoose(a, 's0', 's2', 'B');
    expect(rejects).toEqual([]);
    expect(pendingKind(a)).toBe('chooseOptional');
    return { a, rejects };
  }

  it('swap=true：对调成功、无公共泄漏、快照 append', () => {
    const { a, rejects } = setupShape();
    const h1 = findSeat(a.getState(), 's1')!.house;
    const h2 = findSeat(a.getState(), 's2')!.house;
    rawOptional(a, 's0', true, 'swap');
    expect(rejects).toEqual([]);
    expect(findSeat(a.getState(), 's1')!.house).toBe(h2);
    expect(findSeat(a.getState(), 's2')!.house).toBe(h1);
    // 施术者快照追加 2 条本轮记录
    const kh = findSeat(a.getState(), 's0')!.knownHouses.filter(
      (k) => k.round === a.getState().round,
    );
    expect(kh.length).toBe(2);
    // 第三方视角：无 houseViewed 私密事件、无快照、无 swapped
    const v3 = projectView(a.getState(), 's3')!;
    expect(v3.self.knownHouseHistory).toEqual([]);
    expect(v3.events.some((e) => e.type === 'night.houseViewed')).toBe(false);
    expect(v3.events.some((e) => (e.payload as { swapped?: boolean }).swapped === true)).toBe(false);
    // 施术者本人也看不到 swapped（server 可见性）
    const v0 = projectView(a.getState(), 's0')!;
    expect(v0.events.some((e) => (e.payload as { swapped?: boolean }).swapped === true)).toBe(false);
  });

  it('swap=false：身份保持', () => {
    const { a, rejects } = setupShape();
    const h1 = findSeat(a.getState(), 's1')!.house;
    const h2 = findSeat(a.getState(), 's2')!.house;
    rawOptional(a, 's0', false, 'keep');
    expect(rejects).toEqual([]);
    expect(findSeat(a.getState(), 's1')!.house).toBe(h1);
    expect(findSeat(a.getState(), 's2')!.house).toBe(h2);
  });

  it('死亡座位可被对调（裁定 C4）', () => {
    const a = makeAdapter(5, 4);
    forceNightSetup(a, braked({ s0: [{ cardId: 'shapeshifter:1', instanceId: 'sh1' }] }), 'nightTrickster');
    findSeat(a.mutableState(), 's1')!.alive = false;
    const rejects = rejectsOf(a);
    a.declare('s0', ['sh1']);
    rawChoose(a, 's0', 's1', 'A-dead');
    rawChoose(a, 's0', 's2', 'B');
    expect(rejects).toEqual([]);
    expect(pendingKind(a)).toBe('chooseOptional');
    const h1 = findSeat(a.getState(), 's1')!.house;
    const h2 = findSeat(a.getState(), 's2')!.house;
    rawOptional(a, 's0', true, 'swap-dead');
    expect(rejects).toEqual([]);
    expect(findSeat(a.getState(), 's1')!.house).toBe(h2);
    expect(findSeat(a.getState(), 's2')!.house).toBe(h1);
  });

  it('targetB 重复选 targetA 被拒绝', () => {
    const a = makeAdapter(5, 4);
    forceNightSetup(a, { s0: [{ cardId: 'shapeshifter:1', instanceId: 'sh1' }] }, 'nightTrickster');
    const rejects = rejectsOf(a);
    a.declare('s0', ['sh1']);
    rawChoose(a, 's0', 's1', 'A');
    rawChoose(a, 's0', 's1', 'B-dup');
    expect(rejects).toEqual(['illegalTarget']);
  });
});

describe('骗徒横扫：掘墓人', () => {
  function setupGrave(discard: Array<{ instanceId: string; cardId: string; number: number | null }>) {
    const a = makeAdapter(6, 4);
    a.mutableState().zones.draftDiscard = discard;
    forceNightSetup(a, braked({ s0: [{ cardId: 'grave_digger:2', instanceId: 'gd1' }] }), 'nightTrickster');
    return a;
  }

  it('弃牌不足 2 张直接作废', () => {
    const a = setupGrave([{ instanceId: 'd1', cardId: 'spy:3', number: 3 }]);
    const rejects = rejectsOf(a);
    a.declare('s0', ['gd1']);
    expect(rejects).toEqual([]);
    // 掘墓人作废：s0 无待办（级联停在刹车牌申报窗）
    expect(a.getState().pending.some((p) => p.seatId === 's0')).toBe(false);
  });

  it('挖过去牌立即打出：同阶段直接结算（spy 进目标选择）', () => {
    const a = setupGrave([
      { instanceId: 'd1', cardId: 'spy:3', number: 3 },
      { instanceId: 'd2', cardId: 'mystic:4', number: 4 },
    ]);
    const rejects = rejectsOf(a);
    a.declare('s0', ['gd1']);
    expect(pendingKind(a)).toBe('chooseTarget');
    rawChoose(a, 's0', 'd1', 'pick-spy');
    expect(pendingKind(a)).toBe('chooseOptional');
    rawOptional(a, 's0', true, 'play-now');
    expect(rejects).toEqual([]);
    // spy 立即结算：挂起的是 spy 的目标选择
    const p = a.getState().pending[0];
    expect(p?.kind).toBe('chooseTarget');
    expect(p?.context.cardId).toBe('spy:3');
    // 挖出的牌已离开中央
    expect(a.getState().zones.draftDiscard.some((c) => c.instanceId === 'd1')).toBe(false);
  });

  it('挖未来牌立即打出 → 进 reserved', () => {
    const a = setupGrave([
      { instanceId: 'd1', cardId: 'blind_assassin:2', number: 2 },
      { instanceId: 'd2', cardId: 'spy:3', number: 3 },
    ]);
    const rejects = rejectsOf(a);
    a.declare('s0', ['gd1']);
    rawChoose(a, 's0', 'd1', 'pick-ba');
    rawOptional(a, 's0', true, 'play-now-future');
    expect(rejects).toEqual([]);
    expect(findSeat(a.getState(), 's0')!.reserved.some((c) => c.instanceId === 'd1')).toBe(true);
  });

  it('reserve：留用且离开中央', () => {
    const a = setupGrave([
      { instanceId: 'd1', cardId: 'spy:3', number: 3 },
      { instanceId: 'd2', cardId: 'mystic:4', number: 4 },
    ]);
    const rejects = rejectsOf(a);
    a.declare('s0', ['gd1']);
    rawChoose(a, 's0', 'd2', 'pick-mystic');
    rawOptional(a, 's0', false, 'reserve');
    expect(rejects).toEqual([]);
    expect(findSeat(a.getState(), 's0')!.reserved.some((c) => c.instanceId === 'd2')).toBe(true);
    expect(a.getState().zones.draftDiscard.some((c) => c.instanceId === 'd2')).toBe(false);
  });

  it('非阶段牌立即打出 → 进 reserved', () => {
    const a = setupGrave([
      { instanceId: 'd1', cardId: 'mirror_monk', number: null },
      { instanceId: 'd2', cardId: 'spy:3', number: 3 },
    ]);
    const rejects = rejectsOf(a);
    a.declare('s0', ['gd1']);
    rawChoose(a, 's0', 'd1', 'pick-mirror');
    rawOptional(a, 's0', true, 'play-now-nonphase');
    expect(rejects).toEqual([]);
    expect(findSeat(a.getState(), 's0')!.reserved.some((c) => c.instanceId === 'd1')).toBe(true);
  });
});

describe('骗徒横扫：捣蛋鬼', () => {
  function setupTrouble() {
    const a = makeAdapter(7, 4);
    forceNightSetup(a, braked({ s0: [{ cardId: 'troublemaker:3', instanceId: 'tm1' }] }), 'nightTrickster');
    const rejects = rejectsOf(a);
    a.declare('s0', ['tm1']);
    rawChoose(a, 's0', 's1', 't');
    expect(pendingKind(a)).toBe('chooseOptional');
    return { a, rejects };
  }

  it('reveal：公开目标身份', () => {
    const { a, rejects } = setupTrouble();
    rawOptional(a, 's0', true, 'reveal');
    expect(rejects).toEqual([]);
    expect(findSeat(a.getState(), 's1')!.houseRevealed).toBe(true);
    const v2 = projectView(a.getState(), 's2')!;
    const ev = v2.events.find(
      (e) => e.type === 'house.revealed' && (e.payload as { seatId?: string }).seatId === 's1',
    );
    expect(ev).toBeTruthy();
    expect((ev!.payload as { houseId?: string }).houseId).toBe(findSeat(a.getState(), 's1')!.house);
  });

  it('hide：不公开', () => {
    const { a, rejects } = setupTrouble();
    rawOptional(a, 's0', false, 'hide');
    expect(rejects).toEqual([]);
    expect(findSeat(a.getState(), 's1')!.houseRevealed).toBe(false);
    const v2 = projectView(a.getState(), 's2')!;
    expect(
      v2.events.some(
        (e) => e.type === 'house.revealed' && (e.payload as { seatId?: string }).seatId === 's1',
      ),
    ).toBe(false);
  });
});

describe('骗徒横扫：商人', () => {
  function setupMerchant(
    s0Tokens: Array<{ instanceId: string; value: 2 | 3 | 4 }>,
    s1Tokens: Array<{ instanceId: string; value: 2 | 3 | 4 }>,
  ) {
    const a = makeAdapter(8, 4);
    findSeat(a.mutableState(), 's0')!.tokens = s0Tokens.map((t) => ({ ...t }));
    findSeat(a.mutableState(), 's1')!.tokens = s1Tokens.map((t) => ({ ...t }));
    forceNightSetup(a, braked({ s0: [{ cardId: 'spirit_merchant:4', instanceId: 'sm1' }] }), 'nightTrickster');
    const rejects = rejectsOf(a);
    a.declare('s0', ['sm1']);
    rawChoose(a, 's0', 's1', 'target');
    expect(pendingKind(a)).toBe('merchantChoose');
    return { a, rejects };
  }

  it('view_house + give + random：枚数守恒、事件脱敏', () => {
    const { a, rejects } = setupMerchant(
      [{ instanceId: 'g1', value: 2 }],
      [
        { instanceId: 't1', value: 4 },
        { instanceId: 't2', value: 3 },
      ],
    );
    rawChoose(a, 's0', 'view_house', 'view');
    expect(pendingKind(a)).toBe('merchantExchange');
    rawChoose(a, 's0', 'g1', 'give');
    expect(pendingKind(a)).toBe('merchantExchange');
    rawChoose(a, 's0', 'random', 'take');
    expect(rejects).toEqual([]);
    // 枚数守恒：s0 1 枚、s1 2 枚；id 全集不变
    expect(findSeat(a.getState(), 's0')!.tokens.length).toBe(1);
    expect(findSeat(a.getState(), 's1')!.tokens.length).toBe(2);
    const all = [
      ...findSeat(a.getState(), 's0')!.tokens,
      ...findSeat(a.getState(), 's1')!.tokens,
    ].map((t) => t.instanceId).sort();
    expect(all).toEqual(['g1', 't1', 't2']);
    // 公共 swapped 事件不带面值
    const v2 = projectView(a.getState(), 's2')!;
    const ev = v2.events.find((e) => e.type === 'score.honorAwarded');
    expect(ev).toBeTruthy();
    const keys = Object.keys(ev!.payload as object).sort();
    expect(keys).toEqual(['a', 'b', 'giveTokenId', 'swapped', 'takeTokenId', 'takeWasSeen']);
  });

  it('view_honor + seen：拿到刚看的那枚', () => {
    const { a, rejects } = setupMerchant(
      [{ instanceId: 'g1', value: 2 }],
      [
        { instanceId: 't1', value: 4 },
        { instanceId: 't2', value: 3 },
      ],
    );
    rawChoose(a, 's0', 'view_honor', 'view');
    const seenId = a.getState().resolveContext?.seenTokenId;
    expect(seenId).toBeTruthy();
    expect(pendingKind(a)).toBe('merchantExchange');
    rawChoose(a, 's0', 'g1', 'give');
    const takeOpts = a.getState().pending[0]?.options ?? [];
    expect(takeOpts).toContain('seen');
    rawChoose(a, 's0', 'seen', 'take');
    expect(rejects).toEqual([]);
    expect(findSeat(a.getState(), 's0')!.tokens.some((t) => t.instanceId === seenId)).toBe(true);
  });

  it('no_swap：双方令牌不动', () => {
    const { a, rejects } = setupMerchant(
      [{ instanceId: 'g1', value: 2 }],
      [{ instanceId: 't1', value: 4 }],
    );
    rawChoose(a, 's0', 'view_house', 'view');
    rawChoose(a, 's0', 'no_swap', 'give');
    expect(rejects).toEqual([]);
    expect(findSeat(a.getState(), 's0')!.tokens.map((t) => t.instanceId)).toEqual(['g1']);
    expect(findSeat(a.getState(), 's1')!.tokens.map((t) => t.instanceId)).toEqual(['t1']);
  });

  it('目标无令牌 + view_honor：直接结束，无交换窗', () => {
    const { a, rejects } = setupMerchant([{ instanceId: 'g1', value: 2 }], []);
    rawChoose(a, 's0', 'view_honor', 'view-empty');
    expect(rejects).toEqual([]);
    // 无交换窗（级联停在刹车牌的上忍申报窗，s0 已无待办）
    expect(a.getState().pending.some((p) => p.seatId === 's0')).toBe(false);
    expect(findSeat(a.getState(), 's0')!.tokens.map((t) => t.instanceId)).toEqual(['g1']);
  });

  it('自己无令牌：看完即结束', () => {
    const { a, rejects } = setupMerchant([], [{ instanceId: 't1', value: 4 }]);
    rawChoose(a, 's0', 'view_house', 'view-broke');
    expect(rejects).toEqual([]);
    expect(a.getState().pending.some((p) => p.seatId === 's0')).toBe(false);
  });

  it('目标仅 1 枚：random 等价 seen', () => {
    const { a, rejects } = setupMerchant(
      [{ instanceId: 'g1', value: 2 }],
      [{ instanceId: 't1', value: 4 }],
    );
    rawChoose(a, 's0', 'view_honor', 'view-single');
    expect(a.getState().resolveContext?.seenTokenId).toBe('t1');
    rawChoose(a, 's0', 'g1', 'give');
    rawChoose(a, 's0', 'random', 'take');
    expect(rejects).toEqual([]);
    expect(findSeat(a.getState(), 's0')!.tokens.some((t) => t.instanceId === 't1')).toBe(true);
    expect(findSeat(a.getState(), 's1')!.tokens.map((t) => t.instanceId)).toEqual(['g1']);
  });
});

describe('骗徒横扫：盗贼', () => {
  it('偷枚数多者：转移 1 枚 + 亮自己身份', () => {
    const a = makeAdapter(9, 4);
    findSeat(a.mutableState(), 's1')!.tokens = [
      { instanceId: 't1', value: 2 },
      { instanceId: 't2', value: 3 },
    ];
    forceNightSetup(a, braked({ s0: [{ cardId: 'thief:5', instanceId: 'th1' }] }), 'nightTrickster');
    const rejects = rejectsOf(a);
    a.declare('s0', ['th1']);
    const opts = a.getState().pending[0]?.options ?? [];
    expect(opts).toContain('s1');
    expect(opts).not.toContain('s0');
    rawChoose(a, 's0', 's1', 'steal');
    expect(rejects).toEqual([]);
    expect(findSeat(a.getState(), 's0')!.tokens.length).toBe(1);
    expect(findSeat(a.getState(), 's1')!.tokens.length).toBe(1);
    expect(findSeat(a.getState(), 's0')!.houseRevealed).toBe(true);
    const v2 = projectView(a.getState(), 's2')!;
    const ev = v2.events.find(
      (e) => e.type === 'house.revealed' && (e.payload as { seatId?: string }).seatId === 's0',
    );
    expect(ev).toBeTruthy();
  });

  it('无比自己富者：作废，不卡死', () => {
    const a = makeAdapter(9, 4);
    forceNightSetup(a, braked({ s0: [{ cardId: 'thief:5', instanceId: 'th1' }] }), 'nightTrickster');
    const rejects = rejectsOf(a);
    a.declare('s0', ['th1']);
    expect(rejects).toEqual([]);
    expect(a.getState().pending.some((p) => p.seatId === 's0')).toBe(false);
  });

  it('偷到过 10 分不立即获胜（回合结束才检查）', () => {
    const a = makeAdapter(9, 4);
    findSeat(a.mutableState(), 's0')!.tokens = [
      { instanceId: 'g1', value: 4 },
      { instanceId: 'g2', value: 4 },
    ];
    findSeat(a.mutableState(), 's1')!.tokens = [
      { instanceId: 't1', value: 2 },
      { instanceId: 't2', value: 2 },
      { instanceId: 't3', value: 2 },
    ];
    forceNightSetup(a, braked({ s0: [{ cardId: 'thief:5', instanceId: 'th1' }] }), 'nightTrickster');
    const rejects = rejectsOf(a);
    a.declare('s0', ['th1']);
    rawChoose(a, 's0', 's1', 'steal-10');
    expect(rejects).toEqual([]);
    const sum = findSeat(a.getState(), 's0')!.tokens.reduce((n, t) => n + t.value, 0);
    expect(sum).toBe(10);
    expect(a.getState().gameOver).toBe(false);
  });
});

describe('骗徒横扫：裁判', () => {
  it('杀死目标 + 亮身份 + 镜僧持有者也无反应窗', () => {
    const a = makeAdapter(9, 4);
    forceNightSetup(a, braked({ s0: [{ cardId: 'judge:6', instanceId: 'ju1' }] }), 'nightTrickster');
    // 注意顺序：forceNightSetup 会重写手牌，镜僧必须之后再塞
    findSeat(a.mutableState(), 's1')!.hand = [
      { instanceId: 'mm1', cardId: 'mirror_monk', number: null },
    ];
    const rejects = rejectsOf(a);
    a.declare('s0', ['ju1']);
    rawChoose(a, 's0', 's1', 'judge-kill');
    expect(rejects).toEqual([]);
    expect(findSeat(a.getState(), 's1')!.alive).toBe(false);
    expect(findSeat(a.getState(), 's0')!.houseRevealed).toBe(true);
    expect(a.getState().pending.some((p) => p.kind === 'reactDecide')).toBe(false);
    // 镜僧未被消耗（没开反应窗）
    expect(findSeat(a.getState(), 's1')!.hand.some((c) => c.cardId === 'mirror_monk')).toBe(true);
  });
});

describe('跨角色关键链：反应与击杀', () => {
  function setupKill(victimExtraHand: Array<{ instanceId: string; cardId: string }> = []) {
    const a = makeAdapter(10, 4);
    forceNightSetup(
      a,
      braked({
        s0: [{ cardId: 'blind_assassin:2', instanceId: 'ba1' }],
        s1: [{ cardId: 'spy:3', instanceId: 'sp1' }, ...victimExtraHand],
      }),
      'nightBlindAssassin',
    );
    return a;
  }

  it('BA 杀镜僧持有者：反应反杀凶手、自己存活', () => {
    const a = setupKill([{ instanceId: 'mm1', cardId: 'mirror_monk' }]);
    const rejects = rejectsOf(a);
    a.declare('s0', ['ba1']);
    rawChoose(a, 's0', 's1', 'ba-target');
    expect(pendingKind(a)).toBe('reactDecide');
    rawReact(a, 's1', true, 'mirror');
    expect(rejects).toEqual([]);
    expect(findSeat(a.getState(), 's0')!.alive).toBe(false);
    expect(findSeat(a.getState(), 's1')!.alive).toBe(true);
  });

  it('BA 杀殉道者：自己死 + 得 1 枚', () => {
    const a = setupKill([{ instanceId: 'mt1', cardId: 'martyr' }]);
    const rejects = rejectsOf(a);
    const before = findSeat(a.getState(), 's1')!.tokens.length;
    a.declare('s0', ['ba1']);
    rawChoose(a, 's0', 's1', 'ba-target');
    rawReact(a, 's1', true, 'martyr');
    expect(rejects).toEqual([]);
    expect(findSeat(a.getState(), 's1')!.alive).toBe(false);
    expect(findSeat(a.getState(), 's0')!.alive).toBe(true);
    expect(findSeat(a.getState(), 's1')!.tokens.length).toBe(before + 1);
  });

  it('镜僧 + 殉道同开：双死 + 得令牌（TBD-06）', () => {
    const a = setupKill([
      { instanceId: 'mm1', cardId: 'mirror_monk' },
      { instanceId: 'mt1', cardId: 'martyr' },
    ]);
    const rejects = rejectsOf(a);
    a.declare('s0', ['ba1']);
    rawChoose(a, 's0', 's1', 'ba-target');
    rawReact(a, 's1', true, 'both');
    expect(rejects).toEqual([]);
    expect(findSeat(a.getState(), 's0')!.alive).toBe(false);
    expect(findSeat(a.getState(), 's1')!.alive).toBe(false);
    expect(findSeat(a.getState(), 's1')!.tokens.length).toBe(1);
  });

  it('上忍看后 spare：目标存活', () => {
    const a = makeAdapter(10, 4);
    forceNightSetup(a, braked({ s0: [{ cardId: 'shinobi:2', instanceId: 'sn1' }] }), 'nightShinobi');
    const rejects = rejectsOf(a);
    // s2 先声明刹车牌，s0 同号按座位序先结算
    a.declare('s2', ['brk-shinobi']);
    a.declare('s0', ['sn1']);
    rawChoose(a, 's0', 's1', 'sn-target');
    expect(pendingKind(a)).toBe('chooseOptional');
    rawOptional(a, 's0', false, 'spare');
    expect(rejects).toEqual([]);
    expect(findSeat(a.getState(), 's1')!.alive).toBe(true);
    // 看过：快照有记录
    expect(
      findSeat(a.getState(), 's0')!.knownHouses.some((k) => k.targetSeatId === 's1'),
    ).toBe(true);
  });
});

describe('裁定 B 回归：密探/隐士可选死亡者为目标', () => {
  it('死亡座位出现在 spy 选项中', () => {
    const a = makeAdapter(11, 4);
    forceNightSetup(a, braked({ s0: [{ cardId: 'spy:3', instanceId: 'sp1' }] }), 'nightSpy');
    findSeat(a.mutableState(), 's1')!.alive = false;
    const rejects = rejectsOf(a);
    a.declare('s0', ['sp1']);
    const opts = a.getState().pending[0]?.options ?? [];
    expect(opts).toContain('s1');
    rawChoose(a, 's0', 's1', 'spy-dead');
    expect(rejects).toEqual([]);
    // 仅信息：目标仍死亡，无其他副作用
    expect(findSeat(a.getState(), 's1')!.alive).toBe(false);
    expect(
      findSeat(a.getState(), 's0')!.knownHouses.some((k) => k.targetSeatId === 's1'),
    ).toBe(true);
  });
});

describe('整局多种子横扫：无 reject、可终止、令牌守恒', () => {
  function runFullGame(seed: number, playerCount: number): void {
    const a = makeAdapter(seed, playerCount);
    const rejects: string[] = [];
    a.onReject((_id, reason) => rejects.push(reason));
    let guard = 0;
    while (!a.getState().gameOver && guard < 900) {
      guard += 1;
      const st = a.getState();
      if (st.pending.length === 0) {
        const r = applyAllDefaults(st);
        (a as unknown as { state: typeof st }).state = r.state;
        continue;
      }
      let progressed = false;
      for (const p of [...a.getState().pending]) {
        const cur = a.getState();
        const pp = cur.pending.find((x) => x.id === p.id);
        if (!pp) continue;
        const view = projectView(cur, pp.seatId);
        if (!view) continue;
        const cmd = botDecide(view, pp.id);
        if (!cmd) {
          const r = applyAllDefaults(cur);
          (a as unknown as { state: typeof cur }).state = r.state;
          progressed = true;
          break;
        }
        cmd.seatToken = findSeat(cur, pp.seatId)?.seatToken ?? '';
        cmd.commandId = `sweep-full-${seed}-${playerCount}-${guard}-${pp.id}`;
        a.submit(cmd);
        progressed = true;
      }
      if (!progressed) break;
    }
    expect(a.getState().gameOver, `seed=${seed} n=${playerCount} 应终局`).toBe(true);
    expect(rejects, `seed=${seed} n=${playerCount} 零拒绝`).toEqual([]);
    // 令牌守恒：座位持有 + 池剩余 = 35（转移/交换只搬运）
    expect(totalTokens(a), `seed=${seed} n=${playerCount} 令牌守恒`).toBe(35);
  }

  it('4/7/11 人 × 8 种子全通', () => {
    for (const n of [4, 7, 11]) {
      for (let seed = 1; seed <= 8; seed += 1) {
        runFullGame(seed, n);
      }
    }
  });

  it('同 seed 终局哈希稳定', () => {
    const h = (seed: number): string => {
      const a = makeAdapter(seed, 4);
      let guard = 0;
      while (!a.getState().gameOver && guard < 900) {
        guard += 1;
        const st = a.getState();
        if (st.pending.length === 0) {
          const r = applyAllDefaults(st);
          (a as unknown as { state: typeof st }).state = r.state;
          continue;
        }
        for (const p of [...a.getState().pending]) {
          const cur = a.getState();
          const pp = cur.pending.find((x) => x.id === p.id);
          if (!pp) continue;
          const view = projectView(cur, pp.seatId);
          if (!view) continue;
          const cmd = botDecide(view, pp.id);
          if (!cmd) {
            const r = applyAllDefaults(cur);
            (a as unknown as { state: typeof cur }).state = r.state;
            break;
          }
          cmd.seatToken = findSeat(cur, pp.seatId)?.seatToken ?? '';
          cmd.commandId = `sweep-hash-${seed}-${guard}-${pp.id}`;
          a.submit(cmd);
        }
      }
      return stateHash(a.getState());
    };
    expect(h(7)).toBe(h(7));
  });
});
