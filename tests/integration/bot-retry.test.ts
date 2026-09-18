import { afterEach, describe, expect, it } from 'vitest';
import { scheduleBots } from '../../src/server/bot-scheduler';
import type { RoomRuntime } from '../../src/server/room';
import type { Command } from '../../src/shared/types';
import { findSeat } from '../../src/core/utils';
import { forceNightSetup, makeAdapter } from '../fixtures/game';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 构造最小假 room：真 GameState + bot 调度所需的四个字段 */
function fakeRoom(botSeatId: string) {
  const a = makeAdapter(70, 4);
  forceNightSetup(a, { [botSeatId]: [{ cardId: 'spy:3', instanceId: 'sp1' }] }, 'nightSpy');
  const st = a.mutableState();
  const token = findSeat(st, botSeatId)?.seatToken ?? '';
  const room = {
    code: 'RETRY1',
    state: st,
    bots: new Set([botSeatId]),
    botTimers: new Map<string, NodeJS.Timeout>(),
    botScheduledKeys: new Set<string>(),
    findSessionBySeat: (seatId: string) =>
      seatId === botSeatId ? { seatToken: token } : undefined,
  } as unknown as RoomRuntime;
  return { a, room };
}

describe('bot-scheduler 有界重试', () => {
  afterEach(() => {
    delete process.env.BOT_DELAY_MS;
    delete process.env.BOT_JITTER_MS;
  });

  it('持续被拒收时最多执行 1 + 3 次后停手', async () => {
    process.env.BOT_DELAY_MS = '5';
    process.env.BOT_JITTER_MS = '0';
    const { room } = fakeRoom('s1');
    let calls = 0;
    scheduleBots(room, (_r, _c: Command) => {
      calls += 1;
      return false; // 模拟持续拒收
    });
    await sleep(300);
    expect(calls).toBe(4);
    room.clearBotTimers?.();
    for (const t of (room.botTimers as Map<string, NodeJS.Timeout>).values()) clearTimeout(t);
  });

  it('被接受后不再重试（只执行 1 次）', async () => {
    process.env.BOT_DELAY_MS = '5';
    process.env.BOT_JITTER_MS = '0';
    const { room } = fakeRoom('s1');
    let calls = 0;
    scheduleBots(room, (_r, _c: Command) => {
      calls += 1;
      return true;
    });
    await sleep(120);
    expect(calls).toBe(1);
    for (const t of (room.botTimers as Map<string, NodeJS.Timeout>).values()) clearTimeout(t);
  });
});
