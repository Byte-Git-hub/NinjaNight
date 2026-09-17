import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { createGameServer } from '../../src/server/index';
import type { PlayerView } from '../../src/shared/types';
import type { PresencePayload } from '../../src/shared/protocol';

const PORT = 3462;

function waitEvent<T>(socket: ClientSocket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${event}`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

function nextView(socket: ClientSocket, timeoutMs = 5000): Promise<PlayerView> {
  return waitEvent<PlayerView>(socket, 'view.snapshot', timeoutMs);
}

describe('bot integration', () => {
  let server: ReturnType<typeof createGameServer>;
  const clients: ClientSocket[] = [];

  beforeEach(async () => {
    process.env.BOT_DELAY_MS = '10';
    process.env.BOT_JITTER_MS = '0';
    server = createGameServer(PORT);
    await server.listen();
  });

  afterEach(async () => {
    delete process.env.BOT_DELAY_MS;
    delete process.env.BOT_JITTER_MS;
    for (const c of clients) c.disconnect();
    clients.length = 0;
    await server.close();
  });

  it('添加与移除 Bot，并在大厅与对局中自动决策推进', async () => {
    const base = `http://127.0.0.1:${PORT}`;
    const host = ioc(base, { transports: ['websocket'] });
    clients.push(host);
    await waitEvent(host, 'connect');

    host.emit('room.create', { nickname: 'Host' });
    const ack0 = await waitEvent<{ roomCode: string; seatToken: string }>(host, 'room.ack');
    expect(ack0.roomCode).toBeTruthy();

    // 1. 添加 3 个 bot
    let presenceP = waitEvent<PresencePayload>(host, 'room.presence');
    host.emit('room.addBot', { seatToken: ack0.seatToken });
    let pres = await presenceP;
    expect(pres.seats.length).toBe(2);
    expect(pres.seats[1]?.isBot).toBe(true);

    presenceP = waitEvent<PresencePayload>(host, 'room.presence');
    host.emit('room.addBot', { seatToken: ack0.seatToken });
    pres = await presenceP;
    expect(pres.seats.length).toBe(3);

    presenceP = waitEvent<PresencePayload>(host, 'room.presence');
    host.emit('room.addBot', { seatToken: ack0.seatToken });
    pres = await presenceP;
    expect(pres.seats.length).toBe(4);
    expect(pres.seats.filter((s) => s.isBot).length).toBe(3);

    // 2. 移除 1 个 bot
    presenceP = waitEvent<PresencePayload>(host, 'room.presence');
    host.emit('room.removeBot', { seatToken: ack0.seatToken });
    pres = await presenceP;
    expect(pres.seats.length).toBe(3);
    expect(pres.seats.filter((s) => s.isBot).length).toBe(2);

    // 3. 再次添加 1 个 bot 凑齐 4 人
    presenceP = waitEvent<PresencePayload>(host, 'room.presence');
    host.emit('room.addBot', { seatToken: ack0.seatToken });
    pres = await presenceP;
    expect(pres.seats.length).toBe(4);
    expect(pres.seats.filter((s) => s.isBot).length).toBe(3);

    // 4. 开始游戏
    const viewP = nextView(host);
    host.emit('room.start', { seatToken: ack0.seatToken });
    let view = await viewP;
    expect(view).toBeTruthy();

    // 5. 验证 bot 自动推进
    // 监听视图更新：当 host 有 pendingDecision 时立即选牌，其余 3 个 bot 自动由 scheduler 决策
    const phaseHistory: string[] = [view.phase];

    const onNewView = (v: PlayerView) => {
      view = v;
      if (!phaseHistory.includes(v.phase)) {
        phaseHistory.push(v.phase);
      }
      if (v.pendingDecision && v.pendingDecision.seatId === view.self.seatId) {
        const p = v.pendingDecision;
        if (p.kind === 'draftPick' || p.kind === 'draftDiscard') {
          host.emit('command.send', {
            commandId: `host-cmd-${Date.now()}-${Math.random()}`,
            seatToken: ack0.seatToken,
            windowId: v.windowId,
            type: p.kind === 'draftPick' ? 'draft.pick' : 'draft.discard',
            payload: { cardInstanceId: p.options[0] },
          });
        } else if (p.kind === 'declareCards') {
          host.emit('command.send', {
            commandId: `host-cmd-${Date.now()}-${Math.random()}`,
            seatToken: ack0.seatToken,
            windowId: v.windowId,
            type: 'night.passPhase',
            payload: {},
          });
        } else if (p.kind === 'chooseTarget') {
          host.emit('command.send', {
            commandId: `host-cmd-${Date.now()}-${Math.random()}`,
            seatToken: ack0.seatToken,
            windowId: v.windowId,
            type: 'night.chooseTarget',
            payload: { targetSeatId: p.options[0] },
          });
        } else if (p.kind === 'chooseOptional' || p.kind === 'reactDecide') {
          host.emit('command.send', {
            commandId: `host-cmd-${Date.now()}-${Math.random()}`,
            seatToken: ack0.seatToken,
            windowId: v.windowId,
            type: p.kind === 'reactDecide' ? 'react.decide' : 'night.chooseOptional',
            payload: p.kind === 'reactDecide' ? { react: false } : { choose: false },
          });
        }
      }
    };

    host.on('view.snapshot', onNewView);

    // 触发第一步决策（若当前已有待办）
    if (view.pendingDecision && view.pendingDecision.seatId === view.self.seatId) {
      onNewView(view);
    }

    // 等待推进到 night 或 score
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (
        phaseHistory.some((ph) =>
          ['nightSpy', 'nightMystic', 'nightTrickster', 'nightBlindAssassin', 'nightShinobi', 'score'].includes(ph),
        )
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(
      phaseHistory.some((ph) =>
        ['nightSpy', 'nightMystic', 'nightTrickster', 'nightBlindAssassin', 'nightShinobi', 'score'].includes(ph),
      ),
    ).toBe(true);

    host.off('view.snapshot', onNewView);
  });
});
