/**
 * 6G-1 语音状态单测：纯 VoiceManager 状态机，不启动 mediasoup worker。
 * 覆盖：join/leave/mute/speaking 规则 + 广播 payload 形状 + 清理路径。
 */
import { describe, expect, it } from 'vitest';
import { VoiceManager } from '../../src/server/voice';

function makeManager() {
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
  return { mgr: new VoiceManager(io), emitted };
}

describe('voice state', () => {
  it('join 后快照含该座位（inVoice=true），broadcast 发 voice.state', () => {
    const { mgr, emitted } = makeManager();
    const snap = mgr.join('ROOM01', 's0');
    expect(snap).toEqual([{ seatId: 's0', inVoice: true, muted: false, speaking: false }]);
    mgr.broadcastState('ROOM01');
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ room: 'room:ROOM01', event: 'voice.state' });
    const payload = emitted[0]!.payload as { roomCode: string; seats: unknown[] };
    expect(payload.roomCode).toBe('ROOM01');
    expect(payload.seats).toHaveLength(1);
  });

  it('mute=true 时 speaking 被清零；闭麦座位 setSpeaking 返回 null', () => {
    const { mgr } = makeManager();
    mgr.join('R', 's0');
    mgr.setSpeaking('R', 's0', true);
    expect(mgr.snapshot('R')[0]!.speaking).toBe(true);
    mgr.setMuted('R', 's0', true);
    const s = mgr.snapshot('R')[0]!;
    expect(s.muted).toBe(true);
    expect(s.speaking).toBe(false);
    expect(mgr.setSpeaking('R', 's0', true)).toBeNull();
  });

  it('未加入语音的座位 setSpeaking 返回 null（不脏写）', () => {
    const { mgr } = makeManager();
    expect(mgr.setSpeaking('R', 'ghost', true)).toBeNull();
    expect(mgr.snapshot('R')).toEqual([]);
  });

  it('相同 speaking 值重复上报返回 null（调用方免广播）', () => {
    const { mgr } = makeManager();
    mgr.join('R', 's0');
    expect(mgr.setSpeaking('R', 's0', false)).toBeNull();
  });

  it('leave 删除座位并广播；cleanupRoom 清空整房', () => {
    const { mgr, emitted } = makeManager();
    mgr.join('R', 's0');
    mgr.join('R', 's1');
    mgr.leave('R', 's0');
    expect(mgr.snapshot('R').map((s) => s.seatId)).toEqual(['s1']);
    mgr.broadcastState('R');
    const last = emitted[emitted.length - 1]!.payload as { seats: Array<{ seatId: string }> };
    expect(last.seats.map((s) => s.seatId)).toEqual(['s1']);
    mgr.cleanupRoom('R');
    expect(mgr.snapshot('R')).toEqual([]);
  });

  it('removeSeatEverywhere 删状态并广播（断线/踢出路径）', () => {
    const { mgr, emitted } = makeManager();
    mgr.join('R', 's0');
    mgr.removeSeatEverywhere('s0', 'R');
    expect(mgr.snapshot('R')).toEqual([]);
    expect(emitted.some((e) => e.event === 'voice.state')).toBe(true);
  });
});
