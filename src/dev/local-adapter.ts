import type {
  Command,
  GameClientAdapter,
  PlayerView,
  RejectReason,
  SeatId,
} from '../shared/types';
import {
  applyCommand,
  createGame,
  type EngineResult,
  stateHash,
} from '../core/engine';
import type { GameState } from '../core/game-state';
import { projectView } from '../core/project-view';
import { playableInstanceIds } from '../core/night-flow';
import { findSeat } from '../core/utils';

export type { GameState };

export interface LocalAdapterOptions {
  seed: number;
  roomCode?: string;
  nicknames?: string[];
}

/**
 * 本地单进程适配器：同一 core，可切换视角座位。
 * 仅供测试与 dev；生产联机用 SocketAdapter。
 */
export class LocalAdapter implements GameClientAdapter {
  private state: GameState;
  private viewHandlers = new Set<(seatId: SeatId, view: PlayerView) => void>();
  private rejectHandlers = new Set<(commandId: string, reason: RejectReason) => void>();

  constructor(options: LocalAdapterOptions) {
    this.state = createGame({
      seed: options.seed,
      roomCode: options.roomCode,
      nicknames: options.nicknames,
    });
  }

  getState(): GameState {
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

  /** 测试/dev：发 draft.pick */
  draftPick(seatId: SeatId, cardInstanceId: string): void {
    const seat = findSeat(this.state, seatId);
    if (!seat) throw new Error('no seat');
    this.submit({
      commandId: `cmd-${seatId}-pick-${cardInstanceId}`,
      roomCode: this.state.roomCode,
      seatToken: seat.seatToken,
      windowId: this.state.windowId,
      type: 'draft.pick',
      payload: { cardInstanceId },
    });
  }

  draftDiscard(seatId: SeatId, cardInstanceId: string): void {
    const seat = findSeat(this.state, seatId);
    if (!seat) throw new Error('no seat');
    this.submit({
      commandId: `cmd-${seatId}-discard-${cardInstanceId}`,
      roomCode: this.state.roomCode,
      seatToken: seat.seatToken,
      windowId: this.state.windowId,
      type: 'draft.discard',
      payload: { cardInstanceId },
    });
  }

  declare(seatId: SeatId, cardInstanceIds: string[]): void {
    const seat = findSeat(this.state, seatId);
    if (!seat) throw new Error('no seat');
    this.submit({
      commandId: `cmd-${seatId}-declare-${cardInstanceIds.join('_') || 'empty'}-${this.state.windowId}`,
      roomCode: this.state.roomCode,
      seatToken: seat.seatToken,
      windowId: this.state.windowId,
      type: 'night.declare',
      payload: { cardInstanceIds },
    });
  }

  passPhase(seatId: SeatId): void {
    const seat = findSeat(this.state, seatId);
    if (!seat) throw new Error('no seat');
    this.submit({
      commandId: `cmd-${seatId}-pass-${this.state.windowId}`,
      roomCode: this.state.roomCode,
      seatToken: seat.seatToken,
      windowId: this.state.windowId,
      type: 'night.passPhase',
      payload: {},
    });
  }

  chooseTarget(seatId: SeatId, targetSeatId: SeatId): void {
    const seat = findSeat(this.state, seatId);
    if (!seat) throw new Error('no seat');
    this.submit({
      commandId: `cmd-${seatId}-target-${targetSeatId}-${this.state.windowId}`,
      roomCode: this.state.roomCode,
      seatToken: seat.seatToken,
      windowId: this.state.windowId,
      type: 'night.chooseTarget',
      payload: { targetSeatId },
    });
  }

  chooseOptional(seatId: SeatId, choose: boolean): void {
    const seat = findSeat(this.state, seatId);
    if (!seat) throw new Error('no seat');
    this.submit({
      commandId: `cmd-${seatId}-opt-${choose}-${this.state.windowId}`,
      roomCode: this.state.roomCode,
      seatToken: seat.seatToken,
      windowId: this.state.windowId,
      type: 'night.chooseOptional',
      payload: { choose },
    });
  }

  handIdsOf(seatId: SeatId): string[] {
    const seat = findSeat(this.state, seatId);
    return seat ? seat.hand.map((c) => c.instanceId) : [];
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
