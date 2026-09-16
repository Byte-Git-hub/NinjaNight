import type {
  GameEvent,
  HouseId,
  PendingDecision,
  PlayerSeatView,
  PlayerView,
  SeatId,
  SelfView,
} from '../shared/types';
import type { GameState } from './game-state';
import { findSeat } from './utils';

function visibleEvent(state: GameState, seatId: SeatId): GameEvent[] {
  return state.events.filter((e) => {
    if (e.visibility === 'public') return true;
    if (e.visibility === 'server') return false;
    if (Array.isArray(e.visibility)) return false;
    if (typeof e.visibility === 'object' && 'seats' in e.visibility) {
      return e.visibility.seats.includes(seatId);
    }
    return false;
  });
}

function revealedPublicHouse(seat: GameState['seats'][number]): HouseId | undefined {
  if (seat.houseRevealed) return seat.house;
  return undefined;
}

export function projectView(state: GameState, seatId: SeatId): PlayerView | null {
  const self = findSeat(state, seatId);
  if (!self) return null;

  const seats: PlayerSeatView[] = state.seats.map((s) => ({
    seatId: s.seatId,
    nickname: s.nickname,
    connected: s.connected,
    alive: s.alive,
    isHost: s.isHost,
    honorTokenCount: s.tokens.length,
    publicHouseId: revealedPublicHouse(s),
  }));

  const selfView: SelfView = {
    seatId: self.seatId,
    houseId: self.house,
    canViewOwnHouse: true,
    hand: self.hand.map((c) => ({
      instanceId: c.instanceId,
      cardId: c.cardId,
      number: c.number,
    })),
    reserved: self.reserved.map((c) => ({
      instanceId: c.instanceId,
      cardId: c.cardId,
      number: c.number,
    })),
    honorTokens: self.tokens.map((t) => ({
      instanceId: t.instanceId,
      value: t.value,
    })),
    knownHouseHistory: self.knownHouses.map((k) => ({
      round: k.round,
      targetSeatId: k.targetSeatId,
      houseId: k.houseId,
      viaCardId: k.viaCardId,
    })),
    declaredThisPhase: self.declared.map((c) => c.instanceId),
    hasPending: state.pending.some((p) => p.seatId === self.seatId),
  };

  const pending: PendingDecision | null =
    state.pending.find((p) => p.seatId === self.seatId) ?? null;

  return {
    roomCode: state.roomCode,
    round: state.round,
    phase: state.phase,
    step: state.step,
    windowId: state.windowId,
    pendingDecision: pending,
    seats,
    self: selfView,
    events: visibleEvent(state, seatId),
    revealedCards: state.zones.revealedInPlay.map((c) => ({
      instanceId: c.instanceId,
      cardId: c.cardId,
      number: c.number,
    })),
    gameOver: state.gameOver,
    winners: [...state.winners],
  };
}

/** 仅 dev 全知 */
export function omniscientView(state: GameState): Record<SeatId, PlayerView> {
  const out: Record<SeatId, PlayerView> = {};
  for (const s of state.seats) {
    const v = projectView(state, s.seatId);
    if (v) out[s.seatId] = v;
  }
  return out;
}

export type { HouseId };
