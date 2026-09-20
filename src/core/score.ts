import type { HouseId } from '../shared/types';
import { houseFamily, houseRank } from './deck';
import type { GameState } from './game-state';
import { pushEvent } from './events';
import { findSeat } from './utils';
import { drawToken } from './tokens';

let mastermindOverride: 'none' | { family: 'crane' | 'lotus' | 'ronin' } | null = null;

export function setMastermindOverride(
  v: 'none' | { family: 'crane' | 'lotus' | 'ronin' } | null,
): void {
  mastermindOverride = v;
}

export function getMastermindOverride(): typeof mastermindOverride {
  return mastermindOverride;
}

/** 夜晚结束后检查存活者手牌/reserved 中的大将军 */
export function resolveMastermind(state: GameState): void {
  mastermindOverride = null;
  for (const seat of state.seats) {
    if (!seat.alive) continue;
    const has =
      seat.hand.some((c) => c.cardId === 'mastermind') ||
      seat.reserved.some((c) => c.cardId === 'mastermind');
    if (!has) continue;
    const fam = houseFamily(seat.house);
    if (fam === 'ronin') {
      mastermindOverride = { family: 'ronin' };
      pushEvent(state, 'score.mastermindRevealed', 'public', {
        seatId: seat.seatId,
        family: 'ronin',
      });
      pushEvent(state, 'score.roundWinner', 'public', {
        winner: 'mastermind_ronin',
        note: 'mastermind_ronin_no_house',
        seatId: seat.seatId,
      });
      return;
    }
    mastermindOverride = { family: fam };
    pushEvent(state, 'score.mastermindRevealed', 'public', {
      seatId: seat.seatId,
      family: fam,
    });
    pushEvent(state, 'score.roundWinner', 'public', {
      winner: fam,
      by: 'mastermind',
      seatId: seat.seatId,
    });
    return;
  }
}

export function scoreRound(state: GameState): void {
  const living = state.seats.filter((s) => s.alive);

  // TBD-03 情况 2：全灭
  if (living.length === 0) {
    pushEvent(state, 'score.roundWinner', 'public', { winner: 'none', reason: 'all_dead' });
    finishVictoryCheck(state);
    return;
  }

  const awarded: Array<{ seatId: string; tokenValue: number }> = [];
  let winner: string = 'none';

  const mm = mastermindOverride;
  if (mm && mm !== 'none' && mm.family === 'ronin') {
    for (const s of living) {
      if (s.house === 'ronin') {
        const t = drawToken(state);
        if (t) {
          s.tokens.push(t);
          awarded.push({ seatId: s.seatId, tokenValue: t.value });
        }
      }
    }
    winner = 'mastermind_ronin';
  } else if (mm && mm !== 'none' && (mm.family === 'crane' || mm.family === 'lotus')) {
    winner = mm.family;
    for (const s of state.seats) {
      if (houseFamily(s.house) === winner) {
        const t = drawToken(state);
        if (t) {
          s.tokens.push(t);
          awarded.push({ seatId: s.seatId, tokenValue: t.value });
        }
      }
    }
  } else {
    const crane = living.filter((s) => houseFamily(s.house) === 'crane');
    const lotus = living.filter((s) => houseFamily(s.house) === 'lotus');
    const craneRanks = crane.map((s) => houseRank(s.house)).sort((a, b) => a - b);
    const lotusRanks = lotus.map((s) => houseRank(s.house)).sort((a, b) => a - b);

    // TBD-03 情况 1：双方无存活，浪人存活
    if (craneRanks.length === 0 && lotusRanks.length === 0) {
      winner = 'none';
    } else if (craneRanks.length === 0) {
      winner = 'lotus';
    } else if (lotusRanks.length === 0) {
      winner = 'crane';
    } else {
      const cmp = compareSeq(craneRanks, lotusRanks);
      if (cmp < 0) winner = 'crane';
      else if (cmp > 0) winner = 'lotus';
      else winner = 'tie';
    }

    if (winner === 'crane' || winner === 'lotus') {
      for (const s of state.seats) {
        if (houseFamily(s.house) === winner) {
          const t = drawToken(state);
          if (t) {
            s.tokens.push(t);
            awarded.push({ seatId: s.seatId, tokenValue: t.value });
          }
        }
      }
    } else if (winner === 'tie') {
      for (const s of living) {
        const t = drawToken(state);
        if (t) {
          s.tokens.push(t);
          awarded.push({ seatId: s.seatId, tokenValue: t.value });
        }
      }
    }
  }

  // 浪人存活额外（正常路径；mastermind_ronin 已发）
  if (winner !== 'mastermind_ronin') {
    for (const s of living) {
      if (s.house === 'ronin') {
        const t = drawToken(state);
        if (t) {
          s.tokens.push(t);
          awarded.push({ seatId: s.seatId, tokenValue: t.value });
        }
      }
    }
  }

  // 公开事件只给枚数（谁得几枚），面值走私密事件（令牌总分保密）
  const counts = new Map<string, number>();
  for (const a of awarded) counts.set(a.seatId, (counts.get(a.seatId) ?? 0) + 1);
  pushEvent(state, 'score.roundWinner', 'public', {
    winner,
    awarded: [...counts].map(([seatId, count]) => ({ seatId, count })),
  });
  for (const a of awarded) {
    pushEvent(state, 'score.honorAwarded', { seats: [a.seatId] }, {
      tokenValue: a.tokenValue,
    });
  }
  finishVictoryCheck(state);
}

function finishVictoryCheck(state: GameState): void {
  const scores = state.seats.map((s) => ({
    seatId: s.seatId,
    score: s.tokens.reduce((sum, t) => sum + t.value, 0),
  }));
  const max = scores.length ? Math.max(...scores.map((s) => s.score)) : 0;
  if (max >= 10) {
    const winners = scores.filter((s) => s.score === max).map((s) => s.seatId);
    state.winners = winners;
    state.gameOver = true;
    state.phase = 'gameOver';
    pushEvent(state, 'score.victory', 'public', { winners, scores });
  } else {
    state.phase = 'victoryCheck';
  }
}

function compareSeq(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const av = a[i] ?? Number.POSITIVE_INFINITY;
    const bv = b[i] ?? Number.POSITIVE_INFINITY;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

export function seatScore(state: GameState, seatId: string): number {
  const seat = findSeat(state, seatId);
  return seat ? seat.tokens.reduce((s, t) => s + t.value, 0) : 0;
}

export type { HouseId };
