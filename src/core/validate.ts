import type { RejectReason, SeatId } from '../shared/types';
import { baseOf } from './deck';
import type { CardInstance, GameState, SeatState } from './game-state';
import { findSeat } from './utils';

export type ValidateResult = { ok: true } | { ok: false; reason: RejectReason };

export function validateTarget(
  state: GameState,
  actor: SeatState,
  card: CardInstance,
  targetSeatId: SeatId,
): ValidateResult {
  const target = findSeat(state, targetSeatId);
  if (!target) return { ok: false, reason: 'illegalTarget' };
  const b = baseOf(card.cardId);

  if (b === 'spy' || b === 'mystic') {
    if (target.seatId === actor.seatId) return { ok: false, reason: 'illegalTarget' };
    return { ok: true };
  }
  if (b === 'blind_assassin') {
    if (!target.alive) return { ok: false, reason: 'illegalTarget' };
    return { ok: true };
  }
  if (b === 'shinobi') return { ok: true };
  // 其余允许自选/死亡（01 §0.1 A/B）
  return { ok: true };
}

export function legalTargetsForCard(
  state: GameState,
  actor: SeatState,
  card: CardInstance,
): SeatId[] {
  const b = baseOf(card.cardId);
  if (b === 'blind_assassin') {
    return state.seats.filter((s) => s.alive).map((s) => s.seatId);
  }
  if (b === 'shinobi') {
    return state.seats.map((s) => s.seatId);
  }
  if (b === 'spy' || b === 'mystic') {
    return state.seats.filter((s) => s.alive && s.seatId !== actor.seatId).map((s) => s.seatId);
  }
  if (b === 'thief') {
    return state.seats
      .filter((s) => s.tokens.length > actor.tokens.length)
      .map((s) => s.seatId);
  }
  if (b === 'troublemaker' || b === 'spirit_merchant') {
    return state.seats.filter((s) => s.seatId !== actor.seatId).map((s) => s.seatId);
  }
  // shapeshifter / judge: 任意
  return state.seats.map((s) => s.seatId);
}
