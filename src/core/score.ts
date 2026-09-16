import type { HouseId } from '../shared/types';
import { houseFamily, houseRank } from './deck';
import type { GameState } from './game-state';
import { findSeat, syncRngCalls } from './utils';
import { pushEvent } from './events';

export function scoreRound(state: GameState): void {
  const living = state.seats.filter((s) => s.alive);
  const crane = living.filter((s) => houseFamily(s.house) === 'crane');
  const lotus = living.filter((s) => houseFamily(s.house) === 'lotus');

  const craneRanks = crane.map((s) => houseRank(s.house)).sort((a, b) => a - b);
  const lotusRanks = lotus.map((s) => houseRank(s.house)).sort((a, b) => a - b);

  type Winner = 'crane' | 'lotus' | 'tie' | 'none';
  let winner: Winner = 'tie';
  if (craneRanks.length === 0 && lotusRanks.length === 0) {
    winner = 'none';
  } else if (craneRanks.length === 0) {
    winner = 'lotus';
  } else if (lotusRanks.length === 0) {
    winner = 'crane';
  } else {
    const cmp = compareSequences(craneRanks, lotusRanks);
    if (cmp < 0) winner = 'crane';
    else if (cmp > 0) winner = 'lotus';
    else winner = 'tie';
  }

  const awarded: Array<{ seatId: string; tokenValue: number }> = [];

  if (winner === 'crane' || winner === 'lotus') {
    for (const seat of state.seats) {
      if (houseFamily(seat.house) === winner) {
        const tok = drawToken(state);
        if (tok) {
          seat.tokens.push(tok);
          awarded.push({ seatId: seat.seatId, tokenValue: tok.value });
        }
      }
    }
  } else if (winner === 'tie') {
    for (const seat of living) {
      const tok = drawToken(state);
      if (tok) {
        seat.tokens.push(tok);
        awarded.push({ seatId: seat.seatId, tokenValue: tok.value });
      }
    }
  }

  for (const seat of living) {
    if (seat.house === 'ronin') {
      const tok = drawToken(state);
      if (tok) {
        seat.tokens.push(tok);
        awarded.push({ seatId: seat.seatId, tokenValue: tok.value });
      }
    }
  }

  pushEvent(state, 'score.roundWinner', 'public', { winner, awarded });

  const scores = state.seats.map((s) => ({
    seatId: s.seatId,
    score: s.tokens.reduce((sum, t) => sum + t.value, 0),
  }));
  const max = Math.max(...scores.map((s) => s.score));
  if (max >= 10) {
    const winners = scores.filter((s) => s.score === max).map((s) => s.seatId);
    state.winners = winners;
    state.gameOver = true;
    state.phase = 'gameOver';
    pushEvent(state, 'score.victory', 'public', { winners, scores });
  } else {
    state.phase = 'victoryCheck';
  }
  syncRngCalls(state);
}

function compareSequences(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const av = a[i] ?? Number.POSITIVE_INFINITY;
    const bv = b[i] ?? Number.POSITIVE_INFINITY;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

function drawToken(state: GameState): GameState['tokenPool'][number] | null {
  if (state.tokenPool.length === 0) return null;
  const idx = state.rng.int(state.tokenPool.length);
  syncRngCalls(state);
  const tok = state.tokenPool.splice(idx, 1)[0];
  return tok ?? null;
}

export function seatScore(state: GameState, seatId: string): number {
  const seat = findSeat(state, seatId);
  return seat ? seat.tokens.reduce((s, t) => s + t.value, 0) : 0;
}

export type { HouseId };
