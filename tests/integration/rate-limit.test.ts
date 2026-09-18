import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { createGameServer } from '../../src/server/index';
import type { ChatEventPayload } from '../../src/shared/protocol';

const PORT = 3467;

function waitEvent<T>(socket: ClientSocket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${event}`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

describe('6J-3 限频', () => {
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

  it('1 秒内发 100 条聊天，只处理 10 条', async () => {
    const base = `http://127.0.0.1:${PORT}`;
    const host = ioc(base, { transports: ['websocket'] });
    clients.push(host);
    await waitEvent(host, 'connect');
    host.emit('room.create', { nickname: 'Host' });
    const ack = await waitEvent<{ roomCode: string; seatToken: string }>(host, 'room.ack');

    let chatCount = 0;
    host.on('chat.event', (_p: ChatEventPayload) => {
      chatCount += 1;
    });
    for (let i = 0; i < 100; i += 1) {
      host.emit('chat.send', { seatToken: ack.seatToken, text: `msg-${i}` });
    }
    // 条件等待：首个 1s 窗口内只放行 10 条
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) {
      await new Promise((r) => setTimeout(r, 50));
      if (chatCount >= 10) break;
    }
    await new Promise((r) => setTimeout(r, 300));
    expect(chatCount).toBe(10);
  });

  it('房间码枚举：25 次快速加入，后 5 次被 RATE_LIMITED', async () => {
    const base = `http://127.0.0.1:${PORT}`;
    const s = ioc(base, { transports: ['websocket'] });
    clients.push(s);
    await waitEvent(s, 'connect');
    const reasons: string[] = [];
    s.on('room.error', (p: { reasonCode: string }) => reasons.push(p.reasonCode));
    for (let i = 0; i < 25; i += 1) {
      s.emit('room.join', { roomCode: 'ZZZZZZ', nickname: 'Eve' });
    }
    const t0 = Date.now();
    while (reasons.length < 25 && Date.now() - t0 < 10000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(reasons.length).toBe(25);
    expect(reasons.slice(0, 20).every((r) => r !== 'RATE_LIMITED')).toBe(true);
    expect(reasons.slice(20)).toEqual([
      'RATE_LIMITED',
      'RATE_LIMITED',
      'RATE_LIMITED',
      'RATE_LIMITED',
      'RATE_LIMITED',
    ]);
  });
});
