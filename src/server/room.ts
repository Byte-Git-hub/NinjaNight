import type { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import type { Command, GameEvent } from '../shared/types';
import type { GameState } from '../core/game-state';
import { applyCommand } from '../core/engine';
import { projectView } from '../core/project-view';
import type { ReasonCode, PresencePayload } from '../shared/protocol';
import { OUT } from '../shared/protocol';

export interface LobbySeat {
  seatId: string;
  nickname: string;
  seatToken: string;
  ready: boolean;
  isHost: boolean;
}

export interface SessionInfo {
  roomCode: string;
  seatId: string;
  seatToken: string;
  socketId: string;
  ready: boolean;
  connected: boolean;
  disconnectedAt: number | null;
  rateWindowStart: number;
  rateCount: number;
  recentCommandIds: string[];
}

/** 房间运行时：大厅座位 + 开局后权威 state；严禁广播完整 GameState */
export class RoomRuntime {
  code: string;
  lobby: LobbySeat[] = [];
  state: GameState | null = null;
  hostSeatId: string;
  sessions = new Map<string, SessionInfo>();
  bots = new Set<string>();
  botTimers = new Map<string, NodeJS.Timeout>();
  botScheduledKeys = new Set<string>();
  createdAt = Date.now();
  endedAt: number | null = null;
  emptySince: number | null = Date.now();
  started = false;
  private io: Server;

  constructor(io: Server, code: string) {
    this.io = io;
    this.code = code;
    this.hostSeatId = 's0';
  }

  get seatCount(): number {
    return this.started ? (this.state?.seats.length ?? 0) : this.lobby.length;
  }

  setState(state: GameState): void {
    this.state = state;
  }

  broadcastView(): void {
    if (!this.state) return;
    for (const sess of this.sessions.values()) {
      const view = projectView(this.state, sess.seatId);
      if (view) this.io.to(sess.socketId).emit(OUT.viewSnapshot, view);
    }
  }

  broadcastPublicEvents(events: GameEvent[]): void {
    if (events.length === 0) return;
    this.io.to(this.roomChannel()).emit(OUT.eventPublic, events);
  }

  broadcastPrivateEvents(events: GameEvent[]): void {
    for (const e of events) {
      const seats =
        typeof e.visibility === 'object' && e.visibility && 'seats' in e.visibility
          ? (e.visibility as { seats: string[] }).seats
          : [];
      for (const seatId of seats) {
        const sess = this.findSessionBySeat(seatId);
        if (sess) this.io.to(sess.socketId).emit(OUT.eventPrivate, [e]);
      }
    }
  }

  roomChannel(): string {
    return `room:${this.code}`;
  }

  findSessionBySeat(seatId: string): SessionInfo | undefined {
    for (const s of this.sessions.values()) {
      if (s.seatId === seatId) return s;
    }
    return undefined;
  }

  presence(): PresencePayload {
    const seats = this.started
      ? (this.state?.seats ?? []).map((s) => {
          const sess = this.findSessionBySeat(s.seatId);
          const lobbySeat = this.lobby.find((l) => l.seatId === s.seatId);
          return {
            seatId: s.seatId,
            nickname: s.nickname,
            connected: sess?.connected ?? false,
            ready: lobbySeat?.ready ?? sess?.ready ?? false,
            isHost: s.seatId === this.hostSeatId,
            isBot: this.bots.has(s.seatId),
          };
        })
      : this.lobby.map((l) => {
          const sess = this.sessions.get(l.seatToken);
          return {
            seatId: l.seatId,
            nickname: l.nickname,
            connected: sess?.connected ?? false,
            ready: l.ready,
            isHost: l.isHost,
            isBot: this.bots.has(l.seatId),
          };
        });
    return {
      roomCode: this.code,
      hostSeatId: this.hostSeatId,
      phase: this.state?.phase ?? 'roomLobby',
      seats,
    };
  }

  broadcastPresence(): void {
    this.io.to(this.roomChannel()).emit(OUT.roomPresence, this.presence());
  }

  emitToSeat(seatToken: string, event: string, payload: unknown): void {
    const sess = this.sessions.get(seatToken);
    if (sess) this.io.to(sess.socketId).emit(event, payload);
  }

  applyGameCommand(
    cmd: Command,
  ):
    | { ok: true; newEvents: GameEvent[]; state: GameState }
    | { ok: false; reason: ReasonCode } {
    if (!this.state) return { ok: false, reason: 'ROOM_NOT_FOUND' };
    const before = this.state;
    const beforeSeq = before.eventSeq;
    const result = applyCommand(before, cmd);
    if (!result.ok) {
      return { ok: false, reason: reasonFromCore(result.reason) };
    }
    const next = result.state;
    const newEvents = next.events.slice(beforeSeq);
    this.state = next;
    return { ok: true, newEvents, state: next };
  }

  markEmpty(): void {
    if (this.sessions.size === 0) this.emptySince = Date.now();
    else this.emptySince = null;
  }

  clearTimer(): void {
    /* window timers live in index.ts; kept for API completeness */
  }

  clearBotTimers(): void {
    for (const timer of this.botTimers.values()) {
      clearTimeout(timer);
    }
    this.botTimers.clear();
    this.botScheduledKeys.clear();
  }

  isIdleExpired(now: number, emptyTtl: number, endedTtl: number): boolean {
    if (this.started && this.state?.gameOver && this.endedAt) {
      if (now - this.endedAt > endedTtl) return true;
    }
    if (!this.started && this.emptySince && now - this.emptySince > emptyTtl) return true;
    if (this.started && this.emptySince && now - this.emptySince > emptyTtl) return true;
    return false;
  }
}

function reasonFromCore(r: string): ReasonCode {
  const map: Record<string, ReasonCode> = {
    unauthorized: 'UNAUTHORIZED',
    duplicate: 'DUPLICATE_COMMAND',
    staleWindow: 'STALE_WINDOW',
    phaseMismatch: 'PHASE_MISMATCH',
    notAlive: 'DEAD_SEAT',
    notYourTurn: 'NOT_YOUR_TURN',
    illegalTarget: 'ILLEGAL_TARGET',
    invalidPayload: 'INVALID_PAYLOAD',
    unknownCommand: 'UNKNOWN_COMMAND',
    notInHand: 'NOT_IN_HAND',
    noActiveWindow: 'NO_ACTIVE_WINDOW',
  };
  return map[r] ?? 'INVALID_PAYLOAD';
}

export function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i += 1) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)] as string;
  }
  return s;
}

export function newSeatToken(): string {
  return randomUUID();
}
