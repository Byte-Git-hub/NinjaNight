/**
 * 6G-2 社交层集成测试：SocialMarks 状态机 + EffectRelay 校验/广播。
 * 不启动 mediasoup/Socket.IO，用 fake io 断言广播形状；纯社交层，不碰 core。
 */
import { describe, expect, it } from 'vitest';
import { SocialMarks } from '../../src/server/social';
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

describe('social marks', () => {
  it('setMark 新增并全房广播 mark.state 快照', () => {
    const { io, emitted } = makeIo();
    const social = new SocialMarks(io);
    const snap = social.setMark('R1', 's0', 's1');
    expect(snap).toEqual([{ from: 's0', target: 's1' }]);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ room: 'room:R1', event: 'mark.state' });
    const payload = emitted[0]!.payload as { roomCode: string; marks: unknown[] };
    expect(payload.roomCode).toBe('R1');
    expect(payload.marks).toEqual([{ from: 's0', target: 's1' }]);
  });

  it('重复点同一目标 = 取消', () => {
    const { io } = makeIo();
    const social = new SocialMarks(io);
    social.setMark('R', 's0', 's1');
    const snap = social.setMark('R', 's0', 's1');
    expect(snap).toEqual([]);
  });

  it('每人最多 2 个：超限淘汰最早的一个', () => {
    const { io } = makeIo();
    const social = new SocialMarks(io);
    social.setMark('R', 's0', 's1');
    social.setMark('R', 's0', 's2');
    const snap = social.setMark('R', 's0', 's3');
    expect(snap).toEqual([
      { from: 's0', target: 's2' },
      { from: 's0', target: 's3' },
    ]);
    // 别人的标记不受影响
    social.setMark('R', 's9', 's1');
    expect(social.snapshot('R')).toHaveLength(3);
  });

  it('clearMark 删除指定对；不存在也广播对齐', () => {
    const { io, emitted } = makeIo();
    const social = new SocialMarks(io);
    social.setMark('R', 's0', 's1');
    emitted.length = 0;
    expect(social.clearMark('R', 's0', 's1')).toEqual([]);
    expect(emitted.some((e) => e.event === 'mark.state')).toBe(true);
  });

  it('removeSeat 清理与该座位相关的所有标记（断线/踢出路径）', () => {
    const { io, emitted } = makeIo();
    const social = new SocialMarks(io);
    social.setMark('R', 's0', 's1');
    social.setMark('R', 's1', 's2');
    social.setMark('R', 's2', 's3');
    emitted.length = 0;
    social.removeSeat('R', 's1');
    expect(social.snapshot('R')).toEqual([{ from: 's2', target: 's3' }]);
    expect(emitted.some((e) => e.event === 'mark.state')).toBe(true);
    // 无变更不广播
    emitted.length = 0;
    social.removeSeat('R', 'ghost');
    expect(emitted).toHaveLength(0);
  });

  it('cleanupRoom 清空整房', () => {
    const { io } = makeIo();
    const social = new SocialMarks(io);
    social.setMark('R', 's0', 's1');
    social.cleanupRoom('R');
    expect(social.snapshot('R')).toEqual([]);
  });
});

describe('effect relay', () => {
  const inRoom = (id: string) => ['s0', 's1', 's2'].includes(id);

  it('合法单条通过；非法物品 id 整批丢弃', () => {
    expect(
      validateEffectItems({ items: [{ targetSeatId: 's1', itemId: 'egg', comboId: 'c1' }] }, inRoom),
    ).toEqual([{ targetSeatId: 's1', itemId: 'egg', comboId: 'c1' }]);
    expect(
      validateEffectItems({ items: [{ targetSeatId: 's1', itemId: 'nuke', comboId: 'c1' }] }, inRoom),
    ).toBeNull();
  });

  it('非法目标 / 非法 comboId / 空批 / 超 64 条整批丢弃', () => {
    expect(
      validateEffectItems({ items: [{ targetSeatId: 'ghost', itemId: 'egg', comboId: 'c1' }] }, inRoom),
    ).toBeNull();
    expect(
      validateEffectItems({ items: [{ targetSeatId: 's1', itemId: 'egg', comboId: '' }] }, inRoom),
    ).toBeNull();
    expect(validateEffectItems({ items: [] }, inRoom)).toBeNull();
    const big = Array.from({ length: 65 }, (_, i) => ({
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
