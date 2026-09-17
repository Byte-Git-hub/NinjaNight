import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { createGameServer } from '../../src/server/index';
import { MIN_PLAYERS } from '../../src/shared/timeouts';
import type { PlayerView } from '../../src/shared/types';

const PORT = 3458;

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

function waitViewPhase(socket: ClientSocket, targetPhase: string, timeoutMs = 5000): Promise<PlayerView> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for phase ${targetPhase}`)), timeoutMs);
    const handler = (v: PlayerView) => {
      if (v.phase === targetPhase) {
        clearTimeout(t);
        socket.off('view.snapshot', handler);
        resolve(v);
      }
    };
    socket.on('view.snapshot', handler);
  });
}

async function createRoomWithPlayers(
  n: number,
): Promise<{ code: string; tokens: string[]; sockets: ClientSocket[]; host: ClientSocket }> {
  const base = `http://127.0.0.1:${PORT}`;
  const host = ioc(base, { transports: ['websocket'] });
  await waitEvent(host, 'connect');
  host.emit('room.create', { nickname: 'Host' });
  const ack0 = await waitEvent<{ roomCode: string; seatToken: string }>(host, 'room.ack');
  const tokens = [ack0.seatToken];
  const sockets = [host];
  for (let i = 1; i < n; i += 1) {
    const s = ioc(base, { transports: ['websocket'] });
    await waitEvent(s, 'connect');
    s.emit('room.join', { roomCode: ack0.roomCode, nickname: `P${i}` });
    const ack = await waitEvent<{ seatToken: string }>(s, 'room.ack');
    tokens.push(ack.seatToken);
    sockets.push(s);
  }
  return { code: ack0.roomCode, tokens, sockets, host };
}

async function readyAll(host: ClientSocket, tokens: string[]): Promise<void> {
  for (let i = 1; i < tokens.length; i += 1) {
    host.emit('room.ready', { seatToken: tokens[i], ready: true });
  }
  await new Promise((r) => setTimeout(r, 30));
  host.emit('room.ready', { seatToken: tokens[0] as string, ready: true });
  await new Promise((r) => setTimeout(r, 30));
}

