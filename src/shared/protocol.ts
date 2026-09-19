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
  | 'INVALID_REACTION'
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
  roomLlmConfig: 'room.llmConfig',
  commandSend: 'command.send',
  chatSend: 'chat.send',
  // 6G-1 语音信令（复用 Socket.IO；音频字节只走 mediasoup worker，不经游戏状态机）
  voiceJoin: 'voice.join',
  voiceLeave: 'voice.leave',
  voiceMute: 'voice.mute',
  voiceSpeaking: 'voice.speaking',
  voiceGetRouter: 'voice.getRouter',
  voiceCreateTransport: 'voice.createTransport',
  voiceConnectTransport: 'voice.connectTransport',
  voiceProduce: 'voice.produce',
  voiceConsume: 'voice.consume',
  voiceCloseProducer: 'voice.closeProducer',
  voiceListProducers: 'voice.listProducers',
  // 6G-2a 互动特效（纯社交层，不进 core；只广播不存）
  effectSend: 'effect.send',
  reactionSend: 'room.reaction',
  // 6G-2b 怀疑标记（纯社交层，不进 core；状态服务端内存持有，快照广播）
  markSet: 'mark.set',
  markClear: 'mark.clear',
  markSync: 'mark.sync',
  // 6G-3 快捷短语（纯社交层，不进 core；只发 id，文本服务端 lookup 后广播，不存）
  phraseSend: 'phrase.send',
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
  roomTerminated: 'room.terminated',
  // 6G-1 语音状态广播（仅布尔状态，不含音频流信息）
  voiceState: 'voice.state',
  voiceUnavailable: 'voice.unavailable',
  voiceProducers: 'voice.producers',
  // 6G-2a 特效广播（批）
  effectBatch: 'effect.batch',
  reactionEvent: 'event.reaction',
  // 6G-2b 怀疑标记全量快照
  markState: 'mark.state',
  // 6G-3 快捷短语广播（payload 复用 ChatEventPayload：seatId/nickname/text/ts）
  phraseEvent: 'phrase.event',
} as const;

export interface RoomAckPayload {
  roomCode: string;
  seatToken: string;
  seatId: string;
  isHost: boolean;
}

/** 房主专属配置：省略 apiKey 查询，null/空字符串撤回，只在服务端内存保存。 */
export interface RoomLlmConfigPayload {
  seatToken: string;
  apiKey?: string | null;
}

export type RoomLlmConfigResult = {
  ok: true;
  enabled: boolean;
  source: 'room' | 'server' | 'none';
  hasRoomKey: boolean;
} | { ok: false; reasonCode: ReasonCode };

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

// ---------------------------------------------------------------------------
// 6G-1 语音信令 payload（只传布尔状态与 WebRTC 握手参数，不传音频字节）
// ---------------------------------------------------------------------------

/** 单座位语音状态：仅 inVoice/muted/speaking 三个布尔 */
export interface VoiceSeatState {
  seatId: string;
  inVoice: boolean;
  muted: boolean;
  speaking: boolean;
}

export interface VoiceStatePayload {
  roomCode: string;
  seats: VoiceSeatState[];
}

/** voice.join 请求： SeatToken 鉴权 + 客户端 RTP 能力（ mediasoup 握手用） */
export interface VoiceJoinPayload {
  seatToken: string;
  rtpCapabilities?: unknown;
}

// ---------------------------------------------------------------------------
// 6G-2a 互动特效 payload（纯社交层；物品 id 定稿 9 串，不得改名）
// ---------------------------------------------------------------------------

/** 互动物品 id（定稿 8 串；图集就位前服务端只认 id，不依赖图片） */
export const EFFECT_ITEM_IDS = [
  'egg',
  'sakura',
  'geta',
  'rotten_pill',
  'basket',
  'secret_letter',
  'tea',
  'snowball',
  'shuriken',
] as const;

export type EffectItemId = (typeof EFFECT_ITEM_IDS)[number];

const EFFECT_ITEM_SET: ReadonlySet<string> = new Set(EFFECT_ITEM_IDS);

export function isEffectItemId(v: unknown): v is EffectItemId {
  return typeof v === 'string' && EFFECT_ITEM_SET.has(v);
}

/** 客户端上行单个特效：目标座位 + 物品 + 连击组 id（同组 1.5s 窗口内计连击） */
export interface EffectSendItem {
  targetSeatId: string;
  itemId: string;
  comboId: string;
  /** 压缩的粒子数量；省略时按 1 处理，避免为每一粒子发送 socket 消息。 */
  count?: number;
}

/** effect.send 上行：客户端 50ms 窗口合并，最多 EFFECT_BATCH_MAX 条压缩记录/批。 */
export interface EffectSendPayload {
  seatToken: string;
  items: EffectSendItem[];
}

/** effect.batch 下行单个条目（服务端只透传广播，不存不记历史） */
export interface EffectBatchItem extends EffectSendItem {
  fromSeatId: string;
  fromNickname: string;
}

export interface EffectBatchPayload {
  roomCode: string;
  items: EffectBatchItem[];
}

// ---------------------------------------------------------------------------
// 6F-B2 reaction（纯互动层；只广播、不进入 GameState）
// ---------------------------------------------------------------------------

export type ReactionKind = 'egg' | 'flower' | 'emoji';

export const REACTION_EMOJI_IDS = [
  'swords', 'kunai', 'ninja_head', 'noh_mask', 'flame', 'water',
  'moon', 'star', 'tea_cup', 'bamboo', 'kitsune_mask', 'scroll',
] as const;
export type ReactionEmojiId = (typeof REACTION_EMOJI_IDS)[number];

export interface RoomReactionPayload {
  seatToken: string;
  targetSeatId: string;
  kind: ReactionKind;
  emoji?: string;
  emojiId?: ReactionEmojiId;
  count: number;
  /** 可选关联 id；不参与业务校验，仅用于 command.reject 对应。 */
  commandId?: string;
}

export interface ReactionEventPayload {
  fromSeatId: string;
  targetSeatId: string;
  kind: ReactionKind;
  emoji?: string;
  emojiId?: ReactionEmojiId;
  count: number;
  sentAt: number;
}

// ---------------------------------------------------------------------------
// 6G-2b 怀疑标记 payload（纯社交层，不进 core；服务端内存持有，快照广播）
// ---------------------------------------------------------------------------

/** 一条怀疑关系：from 座位怀疑 target 座位 */
export interface MarkPair {
  from: string;
  target: string;
}

export interface MarkSetPayload {
  seatToken: string;
  targetSeatId: string;
}

export interface MarkClearPayload {
  seatToken: string;
  targetSeatId: string;
}

export interface MarkStatePayload {
  roomCode: string;
  marks: MarkPair[];
}

/** phrase.send 上行：只发下标，文本以服务端 lookup 为准 */
export interface PhraseSendPayload {
  seatToken: string;
  phraseId: number;
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
