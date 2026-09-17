import { io, type Socket } from 'socket.io-client';
import type { GameEvent, PlayerView } from '../shared/types';
import {
  EV,
  OUT,
  type ChatEventPayload,
  type PresencePayload,
  type RoomAckPayload,
  type RoomErrorPayload,
} from '../shared/protocol';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

export interface NetHandlers {
  onAck?: (payload: RoomAckPayload) => void;
  onError?: (payload: RoomErrorPayload) => void;
  onPresence?: (payload: PresencePayload) => void;
  onStarted?: (payload: { roomCode: string }) => void;
  onView?: (view: PlayerView) => void;
  onPublicEvents?: (events: GameEvent[]) => void;
  onPrivateEvents?: (events: GameEvent[]) => void;
  onCommandAck?: (commandId: string) => void;
  onCommandReject?: (commandId: string, reasonCode: string) => void;
  onChat?: (payload: ChatEventPayload) => void;
  onStatus?: (status: ConnectionStatus) => void;
}

/** Socket.IO 客户端封装：不实现任何规则逻辑 */
export class GameNet {
  private socket: Socket | null = null;
  private handlers: NetHandlers = {};
  status: ConnectionStatus = 'idle';
  roomCode: string | null = null;
  seatToken: string | null = null;
  seatId: string | null = null;
  isHost = false;

  connect(url: string, seatToken?: string): void {
    this.setStatus('connecting');
    this.socket = io(url, {
      auth: seatToken ? { seatToken } : {},
      transports: ['websocket', 'polling'],
    });
    this.socket.on('connect', () => this.setStatus('connected'));
    this.socket.on('disconnect', () => this.setStatus('disconnected'));
    this.socket.on(OUT.roomAck, (p: RoomAckPayload) => {
      this.roomCode = p.roomCode;
      this.seatToken = p.seatToken;
      this.seatId = p.seatId;
      this.isHost = p.isHost;
      if (this.socket) {
        this.socket.auth = { seatToken: p.seatToken };
      }
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(`ninja-night:seatToken:${p.roomCode}`, p.seatToken);
          localStorage.setItem('ninja-night:lastRoomCode', p.roomCode);
        }
        if (typeof history !== 'undefined' && history.replaceState) {
          const u = new URL(window.location.href);
          u.searchParams.set('room', p.roomCode);
          history.replaceState(null, '', u.toString());
        }
      } catch {}
      this.handlers.onAck?.(p);
    });
    this.socket.on(OUT.roomError, (p: RoomErrorPayload) => {
      if (p.message === '座位已过期，请重新加入' || p.reasonCode === 'UNAUTHORIZED') {
        try {
          if (typeof localStorage !== 'undefined') {
            if (this.roomCode) {
              localStorage.removeItem(`ninja-night:seatToken:${this.roomCode}`);
            }
            const last = localStorage.getItem('ninja-night:lastRoomCode');
            if (last) localStorage.removeItem(`ninja-night:seatToken:${last}`);
            localStorage.removeItem('ninja-night:lastRoomCode');
          }
          if (typeof history !== 'undefined' && history.replaceState) {
            const u = new URL(window.location.href);
            u.searchParams.delete('room');
            history.replaceState(null, '', u.toString());
          }
        } catch {}
        this.roomCode = null;
        this.seatToken = null;
        this.seatId = null;
      }
      this.handlers.onError?.(p);
    });
    this.socket.on(OUT.roomPresence, (p: PresencePayload) => this.handlers.onPresence?.(p));
    this.socket.on(OUT.roomStarted, (p: { roomCode: string }) => this.handlers.onStarted?.(p));
    this.socket.on(OUT.viewSnapshot, (v: PlayerView) => this.handlers.onView?.(v));
    this.socket.on(OUT.eventPublic, (e: GameEvent[]) => this.handlers.onPublicEvents?.(e));
    this.socket.on(OUT.eventPrivate, (e: GameEvent[]) => this.handlers.onPrivateEvents?.(e));
    this.socket.on(OUT.commandAck, (p: { commandId: string }) =>
      this.handlers.onCommandAck?.(p.commandId),
    );
    this.socket.on(OUT.commandReject, (p: { commandId: string; reasonCode: string }) =>
      this.handlers.onCommandReject?.(p.commandId, p.reasonCode),
    );
    this.socket.on(OUT.chatEvent, (p: ChatEventPayload) => this.handlers.onChat?.(p));
  }

  setHandlers(h: NetHandlers): void {
    this.handlers = { ...this.handlers, ...h };
  }

  private setStatus(s: ConnectionStatus): void {
    this.status = s;
    this.handlers.onStatus?.(s);
  }

  createRoom(nickname: string): void {
    this.socket?.emit(EV.roomCreate, { nickname });
  }

  joinRoom(roomCode: string, nickname: string): void {
    this.socket?.emit(EV.roomJoin, { roomCode, nickname });
  }

  setReady(ready: boolean): void {
    if (!this.seatToken) return;
    this.socket?.emit(EV.roomReady, { seatToken: this.seatToken, ready });
  }

  startRoom(): void {
    if (!this.seatToken) return;
    this.socket?.emit(EV.roomStart, { seatToken: this.seatToken });
  }

  forceAdvance(): void {
    if (!this.seatToken) return;
    this.socket?.emit(EV.roomForceAdvance, { seatToken: this.seatToken });
  }

  kickSeat(targetSeatId: string): void {
    if (!this.seatToken) return;
    this.socket?.emit(EV.roomKick, { seatToken: this.seatToken, targetSeatId });
  }

  endGame(): void {
    if (!this.seatToken) return;
    this.socket?.emit(EV.roomEnd, { seatToken: this.seatToken });
  }

  addBot(): void {
    if (!this.seatToken) return;
    this.socket?.emit(EV.roomAddBot, { seatToken: this.seatToken });
  }

  removeBot(botSeatId?: string): void {
    if (!this.seatToken) return;
    this.socket?.emit(EV.roomRemoveBot, { seatToken: this.seatToken, botSeatId });
  }

  sendCommand(
    windowId: string,
    type: string,
    payload: Record<string, unknown>,
    commandId?: string,
  ): string {
    const id = commandId ?? `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!this.seatToken || !this.socket) return id;
    this.socket.emit(EV.commandSend, {
      commandId: id,
      seatToken: this.seatToken,
      windowId,
      type,
      payload,
    });
    return id;
  }

  sendChat(text: string): void {
    if (!this.seatToken) return;
    this.socket?.emit(EV.chatSend, { seatToken: this.seatToken, text });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.setStatus('idle');
  }
}
