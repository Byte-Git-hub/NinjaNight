import type { SeatId } from '../shared/types';
import { getCardDef } from './deck';
import type { GameState, SeatState } from './game-state';
import { createRng, resumeRng } from './rng';

export function cloneGameState(state: GameState): GameState {
  const rng = resumeRng(state.seed, state.rngCalls);
  return {
    ...state,
    rng,
    seats: state.seats.map((s): SeatState => ({ ...s, knownHouses: s.knownHouses.map((k) => ({ ...k })), tokens: s.tokens.map((t) => ({ ...t })), hand: s.hand.map((c) => ({ ...c })), reserved: s.reserved.map((c) => ({ ...c })), draftHand: s.draftHand.map((c) => ({ ...c })), declared: s.declared.map((c) => ({ ...c })) })),
    zones: {
      undrawn: state.zones.undrawn.map((c) => ({ ...c })),
      draftDiscard: state.zones.draftDiscard.map((c) => ({ ...c })),
      revealedInPlay: state.zones.revealedInPlay.map((c) => ({ ...c })),
      spent: state.zones.spent.map((c) => ({ ...c })),
    },
    resolveQueue: state.resolveQueue.map((q) => ({ ...q, instance: { ...q.instance } })),
    pending: state.pending.map((p) => ({ ...p, options: [...p.options], context: { ...p.context, relatedInstanceIds: [...p.context.relatedInstanceIds] } })),
    resolveContext: state.resolveContext ? { ...state.resolveContext, instance: { ...state.resolveContext.instance } } : null,
    events: state.events.map((e) => ({ ...e, payload: { ...e.payload } })),
    processedCommandIds: [...state.processedCommandIds],
    startingHouses: { ...state.startingHouses },
    tokenPool: state.tokenPool.map((t) => ({ ...t })),
    winners: [...state.winners],
  };
}

export function syncRngCalls(state: GameState): void {
  state.rngCalls = state.rng.calls;
}

export function findSeat(state: GameState, seatId: SeatId): SeatState | undefined {
  return state.seats.find((s) => s.seatId === seatId);
}

export function findSeatByToken(state: GameState, token: string): SeatState | undefined {
  return state.seats.find((s) => s.seatToken === token);
}

let instanceCounter = 0;

export function nextInstanceId(prefix: string): string {
  instanceCounter += 1;
  return `${prefix}#${instanceCounter}`;
}

export function resetInstanceCounter(n = 0): void {
  instanceCounter = n;
}

export function cardNumber(cardId: string): number | null {
  return getCardDef(cardId).number;
}

export function useRng<T>(state: GameState, fn: (rng: { int(n: number): number; shuffle<A>(a: readonly A[]): A[]; next(): number }) => T): T {
  const result = fn(state.rng);
  syncRngCalls(state);
  return result;
}

export { createRng, resumeRng };
