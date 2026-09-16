import type { RejectReason, SeatId } from '../shared/types';
import { getCardDef } from './deck';
import type { CardInstance, GameState, SeatState } from './game-state';
import { findSeat } from './utils';

export type ValidateResult = { ok: true } | { ok: false; reason: RejectReason };

/** 裁定 A/B — docs/01 §0.1 */
export function validateTarget(
  state: GameState,
  actor: SeatState,
  card: CardInstance,
  targetSeatId: SeatId,
): ValidateResult {
  const target = findSeat(state, targetSeatId);
  if (!target) return { ok: false, reason: 'illegalTarget' };

  const def = getCardDef(card.cardId);
  const base = card.cardId.split(':')[0] ?? '';

  if (base === 'spy' || base === 'mystic') {
    if (target.seatId === actor.seatId) return { ok: false, reason: 'illegalTarget' };
    return { ok: true };
  }

  if (base === 'blind_assassin') {
    // 允许自杀；禁止指向死亡者
    if (!target.alive) return { ok: false, reason: 'illegalTarget' };
    void def;
    return { ok: true };
  }

  if (base === 'shinobi') {
    // 允许自杀；允许死亡者（只看不杀）
    return { ok: true };
  }

  // 其他牌：允许自选与死亡（阶段 3 细化）
  return { ok: true };
}

export function livingOtherTargets(state: GameState, actorSeatId: SeatId): SeatId[] {
  return state.seats.filter((s) => s.alive && s.seatId !== actorSeatId).map((s) => s.seatId);
}

export function legalTargetsForCard(state: GameState, actor: SeatState, card: CardInstance): SeatId[] {
  const base = card.cardId.split(':')[0];
  if (base === 'blind_assassin') {
    return state.seats.filter((s) => s.alive).map((s) => s.seatId);
  }
  if (base === 'shinobi') {
    return state.seats.map((s) => s.seatId);
  }
  // spy/mystic
  return livingOtherTargets(state, actor.seatId);
}
