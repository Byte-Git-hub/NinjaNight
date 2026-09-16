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
  | 'done';

export interface ResolveContext {
  actorSeatId: SeatId;
  instance: CardInstance;
  step: CardStep;
  targets: SeatId[];
  graveChoices?: CardInstance[];
  gravePick?: CardInstance;
  viewKind?: 'honor' | 'house';
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