describe('server integration', () => {
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

  function track(...cs: ClientSocket[]): void {
    clients.push(...cs);
  }

  async function startGame(host: ClientSocket, tokens: string[]): Promise<PlayerView> {
    const viewP = nextView(host);
    host.emit('room.start', { seatToken: tokens[0] });
    return viewP;
  }

  it('指令幂等：同 commandId 只生效一次', async () => {
    const { tokens, sockets, host } = await createRoomWithPlayers(MIN_PLAYERS);
    track(...sockets);
    await readyAll(host, tokens);
    const view = await startGame(host, tokens);
    const token = tokens[0] as string;
    const pending = view.pendingDecision;
    expect(pending).toBeTruthy();
    const iid = pending?.options[0] as string;
    const cmd = {
      commandId: 'idem-1',
      seatToken: token,
      windowId: view.windowId,
      type: 'draft.pick',
      payload: { cardInstanceId: iid },
    };
    const ackP = waitEvent(host, 'command.ack');
    host.emit('command.send', cmd);
    await ackP;
    // 服务端状态：手牌应已含该牌
    const room = [...server.rooms.values()].find((r) => r.started);
    expect(room?.state?.seats[0]?.hand.some((c) => c.instanceId === iid)).toBe(true);
    // 重复发送同 commandId → 仍 ack，手牌长度不变
    const beforeLen = room?.state?.seats[0]?.hand.length ?? 0;
    const ackP2 = waitEvent(host, 'command.ack');
    host.emit('command.send', cmd);
    await ackP2;
    expect(room?.state?.seats[0]?.hand.length).toBe(beforeLen);
  });

  it('过期窗口：旧 windowId 被拒', async () => {
    const { tokens, sockets, host } = await createRoomWithPlayers(MIN_PLAYERS);
    track(...sockets);
    await readyAll(host, tokens);
    const view = await startGame(host, tokens);
    const rejP = waitEvent<{ reasonCode: string }>(host, 'command.reject');
    host.emit('command.send', {
      commandId: 'stale-1',
      seatToken: tokens[0],
      windowId: 'w-obsolete-window',
      type: 'draft.pick',
      payload: { cardInstanceId: view.pendingDecision?.options[0] ?? 'x' },
    });
    const rej = await rejP;
    expect(rej.reasonCode).toBe('STALE_WINDOW');
  });

  it('房间隔离：两个房间互不影响', async () => {
    const a = await createRoomWithPlayers(MIN_PLAYERS);
    const b = await createRoomWithPlayers(MIN_PLAYERS);
    track(...a.sockets, ...b.sockets);
    expect(a.code).not.toBe(b.code);
    await readyAll(a.host, a.tokens);
    a.host.emit('room.start', { seatToken: a.tokens[0] });
    await waitEvent(a.host, 'room.started');
    expect(server.rooms.get(b.code)?.started).toBe(false);
    expect(server.rooms.get(a.code)?.started).toBe(true);
  });

  it('projectView 按人下发：不同座位 snapshot 不同', async () => {
    const { tokens, sockets, host } = await createRoomWithPlayers(MIN_PLAYERS);
    track(...sockets);
    await readyAll(host, tokens);
    // 预先挂接收
    const viewsP = Promise.all(sockets.map((s) => nextView(s)));
    host.emit('room.start', { seatToken: tokens[0] });
    const views = await viewsP;
    expect(views[0]?.self.seatId).toBe('s0');
    expect(views[1]?.self.seatId).toBe('s1');
    expect(views[0]?.self.seatId).not.toBe(views[1]?.self.seatId);
    // A 的 draft 手牌 id 不应出现在 B 的 self.hand/draft 视图字段（draftHand 不在 PlayerView；比 hand）
    // 至少 self 不同且 secret house 不同可能相同种子但投影 seatId 不同
    expect(JSON.stringify(views[0]?.self)).not.toBe(JSON.stringify(views[1]?.self));
  });

  it('room.leave: 大厅中离开房间并触发房主移交与幂等', async () => {
    const { code, tokens, sockets, host } = await createRoomWithPlayers(2);
    track(...sockets);
    const room = server.rooms.get(code)!;
    expect(room.lobby.length).toBe(2);
    expect(room.hostSeatId).toBe('s0');

    // 房主 (s0) 离开
    const ackP = waitEvent<{ ok: boolean }>(host, 'room.leave.ack');
    host.emit('room.leave', { seatToken: tokens[0] });
    const ack = await ackP;
    expect(ack.ok).toBe(true);

    // 此时 s0 已被移除，房主移交给剩余玩家 (s1)
    expect(room.lobby.length).toBe(1);
    expect(room.hostSeatId).toBe('s1');

    // 幂等性：再次调用 room.leave 依然成功 ack
    const ack2P = waitEvent<{ ok: boolean }>(host, 'room.leave.ack');
    host.emit('room.leave', { seatToken: tokens[0] });
    const ack2 = await ack2P;
    expect(ack2.ok).toBe(true);
  });

  it('room.leave: 对局中离开标记断线', async () => {
    const { code, tokens, sockets, host } = await createRoomWithPlayers(MIN_PLAYERS);
    track(...sockets);
    await readyAll(host, tokens);
    await startGame(host, tokens);

    const room = server.rooms.get(code)!;
    expect(room.started).toBe(true);

    // P1 (s1) 离开对局
    const p1 = sockets[1] as ClientSocket;
    const ackP = waitEvent<{ ok: boolean }>(p1, 'room.leave.ack');
    p1.emit('room.leave', { seatToken: tokens[1] });
    const ack = await ackP;
    expect(ack.ok).toBe(true);

    // 对应座位应被标记为断开连接
    const s1Seat = room.state?.seats.find((s) => s.seatId === 's1');
    expect(s1Seat?.connected).toBe(false);
  });

  it('room.end: 房主终止本局向所有客户端广播 room.terminated', async () => {
    const { code, tokens, sockets, host } = await createRoomWithPlayers(MIN_PLAYERS);
    track(...sockets);
    await readyAll(host, tokens);
    await startGame(host, tokens);

    const room = server.rooms.get(code)!;
    expect(room.started).toBe(true);

    // 监听所有客户端的 room.terminated 广播
    const termPs = sockets.map((s) => waitEvent(s, 'room.terminated'));
    host.emit('room.end', { seatToken: tokens[0] });
    await Promise.all(termPs);

    // 房间回到未开始的大厅状态
    expect(room.started).toBe(false);
  });

  it('状态同步：阶段推进时所有座位均收到对应 phase 的 view.snapshot，且 forceAdvance 可推进', async () => {
    const { code, tokens, sockets, host } = await createRoomWithPlayers(MIN_PLAYERS);
    track(...sockets);
    await readyAll(host, tokens);

    const draft1Promises = sockets.map((s) => nextView(s));
    host.emit('room.start', { seatToken: tokens[0] });
    const draft1Views = await Promise.all(draft1Promises);
    for (const v of draft1Views) {
      expect(v.phase).toBe('draftPick1');
    }
    const room = server.rooms.get(code)!;
    expect(room.state?.phase).toBe('draftPick1');

    // 1. 正常推进：全员提交 draft.pick -> 推进至 draftPick2，所有座位同步收到 snapshot
    const draft2Promises = sockets.map((s) => waitViewPhase(s, 'draftPick2'));
    for (let i = 0; i < 4; i += 1) {
      const v = draft1Views[i]!;
      const cardId = v.pendingDecision!.options[0]!;
      sockets[i]!.emit('command.send', {
        commandId: `cmd-pick-${i}`,
        seatToken: tokens[i],
        windowId: v.windowId,
        type: 'draft.pick',
        payload: { cardInstanceId: cardId },
      });
    }
    const d2Views = await Promise.all(draft2Promises);
    for (const v of d2Views) {
      expect(v.phase).toBe('draftPick2');
    }
    expect(room.state?.phase).toBe('draftPick2');

    // 2. 强制推进：房主触发 forceAdvance -> applyAllDefaults 推进至无 pending (victoryCheck)，所有座位同步收到 snapshot
    const faPromises = sockets.map((s) => waitViewPhase(s, 'victoryCheck'));
    host.emit('room.forceAdvance', { seatToken: tokens[0] });
    const faViews = await Promise.all(faPromises);
    for (const v of faViews) {
      expect(v.phase).toBe('victoryCheck');
    }
    expect(room.state?.phase).toBe('victoryCheck');
  });
});

