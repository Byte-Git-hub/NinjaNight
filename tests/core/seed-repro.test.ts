import { describe, expect, it } from 'vitest';
import { botDecide } from '../../src/core/bot';
import { applyAllDefaults, stateHash } from '../../src/core/engine';
import { projectView } from '../../src/core/project-view';
import { findSeat } from '../../src/core/utils';
import { parseGameSeed } from '../../src/shared/timeouts';
import { makeAdapter } from '../fixtures/game';

/** bot 全权驱动走完一整局，返回终局哈希（确定性：同 seed 必同哈希） */
function runFullGame(seed: number): string {
  const a = makeAdapter(seed, 4);
  let guard = 0;
  while (!a.getState().gameOver && guard < 600) {
    guard += 1;
    const st = a.getState();
    if (st.pending.length === 0) {
      const r = applyAllDefaults(st);
      (a as unknown as { state: typeof st }).state = r.state;
      continue;
    }
    let progressed = false;
    for (const p of [...a.getState().pending]) {
      const cur = a.getState();
      const pp = cur.pending.find((x) => x.id === p.id);
      if (!pp) continue;
      const view = projectView(cur, pp.seatId);
      if (!view) continue;
      const cmd = botDecide(view, pp.id);
      if (!cmd) {
        const r = applyAllDefaults(cur);
        (a as unknown as { state: typeof cur }).state = r.state;
        progressed = true;
        break;
      }
      cmd.seatToken = findSeat(cur, pp.seatId)?.seatToken ?? '';
      cmd.commandId = `seed-repro-${seed}-${guard}-${pp.id}`;
      const rejects: string[] = [];
      a.onReject((_id, reason) => rejects.push(reason));
      a.submit(cmd);
      expect(rejects, `seed=${seed} kind=${pp.kind}`).toEqual([]);
      progressed = true;
    }
    if (!progressed) break;
  }
  expect(a.getState().gameOver).toBe(true);
  return stateHash(a.getState());
}

describe('6J 种子机制：同一 seed 跑 3 次局面完全一致', () => {
  it('seed=42 三次终局哈希相同；换 seed 则不同', () => {
    const h1 = runFullGame(42);
    const h2 = runFullGame(42);
    const h3 = runFullGame(42);
    expect(h2).toBe(h1);
    expect(h3).toBe(h1);
    expect(runFullGame(43)).not.toBe(h1);
  });

  it('parseGameSeed：合法/非法输入', () => {
    expect(parseGameSeed(42)).toBe(42);
    expect(parseGameSeed('42')).toBe(42);
    expect(parseGameSeed('  7 ')).toBe(7);
    expect(parseGameSeed('')).toBeNull();
    expect(parseGameSeed(undefined)).toBeNull();
    expect(parseGameSeed('abc')).toBeNull();
    expect(parseGameSeed('-1')).toBeNull();
    expect(parseGameSeed('4.5')).toBeNull();
    expect(parseGameSeed('99999999999')).toBeNull();
    expect(parseGameSeed(1.5)).toBeNull();
  });
});
