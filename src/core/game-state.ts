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
  draftHand: CardInstance[];
  declared: CardInstance[];
  declaredResponded: boolean;
  isBot?: boolean;
}

export interface QueuedCard {
  instance: CardInstance;
  actorSeatId: SeatId;
}

/** 当前结算卡的多步决策状态 */
export type CardStep =
  | 'targetA'
  | 'targetB'
  | 'swapOrNot'
  | 'gravePick'
  | 'graveImmediate'
  | 'viewKind'
  | 'tokenGive'
  | 'tokenTake'
  | 'target'
  | 'optionalKill'
  | 'troubleReveal'
  | 'merchantView'
  | 'merchantGive'
  | 'merchantTake'
  | 'tokenOffer'
  | 'done';

export interface ResolveContext {
  actorSeatId: SeatId;
  instance: CardInstance;
  step: CardStep;
  targets: SeatId[];
  graveChoices?: CardInstance[];
  gravePick?: CardInstance;
  viewKind?: 'honor' | 'house';
  /** 商人：刚查看的那枚令牌 */
  seenTokenId?: string;
  seenTokenValue?: 2 | 3 | 4;
  /** 商人：自己给出的令牌实例 */
  giveTokenId?: string;
  /** 反应窗 */
  react?: {
    victimSeatId: SeatId;
    killerSeatId: SeatId;
    fromJudge: boolean;
    opening: boolean;
  };
  mayKill?: boolean;
}

export interface GameState {
  roomCode: RoomCode;
  seed: number;
  /** 6J：种子是否由人工/环境显式固定（决定 gameSeed 可见性；随机局全程保密） */
  seedFixed: boolean;
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
  resolveQueue: QueuedCard[];
  pending: PendingDecision[];
  resolveContext: ResolveContext | null;
  events: GameEvent[];
  eventSeq: number;
  processedCommandIds: string[];
  winners: SeatId[];
  gameOver: boolean;
  tokenPool: HonorToken[];
  startingHouses: Record<SeatId, HouseId>;
}

export type EngineResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: string; state: GameState };
