import { describe, expect, it } from 'vitest';
import { botDecide } from '../../src/core/bot';
import { createRng } from '../../src/core/rng';
import type { PlayerView } from '../../src/shared/types';

function mockPlayerView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    roomCode: 'TEST01',
    round: 1,
    phase: 'draftPick1',
    step: 'draftSelect',
    windowId: 'w-1',
    pendingDecision: null,
    seats: [
      { seatId: 's0', nickname: 'Host', connected: true, alive: true, isHost: true, honorTokenCount: 0 },
      { seatId: 's1', nickname: 'AI-1', connected: true, alive: true, isHost: false, honorTokenCount: 0 },
      { seatId: 's2', nickname: 'AI-2', connected: true, alive: true, isHost: false, honorTokenCount: 0 },
      { seatId: 's3', nickname: 'AI-3', connected: true, alive: true, isHost: false, honorTokenCount: 0 },
    ],
    self: {
      seatId: 's1',
      houseId: 'crane',
      canViewOwnHouse: true,
      hand: [],
      reserved: [],
      honorTokens: [],
      knownHouseHistory: [],
      declaredThisPhase: [],
      hasPending: true,
    },
    events: [],
    revealedCards: [],
    gameOver: false,
    winners: [],
    ...overrides,
  };
}

describe('core/bot.ts - botDecide', () => {
  it('无 pending 或 windowId 不匹配时返回 null', () => {
    const view = mockPlayerView({ pendingDecision: null });
    expect(botDecide(view, 'w-1')).toBeNull();

    const viewMismatch = mockPlayerView({
      windowId: 'w-1',
      pendingDecision: {
        id: 'w-2',
        seatId: 's1',
        kind: 'draftPick',
        options: ['spy:1#1'],
        deadline: null,
        defaultChoice: { kind: 'autoPick', optionId: 'spy:1#1' },
        context: { phase: 'draftPick1', step: 'draftSelect', relatedInstanceIds: [] },
      },
    });
    expect(botDecide(viewMismatch, 'w-999')).toBeNull();
  });

  it('draftPick: 产出合法 draft.pick 指令且在 options 范围内', () => {
    const options = ['spy:1#1', 'crane:1#2', 'troublemaker:3#3'];
    const view = mockPlayerView({
      pendingDecision: {
        id: 'w-draft',
        seatId: 's1',
        kind: 'draftPick',
        options,
        deadline: null,
        defaultChoice: { kind: 'autoPick', optionId: options[0] },
        context: { phase: 'draftPick1', step: 'draftSelect', relatedInstanceIds: [] },
      },
    });

    const cmd = botDecide(view, 'w-draft', createRng(42));
    expect(cmd).not.toBeNull();
    expect(cmd?.type).toBe('draft.pick');
    const chosen = (cmd?.payload as { cardInstanceId: string }).cardInstanceId;
    expect(options).toContain(chosen);
  });

  it('declareCards: 产出 declare 或 passPhase 指令', () => {
    const options = ['spy:1#1'];
    const view = mockPlayerView({
      phase: 'nightSpy',
      step: 'collectDeclarations',
      pendingDecision: {
        id: 'w-dec',
        seatId: 's1',
        kind: 'declareCards',
        options,
        deadline: null,
        defaultChoice: { kind: 'pass' },
        context: { phase: 'nightSpy', step: 'collectDeclarations', relatedInstanceIds: options },
      },
    });

    const cmd1 = botDecide(view, 'w-dec', createRng(1));
    expect(cmd1).not.toBeNull();
    expect(['night.declare', 'night.passPhase']).toContain(cmd1?.type);

    if (cmd1?.type === 'night.declare') {
      const payload = cmd1.payload as { cardInstanceIds: string[] };
      expect(payload.cardInstanceIds).toEqual(['spy:1#1']);
    }
  });

  it('chooseTarget: 优先选择已知敌对阵营', () => {
    const view = mockPlayerView({
      self: {
        seatId: 's1',
        houseId: 'crane',
        canViewOwnHouse: true,
        hand: [],
        reserved: [],
        honorTokens: [],
        knownHouseHistory: [
          { round: 1, targetSeatId: 's2', houseId: 'crane' }, // 队友
          { round: 1, targetSeatId: 's3', houseId: 'lotus' }, // 敌人
        ],
        declaredThisPhase: [],
        hasPending: true,
      },
      pendingDecision: {
        id: 'w-target',
        seatId: 's1',
        kind: 'chooseTarget',
        options: ['s0', 's2', 's3'],
        deadline: null,
        defaultChoice: { kind: 'chooseFirstTarget' },
        context: { phase: 'nightSpy', step: 'chooseTarget', relatedInstanceIds: [] },
      },
    });

    // 无论测试多少次，已知敌对目标 s3 应被选中
    const cmd = botDecide(view, 'w-target', createRng(42));
    expect(cmd?.type).toBe('night.chooseTarget');
    expect((cmd?.payload as { targetSeatId: string }).targetSeatId).toBe('s3');
  });

  it('merchantChoose / merchantExchange / reactDecide: 均产出合法指令', () => {
    const viewMerch = mockPlayerView({
      pendingDecision: {
        id: 'w-merch',
        seatId: 's1',
        kind: 'merchantChoose',
        options: ['HONOR', 'HOUSE'],
        deadline: null,
        defaultChoice: { kind: 'autoPick', optionId: 'HONOR' },
        context: { phase: 'nightTrickster', step: 'chooseTarget', relatedInstanceIds: [] },
      },
    });
    const cmdMerch = botDecide(viewMerch, 'w-merch', createRng(10));
    expect(cmdMerch?.type).toBe('night.chooseTarget');
    expect(['HONOR', 'HOUSE']).toContain((cmdMerch?.payload as { targetSeatId: string }).targetSeatId);

    const viewReact = mockPlayerView({
      pendingDecision: {
        id: 'w-react',
        seatId: 's1',
        kind: 'reactDecide',
        options: ['react', 'decline'],
        deadline: null,
        defaultChoice: { kind: 'decline' },
        context: { phase: 'nightBlindAssassin', step: 'reactWindow', relatedInstanceIds: [] },
      },
    });
    const cmdReact = botDecide(viewReact, 'w-react', createRng(20));
    expect(cmdReact?.type).toBe('react.decide');
    expect(typeof (cmdReact?.payload as { react: boolean }).react).toBe('boolean');
  });

  it('纯函数确定性：同一随机种子多次调用输出完全相同', () => {
    const view = mockPlayerView({
      pendingDecision: {
        id: 'w-det',
        seatId: 's1',
        kind: 'draftPick',
        options: ['spy:1#1', 'mystic:2#2', 'shinobi:3#3'],
        deadline: null,
        defaultChoice: { kind: 'autoPick', optionId: 'spy:1#1' },
        context: { phase: 'draftPick1', step: 'draftSelect', relatedInstanceIds: [] },
      },
    });
    const cmdA = botDecide(view, 'w-det', createRng(99));
    const cmdB = botDecide(view, 'w-det', createRng(99));
    expect(cmdA).toEqual(cmdB);
  });
});
