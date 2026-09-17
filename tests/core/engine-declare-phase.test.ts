import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/core/engine';
import type { Command } from '../../src/shared/types';
import { forceNightSetup } from '../fixtures/game';
import { makeAdapter } from '../fixtures/game';

function declareCmd(
  roomCode: string,
  seatToken: string,
  windowId: string,
  ids: string[],
  commandId: string,
): Command {
  return {
    commandId,
    roomCode,
    seatToken,
    windowId,
    type: 'night.declare',
    payload: { cardInstanceIds: ids },
  };
}

describe('Bug1: night.declare 阶段校验错误码区分', () => {
  it('在手但非本阶段的牌 → phaseMismatch', () => {
    const a = makeAdapter(11);
    forceNightSetup(
      a,
      {
        s0: [
          { cardId: 'spy:1', instanceId: 't-spy' },
          { cardId: 'blind_assassin:1', instanceId: 't-ba' },
        ],
      },
      'nightSpy',
    );
    const st = a.mutableState();
    const seat = st.seats[0]!;
    const r = applyCommand(
      st,
      declareCmd(st.roomCode, seat.seatToken, st.windowId, ['t-ba'], 'bug1-phase-1'),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('phaseMismatch');
  });

  it('根本不在手牌的 id → notInHand', () => {
    const a = makeAdapter(12);
    forceNightSetup(
      a,
      { s0: [{ cardId: 'spy:2', instanceId: 't-spy2' }] },
      'nightSpy',
    );
    const st = a.mutableState();
    const seat = st.seats[0]!;
    const r = applyCommand(
      st,
      declareCmd(st.roomCode, seat.seatToken, st.windowId, ['card#nope'], 'bug1-hand-1'),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('notInHand');
  });

  it('本阶段可打的牌 → ok:true（回归）', () => {
    const a = makeAdapter(13);
    forceNightSetup(
      a,
      { s0: [{ cardId: 'spy:3', instanceId: 't-spy3' }] },
      'nightSpy',
    );
    const st = a.mutableState();
    const seat = st.seats[0]!;
    const r = applyCommand(
      st,
      declareCmd(st.roomCode, seat.seatToken, st.windowId, ['t-spy3'], 'bug1-ok-1'),
    );
    expect(r.ok).toBe(true);
  });
});
