import type { Command, RejectReason, SeatId } from '../shared/types';
import type { GameState, SeatState } from './game-state';
import {
  afterDraftComplete,
  autoDiscardRemainder,
  beginDraftPick,
  bindMastermind,
  bindScoreRound,
  createGame,
  enterHouseReveal,
  enterMastermindReveal,
  enterPassPhaseDraft,
  startNextRound,
} from './setup';
import {
  afterDeclareSeat,
  bindAfterShinobi,
  enterNightPhase,
  playableInstanceIds,
} from './night-flow';
import {
  applyOptionalChoice,
  applyReactChoice,
  applyTargetChoice,
  revealDeclaredAndBuildQueue,
} from './resolve';
import { resolveMastermind, scoreRound } from './score';
import { cloneGameState, findSeatByToken } from './utils';
import { pushEvent } from './events';
import { houseFamily, houseRank } from './deck';

export type EngineResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: RejectReason; state: GameState };

import * as resolveMod from './resolve';
// night-flow no longer needs bindResolve
void resolveMod;
bindScoreRound(scoreRound);
bindMastermind(resolveMastermind);
bindAfterShinobi((state) => {
  enterMastermindReveal(state);
});

export { createGame, enterNightPhase };

export function applyCommand(state: GameState, cmd: Command): EngineResult {
  if (state.processedCommandIds.includes(cmd.commandId)) {
    return { ok: false, reason: 'duplicate', state };
  }
  const next = cloneGameState(state);
  next.processedCommandIds.push(cmd.commandId);
  const seat = findSeatByToken(next, cmd.seatToken);
  if (!seat) return { ok: false, reason: 'unauthorized', state };

  switch (cmd.type) {
    case 'draft.pick':
      return handleDraftPick(next, seat, cmd);
    case 'draft.discard':
      return handleDraftDiscard(next, seat, cmd);
    case 'night.declare':
      return handleDeclare(next, seat, cmd);
    case 'night.passPhase':
      return handlePass(next, seat);
    case 'night.chooseTarget':
      return handleChooseTarget(next, seat, cmd);
    case 'night.chooseOptional':
      return handleChooseOptional(next, seat, cmd);
    case 'react.decide':
      return handleReact(next, seat, cmd);
    case 'room.forceAdvance': {
      if (!seat.isHost) return { ok: false, reason: 'unauthorized', state };
      return applyAllDefaults(next);
    }
    default:
      return { ok: false, reason: 'unknownCommand', state };
  }
}

/**
 * 对当前所有 pending 应用 defaultChoice（房主 forceAdvance / 超时）。
 * 可多次调用直至无 pending 或阶段不再推进。
 */
