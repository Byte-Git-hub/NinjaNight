import type {
  Command,
  GameClientAdapter,
  PlayerView,
  RejectReason,
  SeatId,
} from '../shared/types';
import { applyCommand, createGame, stateHash, type EngineResult } from '../core/engine';
import type { GameState } from '../core/game-state';
import { projectView } from '../core/project-view';
import { playableInstanceIds } from '../core/night-flow';
import { findSeat } from '../core/utils';

export interface LocalAdapterOptions {
  seed: number;
  roomCode?: string;
  nicknames?: string[];
  playerCount?: number;
}

export class LocalAdapter implements GameClientAdapter {
  private state: GameState;
  private viewHandlers = new Set<(seatId: SeatId, view: PlayerView) => void>();
  private rejectHandlers = new Set<(commandId: string, reason: RejectReason) => void>();

  constructor(options: LocalAdapterOptions) {
    this.state = createGame({
      seed: options.seed,
      roomCode: options.roomCode,
      nicknames: options.nicknames,
      playerCount: options.playerCount,
    });
  }

  getState(): GameState {
    return this.state;
  }

  /** 测试：直接改 live state */
  mutableState(): GameState {
    return this.state;
  }

  hash(): string {
    return stateHash(this.state);
  }

  submit(command: Command): void {
    const result = applyCommand(this.state, command);
    this.applyResult(command, result);
  }

  private applyResult(command: Command, result: EngineResult): void {
    if (result.ok) {
      this.state = result.state;
      this.emitViews();
    } else {
      for (const h of this.rejectHandlers) h(command.commandId, result.reason);
    }
  }

  getView(seatId: SeatId): PlayerView | null {
    return projectView(this.state, seatId);
  }

  onView(handler: (seatId: SeatId, view: PlayerView) => void): () => void {
    this.viewHandlers.add(handler);
    return () => this.viewHandlers.delete(handler);
  }

  onReject(handler: (commandId: string, reason: RejectReason) => void): () => void {
    this.rejectHandlers.add(handler);
    return () => this.rejectHandlers.delete(handler);
  }

  private emitViews(): void {
    for (const s of this.state.seats) {
      const view = projectView(this.state, s.seatId);
      if (!view) continue;
      for (const h of this.viewHandlers) h(s.seatId, view);
    }
  }

  private tokenOf(seatId: SeatId): string {
    const seat = findSeat(this.state, seatId);
    if (!seat) throw new Error('no seat');
    return seat.seatToken;
  }

  draftPick(seatId: SeatId, cardInstanceId: string): void {
    this.submit({
      commandId: `cmd-${seatId}-pick-${cardInstanceId}-${this.state.windowId}`,
      roomCode: this.state.roomCode,
      seatToken: this.tokenOf(seatId),
      windowId: this.state.windowId,
      type: 'draft.pick',
      payload: { cardInstanceId },
    });
  }

  draftDiscard(seatId: SeatId, cardInstanceId: string): void {
    this.submit({
      commandId: `cmd-${seatId}-discard-${cardInstanceId}-${this.state.windowId}`,
      roomCode: this.state.roomCode,
      seatToken: this.tokenOf(seatId),
      windowId: this.state.windowId,
      type: 'draft.discard',
      payload: { cardInstanceId },
    });
  }

  declare(seatId: SeatId, cardInstanceIds: string[]): void {
    this.submit({
      commandId: `cmd-${seatId}-declare-${cardInstanceIds.join('_') || 'empty'}-${this.state.windowId}`,
      roomCode: this.state.roomCode,
      seatToken: this.tokenOf(seatId),
      windowId: this.state.windowId,
      type: 'night.declare',
      payload: { cardInstanceIds },
    });
  }

  passPhase(seatId: SeatId): void {
    this.submit({
      commandId: `cmd-${seatId}-pass-${this.state.windowId}`,
      roomCode: this.state.roomCode,
      seatToken: this.tokenOf(seatId),
      windowId: this.state.windowId,
      type: 'night.passPhase',
      payload: {},
    });
  }

  chooseTarget(seatId: SeatId, targetSeatId: SeatId): void {
    this.submit({
      commandId: `cmd-${seatId}-target-${targetSeatId}-${this.state.windowId}-${this.state.eventSeq}`,
      roomCode: this.state.roomCode,
      seatToken: this.tokenOf(seatId),
      windowId: this.state.windowId,
      type: 'night.chooseTarget',
      payload: { targetSeatId },
    });
  }

  chooseOptional(seatId: SeatId, choose: boolean): void {
    this.submit({
      commandId: `cmd-${seatId}-opt-${choose}-${this.state.windowId}-${this.state.eventSeq}`,
      roomCode: this.state.roomCode,
      seatToken: this.tokenOf(seatId),
      windowId: this.state.windowId,
      type: 'night.chooseOptional',
      payload: { choose },
    });
  }

  react(seatId: SeatId, react: boolean): void {
    this.submit({
      commandId: `cmd-${seatId}-react-${react}-${this.state.windowId}-${this.state.eventSeq}`,
      roomCode: this.state.roomCode,
      seatToken: this.tokenOf(seatId),
      windowId: this.state.windowId,
      type: 'react.decide',
      payload: { react },
    });
  }

  draftHandIdsOf(seatId: SeatId): string[] {
    const seat = findSeat(this.state, seatId);
    return seat ? seat.draftHand.map((c) => c.instanceId) : [];
  }

  playableOf(seatId: SeatId): string[] {
    const seat = findSeat(this.state, seatId);
    if (!seat) return [];
    return playableInstanceIds(this.state, seat);
  }
}

export function createLocalAdapter(options: LocalAdapterOptions): LocalAdapter {
  return new LocalAdapter(options);
}

/** 自动完成 draft */
export function finishDraft(adapter: LocalAdapter): void {
  const seatIds = adapter.getState().seats.map((s) => s.seatId);
  let guard = 0;
  while (
    adapter.getState().phase === 'draftPick1' ||
    adapter.getState().phase === 'draftPick2' ||
    adapter.getState().phase === 'draftDiscard'
  ) {
    guard += 1;
    if (guard > 80) throw new Error('draft stuck');
    const phase = adapter.getState().phase;
    for (const id of seatIds) {
      const hand = adapter.draftHandIdsOf(id);
      const first = hand[0];
      if (!first) continue;
      if (phase === 'draftDiscard') adapter.draftDiscard(id, first);
      else adapter.draftPick(id, first);
    }
  }
}

/** 自动推进夜晚决策 */
export function runAutoNight(adapter: LocalAdapter, limit = 400): void {
  let guard = 0;
  while (!adapter.getState().gameOver && guard < limit) {
    guard += 1;
    const st = adapter.getState();
    if (
      !st.phase.startsWith('night') &&
      st.phase !== 'mastermindReveal' &&
      st.phase !== 'houseReveal' &&
      st.phase !== 'score' &&
      st.phase !== 'victoryCheck'
    ) {
      break;
    }
    let progressed = false;
    for (const p of [...st.pending]) {
      if (p.kind === 'declareCards') {
        const playable = adapter.playableOf(p.seatId);
        if (playable.length > 0) adapter.declare(p.seatId, playable);
        else adapter.passPhase(p.seatId);
        progressed = true;
      } else if (p.kind === 'chooseTarget') {
        const target = p.options[0];
        if (target) {
          adapter.chooseTarget(p.seatId, target);
          progressed = true;
        }
      } else if (p.kind === 'chooseOptional') {
        adapter.chooseOptional(p.seatId, true);
        progressed = true;
      } else if (p.kind === 'reactDecide') {
        adapter.react(p.seatId, true);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
}
