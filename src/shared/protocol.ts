import type { RejectReason } from './types';

export type ReasonCode =
  | 'NOT_YOUR_TURN'
  | 'WRONG_WINDOW'
  | 'STALE_WINDOW'
  | 'DEAD_SEAT'
  | 'ILLEGAL_TARGET'
  | 'DUPLICATE_COMMAND'
  | 'NOT_HOST'
  | 'ROOM_FULL'
  | 'ROOM_NOT_FOUND'
  | 'GAME_IN_PROGRESS'
  | 'INVALID_PAYLOAD'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'PHASE_MISMATCH'
  | 'NOT_IN_HAND'
  | 'NO_ACTIVE_WINDOW'
  | 'UNKNOWN_COMMAND';

export function mapReject(reason: RejectReason | string): ReasonCode {
  switch (reason) {
    case 'unauthorized':
      return 'UNAUTHORIZED';
    case 'duplicate':
      return 'DUPLICATE_COMMAND';
    case 'staleWindow':
      return 'STALE_WINDOW';
    case 'phaseMismatch':
      return 'PHASE_MISMATCH';
    case 'notAlive':
      return 'DEAD_SEAT';
    case 'notYourTurn':
      return 'NOT_YOUR_TURN';
    case 'illegalTarget':
      return 'ILLEGAL_TARGET';
    case 'invalidPayload':
      return 'INVALID_PAYLOAD';
    case 'unknownCommand':
      return 'UNKNOWN_COMMAND';
    case 'notInHand':
      return 'NOT_IN_HAND';
    case 'noActiveWindow':
      return 'NO_ACTIVE_WINDOW';
    default:
      return 'INVALID_PAYLOAD';
  }
}

export const EV = {
  roomCreate: 'room.create',
  roomJoin: 'room.join',
  roomLeave: 'room.leave',
  roomReady: 'room.ready',
  roomStart: 'room.start',
  roomForceAdvance: 'room.forceAdvance',
  roomKick: 'room.kick',
  roomEnd: 'room.end',
  roomAddBot: 'room.addBot',
  roomRemoveBot: 'room.removeBot',
  commandSend: 'command.send',
  chatSend: 'chat.send',
} as const;

export const OUT = {
  roomAck: 'room.ack',
  roomError: 'room.error',
  roomPresence: 'room.presence',
  roomStarted: 'room.started',
  commandAck: 'command.ack',
  commandReject: 'command.reject',
  viewSnapshot: 'view.snapshot',
  eventPublic: 'event.public',
  eventPrivate: 'event.private',
  chatEvent: 'chat.event',
} as const;

export interface RoomAckPayload {
  roomCode: string;
  seatToken: string;
  seatId: string;
  isHost: boolean;
}

export interface PresenceSeat {
  seatId: string;
  nickname: string;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
  isBot?: boolean;
}

export interface PresencePayload {
  roomCode: string;
  hostSeatId: string;
  phase: string;
  seats: PresenceSeat[];
}

export interface ChatEventPayload {
  seatId: string;
  nickname: string;
  text: string;
  ts: number;
}

export interface RoomErrorPayload {
  reasonCode: string;
  message?: string;
}

const CTRL_RE = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');

export function sanitizeNickname(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(CTRL_RE, '').trim();
  if (s.length < 1 || s.length > maxLen) return null;
  return s;
}

export function sanitizeChat(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(CTRL_RE, '').trim();
  if (s.length < 1 || s.length > maxLen) return null;
  return s;
}

export function sanitizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(s)) return null;
  return s;
}
