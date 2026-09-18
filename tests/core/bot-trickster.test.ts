import { describe, expect, it } from 'vitest';
import { botDecide } from '../../src/core/bot';
import { createRng } from '../../src/core/rng';
import { applyAllDefaults, applyCommand } from '../../src/core/engine';
import { projectView } from '../../src/core/project-view';
import { findSeat } from '../../src/core/utils';
import type { Command } from '../../src/shared/types';
import { forceNightSetup, makeAdapter } from '../fixtures/game';

/** 百变者进入 targetB 的摆拍：s0 声明百变者，targetA 选 s2 */
function setupShapeshifterTargetB(targetA = 's2') {
  const a = makeAdapter(5, 4);
  forceNightSetup(a, { s0: [{ cardId: 'shapeshifter:1', instanceId: 'sh1' }] }, 'nightTrickster');
  const rejects: string[] = [];
  a.onReject((_id, reason) => rejects.push(reason));
  a.declare('s0', ['sh1']);
  a.chooseTarget('s0', targetA);
  return { a, rejects, targetA };
}

function tokenOf(a: ReturnType<typeof makeAdapter>, seatId: string): string {
  const seat = findSeat(a.getState(), seatId);
  if (!seat) throw new Error('no seat');
  return seat.seatToken;
}

/** 用 bot 决策驱动一步：断言被接受且无 reject */
function botStep(a: ReturnType<typeof makeAdapter>, seatId: string, rngSeed: number): void {
  const st = a.getState();
  const pending = st.pending.find((p) => p.seatId === seatId);
  expect(pending).toBeTruthy();
  const view = projectView(st, seatId);
  expect(view?.pendingDecision).toBeTruthy();
  const cmd = botDecide(view!, pending!.id, createRng(rngSeed));
  expect(cmd, `bot 对 ${pending!.kind} 应产出决策`).not.toBeNull();
  cmd!.seatToken = tokenOf(a, seatId);
  cmd!.commandId = `test-bot-${seatId}-${pending!.id}-${rngSeed}`;
  const rejects: string[] = [];
  a.onReject((_id, reason) => rejects.push(reason));
  a.submit(cmd!);
  expect(rejects, `bot 决策应被接受（kind=${pending!.kind}）`).toEqual([]);
}

