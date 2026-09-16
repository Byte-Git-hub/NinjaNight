import { describe, expect, it } from 'vitest';
import type { Server } from 'socket.io';
import { RoomRuntime } from '../../src/server/room';
import { EMPTY_ROOM_TTL_MS } from '../../src/shared/timeouts';

function makeRoom(): RoomRuntime {
  const fakeIo = {
    to: () => ({ emit: () => {} }),
  } as unknown as Server;
  return new RoomRuntime(fakeIo, 'ABCDEF');
}

describe('room cleanup TTL', () => {
  it('空房超过 TTL 标记可清理', () => {
    const room = makeRoom();
    room.emptySince = Date.now() - EMPTY_ROOM_TTL_MS - 1000;
    expect(room.isIdleExpired(Date.now(), EMPTY_ROOM_TTL_MS, 10_000)).toBe(true);
  });

  it('空房未超 TTL 不清理', () => {
    const room = makeRoom();
    room.emptySince = Date.now();
    expect(room.isIdleExpired(Date.now(), EMPTY_ROOM_TTL_MS, 10_000)).toBe(false);
  });
});
