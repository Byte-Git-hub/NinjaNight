import type {
  Command,
  GamePhase,
  HouseId,
  RejectReason,
  SeatId,
} from '../shared/types';
import { houseFamily, houseRank } from './deck';
import type { GameState, SeatState } from './game-state';
import {
  afterDraftComplete,
  beginDraftPick,
  bindScoreRound,
  createGame,
  enterDraftDiscard,
  enterHouseReveal,
  enterMastermindReveal,
  enterPassPhaseDraft,
} from './setup';
import {
  afterDeclareSeat,
  bindAfterShinobi,
  bindResolve,
  enterNightPhase,
  playableInstanceIds,
} from './night-flow';
import {
  applyOptionalChoice,
  applyTargetChoice,
  revealDeclaredAndBuildQueue,
} from './resolve';
import { scoreRound } from './score';
import { cloneGameState, findSeat, findSeatByToken } from './utils';
import { pushEvent } from './events';

export type EngineResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: RejectReason; state: GameState };

import * as resolveMod from './resolve';
bindResolve(resolveMod);

bindScoreRound(scoreRound);
bindAfterShinobi((state) => {
  enterMastermindReveal(state);
});

export { createGame, enterNightPhase };

export function applyCommand(state: GameState, cmd: Command): EngineResult {
  const dup = state.processedCommandIds.includes(cmd.commandId);
  if (dup) {
    return { ok: false, reason: 'duplicate', state };
  }

  const next = cloneGameState(state);
  next.processedCommandIds.push(cmd.commandId);

  const seat = findSeatByToken(next, cmd.seatToken);
  if (!seat) {
    return { ok: false, reason: 'unauthorized', state };
  }

  switch (cmd.type) {
    case 'draft.pick': {
      return handleDraftPick(next, seat, cmd);
    }
    case 'draft.discard': {
      return handleDraftDiscard(next, seat, cmd);
    }
    case 'night.declare': {
      return handleDeclare(next, seat, cmd);
    }
    case 'night.passPhase': {
      return handlePass(next, seat);
    }
    case 'night.chooseTarget': {
      return handleChooseTarget(next, seat, cmd);
    }
    case 'night.chooseOptional': {
      return handleChooseOptional(next, seat, cmd);
    }
    case 'room.forceAdvance': {
      if (!seat.isHost) return { ok: false, reason: 'unauthorized', state };
      // 阶段 4 完整超时；阶段 2 仅 dev 可跳过当前 declare 窗口
      if (next.step === 'collectDeclarations') {
        for (const s of next.seats) {
          if (!s.declaredResponded) afterDeclareSeat(next, s.seatId);
        }
        // afterDeclareSeat may need resolve bound - also handle queue empty
        if (next.step === 'collectDeclarations') {
          revealDeclaredAndBuildQueue(next);
        }
        return { ok: true, state: next };
      }
      return { ok: false, reason: 'phaseMismatch', state };
    }
    default:
      return { ok: false, reason: 'unknownCommand', state };
  }
}

function cardInSeatDraft(seat: SeatState, instanceId: string): boolean {
  return seat.draftHand.some((c) => c.instanceId === instanceId);
}

function handleDraftPick(next: GameState, seat: SeatState, cmd: Command): EngineResult {
  if (next.phase !== 'draftPick1' && next.phase !== 'draftPick2') {
    return { ok: false, reason: 'phaseMismatch', state: next };
  }
  const pending = next.pending.find((p) => p.seatId === seat.seatId && p.kind === 'draftPick');
  if (!pending) return { ok: false, reason: 'staleWindow', state: next };
  if (pending.id !== cmd.windowId && !cmd.windowId.endsWith(seat.seatId)) {
    // allow prefix match
    if (!pending.id.startsWith(cmd.windowId.split(':')[0] ?? '')) {
      // be lenient with local adapter windows: check kind only if window matches seat window
      if (cmd.windowId !== next.windowId && cmd.windowId !== pending.id) {
        return { ok: false, reason: 'staleWindow', state: next };
      }
    }
  }
  const raw = 'cardInstanceId' in cmd.payload ? cmd.payload.cardInstanceId : null;
  if (!raw || !cardInSeatDraft(seat, raw)) {
    return { ok: false, reason: 'notInHand', state: next };
  }
  const chosen = seat.draftHand.find((c) => c.instanceId === raw);
  if (!chosen) return { ok: false, reason: 'notInHand', state: next };

  // 选 1 扣置；剩余留在 draftHand 传出/弃置
  if (next.phase === 'draftPick2') {
    seat.hand.push({ ...chosen });
  } else {
    seat.hand = [{ ...chosen }];
  }
  seat.draftHand = seat.draftHand.filter((c) => c.instanceId !== raw);
  seat.declaredResponded = true;
  next.pending = next.pending.filter((p) => p.seatId !== seat.seatId);
  pushEvent(next, 'draft.cardPicked', 'public', {
    seatId: seat.seatId,
    instanceId: raw,
    cardId: chosen.cardId,
  });

  if (next.pending.length === 0) {
    if (next.phase === 'draftPick1') {
      enterPassPhaseDraft(next);
      beginDraftPick(next, 2);
    } else if (next.phase === 'draftPick2') {
      // draftHand 剩 1 张进入弃牌阶段；hand 已有第 1 次扣置
      enterDraftDiscard(next);
    }
  }
  return { ok: true, state: next };
}

