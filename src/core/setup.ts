import type { HouseId } from '../shared/types';
import { CARD_DEFS, housesForPlayerCount } from './deck';
import type { CardInstance, GameState, SeatState } from './game-state';
import { createRng, nextInstanceId, resetInstanceCounter } from './utils';
import { pushEvent } from './events';
import { enterNightPhase } from './night-flow';
import { createTokenPool } from './tokens';

export interface CreateGameOptions {
  roomCode?: string;
  seed: number;
  nicknames?: string[];
  playerCount?: number;
}

export function createGame(options: CreateGameOptions): GameState {
  resetInstanceCounter(0);
  const playerCount = options.playerCount ?? 4;
  const rng = createRng(options.seed);
  const roomCode = options.roomCode ?? 'TEST';
  const nicknames = options.nicknames ?? Array.from({ length: playerCount }, (_, i) => `P${i}`);

  const houses = rng.shuffle(housesForPlayerCount(playerCount));
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
    zones: { undrawn: [], draftDiscard: [], revealedInPlay: [], spent: [] },
    round: 1,
    phase: 'draftPick1',
    step: 'draftSelect',
    windowId: 'w-draft1-init',
    resolveQueue: [],
    pending: [],
    resolveContext: null,
    events: [],
    eventSeq: 0,
    processedCommandIds: [],
    winners: [],
    gameOver: false,
    tokenPool: createTokenPool(),
    startingHouses: Object.fromEntries(seats.map((s) => [s.seatId, s.house])) as Record<string, HouseId>,
  };

  let idx = 0;
  for (const seat of state.seats) {
    seat.draftHand = shuffled.slice(idx, idx + 3);
    idx += 3;
  }
  state.zones.undrawn = shuffled.slice(idx);

  for (const seat of state.seats) {
    pushEvent(state, 'draft.cardDealt', 'server', { seatId: seat.seatId, count: 3 });
  }
  beginDraftPick(state, 1);
  return state;
}

export function beginDraftPick(state: GameState, step: 1 | 2): void {
  state.phase = step === 1 ? 'draftPick1' : 'draftPick2';
  state.step = 'draftSelect';
  state.windowId = `w-draft${step}-${state.round}-${state.eventSeq}`;
  for (const seat of state.seats) seat.declaredResponded = false;
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

/**
 * 6F-8 已不再进入：draftPick2 完成后剩余牌自动弃置（见 autoDiscardRemainder）。
 * 保留导出以兼容旧客户端发来的 draft.discard 指令（engine 侧以 phaseMismatch 拒绝）
 * 与 dev/测试辅助中的历史分支；phase 枚举与 zones.draftDiscard 保持不变。
 */
export function enterDraftDiscard(state: GameState): void {
  state.phase = 'draftDiscard';
  state.step = 'draftSelect';
  state.windowId = `w-draftd-${state.round}-${state.eventSeq}`;
  for (const seat of state.seats) seat.declaredResponded = false;
  rebuildDraftPending(state);
}

/**
 * 6F-8（官方规则）：发 3 → 选 1 → 左传 2 → 再选 1，剩下 1 张必然弃掉。
 * draftPick2 完成后把各座位 draftHand 剩余牌直接推入 draftDiscard 区
 * （附与原来 handleDraftDiscard 相同的 draft.cardDiscarded 事件），
 * 不生成 pending，直接经 afterDraftComplete 进入夜晚。
 */
export function autoDiscardRemainder(state: GameState): void {
  for (const seat of state.seats) {
    for (const left of seat.draftHand) {
      state.zones.draftDiscard.push({ ...left });
      pushEvent(state, 'draft.cardDiscarded', 'public', {
        seatId: seat.seatId,
        instanceId: left.instanceId,
      });
    }
    seat.draftHand = [];
    seat.declaredResponded = true;
  }
  afterDraftComplete(state);
}
export function afterDraftComplete(state: GameState): void {
  for (const seat of state.seats) {
    if (seat.draftHand.length > 0) {
      seat.hand.push(...seat.draftHand.map((c) => ({ ...c })));
    }
    seat.draftHand = [];
  }
  enterNightPhase(state, 'nightSpy');
}

/**
 * 开启下一轮（Q2 裁定）：保留 tokens/round+1/rng 连续，其余重置。
 * 重发身份、重组忍者牌堆并重发 draftHand；knownHouses 按轮清空
 * （单轮内 append-only，记录自带 round 戳；跨轮清空 + 投影过滤双保险）；
 * tokenPool 保留剩余（耗尽不再发，不重洗）。
 * 注意：不重置牌实例计数器，保证 instanceId 跨轮唯一。
 */
export function startNextRound(state: GameState): void {
  state.round += 1;
  const n = state.seats.length;
  const houses = state.rng.shuffle(housesForPlayerCount(n));

  const ninjaDeck: CardInstance[] = CARD_DEFS.map((def) => ({
    instanceId: nextInstanceId('card'),
    cardId: def.cardId,
    number: def.number,
  }));
  const shuffled = state.rng.shuffle(ninjaDeck);

  let idx = 0;
  state.seats.forEach((seat, i) => {
    seat.alive = true;
    seat.house = houses[i] as HouseId;
    seat.houseRevealed = false;
    seat.knownHouses = [];
    seat.hand = [];
    seat.reserved = [];
    seat.declared = [];
    seat.declaredResponded = false;
    seat.draftHand = shuffled.slice(idx, idx + 3);
    idx += 3;
  });
  state.zones = { undrawn: shuffled.slice(idx), draftDiscard: [], revealedInPlay: [], spent: [] };
  state.resolveQueue = [];
  state.resolveContext = null;
  state.winners = [];
  state.startingHouses = Object.fromEntries(
    state.seats.map((s) => [s.seatId, s.house]),
  ) as Record<string, HouseId>;

  for (const seat of state.seats) {
    pushEvent(state, 'draft.cardDealt', 'server', { seatId: seat.seatId, count: 3 });
  }
  beginDraftPick(state, 1);
}

export function enterPassPhaseDraft(state: GameState): void {
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

export function enterMastermindReveal(state: GameState): void {
  state.phase = 'mastermindReveal';
  state.step = 'idle';
  state.pending = [];
  state.resolveQueue = [];
  state.resolveContext = null;
  // resolveMastermind bound by engine
  mastermindFn(state);
  enterHouseReveal(state);
}

let mastermindFn: (s: GameState) => void = () => {
  throw new Error('mastermind not bound');
};
export function bindMastermind(fn: (s: GameState) => void): void {
  mastermindFn = fn;
}

export function enterHouseReveal(state: GameState): void {
  state.phase = 'houseReveal';
  state.step = 'idle';
  for (const seat of state.seats) {
    if (seat.alive) {
      seat.houseRevealed = true;
      pushEvent(state, 'house.revealed', 'public', { seatId: seat.seatId, houseId: seat.house });
    }
  }
  scoreFn(state);
}

let scoreFn: (s: GameState) => void = () => {
  throw new Error('score not bound');
};
export function bindScoreRound(fn: (s: GameState) => void): void {
  scoreFn = fn;
}
