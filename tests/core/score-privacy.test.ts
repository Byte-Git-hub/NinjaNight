import { describe, expect, it } from 'vitest';
import { scoreRound } from '../../src/core/score';
import { makeAdapter } from '../fixtures/game';

function publicJson(st: ReturnType<ReturnType<typeof makeAdapter>['mutableState']>): string {
  return JSON.stringify(st.events.filter((e) => e.visibility === 'public'));
}

describe('Bug3: roundWinner 脱敏', () => {
  it('公开事件不含任何 tokenValue 面值', () => {
    const a = makeAdapter(31);
    const st = a.mutableState();
    st.pending = [];
    scoreRound(st);
    expect(st.phase).toBe('victoryCheck');
    const pub = publicJson(st);
    expect(pub).not.toContain('tokenValue');
    // 公开仍保留枚数信息
    const rw = st.events.find((e) => e.type === 'score.roundWinner' && e.visibility === 'public');
    expect(rw).toBeTruthy();
    const awarded = (rw!.payload as { awarded: Array<{ seatId: string; count: number }> }).awarded;
    expect(awarded.length).toBeGreaterThan(0);
    for (const x of awarded) {
      expect(typeof x.seatId).toBe('string');
      expect(typeof x.count).toBe('number');
      expect('tokenValue' in x).toBe(false);
    }
  });

  it('得牌者能收到私密 honorAwarded（含面值，用于个人反馈）', () => {
    const a = makeAdapter(32);
    const st = a.mutableState();
    st.pending = [];
    scoreRound(st);
    const privates = st.events.filter(
      (e) => e.type === 'score.honorAwarded' && typeof e.visibility === 'object',
    );
    expect(privates.length).toBeGreaterThan(0);
    for (const e of privates) {
      expect('tokenValue' in e.payload).toBe(true);
    }
  });

  it('终局 score.victory 公开总分合法（Q5）', () => {
    const a = makeAdapter(33);
    const st = a.mutableState();
    st.pending = [];
    st.seats[0]!.tokens.push(
      { instanceId: 'v1', value: 4 },
      { instanceId: 'v2', value: 4 },
      { instanceId: 'v3', value: 4 },
    );
    scoreRound(st);
    expect(st.gameOver).toBe(true);
    const vic = st.events.find((e) => e.type === 'score.victory' && e.visibility === 'public');
    expect(vic).toBeTruthy();
    expect((vic!.payload as { winners: string[] }).winners).toContain('s0');
    expect((vic!.payload as { scores: Array<{ seatId: string; score: number }> }).scores[0]).toHaveProperty('score');
  });
});
