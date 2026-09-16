import type { GameState } from './game-state';

export interface HonorToken {
  instanceId: string;
  value: 2 | 3 | 4;
}

/** 临时面值分布【待确认 TBD-02】：12×2 + 12×3 + 11×4 = 35 */
export function createTokenPool(): HonorToken[] {
  const pool: HonorToken[] = [];
  for (let i = 0; i < 12; i += 1) pool.push({ instanceId: `tok-2-${i}`, value: 2 });
  for (let i = 0; i < 12; i += 1) pool.push({ instanceId: `tok-3-${i}`, value: 3 });
  for (let i = 0; i < 11; i += 1) pool.push({ instanceId: `tok-4-${i}`, value: 4 });
  return pool;
}

export function drawToken(state: GameState): HonorToken | null {
  if (state.tokenPool.length === 0) return null; // TBD-09
  const idx = state.rng.int(state.tokenPool.length);
  state.rngCalls = state.rng.calls;
  const tok = state.tokenPool.splice(idx, 1)[0];
  return tok ?? null;
}

export function tokenCount(seat: GameState['seats'][number]): number {
  return seat.tokens.length;
}
