import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import { applyAllDefaults, createGame } from '../core/engine';
import { playableInstanceIds } from '../core/night-flow';
import { projectView } from '../core/project-view';
import type { Command, CommandType } from '../shared/types';
import {
  DEFAULT_WINDOW_MS,
  EMPTY_ROOM_TTL_MS,
  ENDED_ROOM_TTL_MS,
  COMMAND_RATE_PER_SEC,
  FIXED_GAME_SEED,
  IDEMPOTENCY_CACHE_SIZE,
  MAX_CHAT_LEN,
  MAX_NICKNAME_LEN,
  MAX_PLAYERS,
  MIN_PLAYERS,
  REACTION_RATE_PER_SEC,
  parseGameSeed,
} from '../shared/timeouts';
import {
  EV,
  OUT,
  sanitizeChat,
  sanitizeNickname,
  sanitizeRoomCode,
  type ReasonCode,
  type RoomAckPayload,
  type ReactionEventPayload,
} from '../shared/protocol';
import { RoomRuntime, generateRoomCode, newSeatToken, type SessionInfo } from './room';
import { logger } from './logger';
import { VoiceManager } from './voice';
import { EffectRelay, validateEffectItems } from './effects';
import { SocialMarks, validatePhrase } from './social';
import { DISCONNECT_RETAIN_MS } from '../shared/timeouts';
import { VICTORY_AUTO_ADVANCE_MS } from '../shared/timeouts';
import { scheduleBots } from './bot-scheduler';
import { validateReaction } from './reactions';

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
  // 6G-1 自签证书：仅当 NINJA_TLS=1 且 certs/ 下证书齐全时跑 https，
  // 否则降级为 http（默认，保证现有 e2e 不受影响）。
  const httpServer = buildHttpServer(app);
  const io = new Server(httpServer, { cors: { origin: resolveCorsOrigin() } });
  // 6I：NINJA_VOICE=0 时彻底禁用语音（Railway 免费层 UDP/C++ 受限时用）；
  // 游戏核心功能零依赖语音，照常运行。
  const voice = new VoiceManager(io);
  if (process.env.NINJA_VOICE === '0') voice.disable('NINJA_VOICE=0');
  // 6G-2a：特效只中继广播（无状态）
  const effects = new EffectRelay(io);
  // 6G-2b：怀疑标记（服务端内存持有，快照广播；不进 core）
  const social = new SocialMarks(io);

  const rooms = new Map<string, RoomRuntime>();
  const sessionsByToken = new Map<string, SessionInfo>();
  const reactionRates = new Map<string, { start: number; count: number }>();

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
        social.cleanupRoom(code);
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
        room.setState(result.state);
        const newEvents = result.state.events.slice(beforeSeq);
        room.broadcastPublicEvents(newEvents.filter((e) => e.visibility === 'public'));
        room.broadcastPrivateEvents(newEvents);
        afterStateChange(room);
      }
    }, ms);
    t.unref?.();
  }

  function handleBotCommand(room: RoomRuntime, cmd: Command): boolean {
    if (!room.state) return false;
    const res = room.applyGameCommand(cmd);
    if (!res.ok) {
      const botSeat = room.state.seats.find((s) => s.seatToken === cmd.seatToken);
      logger.warn('bot.command_reject', {
        roomCode: room.code,
        seatId: botSeat?.seatId ?? 'unknown',
        reason: res.reason,
      });
      return false;
    }
    room.broadcastPublicEvents(res.newEvents.filter((e) => e.visibility === 'public'));
    room.broadcastPrivateEvents(res.newEvents);
    afterStateChange(room);
    return true;
  }

  function afterStateChange(room: RoomRuntime): void {
    if (!room.state) return;
    if (room.state.gameOver && !room.endedAt) room.endedAt = Date.now();
    const pendingSeats = room.state.pending.map((p) => p.seatId);
    if (process.env.DEBUG_BROADCAST || process.env.NODE_ENV !== 'production') {
      logger.info('broadcast.view', {
        roomCode: room.code,
        seatCount: room.sessions.size,
        phase: room.state.phase,
        pendingSeats,
      });
    }
    room.broadcastView();
    room.broadcastPresence();
    if (room.state.pending.length > 0) {
      scheduleWindowTimeout(room);
      scheduleBots(room, handleBotCommand);
    }
    scheduleVictoryAuto(room);
  }

  const victoryTimers = new Map<string, NodeJS.Timeout>();
  function clearVictoryAuto(code: string): void {
    const t = victoryTimers.get(code);
    if (t) {
      clearTimeout(t);
      victoryTimers.delete(code);
    }
  }
  /**
   * Q3 裁定：victoryCheck 轮间停留，多人房等房主手动 forceAdvance；
   * 仅当在线真人 ≤1 时 5s 后自动进下一轮（可视倒计时 TODO 6F）。
   */
  function scheduleVictoryAuto(room: RoomRuntime): void {
    clearVictoryAuto(room.code);
    if (!room.state || room.state.gameOver || room.state.phase !== 'victoryCheck') return;
    const humans = [...room.sessions.values()].filter(
      (s) => s.connected && !room.bots.has(s.seatId),
    );
    if (humans.length > 1) return;
    const t = setTimeout(() => {
      victoryTimers.delete(room.code);
      if (rooms.get(room.code) !== room || !room.state) return;
      if (room.state.phase !== 'victoryCheck' || room.state.gameOver) return;
      const beforeSeq = room.state.eventSeq;
      const result = applyAllDefaults(room.state);
      if (!result.ok) return;
      room.setState(result.state);
      const newEvents = result.state.events.slice(beforeSeq);
      room.broadcastPublicEvents(newEvents.filter((e) => e.visibility === 'public'));
      room.broadcastPrivateEvents(newEvents);
      logger.info('room.victoryAuto', { roomCode: room.code });
      afterStateChange(room);
    }, VICTORY_AUTO_ADVANCE_MS);
    t.unref?.();
    victoryTimers.set(room.code, t);
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
    // 裁定 1：断线重连 seatToken 复用（握手带 seatToken）
    const handshakeToken =
      (typeof socket.handshake.auth?.seatToken === 'string' ? socket.handshake.auth.seatToken : null) ||
      (typeof socket.handshake.query?.seatToken === 'string' ? socket.handshake.query.seatToken : null);

    if (handshakeToken) {
      const sess = sessionsByToken.get(handshakeToken);
      if (sess) {
        const room = rooms.get(sess.roomCode);
        const now = Date.now();
        if (room && (!sess.disconnectedAt || now - sess.disconnectedAt <= DISCONNECT_RETAIN_MS)) {
          bindSession(room, socket, sess.seatId, handshakeToken);
          const isHost = sess.seatId === room.hostSeatId;
          const ack: RoomAckPayload = {
            roomCode: room.code,
            seatToken: handshakeToken,
            seatId: sess.seatId,
            isHost,
          };
          socket.emit(OUT.roomAck, ack);
          room.broadcastPresence();
          if (room.started && room.state) {
            const view = projectView(room.state, sess.seatId);
            if (view) socket.emit(OUT.viewSnapshot, view);
          }
          logger.info('session.reconnect', { roomCode: room.code, seatId: sess.seatId });
        } else {
          socket.emit(OUT.roomError, {
            reasonCode: 'UNAUTHORIZED',
            message: '座位已过期，请重新加入',
          });
        }
      } else {
        socket.emit(OUT.roomError, {
          reasonCode: 'UNAUTHORIZED',
          message: '座位已过期，请重新加入',
        });
      }
    }

    socket.on(EV.roomCreate, (payload: unknown) => {
      try {
      if (!takeJoinRate(socket.id)) {
        emitError(socket, 'RATE_LIMITED', '建房过于频繁');
        return;
      }
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
      // 6J-3：按 socket 限加入（60s 窗口 20 次），防房间码枚举爆破
      // （码空间 32^6；20 次/分钟 → 在线爆破不可行）
      if (!takeJoinRate(socket.id)) {
        emitError(socket, 'RATE_LIMITED', '加入过于频繁');
        return;
      }
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
      const body = (payload ?? {}) as { seatToken?: unknown; seed?: unknown };
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
      // 排序确保 s0..sn-1 顺序与 createGame 一一对应
      room.lobby.sort((a, b) => Number(a.seatId.slice(1)) - Number(b.seatId.slice(1)));
      const nicknames = room.lobby.map((l) => l.nickname);
      // 6J 种子机制：房主请求 seed（?seed=xxx）> NINJA_SEED > 随机。
      // 显式固定的局 seedFixed=true（视图可见、可复现）；随机局种子全程保密。
      const requestedSeed = parseGameSeed(body.seed);
      const seed = requestedSeed ?? FIXED_GAME_SEED ?? Math.floor(Math.random() * 1_000_000);
      const seedFixed = requestedSeed !== null || FIXED_GAME_SEED !== null;
      const seedSource = requestedSeed !== null ? 'client' : FIXED_GAME_SEED !== null ? 'env' : 'random';
      const state = createGame({
        seed,
        seedFixed,
        roomCode: room.code,
        nicknames,
        playerCount: n,
      });
      logger.info('room.started', {
        roomCode: room.code,
        seatCount: n,
        seedSource,
        // 脱敏例外：仅人工显式固定的种子才记值（复现对局用）；随机种子只记来源
        ...(seedFixed ? { fixedSeed: seed } : {}),
      });
      // 大厅 seatId s0..sn-1 与 createGame 座位一一对应
      for (let i = 0; i < n; i += 1) {
        const lobbySeat = room.lobby[i];
        const seat = state.seats[i];
        if (lobbySeat && seat) {
          seat.seatToken = lobbySeat.seatToken;
          seat.nickname = lobbySeat.nickname;
          seat.isHost = lobbySeat.isHost;
          seat.isBot = room.bots.has(lobbySeat.seatId);
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
      logger.info('room.forceAdvance', {
        roomCode: room.code,
        seatId: sess.seatId,
        pendingCount: room.state.pending.length,
        phase: room.state.phase,
      });
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
        emitError(socket, res.reason, `强制推进被拒绝：${res.reason}`);
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
          voice.removeSeatEverywhere(targetSeatId, room.code);
          social.removeSeat(room.code, targetSeatId);
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

    // 房主添加人机对手
    socket.on(EV.roomAddBot, (payload: unknown) => {
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
      if (room.lobby.length >= MAX_PLAYERS) {
        emitError(socket, 'ROOM_FULL', `房间最多容纳 ${MAX_PLAYERS} 人`);
        return;
      }

      // 分配未被占用的最小 seatId
      const usedIds = new Set(room.lobby.map((l) => l.seatId));
      let newSeatId = '';
      for (let i = 0; i < MAX_PLAYERS; i += 1) {
        const sid = `s${i}`;
        if (!usedIds.has(sid)) {
          newSeatId = sid;
          break;
        }
      }
      if (!newSeatId) {
        emitError(socket, 'ROOM_FULL');
        return;
      }

      const botCount = room.bots.size;
      const botNick = `AI-${botCount + 1}`;
      const botToken = newSeatToken();
      room.lobby.push({
        seatId: newSeatId,
        nickname: botNick,
        seatToken: botToken,
        ready: true,
        isHost: false,
      });
      room.bots.add(newSeatId);

      const botSess: SessionInfo = {
        roomCode: room.code,
        seatId: newSeatId,
        seatToken: botToken,
        socketId: `bot-sock-${newSeatId}`,
        ready: true,
        connected: true,
        disconnectedAt: null,
        rateWindowStart: Date.now(),
        rateCount: 0,
        recentCommandIds: [],
      };
      room.sessions.set(botToken, botSess);
      sessionsByToken.set(botToken, botSess);

      room.broadcastPresence();
      logger.info('room.bot_add', { roomCode: room.code, seatId: newSeatId });
    });

    // 房主移除人机对手
    socket.on(EV.roomRemoveBot, (payload: unknown) => {
      const body = (payload ?? {}) as { seatToken?: unknown; botSeatId?: unknown };
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
      if (room.bots.size === 0) {
        return;
      }

      // 若未指定具体 botSeatId，则默认移除最后一个 bot
      const targetSeatId =
        typeof body.botSeatId === 'string' && room.bots.has(body.botSeatId)
          ? body.botSeatId
          : [...room.bots].pop();

      if (!targetSeatId) return;

      room.bots.delete(targetSeatId);
      const lobbySeat = room.lobby.find((l) => l.seatId === targetSeatId);
      if (lobbySeat) {
        room.sessions.delete(lobbySeat.seatToken);
        sessionsByToken.delete(lobbySeat.seatToken);
      }
      room.lobby = room.lobby.filter((l) => l.seatId !== targetSeatId);
      room.broadcastPresence();
      logger.info('room.bot_remove', { roomCode: room.code, seatId: targetSeatId });
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
      if (!takeSharedRate(sess)) {
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
        // 预校验：声明的牌必须在本阶段可打（core 内 phaseMismatch 兜底，双层保护）
        const seat = room.state.seats.find((s) => s.seatToken === sess.seatToken);
        if (seat && room.state.phase.startsWith('night')) {
          const ids = p.cardInstanceIds as string[];
          const handIds = new Set(seat.hand.map((c) => c.instanceId));
          if (ids.some((id) => !handIds.has(id))) {
            socket.emit(OUT.commandReject, { commandId, reasonCode: 'NOT_IN_HAND' });
            return;
          }
          const playable = playableInstanceIds(room.state, seat);
          if (ids.some((id) => !playable.includes(id))) {
            socket.emit(OUT.commandReject, { commandId, reasonCode: 'PHASE_MISMATCH' });
            return;
          }
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

    /**
     * 游戏/聊天/语音使用共享限频桶；effect.send 走压缩条目并独立于游戏命令，
     * 避免一阵物品飞行触发 RATE_LIMITED 横幅。
     */
    function takeSharedRate(sess: SessionInfo): boolean {
      const now = Date.now();
      if (now - sess.rateWindowStart > 1000) {
        sess.rateWindowStart = now;
        sess.rateCount = 0;
      }
      sess.rateCount += 1;
      return sess.rateCount <= COMMAND_RATE_PER_SEC;
    }

    function takeReactionRate(socketId: string): boolean {
      const now = Date.now();
      const current = reactionRates.get(socketId);
      if (!current || now - current.start > 1000) {
        reactionRates.set(socketId, { start: now, count: 1 });
        return true;
      }
      current.count += 1;
      return current.count <= REACTION_RATE_PER_SEC;
    }

    /**
     * 6J-3：建房/加入按 socket 限频（60s 窗口 20 次），防房间码枚举爆破。
     * 超限返回 false（调用方回 RATE_LIMITED）；断开时清理条目。
     */
    const joinRate = new Map<string, { start: number; count: number }>();
    function takeJoinRate(socketId: string): boolean {
      const now = Date.now();
      const r = joinRate.get(socketId);
      if (!r || now - r.start > 60_000) {
        if (joinRate.size > 2000) {
          for (const [k, v] of joinRate) {
            if (now - v.start > 60_000) joinRate.delete(k);
          }
        }
        joinRate.set(socketId, { start: now, count: 1 });
        return true;
      }
      r.count += 1;
      return r.count <= 20;
    }

    /** 本房座位 id 全集（lobby + 对局态；社交层目标合法性用） */    function seatIdsOf(room: RoomRuntime): Set<string> {
      const ids = new Set(room.lobby.map((l) => l.seatId));
      if (room.state) {
        for (const s of room.state.seats) ids.add(s.seatId);
      }
      return ids;
    }

    function nicknameOf(room: RoomRuntime, seatId: string): string {
      const st = room.state?.seats.find((s) => s.seatId === seatId);
      if (st) return st.nickname;
      return room.lobby.find((l) => l.seatId === seatId)?.nickname ?? seatId;
    }

    // ---- 6G-1 语音信令（seatToken 鉴权；只传状态与握手参数，不碰音频） ----
    type VoiceAck = (res: unknown) => void;
    function voiceSess(body: Record<string, unknown>): SessionInfo | undefined {
      return typeof body.seatToken === 'string'
        ? sessionsByToken.get(body.seatToken)
        : undefined;
    }
    function voiceRoomOf(sess: SessionInfo) {
      return rooms.get(sess.roomCode);
    }

    socket.on(EV.voiceJoin, (payload: unknown, ack?: VoiceAck) => {
      const body = (payload ?? {}) as Record<string, unknown>;
      const sess = voiceSess(body);
      if (!sess) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      const room = voiceRoomOf(sess);
      if (!room) {
        emitError(socket, 'ROOM_NOT_FOUND');
        return;
      }
      // Bot 座位不参与语音
      if (room.bots.has(sess.seatId)) {
        emitError(socket, 'INVALID_PAYLOAD', '人机不参与语音');
        return;
      }
      if (!takeSharedRate(sess)) {
        socket.emit(OUT.voiceUnavailable, { message: '操作过于频繁' });
        if (typeof ack === 'function') ack({ error: 'RATE_LIMITED' });
        return;
      }
      voice.join(room.code, sess.seatId);
      voice.broadcastState(room.code);
      void voice.ensureRouter().then((router) => {
        if (!router) {
          socket.emit(OUT.voiceUnavailable, { message: '语音暂不可用' });
          if (typeof ack === 'function') ack({ error: 'VOICE_UNAVAILABLE' });
          return;
        }
        if (typeof ack === 'function') {
          ack({ routerRtpCapabilities: voice.getRouterCapabilities() });
        }
      });
      logger.info('voice.signal', { roomCode: room.code, seatId: sess.seatId, type: 'join' });
    });

    socket.on(EV.voiceLeave, (payload: unknown) => {
      const body = (payload ?? {}) as Record<string, unknown>;
      const sess = voiceSess(body);
      if (!sess) return;
      if (!takeSharedRate(sess)) return;
      const room = voiceRoomOf(sess);
      if (!room) return;
      voice.leave(room.code, sess.seatId);
      voice.broadcastState(room.code);
    });

    socket.on(EV.voiceMute, (payload: unknown) => {
      const body = (payload ?? {}) as { seatToken?: unknown; muted?: unknown };
      const sess = voiceSess(body);
      if (!sess) return;
      if (!takeSharedRate(sess)) return;
      const room = voiceRoomOf(sess);
      if (!room) return;
      voice.setMuted(room.code, sess.seatId, body.muted === true);
      voice.broadcastState(room.code);
    });

    socket.on(EV.voiceSpeaking, (payload: unknown) => {
      const body = (payload ?? {}) as { seatToken?: unknown; speaking?: unknown };
      const sess = voiceSess(body);
      if (!sess) return;
      // 高频上报（客户端 1s 节流），超限静默丢弃防广播风暴
      if (!takeSharedRate(sess)) return;
      const room = voiceRoomOf(sess);
      if (!room) return;
      const snap = voice.setSpeaking(room.code, sess.seatId, body.speaking === true);
      if (snap) voice.broadcastState(room.code);
    });

    socket.on(EV.voiceGetRouter, (payload: unknown, ack?: VoiceAck) => {
      const body = (payload ?? {}) as Record<string, unknown>;
      if (!voiceSess(body)) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      const sess = voiceSess(body);
      if (sess && !takeSharedRate(sess)) {
        if (typeof ack === 'function') ack({ error: 'RATE_LIMITED' });
        return;
      }
      void voice.ensureRouter().then((router) => {
        if (typeof ack !== 'function') return;
        if (!router) ack({ error: 'VOICE_UNAVAILABLE' });
        else ack({ routerRtpCapabilities: voice.getRouterCapabilities() });
      });
    });

    socket.on(EV.voiceCreateTransport, (payload: unknown, ack?: VoiceAck) => {
      const body = (payload ?? {}) as { seatToken?: unknown; direction?: unknown };
      const sess = voiceSess(body);
      if (!sess) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      if (!takeSharedRate(sess)) {
        if (typeof ack === 'function') ack({ error: 'RATE_LIMITED' });
        return;
      }
      const room = voiceRoomOf(sess);
      if (!room) {
        emitError(socket, 'ROOM_NOT_FOUND');
        return;
      }
      const direction = body.direction === 'recv' ? 'recv' : 'send';
      void voice.createTransport(room.code, sess.seatId, direction).then((t) => {
        if (typeof ack !== 'function') return;
        if (!t) ack({ error: 'VOICE_UNAVAILABLE' });
        else ack(t);
      });
    });

    socket.on(EV.voiceConnectTransport, (payload: unknown, ack?: VoiceAck) => {
      const body = (payload ?? {}) as { seatToken?: unknown; transportId?: unknown; dtlsParameters?: unknown };
      const sess = voiceSess(body);
      if (!sess) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      if (!takeSharedRate(sess)) {
        if (typeof ack === 'function') ack({ error: 'RATE_LIMITED' });
        return;
      }
      if (typeof body.transportId !== 'string' || !body.dtlsParameters) {
        if (typeof ack === 'function') ack({ error: 'INVALID_PAYLOAD' });
        return;
      }
      void voice.connectTransport(body.transportId, body.dtlsParameters).then((ok) => {
        if (typeof ack === 'function') ack({ ok });
      });
    });

    socket.on(EV.voiceProduce, (payload: unknown, ack?: VoiceAck) => {
      const body = (payload ?? {}) as {
        seatToken?: unknown;
        transportId?: unknown;
        kind?: unknown;
        rtpParameters?: unknown;
      };
      const sess = voiceSess(body);
      if (!sess) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      if (!takeSharedRate(sess)) {
        if (typeof ack === 'function') ack({ error: 'RATE_LIMITED' });
        return;
      }
      const room = voiceRoomOf(sess);
      if (!room) {
        emitError(socket, 'ROOM_NOT_FOUND');
        return;
      }
      if (typeof body.transportId !== 'string' || !body.rtpParameters) {
        if (typeof ack === 'function') ack({ error: 'INVALID_PAYLOAD' });
        return;
      }
      void voice
        .produce(room.code, sess.seatId, body.transportId, String(body.kind ?? ''), body.rtpParameters)
        .then((producerId) => {
          if (typeof ack === 'function') {
            if (!producerId) ack({ error: 'VOICE_UNAVAILABLE' });
            else ack({ producerId });
          }
          if (producerId) {
            io.to(room.roomChannel()).emit(OUT.voiceProducers, {
              roomCode: room.code,
              producers: voice.listProducers(room.code),
            });
          }
        });
    });

    socket.on(EV.voiceConsume, (payload: unknown, ack?: VoiceAck) => {
      const body = (payload ?? {}) as {
        seatToken?: unknown;
        recvTransportId?: unknown;
        producerId?: unknown;
        rtpCapabilities?: unknown;
      };
      const sess = voiceSess(body);
      if (!sess) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      if (!takeSharedRate(sess)) {
        if (typeof ack === 'function') ack({ error: 'RATE_LIMITED' });
        return;
      }
      const room = voiceRoomOf(sess);
      if (!room) {
        emitError(socket, 'ROOM_NOT_FOUND');
        return;
      }
      if (
        typeof body.recvTransportId !== 'string' ||
        typeof body.producerId !== 'string' ||
        !body.rtpCapabilities
      ) {
        if (typeof ack === 'function') ack({ error: 'INVALID_PAYLOAD' });
        return;
      }
      void voice
        .consume(room.code, sess.seatId, body.recvTransportId, body.producerId, body.rtpCapabilities)
        .then((c) => {
          if (typeof ack !== 'function') return;
          if (!c) ack({ error: 'VOICE_UNAVAILABLE' });
          else ack(c);
        });
    });

    socket.on(EV.voiceCloseProducer, (payload: unknown) => {
      const body = (payload ?? {}) as { seatToken?: unknown };
      const sess = voiceSess(body);
      if (!sess) return;
      if (!takeSharedRate(sess)) return;
      const room = voiceRoomOf(sess);
      if (!room) return;
      voice.removeSeatEverywhere(sess.seatId, room.code);
      voice.join(room.code, sess.seatId);
      voice.broadcastState(room.code);
    });

    socket.on(EV.voiceListProducers, (payload: unknown, ack?: VoiceAck) => {
      const body = (payload ?? {}) as Record<string, unknown>;
      const sess = voiceSess(body);
      if (!sess) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      if (!takeSharedRate(sess)) {
        if (typeof ack === 'function') ack({ error: 'RATE_LIMITED' });
        return;
      }
      const room = voiceRoomOf(sess);
      if (!room || typeof ack !== 'function') return;
      ack({ producers: voice.listProducers(room.code) });
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
      // 6J-3：聊天纳入共享限频桶（超限静默丢弃，与社交层一致）
      if (!takeSharedRate(sess)) return;
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

    // ---- 6G-2a 互动特效（seatToken 鉴权；压缩批量、独立于游戏限频；只广播不存） ----
    socket.on(EV.effectSend, (payload: unknown) => {
      const body = (payload ?? {}) as { seatToken?: unknown; items?: unknown };
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
      const items = validateEffectItems({ items: body.items }, (id) => seatIdsOf(room).has(id));
      if (!items) {
        emitError(socket, 'INVALID_PAYLOAD');
        return;
      }
      effects.broadcast(room.code, room.roomChannel(), sess.seatId, nicknameOf(room, sess.seatId), items);
      logger.info('effect.relay', { roomCode: room.code, seatId: sess.seatId, type: 'batch' });
    });

    // ---- 6F-B2 reaction（独立保护限频，超限静默；只广播、不存历史、不进入 GameState） ----
    socket.on(EV.reactionSend, (payload: unknown) => {
      const body = (payload ?? {}) as { seatToken?: unknown; commandId?: unknown };
      const sess = typeof body.seatToken === 'string' ? sessionsByToken.get(body.seatToken) : undefined;
      if (!sess) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      const commandId = typeof body.commandId === 'string' ? body.commandId : '';
      // reaction 有独立的保护桶，但超限静默丢弃，不污染游戏拒绝提示。
      if (!takeReactionRate(socket.id)) return;
      const room = rooms.get(sess.roomCode);
      if (!room) {
        emitError(socket, 'ROOM_NOT_FOUND');
        return;
      }
      const reaction = validateReaction(payload, (id) => seatIdsOf(room).has(id));
      if (!reaction) {
        socket.emit(OUT.commandReject, { commandId, reasonCode: 'INVALID_REACTION' });
        logger.warn('reaction.reject', { roomCode: room.code, seatId: sess.seatId, reasonCode: 'INVALID_REACTION' });
        return;
      }
      const event: ReactionEventPayload = {
        fromSeatId: sess.seatId,
        targetSeatId: reaction.targetSeatId,
        kind: reaction.kind,
        ...(reaction.emoji ? { emoji: reaction.emoji } : {}),
        ...(reaction.emojiId ? { emojiId: reaction.emojiId } : {}),
        count: reaction.count,
        sentAt: Date.now(),
      };
      io.to(room.roomChannel()).emit(OUT.reactionEvent, event);
      logger.info('reaction.relay', { roomCode: room.code, seatId: sess.seatId, commandType: 'room.reaction' });
    });

    // ---- 6G-2b 怀疑标记（seatToken 鉴权；共享限频桶，超限静默丢弃；重复点同一目标=取消） ----
    socket.on(EV.markSet, (payload: unknown) => {
      const body = (payload ?? {}) as { seatToken?: unknown; targetSeatId?: unknown };
      const sess = typeof body.seatToken === 'string' ? sessionsByToken.get(body.seatToken) : undefined;
      if (!sess) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      if (!takeSharedRate(sess)) return;
      const room = rooms.get(sess.roomCode);
      if (!room) {
        emitError(socket, 'ROOM_NOT_FOUND');
        return;
      }
      const target =
        typeof body.targetSeatId === 'string' ? body.targetSeatId : '';
      if (target === '' || target === sess.seatId || !seatIdsOf(room).has(target)) {
        emitError(socket, 'INVALID_PAYLOAD');
        return;
      }
      social.setMark(room.code, sess.seatId, target);
    });

    socket.on(EV.markClear, (payload: unknown) => {
      const body = (payload ?? {}) as { seatToken?: unknown; targetSeatId?: unknown };
      const sess = typeof body.seatToken === 'string' ? sessionsByToken.get(body.seatToken) : undefined;
      if (!sess) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      if (!takeSharedRate(sess)) return;
      const room = rooms.get(sess.roomCode);
      if (!room) {
        emitError(socket, 'ROOM_NOT_FOUND');
        return;
      }
      const target =
        typeof body.targetSeatId === 'string' ? body.targetSeatId : '';
      if (target === '' || target === sess.seatId || !seatIdsOf(room).has(target)) {
        emitError(socket, 'INVALID_PAYLOAD');
        return;
      }
      social.clearMark(room.code, sess.seatId, target);
    });

    // 入房/重连后对齐快照（服务端单播回 mark.state）
    socket.on(EV.markSync, (payload: unknown) => {
      const body = (payload ?? {}) as { seatToken?: unknown };
      const sess = typeof body.seatToken === 'string' ? sessionsByToken.get(body.seatToken) : undefined;
      if (!sess) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      socket.emit(OUT.markState, { roomCode: sess.roomCode, marks: social.snapshot(sess.roomCode) });
    });

    // ---- 6G-3 快捷短语（seatToken 鉴权；共享限频桶，超限静默丢弃；只广播不存） ----
    socket.on(EV.phraseSend, (payload: unknown) => {
      const body = (payload ?? {}) as { seatToken?: unknown; phraseId?: unknown };
      const sess = typeof body.seatToken === 'string' ? sessionsByToken.get(body.seatToken) : undefined;
      if (!sess) {
        emitError(socket, 'UNAUTHORIZED');
        return;
      }
      if (!takeSharedRate(sess)) return;
      const room = rooms.get(sess.roomCode);
      if (!room) {
        emitError(socket, 'ROOM_NOT_FOUND');
        return;
      }
      const text = validatePhrase(body.phraseId);
      if (!text) {
        emitError(socket, 'INVALID_PAYLOAD');
        return;
      }
      io.to(room.roomChannel()).emit(OUT.phraseEvent, {
        seatId: sess.seatId,
        nickname: nicknameOf(room, sess.seatId),
        text,
        ts: Date.now(),
      });
      logger.info('phrase.relay', { roomCode: room.code, seatId: sess.seatId });
    });



    socket.on(EV.roomLeave, (payload: unknown) => {
      const body = (payload ?? {}) as { seatToken?: unknown };
      const sess = typeof body.seatToken === 'string' ? sessionsByToken.get(body.seatToken) : undefined;
      if (sess) {
        handleRoomLeave(sess, socket);
      } else {
        socket.emit('room.leave.ack', { ok: true });
      }
    });

    socket.on('disconnect', () => {
      joinRate.delete(socket.id);
      reactionRates.delete(socket.id);
      const token = socket.data.seatToken as string | undefined;
      if (!token) return;
      const sess = sessionsByToken.get(token);
      if (sess) leaveSession(sess, socket);
    });
  });

  function handleRoomLeave(sess: SessionInfo, socket: Socket): void {
    const room = rooms.get(sess.roomCode);
    socket.leave(room?.roomChannel() ?? '');
    socket.emit('room.leave.ack', { ok: true });

    if (!room) {
      sessionsByToken.delete(sess.seatToken);
      return;
    }

    if (!room.started) {
      // 对局未开始：彻底移除座位与 session
      room.sessions.delete(sess.seatToken);
      sessionsByToken.delete(sess.seatToken);
      room.lobby = room.lobby.filter((l) => l.seatToken !== sess.seatToken);

      const humanSeats = room.lobby.filter((s) => !room.bots.has(s.seatId));
      if (humanSeats.length === 0) {
        room.clearTimer?.();
        room.clearBotTimers?.();
        social.cleanupRoom(room.code);
        rooms.delete(room.code);
        logger.info('room.destroy_empty', { roomCode: room.code, seatId: sess.seatId });
        return;
      }
      if (room.hostSeatId === sess.seatId) {
        room.hostSeatId = humanSeats[0].seatId;
        for (const s of room.lobby) {
          s.isHost = s.seatId === room.hostSeatId;
        }
      }
      room.markEmpty();
      room.broadcastPresence();
      logger.info('room.leave_lobby', { roomCode: room.code, seatId: sess.seatId });
    } else {
      // 对局进行中：标记该玩家断开
      sess.connected = false;
      sess.disconnectedAt = Date.now();
      sess.socketId = '';
      if (room.state) {
        const seat = room.state.seats.find((s) => s.seatId === sess.seatId);
        if (seat) seat.connected = false;
      }
      room.markEmpty();
      room.broadcastPresence();
      logger.info('room.leave_game', { roomCode: room.code, seatId: sess.seatId });

      // 若所有人类都已离线，重置房间回大厅
      const anyHumanConnected = [...room.sessions.values()].some(
        (s) => s.connected && !room.bots.has(s.seatId),
      );
      if (!anyHumanConnected) {
        resetRoomToLobby(room);
      }
    }
  }

  function leaveSession(sess: SessionInfo, socket: Socket): void {
    const room = rooms.get(sess.roomCode);
    socket.leave(room?.roomChannel() ?? '');
    // 6G-1：断线即离语音（重连后需重新加入语音；听语音偏好不持久）
    voice.removeSeatEverywhere(sess.seatId, sess.roomCode);
    // 6G-2b：断线清理该座位相关怀疑标记
    social.removeSeat(sess.roomCode, sess.seatId);
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
    room.clearBotTimers?.();
    voice.cleanupRoom(room.code);
    social.cleanupRoom(room.code);
    room.state = null;
    room.started = false;
    room.endedAt = null;
    // 保留仍连接的 session 在 lobby（按 seatToken 重建 lobby）
    const still: typeof room.lobby = [];
    for (const sess of room.sessions.values()) {
      if (!sess.connected) continue;
      const prev = room.lobby.find((l) => l.seatId === sess.seatId);
      const isBot = room.bots.has(sess.seatId);
      still.push({
        seatId: sess.seatId,
        nickname: prev?.nickname ?? sess.seatId,
        seatToken: sess.seatToken,
        ready: isBot,
        isHost: sess.seatId === room.hostSeatId,
      });
      sess.ready = isBot;
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
      room.emitToSeat(sess.seatToken, OUT.roomTerminated, { roomCode: room.code });
      room.emitToSeat(sess.seatToken, OUT.roomStarted, { roomCode: room.code, reset: true });
    }
  }

  return {
    httpServer,
    io,
    rooms,
    sessionsByToken,
    voice,
    effects,
    listen(portNum = port) {
      return new Promise<void>((resolve) => {
        // 局域网访问：监听所有网卡（Socket.IO 复用同一 httpServer，一并生效）
        httpServer.listen(portNum, '0.0.0.0', () => {
          logger.info('server.start', {
            port: portNum,
            voice: voice.isAvailable() ? 'on' : 'off',
            seedMode: FIXED_GAME_SEED !== null ? 'fixed' : 'random',
          });
          resolve();
        });
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

/**
 * 6I：Socket.IO CORS 来源。
 * - NINJA_CORS_ORIGIN 未设（开发/局域网）：全放行（含 localhost 与局域网 IP）。
 * - 生产（Railway）：设为 Vercel 域名逗号分隔，如 https://ninja-night.vercel.app。
 */
function resolveCorsOrigin(): true | string[] {
  const raw = (process.env.NINJA_CORS_ORIGIN ?? '').trim();
  if (raw === '') return true;
  const list = raw.split(',').map((s) => s.trim()).filter((s) => s !== '');
  return list.length > 0 ? list : true;
}

/** 6G-1：有证书 + NINJA_TLS=1 时返回 https server，否则 http（降级开发模式） */
function buildHttpServer(app: ReturnType<typeof createApp>) {
  const wantTls = process.env.NINJA_TLS === '1';
  const keyPath = join(process.cwd(), 'certs', 'key.pem');
  const certPath = join(process.cwd(), 'certs', 'cert.pem');
  if (wantTls && existsSync(keyPath) && existsSync(certPath)) {
    try {
      const s = createHttpsServer(
        { key: readFileSync(keyPath), cert: readFileSync(certPath) },
        app,
      );
      logger.info('server.tls', { mode: 'https' });
      return s;
    } catch (err) {
      logger.warn('server.tls_fallback', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return createHttpServer(app);
}

process.on('uncaughtException', (err) => {
  logger.error('process.uncaughtException', { error: err.message });
});
process.on('unhandledRejection', (reason) => {
  logger.error('process.unhandledRejection', {
    error: reason instanceof Error ? reason.message : String(reason),
  });
});