describe('bot 骗徒牌决策补全（百变者卡死回归）', () => {
  it('百变者 targetB：不再下发 targets[0] 非法选项', () => {
    const { a, targetA } = setupShapeshifterTargetB('s2');
    const p = a.getState().pending[0];
    expect(p?.kind).toBe('chooseTarget');
    expect(p?.options.length).toBeGreaterThan(0);
    expect(p?.options, 'targetB 选项不得包含 targetA').not.toContain(targetA);
    // 默认分支（forceAdvance/超时）同样合法
    expect(p?.defaultChoice).toEqual({ kind: 'autoPick', optionId: p?.options[0] });
  });

  it('bot 对百变者 targetB 的决策必合法（50 种子 sweep，生前必红）', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const { a } = setupShapeshifterTargetB('s2');
      const st = a.getState();
      const pending = st.pending[0]!;
      const view = projectView(st, 's0')!;
      const cmd = botDecide(view, pending.id, createRng(seed));
      expect(cmd).not.toBeNull();
      const full: Command = {
        ...cmd!,
        seatToken: tokenOf(a, 's0'),
        commandId: `sweep-${seed}`,
      };
      const r = applyCommand(st, full);
      expect(r.ok, `seed=${seed} 选了 ${(cmd!.payload as { targetSeatId: string }).targetSeatId}`).toBe(true);
    }
  });

  it('百变者全链路 bot 可走完：targetA → targetB → swapOrNot', () => {
    const a = makeAdapter(5, 4);
    forceNightSetup(a, { s0: [{ cardId: 'shapeshifter:1', instanceId: 'sh1' }] }, 'nightTrickster');
    a.declare('s0', ['sh1']);
    botStep(a, 's0', 11); // targetA
    expect(a.getState().pending[0]?.kind).toBe('chooseTarget'); // targetB
    botStep(a, 's0', 12); // targetB
    expect(a.getState().pending[0]?.kind).toBe('chooseOptional'); // swapOrNot
    botStep(a, 's0', 13); // swap/keep
    // 百变者结算完成（队列推进、pending 不再是该牌）
    expect(
      a.getState().pending.some((p) => p.context.cardId === 'shapeshifter:1'),
    ).toBe(false);
  });

  it('掘墓人 bot 可走完：gravePick → graveImmediate', () => {
    const a = makeAdapter(6, 4);
    const st = a.mutableState();
    st.zones.draftDiscard = [
      { instanceId: 'd1', cardId: 'spy:3', number: 3 },
      { instanceId: 'd2', cardId: 'mystic:4', number: 4 },
    ];
    forceNightSetup(a, { s0: [{ cardId: 'grave_digger:2', instanceId: 'gd1' }] }, 'nightTrickster');
    a.declare('s0', ['gd1']);
    expect(a.getState().pending[0]?.kind).toBe('chooseTarget'); // gravePick
    botStep(a, 's0', 21);
    expect(a.getState().pending[0]?.kind).toBe('chooseOptional'); // graveImmediate
    botStep(a, 's0', 22);
  });

  it('捣蛋鬼 bot 可走完：chooseTarget → troubleReveal', () => {
    const a = makeAdapter(7, 4);
    forceNightSetup(a, { s0: [{ cardId: 'troublemaker:3', instanceId: 'tm1' }] }, 'nightTrickster');
    a.declare('s0', ['tm1']);
    botStep(a, 's0', 31);
    expect(a.getState().pending[0]?.kind).toBe('chooseOptional'); // troubleReveal
    botStep(a, 's0', 32);
  });

  it('商人 bot 可走完：chooseTarget → merchantChoose → merchantGive → merchantTake', () => {
    const a = makeAdapter(8, 4);
    const st = a.mutableState();
    findSeat(st, 's0')!.tokens = [{ instanceId: 't0', value: 2 }];
    findSeat(st, 's1')!.tokens = [
      { instanceId: 't1', value: 4 },
      { instanceId: 't2', value: 3 },
    ];
    forceNightSetup(a, { s0: [{ cardId: 'spirit_merchant:4', instanceId: 'sm1' }] }, 'nightTrickster');
    a.declare('s0', ['sm1']);
    botStep(a, 's0', 41); // 选目标
    expect(a.getState().pending[0]?.kind).toBe('merchantChoose');
    botStep(a, 's0', 42); // view_house / view_honor
    const afterChoose = a.getState();
    if (afterChoose.pending.length > 0) {
      // 双方都有令牌 → 进入交换链
      expect(afterChoose.pending[0]?.kind).toBe('merchantExchange'); // merchantGive
      botStep(a, 's0', 43);
      const afterGive = a.getState();
      if (afterGive.pending.length > 0) {
        expect(afterGive.pending[0]?.kind).toBe('merchantExchange'); // merchantTake
        botStep(a, 's0', 44);
      }
    }
  });

  it('盗贼 / 裁判 bot 目标选择合法', () => {
    const a = makeAdapter(9, 4);
    const st = a.mutableState();
    findSeat(st, 's1')!.tokens = [
      { instanceId: 't1', value: 2 },
      { instanceId: 't2', value: 3 },
    ];
    forceNightSetup(
      a,
      {
        s0: [{ cardId: 'thief:5', instanceId: 'th1' }],
        s2: [{ cardId: 'judge:6', instanceId: 'ju1' }],
      },
      'nightTrickster',
    );
    a.declare('s0', ['th1']);
    const tp = a.getState().pending[0];
    if (tp?.kind === 'chooseTarget') botStep(a, 's0', 51);
  });

  it('forceAdvance 对百变者 targetB 默认合法（超时路径不悬空）', () => {
    const { a } = setupShapeshifterTargetB('s0');
    const before = a.getState();
    const r = applyAllDefaults(before);
    expect(r.ok).toBe(true);
    // targetB 已被默认推进，不再停留
    const stillTargetB =
      r.state.pending.length > 0 &&
      r.state.pending[0]?.kind === 'chooseTarget' &&
      r.state.pending[0]?.context.cardId === 'shapeshifter:1' &&
      r.state.resolveContext?.step === 'targetB';
    expect(stillTargetB).toBe(false);
  });
});
