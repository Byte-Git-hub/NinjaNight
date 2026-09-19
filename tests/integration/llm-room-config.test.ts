import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { createGameServer } from '../../src/server/index';

const PORT = 3475;

function event<T>(socket: ClientSocket, name: string, timeout = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${name}`)), timeout);
    socket.once(name, (payload: T) => { clearTimeout(timer); resolve(payload); });
  });
}

describe('房主 LLM key 房间隔离与协议', () => {
  let server: ReturnType<typeof createGameServer>;
  const sockets: ClientSocket[] = [];
  beforeEach(async () => { server = createGameServer(PORT); await server.listen(); });
  afterEach(async () => { for (const s of sockets) s.disconnect(); sockets.length = 0; await server.close(); });

  it('创建时 key 仅存房间内存，房主可查询和撤回，非房主拒绝', async () => {
    const host = ioc(`http://127.0.0.1:${PORT}`, { transports: ['websocket'] }); sockets.push(host);
    await event(host, 'connect');
    host.emit('room.create', { nickname: 'Host', llmApiKey: 'sk-room-secret' });
    const ack = await event<{ roomCode: string; seatToken: string }>(host, 'room.ack');
    const room = server.rooms.get(ack.roomCode)!;
    expect(room.llmOverrideKey).toBe('sk-room-secret');
    const status = await new Promise<any>((resolve) => host.emit('room.llmConfig', { seatToken: ack.seatToken }, resolve));
    expect(status).toMatchObject({ ok: true, hasRoomKey: true, source: 'room' });
    expect(JSON.stringify(status)).not.toContain('sk-room-secret');

    const guest = ioc(`http://127.0.0.1:${PORT}`, { transports: ['websocket'] }); sockets.push(guest);
    await event(guest, 'connect');
    guest.emit('room.join', { roomCode: ack.roomCode, nickname: 'Guest' });
    const guestAck = await event<{ seatToken: string }>(guest, 'room.ack');
    const denied = await new Promise<any>((resolve) => guest.emit('room.llmConfig', { seatToken: guestAck.seatToken, apiKey: 'sk-other' }, resolve));
    expect(denied).toEqual({ ok: false, reasonCode: 'NOT_HOST' });

    const cleared = await new Promise<any>((resolve) => host.emit('room.llmConfig', { seatToken: ack.seatToken, apiKey: null }, resolve));
    expect(cleared).toMatchObject({ ok: true, hasRoomKey: false });
    expect(room.llmOverrideKey).toBeUndefined();
  });
});
