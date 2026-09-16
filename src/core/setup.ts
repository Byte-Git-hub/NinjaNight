import type { HouseId } from '../shared/types';
import { CARD_DEFS, HOUSES_4P } from './deck';
import type { CardInstance, GameState, SeatState } from './game-state';
import { createRng, nextInstanceId, resetInstanceCounter, syncRngCalls } from './utils';
import { pushEvent } from './events';
import { enterNightPhase } from './night-flow';

export interface CreateGameOptions {
  roomCode?: string;
  seed: number;
  nicknames?: string[];
  playerCount?: number;
}

function makeTokenPool(): GameState['tokenPool'] {
  // 临时表【待确认】：12×2 + 12×3 + 11×4 = 35
  const pool: GameState['tokenPool'] = [];
  for (let i = 0; i < 12; i += 1) pool.push({ instanceId: `tok-2-${i}`, value: 2 });
  for (let i = 0; i < 12; i += 1) pool.push({ instanceId: `tok-3-${i}`, value: 3 });
  for (let i = 0; i < 11; i += 1) pool.push({ instanceId: `tok-4-${i}`, value: 4 });
  return pool;
}

export function createGame(options: CreateGameOptions): GameState {
  resetInstanceCounter(0);
  const playerCount = options.playerCount ?? 4;
  if (playerCount !== 4) {
    throw new Error('阶段 2 仅支持 4 人局');
  }
  const rng = createRng(options.seed);
  const roomCode = options.roomCode ?? 'TEST';
  const nicknames = options.nicknames ?? ['甲', '乙', '丙', '丁'];

  const houses = rng.shuffle([...HOUSES_4P]);
  const seats: SeatState[] = [];
  for (let i = 0; i < playerCount; i += 1) {
    seats.push({
      seatId: `s${i}`,
      nickname: nicknames[i] ?? `P${i}`,
      seatToken: `token-s${i}`,
      connected: true,
      isHost: i === 0,
      alive: true,
      house: houses[i] as HouseId,
      houseRevealed: false,
      knownHouses: [],
      tokens: [],
      hand: [],
      reserved: [],
      draftHand: [],
      declared: [],
      declaredResponded: false,
    });
  }

  const ninjaDeck: CardInstance[] = CARD_DEFS.map((def) => ({
    instanceId: nextInstanceId('card'),
    cardId: def.cardId,
    number: def.number,
  }));
  const shuffled = rng.shuffle(ninjaDeck);

  const state: GameState = {
    roomCode,
    seed: options.seed,
    rng,
    rngCalls: rng.calls,
    seats,
    zones: {
      undrawn: [],
      draftDiscard: [],
      revealedInPlay: [],
      spent: [],
    },
    round: 1,
    phase: 'draftPick1',
    step: 'draftSelect',
    windowId: `w-draft1-init`,
    resolveQueue: [],
    pending: [],
    resolveContext: null,
    nightPhaseOrder: [
      'nightSpy',
      'nightMystic',
      'nightTrickster',
      'nightBlindAssassin',
      'nightShinobi',
    ],
    events: [],
    eventSeq: 0,
    processedCommandIds: [],
    winners: [],
    gameOver: false,
    tokenPool: makeTokenPool(),
    startingHouses: Object.fromEntries(
      seats.map((s) => [s.seatId, s.house]),
    ) as Record<string, HouseId>,
  };

  let idx = 0;
  for (const seat of state.seats) {
    seat.draftHand = shuffled.slice(idx, idx + 3);
    idx += 3;
  }
  state.zones.undrawn = shuffled.slice(idx);

  for (const seat of state.seats) {
    pushEvent(state, 'draft.cardDealt', 'server', {
      seatId: seat.seatId,
      count: 3,
    });
  }
  beginDraftPick(state, 1);
  return state;
}

export function beginDraftPick(state: GameState, step: 1 | 2): void {
  state.phase = step === 1 ? 'draftPick1' : 'draftPick2';
  state.step = 'draftSelect';
  state.windowId = `w-draft${step}-${state.round}-${state.eventSeq}`;
  for (const seat of state.seats) {
    seat.declaredResponded = false;
  }
  rebuildDraftPending(state);
}

function rebuildDraftPending(state: GameState): void {
  state.pending = state.seats
    .filter((s) => !s.declaredResponded && s.draftHand.length > 0)
    .map((s) => ({
      id: `${state.windowId}:${s.seatId}`,
      seatId: s.seatId,
      kind: state.phase === 'draftDiscard' ? ('draftDiscard' as const) : ('draftPick' as const),
      options: s.draftHand.map((c) => c.instanceId),
      deadline: null,
      defaultChoice: {
        kind: 'autoPick' as const,
        optionId: s.draftHand[0]?.instanceId ?? '',
      },
      context: {
        phase: state.phase,
        step: 'draftSelect' as const,
        relatedInstanceIds: s.draftHand.map((c) => c.instanceId),
      },
    }));
}

export function enterDraftDiscard(state: GameState): void {
  state.phase = 'draftDiscard';
  state.step = 'draftSelect';
  state.windowId = `w-draftd-${state.round}-${state.eventSeq}`;
  for (const seat of state.seats) {
    seat.declaredResponded = false;
  }
  rebuildDraftPending(state);
}

export function afterDraftComplete(state: GameState): void {
  for (const seat of state.seats) {
    // hand 已含两次扣置；弃牌阶段应已清空 draftHand
    if (seat.draftHand.length > 0) {
      seat.hand.push(...seat.draftHand.map((c) => ({ ...c })));
    }
    seat.draftHand = [];
  }
  enterNightPhase(state, 'nightSpy');
}

export function enterMastermindReveal(state: GameState): void {
  state.phase = 'mastermindReveal';
  state.step = 'idle';
  state.pending = [];
  state.resolveQueue = [];
  state.resolveContext = null;
  enterHouseReveal(state);
}

export function enterHouseReveal(state: GameState): void {
  state.phase = 'houseReveal';
  state.step = 'idle';
  for (const seat of state.seats) {
    if (seat.alive) {
      seat.houseRevealed = true;
      pushEvent(state, 'house.revealed', 'public', {
        seatId: seat.seatId,
        houseId: seat.house,
      });
    }
  }
  enterScorePhase(state);
}

export function enterScorePhase(state: GameState): void {
  state.phase = 'score';
  state.step = 'idle';
  // scoreRound import deferred via circular-safe side
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  scoreRoundRef(state);
}

let scoreRoundRef: (s: GameState) => void = () => {
  throw new Error('scoreRound not bound');
};

export function bindScoreRound(fn: (s: GameState) => void): void {
  scoreRoundRef = fn;
}

export function enterPassPhaseDraft(state: GameState): void {
  // 左传：i -> (i-1+len)%len 得到新 draftHand
  const n = state.seats.length;
  const nextHands = state.seats.map((_, i) => {
    const from = state.seats[(i + 1) % n];
    return from ? from.draftHand.map((c) => ({ ...c })) : [];
  });
  state.seats.forEach((seat, i) => {
    seat.draftHand = nextHands[i] ?? [];
  });
  pushEvent(state, 'draft.passed', 'public', { direction: 'left' });
}

export { createRng, syncRngCalls };
