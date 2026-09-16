import type {
  GameEvent,
  GamePhase,
  HouseId,
  PendingDecision,
  RoomCode,
  SeatId,
  StepKind,
  WindowId,
} from '../shared/types';
import type { Rng } from './rng';

export interface CardInstance {
  instanceId: string;
  cardId: string;
  number: number | null;
}

export interface HonorToken {
  instanceId: string;
  value: 2 | 3 | 4;
}

export interface SeatState {
  seatId: SeatId;
  nickname: string;
  seatToken: string;
  connected: boolean;
  isHost: boolean;
  alive: boolean;
  /** 当前 HOUSE（可被 Shapeshifter 等改动；结算用此字段） */
  house: HouseId;
  houseRevealed: boolean;
  knownHouses: Array<{
    round: number;
    targetSeatId: SeatId;
    houseId: HouseId;
    viaCardId?: string;
  }>;
  tokens: HonorToken[];
  hand: CardInstance[];
  reserved: CardInstance[];
  /** draft 临时手牌 */
  draftHand: CardInstance[];
  /** 本阶段已声明打出的牌实例 */
  declared: CardInstance[];
  /** 本阶段已应答 */
  declaredResponded: boolean;
}

export interface QueuedCard {
  instance: CardInstance;
  actorSeatId: SeatId;
}

export interface ResolveContext {
  kind: 'target' | 'optional' | 'react';
  actorSeatId: SeatId;
  instance: CardInstance;
  targetSeatId?: SeatId;
  /** shinobi 查看后是否还允许杀 */
  mayKill?: boolean;
}

export interface GameState {
  roomCode: RoomCode;
  seed: number;
  rng: Rng;
  rngCalls: number;
  seats: SeatState[];
  zones: {
    undrawn: CardInstance[];
    draftDiscard: CardInstance[];
    revealedInPlay: CardInstance[];
    spent: CardInstance[];
  };
  round: number;
  phase: GamePhase;
  step: StepKind;
  windowId: WindowId;
  /** 解决队列 */
  resolveQueue: QueuedCard[];
  pending: PendingDecision[];
  resolveContext: ResolveContext | null;
  /** 已收集声明的座位数辅助 */
  nightPhaseOrder: GamePhase[];
  events: GameEvent[];
  eventSeq: number;
  processedCommandIds: string[];
  /** 本轮死亡者 HOUSE 仍保留，用于记分（官方：含已死） */
  winners: SeatId[];
  gameOver: boolean;
  tokenPool: HonorToken[];
  /** 每轮开始时备份，用于记分全员 */
  startingHouses: Record<SeatId, HouseId>;
}

export type EngineResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: string; state: GameState };
