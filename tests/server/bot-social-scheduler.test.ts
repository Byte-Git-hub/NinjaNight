import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeAdapter, forceNightSetup } from '../fixtures/game';
import { createBotSocialScheduler } from '../../src/server/bot/social-scheduler';
import type { RoomRuntime } from '../../src/server/room';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function roomFor(bot = 's1') {
  const adapter = makeAdapter(99, 4);
  forceNightSetup(adapter, { [bot]: [{ cardId: 'spy:1', instanceId: 'sp1' }] });
  const state = adapter.mutableState();
  const token = state.seats.find((s) => s.seatId === bot)?.seatToken ?? '';
  const room = {
    code: 'SOCIAL1', started: true, state, bots: new Set([bot]),
    llmOverrideKey: undefined,
    findSessionBySeat: (seatId: string) => seatId === bot ? { seatToken: token } : undefined,
  } as unknown as RoomRuntime;
  return { room, state, bot };
}
function rng(values: number[]) {
  let i = 0;
  return { next: () => values[Math.min(i++, values.length - 1)] ?? 0, int: () => 0 };
}

afterEach(() => vi.useRealTimers());

describe('bot social scheduler', () => {
  it('schedules a local action without blocking the room', async () => {
    const { room, bot } = roomFor();
    const relays: unknown[] = [];
    const scheduler = createBotSocialScheduler({ relay: (_r, seat, action) => { relays.push({ seat, action }); }, roundStartMinMs: 0, roundStartMaxMs: 0, minIntervalMs: 0, rng: rng([0, 0, 0]) });
    scheduler.sync(room);
    await sleep(20);
    expect(relays).toHaveLength(1);
    expect((relays[0] as { seat: string }).seat).toBe(bot);
    scheduler.close();
  });

  it('drops an LLM result when the room round changed while awaiting it', async () => {
    const { room, state } = roomFor();
    let resolveLlm!: (text: string) => void;
    const relays: unknown[] = [];
    const scheduler = createBotSocialScheduler({
      relay: (_r, _seat, action) => { relays.push(action); },
      enhance: () => new Promise<string>((resolve) => { resolveLlm = resolve; }),
      roundStartMinMs: 0, roundStartMaxMs: 0, minIntervalMs: 0,
      rng: rng([0, 0, 0, 0]),
    });
    scheduler.sync(room);
    await sleep(10);
    state.round += 1;
    resolveLlm('过期发言');
    await sleep(10);
    expect(relays).toHaveLength(0);
    scheduler.close();
  });

  it('invalidate cancels pending work but keeps the room profile for later sync', async () => {
    const { room } = roomFor();
    let aborted = false;
    const scheduler = createBotSocialScheduler({
      relay: () => undefined,
      enhance: ({ signal }) => new Promise<string>(() => { signal.addEventListener('abort', () => { aborted = true; }); }),
      roundStartMinMs: 0, roundStartMaxMs: 0, minIntervalMs: 0, rng: rng([0, 0, 0, 0]),
    });
    scheduler.sync(room);
    await sleep(10);
    scheduler.invalidate(room);
    expect(aborted).toBe(true);
    scheduler.sync(room);
    scheduler.close();
  });
});