export function applyAllDefaults(state: GameState): EngineResult {
  if (state.pending.length === 0) {
    // victoryCheck 无待办是轮间停留态：forceAdvance/超时触发下一轮（Q3 裁定）
    if (state.phase === 'victoryCheck' && !state.gameOver) {
      startNextRound(state);
      return { ok: true, state };
    }
    return { ok: true, state };
  }
  let progressed = false;
  let guard = 0;
  while (state.pending.length > 0 && guard < 200) {
    guard += 1;
    const p = state.pending[0];
    if (!p) break;
    const beforePhase = state.phase;
    const beforeStep = state.step;
    const beforePending = state.pending.length;
    const beforeEvent = state.eventSeq;

    const token = state.seats.find((s) => s.seatId === p.seatId)?.seatToken ?? '';
    if (!token) {
      state.pending = state.pending.filter((x) => x.id !== p.id);
      progressed = true;
      continue;
    }

    let cmd: Command | null = null;
    if (p.kind === 'draftPick') {
      const id = p.defaultChoice.kind === 'autoPick' ? p.defaultChoice.optionId : p.options[0];
      if (!id) {
        // 无可选则直接移除
        state.pending = state.pending.filter((x) => x.id !== p.id);
        progressed = true;
        continue;
      }
      cmd = {
        commandId: `auto-draft-pick-${p.id}-${state.eventSeq}`,
        roomCode: state.roomCode,
        seatToken: token,
        windowId: p.id,
        type: 'draft.pick',
        payload: { cardInstanceId: id },
      };
    } else if (p.kind === 'draftDiscard') {
      const id = p.defaultChoice.kind === 'autoPick' ? p.defaultChoice.optionId : p.options[0];
      if (!id) {
        state.pending = state.pending.filter((x) => x.id !== p.id);
        progressed = true;
        continue;
      }
      cmd = {
        commandId: `auto-draft-d-${p.id}-${state.eventSeq}`,
        roomCode: state.roomCode,
        seatToken: token,
        windowId: p.id,
        type: 'draft.discard',
        payload: { cardInstanceId: id },
      };
    } else if (p.kind === 'declareCards') {
      cmd = {
        commandId: `auto-pass-${p.id}-${state.eventSeq}`,
        roomCode: state.roomCode,
        seatToken: token,
        windowId: p.id,
        type: 'night.passPhase',
        payload: {},
      };
    } else if (p.kind === 'chooseTarget' || p.kind === 'merchantChoose' || p.kind === 'merchantExchange') {
      const id = p.defaultChoice.kind === 'autoPick' ? p.defaultChoice.optionId : p.options[0];
      if (!id) {
        state.pending = state.pending.filter((x) => x.id !== p.id);
        progressed = true;
        continue;
      }
      cmd = {
        commandId: `auto-tgt-${p.id}-${state.eventSeq}`,
        roomCode: state.roomCode,
        seatToken: token,
        windowId: p.id,
        type: 'night.chooseTarget',
        payload: { targetSeatId: id },
      };
    } else if (p.kind === 'chooseOptional') {
      cmd = {
        commandId: `auto-opt-${p.id}-${state.eventSeq}`,
        roomCode: state.roomCode,
        seatToken: token,
        windowId: p.id,
        type: 'night.chooseOptional',
        payload: { choose: false },
      };
    } else if (p.kind === 'reactDecide') {
      cmd = {
        commandId: `auto-react-${p.id}-${state.eventSeq}`,
        roomCode: state.roomCode,
        seatToken: token,
        windowId: p.id,
        type: 'react.decide',
        payload: { react: false },
      };
    }

    if (!cmd) {
      state.pending = state.pending.filter((x) => x.id !== p.id);
      progressed = true;
      continue;
    }

    const r = applyCommandDirect(state, cmd);
    if (!r.ok) {
      // 失败则移除该 pending 防止死循环
      state.pending = state.pending.filter((x) => x.id !== p.id);
      progressed = true;
      continue;
    }
    progressed = true;
    if (
      state.phase === beforePhase &&
      state.step === beforeStep &&
      state.pending.length === beforePending &&
      state.eventSeq === beforeEvent
    ) {
      break;
    }
  }
  if (!progressed) return { ok: false, reason: 'phaseMismatch', state };
  return { ok: true, state };
}

