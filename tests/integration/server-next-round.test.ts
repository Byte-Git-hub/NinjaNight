import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { createGameServer } from '../../src/server/index';
import type { PlayerView } from '../../src/shared/types';

const PORT = 3466;

function waitEvent<T>(socket: ClientSocket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${event}`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

function waitPhase(socket: ClientSocket, phases: string[], timeoutMs = 15000): Promise<PlayerView> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting ${phases.join('/')}`)), timeoutMs);
    const handler = (v: PlayerView) => {
      if (phases.includes(v.phase)) {
        clearTimeout(t);
        socket.off('view.snapshot', handler);
        resolve(v);
      }
    };
    socket.on('view.snapshot', handler);
  });
}

async function forceToVictory(host: ClientSocket, token: string): Promise<PlayerView> {
  let last: PlayerView | null = null;
  for (let i = 0; i < 10; i += 1) {
    const p = waitPhase(host, ['victoryCheck', 'gameOver', 'draftPick1'], 8000);
    host.emit('room.forceAdvance', { seatToken: token });
    last = await p;
    if (last.phase === 'victoryCheck' || last.gameOver) break;
  }
  if (!last || (last.phase !== 'victoryCheck' && !last.gameOver)) {
    throw new Error(`未到达 victoryCheck，最后 phase=${last?.phase}`);
  }
  return last;
}

describe('Bug2: victoryCheck 下一轮（server）', () => {
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

  async function startFourHumans(): Promise<{ host: ClientSocket; token: string }> {
    const base = `http://127.0.0.1:${PORT}`;
    const host = ioc(base, { transports: ['websocket'] });
    clients.push(host);
    await waitEvent(host, 'connect');
    host.emit('room.create', { nickname: 'Host' });
    const ack0 = await waitEvent<{ roomCode: string; seatToken: string }>(host, 'room.ack');
    const tokens = [ack0.seatToken];
    for (let i = 1; i < 4; i += 1) {
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
    await new Promise((r) => setTimeout(r, 50));
    const viewP = waitEvent<PlayerView>(host, 'view.snapshot');
    host.emit('room.start', { seatToken: tokens[0] });
    await viewP;
    return { host, token: tokens[0] as string };
  }

  async function startSoloBots(): Promise<{ host: ClientSocket; token: string }> {
    const base = `http://127.0.0.1:${PORT}`;
    const host = ioc(base, { transports: ['websocket'] });
    clients.push(host);
    await waitEvent(host, 'connect');
    host.emit('room.create', { nickname: 'Host' });
    const ack0 = await waitEvent<{ roomCode: string; seatToken: string }>(host, 'room.ack');
    for (let i = 0; i < 3; i += 1) {
      host.emit('room.addBot', { seatToken: ack0.seatToken });
      await new Promise((r) => setTimeout(r, 50));
    }
    const viewP = waitEvent<PlayerView>(host, 'view.snapshot');
    host.emit('room.start', { seatToken: ack0.seatToken });
    await viewP;
    return { host, token: ack0.seatToken };
  }

  it('房主 forceAdvance 在 victoryCheck 进入下一轮（round+1）', async () => {
    const { host, token } = await startFourHumans();
    const end = await forceToVictory(host, token);
    expect(end.gameOver).toBe(false);
    expect(end.phase).toBe('victoryCheck');

    const nextP = waitPhase(host, ['draftPick1'], 8000);
    host.emit('room.forceAdvance', { seatToken: token });
    const next = await nextP;
    expect(next.round).toBe(end.round + 1);
  });

  it('单人+bot 房 victoryCheck 后 10s 自动进下一轮（结算倒计时可视）', async () => {
    const { host, token } = await startSoloBots();
    const end = await forceToVictory(host, token);
    expect(end.gameOver).toBe(false);
    expect(end.phase).toBe('victoryCheck');
    // 结算倒计时 deadline 由服务端下发：约 now+10s（VICTORY_AUTO_ADVANCE_MS）
    expect(typeof end.autoAdvanceAt).toBe('number');
    const gap = (end.autoAdvanceAt as number) - Date.now();
    expect(gap).toBeGreaterThan(5000);
    expect(gap).toBeLessThanOrEqual(10000);
    // 不做任何操作，等自动推进（默认 10000ms）
    const next = await waitPhase(host, ['draftPick1'], 25000);
    expect(next.round).toBe(end.round + 1);
  }, 60000);

  it('多人房 victoryCheck 不下发自动推进 deadline（等房主手动）', async () => {
    const { host, token } = await startFourHumans();
    const end = await forceToVictory(host, token);
    expect(end.gameOver).toBe(false);
    expect(end.phase).toBe('victoryCheck');
    expect(end.autoAdvanceAt).toBeUndefined();
  });
});
