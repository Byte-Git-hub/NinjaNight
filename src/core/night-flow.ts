import type { GamePhase } from '../shared/types';
import type { SeatState } from './game-state';
import type { GameState } from './game-state';
import { pushEvent } from './events';

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
    .filter((s) => s.alive && hasImplementedCardsForPhase(state, s))
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
  if (state.pending.length === 0 && state.step === 'collectDeclarations') {
    const { revealDeclaredAndBuildQueue } = require_resolve();
    revealDeclaredAndBuildQueue(state);
  }
}

// indirection to avoid circular import resolve <-> night-flow
type ResolveMod = typeof import('./resolve');
let resolveMod: ResolveMod | null = null;
export function bindResolve(mod: ResolveMod): void {
  resolveMod = mod;
}
function require_resolve(): ResolveMod {
  if (!resolveMod) throw new Error('resolve not bound');
  return resolveMod;
}

function phaseCardPrefix(state: GameState): string | null {
  switch (state.phase) {
    case 'nightSpy':
      return 'spy';
    case 'nightMystic':
      return 'mystic';
    case 'nightTrickster':
      return 'trickster';
    case 'nightBlindAssassin':
      return 'blind_assassin';
    case 'nightShinobi':
      return 'shinobi';
    default:
      return null;
  }
}

export function isImplemented(cardId: string): boolean {
  return (
    cardId.startsWith('spy') ||
    cardId.startsWith('mystic') ||
    cardId.startsWith('blind_assassin') ||
    cardId.startsWith('shinobi')
  );
}

function hasImplementedCardsForPhase(state: GameState, seat: SeatState): boolean {
  const prefix = phaseCardPrefix(state);
  if (!prefix || prefix === 'trickster') return false;
  return seat.hand.some((c) => c.cardId.startsWith(prefix) && isImplemented(c.cardId));
}

export function playableInstanceIds(state: GameState, seat: SeatState): string[] {
  const prefix = phaseCardPrefix(state);
  if (!prefix || prefix === 'trickster') return [];
  return seat.hand
    .filter((c) => c.cardId.startsWith(prefix) && isImplemented(c.cardId))
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
    advanceAfterShinobi(state);
    return;
  }
}

let afterShinobi: (s: GameState) => void = () => {
  throw new Error('afterShinobi not bound');
};

export function bindAfterShinobi(fn: (s: GameState) => void): void {
  afterShinobi = fn;
}

function advanceAfterShinobi(state: GameState): void {
  afterShinobi(state);
}
