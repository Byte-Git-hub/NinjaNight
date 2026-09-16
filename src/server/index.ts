import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import { applyAllDefaults, createGame } from '../core/engine';
import type { Command, CommandType } from '../shared/types';
import {
  DEFAULT_WINDOW_MS,
  EMPTY_ROOM_TTL_MS,
  ENDED_ROOM_TTL_MS,
  COMMAND_RATE_PER_SEC,
  IDEMPOTENCY_CACHE_SIZE,
  MAX_CHAT_LEN,
  MAX_NICKNAME_LEN,
  MAX_PLAYERS,
  MIN_PLAYERS,
} from '../shared/timeouts';
import {
  EV,
  OUT,
  sanitizeChat,
  sanitizeNickname,
  sanitizeRoomCode,
  type ReasonCode,
  type RoomAckPayload,
} from '../shared/protocol';
import { RoomRuntime, generateRoomCode, newSeatToken, type SessionInfo } from './room';
import { logger } from './logger';
import { DISCONNECT_RETAIN_MS } from '../shared/timeouts';

const VALID_TYPES = new Set<CommandType>([
  'draft.pick',
  'draft.discard',
  'night.declare',
  'night.passPhase',
  'night.chooseTarget',
  'night.chooseOptional',
  'react.decide',
  'room.forceAdvance',
]);

export function createApp() {
  const app = express();
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  const dist = join(process.cwd(), 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/socket\.io|\/health).*/, (_req, res) => {
      res.sendFile(join(dist, 'index.html'));
    });
  }
  return app;
}