/** 不经过 processedCommandIds 门闩的内部应用（auto 指令需要） */
function applyCommandDirect(state: GameState, cmd: Command): EngineResult {
  // 复制 commandId 到 processed 防重复
  if (!state.processedCommandIds.includes(cmd.commandId)) {
    state.processedCommandIds.push(cmd.commandId);
  }
  const seat = findSeatByToken(state, cmd.seatToken);
  if (!seat) return { ok: false, reason: 'unauthorized', state };

  switch (cmd.type) {
    case 'draft.pick':
      return handleDraftPick(state, seat, cmd);
    case 'draft.discard':
      return handleDraftDiscard(state, seat, cmd);
    case 'night.declare':
      return handleDeclare(state, seat, cmd);
    case 'night.passPhase':
      return handlePass(state, seat);
    case 'night.chooseTarget':
      return handleChooseTarget(state, seat, cmd);
    case 'night.chooseOptional':
      return handleChooseOptional(state, seat, cmd);
    case 'react.decide':
      return handleReact(state, seat, cmd);
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
  if (cmd.windowId !== next.windowId && cmd.windowId !== pending.id) {
    return { ok: false, reason: 'staleWindow', state: next };
  }
  const raw = 'cardInstanceId' in cmd.payload ? cmd.payload.cardInstanceId : null;
  if (!raw || !cardInSeatDraft(seat, raw)) {
    return { ok: false, reason: 'notInHand', state: next };
  }
  const chosen = seat.draftHand.find((c) => c.instanceId === raw);
  if (!chosen) return { ok: false, reason: 'notInHand', state: next };

  if (next.phase === 'draftPick2') seat.hand.push({ ...chosen });
  else seat.hand = [{ ...chosen }];
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
      // 6F-8：第二次选完剩 1 张必弃，自动弃置后直接进夜晚，不生成 draftDiscard pending
      autoDiscardRemainder(next);
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
  pushEvent(next, 'draft.cardDiscarded', 'public', { seatId: seat.seatId, instanceId: raw });
  if (next.pending.length === 0) afterDraftComplete(next);
  return { ok: true, state: next };
}

function handleDeclare(next: GameState, seat: SeatState, cmd: Command): EngineResult {
  if (!next.phase.startsWith('night') || next.step !== 'collectDeclarations') {
    return { ok: false, reason: 'phaseMismatch', state: next };
  }
  if (!seat.alive) return { ok: false, reason: 'notAlive', state: next };
  const pending = next.pending.find((p) => p.seatId === seat.seatId && p.kind === 'declareCards');
  if (!pending) return { ok: false, reason: 'staleWindow', state: next };

  const ids =
    'cardInstanceIds' in cmd.payload && Array.isArray(cmd.payload.cardInstanceIds)
      ? cmd.payload.cardInstanceIds
      : [];
  // 先区分“不在手牌”（notInHand），再区分“在手但非本阶段可打”（phaseMismatch）
  const handIds = new Set(seat.hand.map((c) => c.instanceId));
  for (const id of ids) {
    if (!handIds.has(id)) return { ok: false, reason: 'notInHand', state: next };
  }
  const playable = playableInstanceIds(next, seat);
  for (const id of ids) {
    if (!playable.includes(id)) return { ok: false, reason: 'phaseMismatch', state: next };
  }
  seat.declared = seat.hand.filter((c) => ids.includes(c.instanceId)).map((c) => ({ ...c }));
  afterDeclareSeat(next, seat.seatId);
  if (next.pending.length === 0) revealDeclaredAndBuildQueue(next);
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
  if (next.pending.length === 0) revealDeclaredAndBuildQueue(next);
  return { ok: true, state: next };
}

function handleChooseTarget(next: GameState, seat: SeatState, cmd: Command): EngineResult {
  if (next.step !== 'chooseTarget') return { ok: false, reason: 'phaseMismatch', state: next };
  const target = 'targetSeatId' in cmd.payload ? cmd.payload.targetSeatId : null;
  if (!target) return { ok: false, reason: 'invalidPayload', state: next };
  const res = applyTargetChoice(next, seat.seatId, target);
  if (!res.ok) return { ok: false, reason: res.reason as RejectReason, state: next };
  return { ok: true, state: next };
}

function handleChooseOptional(next: GameState, seat: SeatState, cmd: Command): EngineResult {
  if (next.step !== 'chooseOptional') return { ok: false, reason: 'phaseMismatch', state: next };
  const choose = 'choose' in cmd.payload ? Boolean(cmd.payload.choose) : false;
  const res = applyOptionalChoice(next, seat.seatId, choose);
  if (!res.ok) return { ok: false, reason: res.reason as RejectReason, state: next };
  return { ok: true, state: next };
}

function handleReact(next: GameState, seat: SeatState, cmd: Command): EngineResult {
  if (next.step !== 'reactWindow') return { ok: false, reason: 'phaseMismatch', state: next };
  const react = 'react' in cmd.payload ? Boolean(cmd.payload.react) : false;
  const res = applyReactChoice(next, seat.seatId, react);
  if (!res.ok) return { ok: false, reason: res.reason as RejectReason, state: next };
  return { ok: true, state: next };
}

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
      reserved: s.reserved.map((c) => c.instanceId).sort(),
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
    state.seats.reduce(
      (n, s) => n + s.hand.length + s.reserved.length + s.draftHand.length,
      0,
    )
  );
}

export { houseFamily, houseRank, enterHouseReveal };
export type { SeatId };
