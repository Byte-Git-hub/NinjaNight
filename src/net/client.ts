import { io, type Socket } from 'socket.io-client';
import type { GameEvent, PlayerView } from '../shared/types';
import {
  EV,
  OUT,
  type ChatEventPayload,
  type PresencePayload,
  type RoomAckPayload,
  type RoomErrorPayload,
  type ReactionEventPayload,
  type ReactionKind,
  type ReactionEmojiId,
  type RoomLlmConfigResult,
} from '../shared/protocol';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

export interface NetHandlers {
  onAck?: (payload: RoomAckPayload) => void;
  onError?: (payload: RoomErrorPayload) => void;
  onPresence?: (payload: PresencePayload) => void;
  onStarted?: (payload: { roomCode: string }) => void;
  onTerminated?: (payload: { roomCode: string }) => void;
  onView?: (view: PlayerView) => void;
  onPublicEvents?: (events: GameEvent[]) => void;
  onPrivateEvents?: (events: GameEvent[]) => void;
  onCommandAck?: (commandId: string) => void;
  onCommandReject?: (commandId: string, reasonCode: string) => void;
  /** 社交链路拒绝单独分流，避免在牌桌上显示游戏指令的 RATE_LIMITED 横幅。 */
  onSocialReject?: (commandId: string, reasonCode: string) => void;
  onChat?: (payload: ChatEventPayload) => void;
  onReaction?: (payload: ReactionEventPayload) => void;
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
    this.socket.on(OUT.roomPresence, (p: PresencePayload) => {
      this.isHost = this.seatId === p.hostSeatId;
      this.handlers.onPresence?.(p);
    });
    this.socket.on(OUT.roomStarted, (p: { roomCode: string }) => this.handlers.onStarted?.(p));
    this.socket.on(OUT.roomTerminated, (p: { roomCode: string }) => this.handlers.onTerminated?.(p));
    this.socket.on(OUT.viewSnapshot, (v: PlayerView) => {
      if (import.meta.env.DEV) {
        console.log('[view]', {
          phase: v.phase,
          pending: v.pendingDecision?.kind ?? null,
          receivedAt: Date.now(),
        });
      }
      this.handlers.onView?.(v);
    });
    this.socket.on(OUT.eventPublic, (e: GameEvent[]) => this.handlers.onPublicEvents?.(e));
    this.socket.on(OUT.eventPrivate, (e: GameEvent[]) => this.handlers.onPrivateEvents?.(e));
    this.socket.on(OUT.commandAck, (p: { commandId: string }) =>
      this.handlers.onCommandAck?.(p.commandId),
    );
    this.socket.on(OUT.commandReject, (p: { commandId: string; reasonCode: string }) => {
      if (p.commandId.startsWith('reaction-')) {
        this.handlers.onSocialReject?.(p.commandId, p.reasonCode);
      } else {
        this.handlers.onCommandReject?.(p.commandId, p.reasonCode);
      }
    });
    this.socket.on(OUT.chatEvent, (p: ChatEventPayload) => this.handlers.onChat?.(p));
    this.socket.on(OUT.reactionEvent, (p: ReactionEventPayload) => this.handlers.onReaction?.(p));
    this.bindPendingHandlers();
  }

  setHandlers(h: NetHandlers): void {
    this.handlers = { ...this.handlers, ...h };
  }

  /**
   * 6G-1 语音信令透传：复用同一 Socket，不另建连接。
   * 游戏 Command 链路零依赖；语音事件走独立命名空间（voice.*）。
   * mount 时 socket 可能尚未建立，handler 先记入 pending，connect 后补绑。
   */
  private pendingSocketHandlers = new Map<string, Set<(...args: never[]) => void>>();

  private bindPendingHandlers(): void {
    if (!this.socket) return;
    for (const [event, handlers] of this.pendingSocketHandlers) {
      for (const h of handlers) {
        this.socket.on(event, h as (...args: unknown[]) => void);
      }
    }
  }

  onSocketEvent(event: string, handler: (...args: never[]) => void): void {
    let set = this.pendingSocketHandlers.get(event);
    if (!set) {
      set = new Set();
      this.pendingSocketHandlers.set(event, set);
    }
    set.add(handler);
    this.socket?.on(event, handler as (...args: unknown[]) => void);
  }

  offSocketEvent(event: string, handler: (...args: never[]) => void): void {
    this.pendingSocketHandlers.get(event)?.delete(handler);
    this.socket?.off(event, handler as (...args: unknown[]) => void);
  }

  emitWithAck(event: string, payload: Record<string, unknown>): Promise<unknown> {
    const sock = this.socket;
    if (!sock || !this.seatToken) return Promise.resolve({ error: 'NO_SOCKET' });
    return new Promise((resolve) => {
      try {
        sock.emit(event, { ...payload, seatToken: this.seatToken }, (res: unknown) => {
          resolve(res);
        });
      } catch {
        resolve({ error: 'EMIT_FAILED' });
      }
    });
  }

  emitVoice(event: string, payload: Record<string, unknown>): void {
    if (!this.socket || !this.seatToken) return;
    this.socket.emit(event, { ...payload, seatToken: this.seatToken });
  }

  get isSocketConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  private setStatus(s: ConnectionStatus): void {
    this.status = s;
    this.handlers.onStatus?.(s);
  }

  createRoom(nickname: string, llmApiKey?: string): void {
    this.socket?.emit(EV.roomCreate, { nickname, ...(llmApiKey ? { llmApiKey } : {}) });
  }

  configureLlm(apiKey?: string | null): Promise<RoomLlmConfigResult> {
    const socket = this.socket;
    if (!socket?.connected || !this.seatToken) {
      return Promise.resolve({ ok: false, reasonCode: 'UNAUTHORIZED' });
    }
    return new Promise((resolve) => {
      socket.timeout(5000).emit(EV.roomLlmConfig, {
        seatToken: this.seatToken,
        ...(apiKey === undefined ? {} : { apiKey }),
      }, (error: Error | null, result: RoomLlmConfigResult) => {
        resolve(error ? { ok: false, reasonCode: 'INVALID_PAYLOAD' } : result);
      });
    });
  }

  joinRoom(roomCode: string, nickname: string): void {
    this.socket?.emit(EV.roomJoin, { roomCode, nickname });
  }

  setReady(ready: boolean): void {
    if (!this.seatToken) return;
    this.socket?.emit(EV.roomReady, { seatToken: this.seatToken, ready });
  }

  startRoom(seed?: number): void {
    if (!this.seatToken) return;
    // 6J 种子机制：seed 仅房主固定复现局时传；undefined = 随机
    this.socket?.emit(EV.roomStart, { seatToken: this.seatToken, ...(seed === undefined ? {} : { seed }) });
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

  leaveRoom(): void {
    if (this.seatToken) {
      this.socket?.emit(EV.roomLeave, { seatToken: this.seatToken });
    }
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
    this.isHost = false;
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

  sendReaction(targetSeatId: string, kind: ReactionKind, count = 1, emoji?: string, emojiId?: ReactionEmojiId): void {
    if (!this.seatToken) return;
    this.socket?.emit(EV.reactionSend, {
      seatToken: this.seatToken,
      targetSeatId,
      kind,
      count,
      ...(emoji ? { emoji } : {}),
      ...(emojiId ? { emojiId } : {}),
      commandId: `reaction-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.setStatus('idle');
  }
}
