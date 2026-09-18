import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { createGameServer } from '../../src/server/index';
import { MIN_PLAYERS } from '../../src/shared/timeouts';
import type { PlayerView } from '../../src/shared/types';

const PORT = 3463;

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

async function makeRoom(n = MIN_PLAYERS): Promise<{ host: ClientSocket; tokens: string[]; sockets: ClientSocket[] }> {
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
  for (let i = 1; i < tokens.length; i += 1) {
    host.emit('room.ready', { seatToken: tokens[i], ready: true });
  }
  await new Promise((r) => setTimeout(r, 30));
  host.emit('room.ready', { seatToken: tokens[0], ready: true });
  await new Promise((r) => setTimeout(r, 30));
  return { host, tokens, sockets };
}

describe('6J 种子机制（联机）', () => {
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

  it('房主指定 seed：视图 gameSeed 全程可见且等于指定值', async () => {
    const { host, tokens, sockets } = await makeRoom();
    clients.push(...sockets);
    const viewP = nextView(host);
    host.emit('room.start', { seatToken: tokens[0], seed: 4242 });
    const view = await viewP;
    expect(view.gameSeed).toBe(4242);
  });

  it('随机局：进行中 gameSeed 为 null（保密）', async () => {
    const { host, tokens, sockets } = await makeRoom();
    clients.push(...sockets);
    const viewP = nextView(host);
    host.emit('room.start', { seatToken: tokens[0] });
    const view = await viewP;
    expect(view.gameOver).toBe(false);
    expect(view.gameSeed ?? null).toBeNull();
  });

  it('非法 seed 被忽略：照常用随机种子开局', async () => {
    const { host, tokens, sockets } = await makeRoom();
    clients.push(...sockets);
    const viewP = nextView(host);
    host.emit('room.start', { seatToken: tokens[0], seed: 'not-a-seed' });
    const view = await viewP;
    expect(view.phase).toBe('draftPick1');
    expect(view.gameSeed ?? null).toBeNull();
  });
});