export function createGameServer(port = Number(process.env.PORT ?? 3000)) {
  const app = createApp();
  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: { origin: true } });

  const rooms = new Map<string, RoomRuntime>();
  const sessionsByToken = new Map<string, SessionInfo>();

  function uniqueCode(): string {
    for (let i = 0; i < 50; i += 1) {
      const c = generateRoomCode();
      if (!rooms.has(c)) return c;
    }
    return generateRoomCode();
  }

  function clearIdleRooms(): void {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (room.isIdleExpired(now, EMPTY_ROOM_TTL_MS, ENDED_ROOM_TTL_MS)) {
        room.sessions.clear();
        rooms.delete(code);
      }
    }
  }
  const cleaner = setInterval(clearIdleRooms, 30_000);
  cleaner.unref?.();

  function windowKeyOf(room: RoomRuntime): string {
    if (!room.state) return '';
    return (
      room.state.windowId +
      ':' +
      room.state.eventSeq +
      ':' +
      room.state.pending.map((p) => p.id).join(',')
    );
  }

  function scheduleWindowTimeout(room: RoomRuntime, ms = DEFAULT_WINDOW_MS): void {
    if (!room.state || room.state.pending.length === 0) return;
    const key = windowKeyOf(room);
    const t = setTimeout(() => {
      if (rooms.get(room.code) !== room) return;
      if (!room.state || room.state.pending.length === 0) return;
      if (windowKeyOf(room) !== key) return;
      const beforeSeq = room.state.eventSeq;
      const result = applyAllDefaults(room.state);
      if (result.ok) {
        const newEvents = result.state.events.slice(beforeSeq);
        room.broadcastPublicEvents(newEvents.filter((e) => e.visibility === 'public'));
        room.broadcastPrivateEvents(newEvents);
        room.broadcastView();
        if (room.state.pending.length > 0) scheduleWindowTimeout(room, ms);
      }
    }, ms);
    t.unref?.();
  }

  function afterStateChange(room: RoomRuntime): void {
    if (!room.state) return;
    if (room.state.gameOver && !room.endedAt) room.endedAt = Date.now();
    room.broadcastView();
    room.broadcastPresence();
    if (room.state.pending.length > 0) scheduleWindowTimeout(room);
  }

  function emitError(socket: Socket, reason: ReasonCode, message?: string): void {
    socket.emit(OUT.roomError, { reasonCode: reason, message });
  }

  /** 清理超过保留期的断线 session */
  function pruneDisconnectedSessions(): void {
    const now = Date.now();
    for (const room of rooms.values()) {
      for (const [tok, sess] of [...room.sessions]) {
        if (!sess.connected && sess.disconnectedAt && now - sess.disconnectedAt > DISCONNECT_RETAIN_MS) {
          room.sessions.delete(tok);
          sessionsByToken.delete(tok);
          logger.info('session.pruned', { roomCode: room.code, seatId: sess.seatId });
        }
      }
      room.markEmpty();
    }
  }
  const pruneTimer = setInterval(pruneDisconnectedSessions, 30_000);
  pruneTimer.unref?.();

  function bindSession(
    room: RoomRuntime,
    socket: Socket,
    seatId: string,
    seatToken: string,
  ): SessionInfo {
    // 重绑同 seatToken
    const existing = room.sessions.get(seatToken);
    if (existing) {
      existing.socketId = socket.id;
      existing.connected = true;
      existing.disconnectedAt = null;
      sessionsByToken.set(seatToken, existing);
      socket.join(room.roomChannel());
      socket.data.seatToken = seatToken;
      socket.data.roomCode = room.code;
      if (room.started && room.state) {
        const seat = room.state.seats.find((s) => s.seatId === seatId);
        if (seat) seat.connected = true;
      }
      logger.info('session.rebind', { roomCode: room.code, seatId });
      return existing;
    }
    const sess: SessionInfo = {
      roomCode: room.code,
      seatId,
      seatToken,
      socketId: socket.id,
      ready: false,
      connected: true,
      disconnectedAt: null,
      rateWindowStart: Date.now(),
      rateCount: 0,
      recentCommandIds: [],
    };
    // 同一 seat 新连接抢占旧 token
    for (const [tok, old] of sessionsByToken) {
      if (old.seatId === seatId && old.roomCode === room.code && tok !== seatToken) {
        io.to(old.socketId).emit(OUT.roomError, {
          reasonCode: 'UNAUTHORIZED',
          message: '连接被替换',
        });
        io.sockets.sockets.get(old.socketId)?.leave(room.roomChannel());
        sessionsByToken.delete(tok);
        room.sessions.delete(tok);
      }
    }
    room.sessions.set(seatToken, sess);
    sessionsByToken.set(seatToken, sess);
    socket.join(room.roomChannel());
    socket.data.seatToken = seatToken;
    socket.data.roomCode = room.code;
    if (room.started && room.state) {
      const seat = room.state.seats.find((s) => s.seatId === seatId);
      if (seat) seat.connected = true;
    }
    return sess;
  }

  io.on('connection', (socket) => {
    socket.on(EV.roomCreate, (payload: unknown) => {
      try {
      const body = (payload ?? {}) as { nickname?: unknown };
      const nick = sanitizeNickname(body.nickname, MAX_NICKNAME_LEN);
      if (!nick) {
        emitError(socket, 'INVALID_PAYLOAD', '昵称无效');
        return;
      }
      const code = uniqueCode();
      const room = new RoomRuntime(io, code);
      const seatToken = newSeatToken();
      room.lobby.push({
        seatId: 's0',
        nickname: nick,
        seatToken,
        ready: false,
        isHost: true,
      });
      rooms.set(code, room);
      const sess = bindSession(room, socket, 's0', seatToken);
      const ack: RoomAckPayload = {
        roomCode: code,
        seatToken: sess.seatToken,
        seatId: 's0',
        isHost: true,
      };
      socket.emit(OUT.roomAck, ack);
      room.broadcastPresence();
      } catch (err) {
        const e = err as Error;
        logger.error('socket.handler_error', { error: e.message, type: 'room.create' });
        emitError(socket, 'INVALID_PAYLOAD', '服务器内部错误');
      }
    });

    socket.on(EV.roomJoin, (payload: unknown) => {
      const body = (payload ?? {}) as { roomCode?: unknown; nickname?: unknown };
      const code = sanitizeRoomCode(body.roomCode);
      const nick = sanitizeNickname(body.nickname, MAX_NICKNAME_LEN);
      if (!code || !nick) {
        emitError(socket, 'INVALID_PAYLOAD', '房间码或昵称无效');
        return;
      }
      const room = rooms.get(code);
      if (!room) {
        emitError(socket, 'ROOM_NOT_FOUND');
        return;
      }
      if (room.started) {
        emitError(socket, 'GAME_IN_PROGRESS');
        return;
      }
      if (room.lobby.length >= MAX_PLAYERS) {
        emitError(socket, 'ROOM_FULL');
        return;
      }
      const idx = room.lobby.length;
      const seatId = `s${idx}`;
      const seatToken = newSeatToken();
      room.lobby.push({ seatId, nickname: nick, seatToken, ready: false, isHost: false });
      const sess = bindSession(room, socket, seatId, seatToken);
      const ack: RoomAckPayload = {
        roomCode: code,
        seatToken: sess.seatToken,
        seatId,
        isHost: false,
      };
      socket.emit(OUT.roomAck, ack);
      room.broadcastPresence();
    });

    socket.on(EV.roomReady, (payload: unknown) => {
      const body = (payload ?? {}) as { seatToken?: unknown; ready?: unknown };
      const sess = typeof body.seatToken === 'string' ? sessionsByToken.get(body.seatToken) : undefined;
      if (!sess) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      const room = rooms.get(sess.roomCode);
      if (!room) {
        emitError(socket, 'ROOM_NOT_FOUND');
        return;
      }
      const ready = body.ready === true;
      sess.ready = ready;
      const lobbySeat = room.lobby.find((l) => l.seatToken === sess.seatToken);
      if (lobbySeat) lobbySeat.ready = ready;
      room.broadcastPresence();
    });

    socket.on(EV.roomStart, (payload: unknown) => {
      const body = (payload ?? {}) as { seatToken?: unknown };
      const sess = typeof body.seatToken === 'string' ? sessionsByToken.get(body.seatToken) : undefined;
      if (!sess) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      const room = rooms.get(sess.roomCode);
      if (!room) {
        emitError(socket, 'ROOM_NOT_FOUND');
        return;
      }
      if (sess.seatId !== room.hostSeatId) {
        emitError(socket, 'NOT_HOST');
        return;
      }
      if (room.started) {
        emitError(socket, 'GAME_IN_PROGRESS');
        return;
      }
      const n = room.lobby.length;
      if (n < MIN_PLAYERS || n > MAX_PLAYERS) {
        emitError(socket, 'INVALID_PAYLOAD', `需要 ${MIN_PLAYERS}–${MAX_PLAYERS} 人`);
        return;
      }
      const allReady = room.lobby.every((l) => l.isHost || l.ready);
      if (!allReady) {
        emitError(socket, 'INVALID_PAYLOAD', '仍有玩家未准备');
        return;
      }
      const nicknames = room.lobby.map((l) => l.nickname);
      const state = createGame({
        seed: Date.now() % 1_000_000,
        roomCode: room.code,
        nicknames,
        playerCount: n,
      });
      // 大厅 seatId s0..sn-1 与 createGame 座位一一对应
      for (let i = 0; i < n; i += 1) {
        const lobbySeat = room.lobby[i];
        const seat = state.seats[i];
        if (lobbySeat && seat) {
          seat.seatToken = lobbySeat.seatToken;
          seat.nickname = lobbySeat.nickname;
          seat.isHost = lobbySeat.isHost;
        }
      }
      room.setState(state);
      room.started = true;
      io.to(room.roomChannel()).emit(OUT.roomStarted, { roomCode: room.code });
      room.broadcastPresence();
      afterStateChange(room);
    });

    socket.on(EV.roomForceAdvance, (payload: unknown) => {
      const body = (payload ?? {}) as { seatToken?: unknown };
      const sess = typeof body.seatToken === 'string' ? sessionsByToken.get(body.seatToken) : undefined;
      if (!sess) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      const room = rooms.get(sess.roomCode);
      if (!room || !room.state) {
        emitError(socket, 'ROOM_NOT_FOUND');
        return;
      }
      if (sess.seatId !== room.hostSeatId) {
        emitError(socket, 'NOT_HOST');
        return;
      }
      const hostSeat = room.state.seats.find((s) => s.seatId === room.hostSeatId);
      if (!hostSeat) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      const cmd: Command = {
        commandId: `fa-${randomUUID()}`,
        roomCode: room.code,
        seatToken: hostSeat.seatToken,
        windowId: room.state.windowId,
        type: 'room.forceAdvance',
        payload: {},
      };
      const res = room.applyGameCommand(cmd);
      if (!res.ok) {
        emitError(socket, res.reason);
        return;
      }
      room.broadcastPublicEvents(res.newEvents.filter((e) => e.visibility === 'public'));
      room.broadcastPrivateEvents(res.newEvents);
      afterStateChange(room);
    });

    // 房主踢出断线玩家；对局中踢出则本局结束回大厅
    socket.on(EV.roomKick, (payload: unknown) => {
      const body = (payload ?? {}) as { seatToken?: unknown; targetSeatId?: unknown };
      const sess = typeof body.seatToken === 'string' ? sessionsByToken.get(body.seatToken) : undefined;
      if (!sess) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      const room = rooms.get(sess.roomCode);
      if (!room) {
        emitError(socket, 'ROOM_NOT_FOUND');
        return;
      }
      if (sess.seatId !== room.hostSeatId) {
        emitError(socket, 'NOT_HOST');
        return;
      }
      const targetSeatId = typeof body.targetSeatId === 'string' ? body.targetSeatId : null;
      if (!targetSeatId || targetSeatId === room.hostSeatId) {
        emitError(socket, 'INVALID_PAYLOAD', '不能踢出房主');
        return;
      }
      // 移除该座位 session
      for (const [tok, s] of [...room.sessions]) {
        if (s.seatId === targetSeatId) {
          room.sessions.delete(tok);
          sessionsByToken.delete(tok);
          io.to(s.socketId).emit(OUT.roomError, {
            reasonCode: 'UNAUTHORIZED',
            message: '你已被房主踢出',
          });
        }
      }
      room.lobby = room.lobby.filter((l) => l.seatId !== targetSeatId);
      if (room.started && room.state) {
        // 已开始的对局无法继续 → 回大厅
        resetRoomToLobby(room);
        logger.info('room.kick_end_game', { roomCode: room.code, seatId: targetSeatId });
      } else {
        room.broadcastPresence();
        logger.info('room.kick', { roomCode: room.code, seatId: targetSeatId });
      }
    });

    // 房主终止本局 → 回大厅
    socket.on(EV.roomEnd, (payload: unknown) => {
      const body = (payload ?? {}) as { seatToken?: unknown };
      const sess = typeof body.seatToken === 'string' ? sessionsByToken.get(body.seatToken) : undefined;
      if (!sess) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      const room = rooms.get(sess.roomCode);
      if (!room) {
        emitError(socket, 'ROOM_NOT_FOUND');
        return;
      }
      if (sess.seatId !== room.hostSeatId) {
        emitError(socket, 'NOT_HOST');
        return;
      }
      resetRoomToLobby(room);
      logger.info('room.end', { roomCode: room.code });
    });

    socket.on(EV.commandSend, (payload: unknown) => {
      const body = (payload ?? {}) as {
        commandId?: unknown;
        seatToken?: unknown;
        windowId?: unknown;
        type?: unknown;
        payload?: unknown;
      };
      const sess = typeof body.seatToken === 'string' ? sessionsByToken.get(body.seatToken) : undefined;
      if (!sess) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      const now = Date.now();
      if (now - sess.rateWindowStart > 1000) {
        sess.rateWindowStart = now;
        sess.rateCount = 0;
      }
      sess.rateCount += 1;
      if (sess.rateCount > COMMAND_RATE_PER_SEC) {
        socket.emit(OUT.commandReject, {
          commandId: String(body.commandId ?? ''),
          reasonCode: 'RATE_LIMITED',
        });
        return;
      }
      const commandId = typeof body.commandId === 'string' ? body.commandId : null;
      const windowId = typeof body.windowId === 'string' ? body.windowId : null;
      const type = typeof body.type === 'string' ? (body.type as CommandType) : null;
      if (!commandId || !windowId || !type || !VALID_TYPES.has(type)) {
        socket.emit(OUT.commandReject, {
          commandId: commandId ?? '',
          reasonCode: 'INVALID_PAYLOAD',
        });
        return;
      }
      if (sess.recentCommandIds.includes(commandId)) {
        socket.emit(OUT.commandAck, { commandId });
        return;
      }
      sess.recentCommandIds.push(commandId);
      if (sess.recentCommandIds.length > IDEMPOTENCY_CACHE_SIZE) {
        sess.recentCommandIds.shift();
      }

      const room = rooms.get(sess.roomCode);
      if (!room || !room.state) {
        socket.emit(OUT.commandReject, { commandId, reasonCode: 'ROOM_NOT_FOUND' });
        return;
      }

      if (type !== 'room.forceAdvance') {
        const pendingIds = room.state.pending.map((p) => p.id);
        if (windowId !== room.state.windowId && !pendingIds.includes(windowId)) {
          socket.emit(OUT.commandReject, { commandId, reasonCode: 'STALE_WINDOW' });
          return;
        }
      }

      const p = (body.payload ?? {}) as Record<string, unknown>;
      if (type === 'draft.pick' || type === 'draft.discard') {
        if (typeof p.cardInstanceId !== 'string') {
          socket.emit(OUT.commandReject, { commandId, reasonCode: 'INVALID_PAYLOAD' });
          return;
        }
      } else if (type === 'night.declare') {
        if (
          !Array.isArray(p.cardInstanceIds) ||
          p.cardInstanceIds.some((x) => typeof x !== 'string')
        ) {
          socket.emit(OUT.commandReject, { commandId, reasonCode: 'INVALID_PAYLOAD' });
          return;
        }
      } else if (type === 'night.chooseTarget') {
        if (typeof p.targetSeatId !== 'string') {
          socket.emit(OUT.commandReject, { commandId, reasonCode: 'INVALID_PAYLOAD' });
          return;
        }
      } else if (type === 'night.chooseOptional') {
        if (typeof p.choose !== 'boolean') {
          socket.emit(OUT.commandReject, { commandId, reasonCode: 'INVALID_PAYLOAD' });
          return;
        }
      } else if (type === 'react.decide') {
        if (typeof p.react !== 'boolean') {
          socket.emit(OUT.commandReject, { commandId, reasonCode: 'INVALID_PAYLOAD' });
          return;
        }
      }

      const cmd: Command = {
        commandId,
        roomCode: room.code,
        seatToken: sess.seatToken,
        windowId,
        type,
        payload: p as Command['payload'],
      };
      const res = room.applyGameCommand(cmd);
      if (!res.ok) {
        socket.emit(OUT.commandReject, { commandId, reasonCode: res.reason });
        return;
      }
      socket.emit(OUT.commandAck, { commandId });
      room.broadcastPublicEvents(res.newEvents.filter((e) => e.visibility === 'public'));
      room.broadcastPrivateEvents(res.newEvents);
      afterStateChange(room);
    });

    socket.on(EV.chatSend, (payload: unknown) => {
      const body = (payload ?? {}) as { seatToken?: unknown; text?: unknown };
      const sess = typeof body.seatToken === 'string' ? sessionsByToken.get(body.seatToken) : undefined;
      if (!sess) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      const text = sanitizeChat(body.text, MAX_CHAT_LEN);
      if (!text) {
        emitError(socket, 'INVALID_PAYLOAD', '聊天内容无效');
        return;
      }
      const room = rooms.get(sess.roomCode);
      if (!room) {
        emitError(socket, 'ROOM_NOT_FOUND');
        return;
      }
      const seat = room.state?.seats.find((s) => s.seatId === sess.seatId);
      const lobbySeat = room.lobby.find((l) => l.seatId === sess.seatId);
      io.to(room.roomChannel()).emit(OUT.chatEvent, {
        seatId: sess.seatId,
        nickname: seat?.nickname ?? lobbySeat?.nickname ?? '???',
        text,
        ts: Date.now(),
      });
    });

    socket.on(EV.roomLeave, (payload: unknown) => {
      const body = (payload ?? {}) as { seatToken?: unknown };
      const sess = typeof body.seatToken === 'string' ? sessionsByToken.get(body.seatToken) : undefined;
      if (sess) leaveSession(sess, socket);
    });

    socket.on('disconnect', () => {
      const token = socket.data.seatToken as string | undefined;
      if (!token) return;
      const sess = sessionsByToken.get(token);
      if (sess) leaveSession(sess, socket);
    });
  });

  function leaveSession(sess: SessionInfo, socket: Socket): void {
    const room = rooms.get(sess.roomCode);
    socket.leave(room?.roomChannel() ?? '');
    // 断线：保留 session 映射，标记 disconnected（阶段 5）
    sess.connected = false;
    sess.disconnectedAt = Date.now();
    sess.socketId = '';
    if (room) {
      if (room.started && room.state) {
        const seat = room.state.seats.find((s) => s.seatId === sess.seatId);
        if (seat) seat.connected = false;
      }
      room.markEmpty();
      room.broadcastPresence();
    }
    logger.info('session.disconnect', {
      roomCode: sess.roomCode,
      seatId: sess.seatId,
    });
  }

  function resetRoomToLobby(room: RoomRuntime): void {
    room.clearTimer?.();
    room.state = null;
    room.started = false;
    room.endedAt = null;
    // 保留仍连接的 session 在 lobby（按 seatToken 重建 lobby）
    const still: typeof room.lobby = [];
    for (const sess of room.sessions.values()) {
      if (!sess.connected) continue;
      const prev = room.lobby.find((l) => l.seatId === sess.seatId);
      still.push({
        seatId: sess.seatId,
        nickname: prev?.nickname ?? sess.seatId,
        seatToken: sess.seatToken,
        ready: false,
        isHost: sess.seatId === room.hostSeatId,
      });
      sess.ready = false;
    }
    if (still.length === 0) {
      // 至少保留房主若仍在线；否则房间将被清理
      room.lobby = [];
    } else {
      room.lobby = still;
      const host = still.find((s) => s.isHost) ?? still[0];
      if (host) room.hostSeatId = host.seatId;
    }
    room.emptySince = room.sessions.size === 0 ? Date.now() : null;
    room.broadcastPresence();
    for (const sess of room.sessions.values()) {
      room.emitToSeat(sess.seatToken, OUT.roomStarted, { roomCode: room.code, reset: true });
    }
  }

  return {
    httpServer,
    io,
    rooms,
    sessionsByToken,
    listen(portNum = port) {
      return new Promise<void>((resolve) => {
        httpServer.listen(portNum, () => resolve());
      });
    },
    close() {
      clearInterval(cleaner);
      clearInterval(pruneTimer);
      return new Promise<void>((resolve) => {
        io.close();
        httpServer.close(() => resolve());
      });
    },
  };
}

// 仅作为库导出；启动入口见 scripts/dev-server.ts

process.on('uncaughtException', (err) => {
  logger.error('process.uncaughtException', { error: err.message });
});
process.on('unhandledRejection', (reason) => {
  logger.error('process.unhandledRejection', {
    error: reason instanceof Error ? reason.message : String(reason),
  });
});