function handleDraftDiscard(next: GameState, seat: SeatState, cmd: Command): EngineResult {
  if (next.phase !== 'draftDiscard') {
    return { ok: false, reason: 'phaseMismatch', state: next };
  }
  const pending = next.pending.find((p) => p.seatId === seat.seatId && p.kind === 'draftDiscard');
  if (!pending) return { ok: false, reason: 'staleWindow', state: next };
  if (cmd.windowId !== next.windowId && cmd.windowId !== pending.id) {
    return { ok: false, reason: 'staleWindow', state: next };
  }
  const raw = 'cardInstanceId' in cmd.payload ? cmd.payload.cardInstanceId : null;
  if (!raw || !cardInSeatDraft(seat, raw)) {
    return { ok: false, reason: 'notInHand', state: next };
  }
  const discarded = seat.draftHand.find((c) => c.instanceId === raw);
  if (!discarded) return { ok: false, reason: 'notInHand', state: next };
  next.zones.draftDiscard.push({ ...discarded });
  seat.draftHand = seat.draftHand.filter((c) => c.instanceId !== raw);
  seat.declaredResponded = true;
  next.pending = next.pending.filter((p) => p.seatId !== seat.seatId);
  pushEvent(next, 'draft.cardDiscarded', 'public', {
    seatId: seat.seatId,
    instanceId: raw,
  });
  if (next.pending.length === 0) {
    afterDraftComplete(next);
  }
  return { ok: true, state: next };
}

function handleDeclare(next: GameState, seat: SeatState, cmd: Command): EngineResult {
  if (!next.phase.startsWith('night')) {
    return { ok: false, reason: 'phaseMismatch', state: next };
  }
  if (next.step !== 'collectDeclarations') {
    return { ok: false, reason: 'phaseMismatch', state: next };
  }
  if (!seat.alive) return { ok: false, reason: 'notAlive', state: next };
  const pending = next.pending.find((p) => p.seatId === seat.seatId && p.kind === 'declareCards');
  if (!pending) return { ok: false, reason: 'staleWindow', state: next };

  const ids =
    'cardInstanceIds' in cmd.payload && Array.isArray(cmd.payload.cardInstanceIds)
      ? cmd.payload.cardInstanceIds
      : [];
  const playable = playableInstanceIds(next, seat);
  for (const id of ids) {
    if (!playable.includes(id)) {
      return { ok: false, reason: 'notInHand', state: next };
    }
  }
  seat.declared = seat.hand.filter((c) => ids.includes(c.instanceId)).map((c) => ({ ...c }));
  afterDeclareSeat(next, seat.seatId);
  return { ok: true, state: next };
}

function handlePass(next: GameState, seat: SeatState): EngineResult {
  if (!next.phase.startsWith('night') || next.step !== 'collectDeclarations') {
    return { ok: false, reason: 'phaseMismatch', state: next };
  }
  const pending = next.pending.find((p) => p.seatId === seat.seatId && p.kind === 'declareCards');
  if (!pending) return { ok: false, reason: 'staleWindow', state: next };
  seat.declared = [];
  afterDeclareSeat(next, seat.seatId);
  return { ok: true, state: next };
}

function handleChooseTarget(next: GameState, seat: SeatState, cmd: Command): EngineResult {
  if (next.step !== 'chooseTarget') {
    return { ok: false, reason: 'phaseMismatch', state: next };
  }
  const target =
    'targetSeatId' in cmd.payload ? cmd.payload.targetSeatId : null;
  if (!target) return { ok: false, reason: 'invalidPayload', state: next };
  const res = applyTargetChoice(next, seat.seatId, target);
  if (!res.ok) {
    return { ok: false, reason: res.reason as RejectReason, state: next };
  }
  return { ok: true, state: next };
}

function handleChooseOptional(next: GameState, seat: SeatState, cmd: Command): EngineResult {
  if (next.step !== 'chooseOptional') {
    return { ok: false, reason: 'phaseMismatch', state: next };
  }
  const choose = 'choose' in cmd.payload ? Boolean(cmd.payload.choose) : false;
  const res = applyOptionalChoice(next, seat.seatId, choose);
  if (!res.ok) {
    return { ok: false, reason: res.reason as RejectReason, state: next };
  }
  return { ok: true, state: next };
}

/** 稳定状态哈希（测试重放） */
export function stateHash(state: GameState): string {
  const payload = JSON.stringify({
    seed: state.seed,
    rngCalls: state.rngCalls,
    round: state.round,
    phase: state.phase,
    step: state.step,
    seats: state.seats.map((s) => ({
      id: s.seatId,
      alive: s.alive,
      house: s.house,
      revealed: s.houseRevealed,
      tokens: s.tokens.map((t) => `${t.instanceId}:${t.value}`).sort(),
      hand: s.hand.map((c) => c.instanceId).sort(),
      draft: s.draftHand.map((c) => c.instanceId).sort(),
      known: s.knownHouses.map((k) => `${k.targetSeatId}|${k.houseId}|${k.round}`),
    })),
    zones: {
      u: state.zones.undrawn.map((c) => c.instanceId),
      d: state.zones.draftDiscard.map((c) => c.instanceId),
      r: state.zones.revealedInPlay.map((c) => c.instanceId),
      s: state.zones.spent.map((c) => c.instanceId),
    },
    pool: state.tokenPool.length,
    gameOver: state.gameOver,
    winners: state.winners,
  });
  let h = 5381;
  for (let i = 0; i < payload.length; i += 1) {
    h = ((h << 5) + h + payload.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

export function totalCardsInZones(state: GameState): number {
  return (
    state.zones.undrawn.length +
    state.zones.draftDiscard.length +
    state.zones.revealedInPlay.length +
    state.zones.spent.length +
    state.seats.reduce((n, s) => n + s.hand.length + s.reserved.length + s.draftHand.length, 0)
  );
}

export type { GamePhase, HouseId, SeatId };
export { houseFamily, houseRank, findSeat, enterHouseReveal };
