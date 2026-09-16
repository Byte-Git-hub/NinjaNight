import type { GamePhase } from '../shared/types';
import type { SeatState } from './game-state';
import type { GameState } from './game-state';
import { pushEvent } from './events';
import { baseOf } from './deck';

export function enterNightPhase(state: GameState, phase: GamePhase): void {
  state.phase = phase;
  state.step = 'collectDeclarations';
  state.windowId = `w-${phase}-${state.round}-${state.eventSeq}`;
  state.resolveQueue = [];
  state.resolveContext = null;
  state.pending = [];
  for (const seat of state.seats) {
    seat.declared = [];
    seat.declaredResponded = false;
  }
  pushEvent(state, 'night.phaseStarted', 'public', { phase });
  beginCollectDeclarations(state);
}

export function beginCollectDeclarations(state: GameState): void {
  state.step = 'collectDeclarations';
  state.pending = state.seats
    .filter((s) => s.alive && playableInstanceIds(state, s).length > 0)
    .map((s) => ({
      id: `${state.windowId}:${s.seatId}`,
      seatId: s.seatId,
      kind: 'declareCards' as const,
      options: playableInstanceIds(state, s),
      deadline: null,
      defaultChoice: { kind: 'pass' as const },
      context: {
        phase: state.phase,
        step: 'collectDeclarations' as const,
        relatedInstanceIds: playableInstanceIds(state, s),
      },
    }));

  if (state.pending.length === 0) {
    tryAdvanceNightPhase(state);
  }
}

export function afterDeclareSeat(state: GameState, seatId: string): void {
  const seat = state.seats.find((s) => s.seatId === seatId);
  if (seat) seat.declaredResponded = true;
  state.pending = state.pending.filter((p) => p.seatId !== seatId);
}

export function allDeclarationsDone(state: GameState): boolean {
  return state.pending.length === 0 && state.step === 'collectDeclarations';
}

export function isImplemented(cardId: string): boolean {
  const b = baseOf(cardId);
  return (
    b === 'spy' ||
    b === 'mystic' ||
    b === 'blind_assassin' ||
    b === 'shinobi' ||
    TRICKSTERS.has(b)
  );
}

const TRICKSTERS = new Set([
  'shapeshifter',
  'grave_digger',
  'troublemaker',
  'spirit_merchant',
  'thief',
  'judge',
]);

export function matchesPhase(state: GameState, cardId: string): boolean {
  const b = baseOf(cardId);
  switch (state.phase) {
    case 'nightSpy':
      return b === 'spy';
    case 'nightMystic':
      return b === 'mystic';
    case 'nightTrickster':
      return TRICKSTERS.has(b);
    case 'nightBlindAssassin':
      return b === 'blind_assassin';
    case 'nightShinobi':
      return b === 'shinobi';
    default:
      return false;
  }
}

export function playableInstanceIds(state: GameState, seat: SeatState): string[] {
  return seat.hand
    .filter((c) => matchesPhase(state, c.cardId) && isImplemented(c.cardId))
    .map((c) => c.instanceId);
}

export function tryAdvanceNightPhase(state: GameState): void {
  state.resolveQueue = [];
  state.resolveContext = null;
  state.pending = [];
  if (state.phase === 'nightSpy') {
    enterNightPhase(state, 'nightMystic');
    return;
  }
  if (state.phase === 'nightMystic') {
    enterNightPhase(state, 'nightTrickster');
    return;
  }
  if (state.phase === 'nightTrickster') {
    enterNightPhase(state, 'nightBlindAssassin');
    return;
  }
  if (state.phase === 'nightBlindAssassin') {
    enterNightPhase(state, 'nightShinobi');
    return;
  }
  if (state.phase === 'nightShinobi') {
    afterShinobiFn(state);
    return;
  }
}

let afterShinobiFn: (s: GameState) => void = () => {
  throw new Error('afterShinobi not bound');
};
export function bindAfterShinobi(fn: (s: GameState) => void): void {
  afterShinobiFn = fn;
}
