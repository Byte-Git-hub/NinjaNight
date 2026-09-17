/**
 * 6G-2a 特效网络层集成测试：EffectRelay 校验 + 广播透传。
 * 不启动 mediasoup/Socket.IO，用 fake io 断言广播形状；只广播不存，不碰 core。
 */
import { describe, expect, it } from 'vitest';
import { EffectRelay, validateEffectItems } from '../../src/server/effects';

function makeIo() {
  const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
  const io = {
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          emitted.push({ room, event, payload });
        },
      };
    },
  };
  return { io, emitted };
}

describe('effect relay', () => {
  const inRoom = (id: string) => ['s0', 's1', 's2'].includes(id);

  it('合法单条通过；非法物品 id 整批丢弃', () => {
    expect(
      validateEffectItems({ items: [{ targetSeatId: 's1', itemId: 'egg', comboId: 'c1' }] }, inRoom),
    ).toEqual([{ targetSeatId: 's1', itemId: 'egg', comboId: 'c1' }]);
    expect(
      validateEffectItems(
        { items: [{ targetSeatId: 's1', itemId: 'nuke', comboId: 'c1' }] },
        inRoom,
      ),
    ).toBeNull();
  });

  it('定稿 9 串全部通过；旧占位 id 不通过', () => {
    for (const id of [
      'egg',
      'sakura',
      'geta',
      'rotten_pill',
      'basket',
      'secret_letter',
      'tea',
      'snowball',
      'shuriken',
    ]) {
      expect(
        validateEffectItems({ items: [{ targetSeatId: 's1', itemId: id, comboId: 'c1' }] }, inRoom),
      ).toHaveLength(1);
    }
    for (const id of ['dango', 'letter', 'snow']) {
      expect(
        validateEffectItems({ items: [{ targetSeatId: 's1', itemId: id, comboId: 'c1' }] }, inRoom),
      ).toBeNull();
    }
  });

  it('非法目标 / 非法 comboId / 空批 / 超 10 条整批丢弃', () => {
    expect(
      validateEffectItems(
        { items: [{ targetSeatId: 'ghost', itemId: 'egg', comboId: 'c1' }] },
        inRoom,
      ),
    ).toBeNull();
    expect(
      validateEffectItems({ items: [{ targetSeatId: 's1', itemId: 'egg', comboId: '' }] }, inRoom),
    ).toBeNull();
    expect(validateEffectItems({ items: [] }, inRoom)).toBeNull();
    const big = Array.from({ length: 11 }, (_, i) => ({
      targetSeatId: 's1',
      itemId: 'egg',
      comboId: `c${i}`,
    }));
    expect(validateEffectItems({ items: big }, inRoom)).toBeNull();
  });

  it('broadcast 透传 effect.batch（含 from/昵称），不存状态', () => {
    const { io, emitted } = makeIo();
    const relay = new EffectRelay(io);
    relay.broadcast('R1', 'room:R1', 's0', '房主', [
      { targetSeatId: 's1', itemId: 'tea', comboId: 'c9' },
    ]);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ room: 'room:R1', event: 'effect.batch' });
    const payload = emitted[0]!.payload as {
      roomCode: string;
      items: Array<Record<string, unknown>>;
    };
    expect(payload.roomCode).toBe('R1');
    expect(payload.items).toEqual([
      {
        fromSeatId: 's0',
        fromNickname: '房主',
        targetSeatId: 's1',
        itemId: 'tea',
        comboId: 'c9',
      },
    ]);
    // 空批不广播
    relay.broadcast('R1', 'room:R1', 's0', '房主', []);
    expect(emitted).toHaveLength(1);
  });
});
