import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { createGameServer } from '../../src/server/index';
import { MIN_PLAYERS } from '../../src/shared/timeouts';

const PORT = 3464;

function waitEvent<T>(socket: ClientSocket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${event}`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

describe('Bug1: server night.declare 预校验', () => {
  let server: ReturnType<typeof createGameServer>;
  const clients: ClientSocket[] = [];

  beforeEach(async () => {
    server = createGameServer(PORT);
    await server.listen();
  });

  afterEach(async () => {
    for (const c of clients) c.disconnect();
    clients.length = 0;
    await server.close();
  });

  it('非本阶段牌 → PHASE_MISMATCH；不在手牌 → NOT_IN_HAND；本阶段牌 → ack', async () => {
    const base = `http://127.0.0.1:${PORT}`;
    const host = ioc(base, { transports: ['websocket'] });
    clients.push(host);
    await waitEvent(host, 'connect');
    host.emit('room.create', { nickname: 'Host' });
    const ack0 = await waitEvent<{ roomCode: string; seatToken: string }>(host, 'room.ack');
    const tokens = [ack0.seatToken];
    for (let i = 1; i < MIN_PLAYERS; i += 1) {
      const s = ioc(base, { transports: ['websocket'] });
      clients.push(s);
      await waitEvent(s, 'connect');
      s.emit('room.join', { roomCode: ack0.roomCode, nickname: `P${i}` });
      const ack = await waitEvent<{ seatToken: string }>(s, 'room.ack');
      tokens.push(ack.seatToken);
    }
    for (let i = 1; i < tokens.length; i += 1) {
      host.emit('room.ready', { seatToken: tokens[i], ready: true });
    }
    await new Promise((r) => setTimeout(r, 30));
    const viewP = waitEvent(host, 'view.snapshot');
    host.emit('room.start', { seatToken: tokens[0] });
    await viewP;

    // 固定为 nightSpy 可控态：s0 手牌 1 张密探（可打）+ 1 张刺客（非本阶段）
    const room = [...server.rooms.values()].find((r) => r.started);
    expect(room?.state).toBeTruthy();
    const st = room!.state!;
    st.phase = 'nightSpy';
    st.step = 'collectDeclarations';
    st.windowId = 'w-test-bug1';
    for (const s of st.seats) {
      s.hand = [];
      s.draftHand = [];
      s.declared = [];
      s.declaredResponded = false;
    }
    st.seats[0]!.hand = [
      { instanceId: 't-spy', cardId: 'spy:1', number: 1 },
      { instanceId: 't-ba', cardId: 'blind_assassin:1', number: 1 },
    ];
    st.resolveQueue = [];
    st.resolveContext = null;
    st.pending = [
      {
        id: 'w-test-bug1:s0',
        seatId: 's0',
        kind: 'declareCards',
        options: ['t-spy'],
        deadline: null,
        defaultChoice: { kind: 'pass' },
        context: {
          phase: 'nightSpy',
          step: 'collectDeclarations',
          relatedInstanceIds: ['t-spy'],
        },
      },
    ];

    const send = (ids: string[], commandId: string) =>
      new Promise<{ ack: boolean; reason?: string }>((resolve) => {
        host.once('command.ack', () => resolve({ ack: true }));
        host.once('command.reject', (d: { reasonCode: string }) =>
          resolve({ ack: false, reason: d.reasonCode }),
        );
        host.emit('command.send', {
          commandId,
          seatToken: tokens[0],
          windowId: 'w-test-bug1:s0',
          type: 'night.declare',
          payload: { cardInstanceIds: ids },
        });
      });

    // 在手但非本阶段 → PHASE_MISMATCH（server 预校验）
    const r1 = await send(['t-ba'], 'bug1-srv-phase');
    expect(r1.ack).toBe(false);
    expect(r1.reason).toBe('PHASE_MISMATCH');

    // 不在手牌 → NOT_IN_HAND（server 预校验）
    const r2 = await send(['card#nope'], 'bug1-srv-hand');
    expect(r2.ack).toBe(false);
    expect(r2.reason).toBe('NOT_IN_HAND');

    // 本阶段可打 → ack（回归）
    const r3 = await send(['t-spy'], 'bug1-srv-ok');
    expect(r3.ack).toBe(true);
  });
});
