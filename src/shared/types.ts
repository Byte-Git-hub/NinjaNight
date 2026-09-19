/**
 * 共享类型 — LocalAdapter 与 SocketAdapter 共用。
 * 业务逻辑放 src/core；本文件只保留形状与少量纯工具。
 */

export type SeatId = string;
export type SeatToken = string;
export type WindowId = string;
export type CardId = string;
export type HouseId = string;
export type HonorTokenId = string;
export type RoomCode = string;

/** 全局对局阶段 */
export type GamePhase =
  | 'roomLobby'
  | 'dealHouses'
  | 'draftPick1'
  | 'draftPass2'
  | 'draftPick2'
  | 'draftDiscard'
  | 'nightSpy'
  | 'nightMystic'
  | 'nightTrickster'
  | 'nightBlindAssassin'
  | 'nightShinobi'
  | 'mastermindReveal'
  | 'houseReveal'
  | 'score'
  | 'victoryCheck'
  | 'gameOver';

export type StepKind =
  | 'idle'
  | 'collectDeclarations'
  | 'revealDeclared'
  | 'resolveQueue'
  | 'chooseTarget'
  | 'chooseOptional'
  | 'reactWindow'
  | 'draftSelect'
  | 'pending';

export type NightPhase =
  | 'nightSpy'
  | 'nightMystic'
  | 'nightTrickster'
  | 'nightBlindAssassin'
  | 'nightShinobi';

export type RejectReason =
  | 'unauthorized'
  | 'duplicate'
  | 'staleWindow'
  | 'phaseMismatch'
  | 'notAlive'
  | 'notYourTurn'
  | 'illegalTarget'
  | 'invalidPayload'
  | 'unknownCommand'
  | 'notInHand'
  | 'noActiveWindow';

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export type CommandType =
  | 'draft.pick'
  | 'draft.discard'
  | 'night.declare'
  | 'night.passPhase'
  | 'night.chooseTarget'
  | 'night.chooseOptional'
  | 'react.decide'
  | 'room.forceAdvance';

export type CommandPayload =
  | { cardInstanceId: string }
  | { cardInstanceIds: string[] }
  | { targetSeatId: SeatId }
  | { choose: boolean }
  | { react: boolean }
  | Record<string, never>;

export interface Command {
  commandId: string;
  roomCode: RoomCode;
  seatToken: SeatToken;
  windowId: WindowId;
  type: CommandType;
  payload: CommandPayload;
}

// ---------------------------------------------------------------------------
// GameEvent
// ---------------------------------------------------------------------------

export type EventVisibility =
  | 'public'
  | { seats: SeatId[] }
  | 'server';

export type GameEventType =
  | 'game.started'
  | 'draft.cardDealt'
  | 'draft.cardPicked'
  | 'draft.cardDiscarded'
  | 'draft.passed'
  | 'night.phaseStarted'
  | 'night.cardsDeclared'
  | 'night.cardResolved'
  | 'night.targetChosen'
  | 'night.optionalResolved'
  | 'night.playerDied'
  | 'night.houseViewed'
  | 'night.ninjaViewed'
  | 'house.revealed'
  | 'score.honorAwarded'
  | 'score.roundWinner'
  | 'score.victory'
  | 'react.opened'
  | 'react.resolved'
  | 'night.decision';

export interface GameEvent {
  id: string;
  seq: number;
  type: GameEventType;
  round: number;
  visibility: EventVisibility;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// PendingDecision
// ---------------------------------------------------------------------------

export type PendingDecisionKind =
  | 'draftPick'
  | 'draftDiscard'
  | 'declareCards'
  | 'chooseTarget'
  | 'chooseOptional'
  | 'reactDecide'
  | 'merchantChoose'
  | 'merchantExchange';

export type PendingDefaultAction =
  | { kind: 'pass' }
  | { kind: 'autoPick'; optionId: string }
  | { kind: 'decline' }
  | { kind: 'chooseFirstTarget' };

export interface PendingDecision {
  id: WindowId;
  seatId: SeatId;
  kind: PendingDecisionKind;
  options: string[];
  /** 阶段 2 不做真实超时；字段保留 */
  deadline: number | null;
  defaultChoice: PendingDefaultAction;
  context: {
    phase: GamePhase;
    step: StepKind;
    relatedInstanceIds: string[];
    cardId?: CardId;
    /** 掘墓人 gravePick：选项 instanceId → cardId（仅 actor 自己的 pending 可见） */
    graveChoices?: { instanceId: string; cardId: CardId }[];
  };
}

// ---------------------------------------------------------------------------
// PlayerView
// ---------------------------------------------------------------------------

export interface NinjaCardInstanceView {
  instanceId: string;
  cardId: CardId;
  number: number | null;
}

export interface HonorTokenInstanceView {
  instanceId: string;
  value: 2 | 3 | 4;
}

export interface KnownHouseRecord {
  round: number;
  targetSeatId: SeatId;
  houseId: HouseId;
  /** 死亡目标仍可查看时记录 */
  viaCardId?: CardId;
}

export interface PlayerSeatView {
  seatId: SeatId;
  nickname: string;
  connected: boolean;
  alive: boolean;
  isHost: boolean;
  honorTokenCount: number;
  /** 他人手牌张数（6F-2 座位卡背堆叠用）：hand + draftHand，不含 reserved；declared 是 hand 子集不重复计 */
  handCount: number;
  publicHouseId?: HouseId;
  isBot?: boolean;
}

export interface SelfView {
  seatId: SeatId;
  houseId: HouseId;
  canViewOwnHouse: boolean;
  hand: NinjaCardInstanceView[];
  reserved: NinjaCardInstanceView[];
  draftHand?: NinjaCardInstanceView[];
  honorTokens: HonorTokenInstanceView[];
  knownHouseHistory: KnownHouseRecord[];
  declaredThisPhase: string[];
  hasPending: boolean;
}

export interface PlayerView {
  roomCode: RoomCode;
  round: number;
  phase: GamePhase;
  step: StepKind;
  windowId: WindowId;
  pendingDecision: PendingDecision | null;
  /**
   * 6J 种子机制：仅当种子被显式固定（复现局）或对局已结束时下发，
   * 随机对局进行中为 null（防种子推导暗牌；见 AGENTS 可见性约定）。
   */
  gameSeed?: number | null;
  seats: PlayerSeatView[];
  self: SelfView;
  events: GameEvent[];
  revealedCards: NinjaCardInstanceView[];
  gameOver: boolean;
  winners: SeatId[];
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

export interface GameClientAdapter {
  submit(command: Command): void;
  getView(seatId: SeatId): PlayerView | null;
  onView(handler: (seatId: SeatId, view: PlayerView) => void): () => void;
  onReject(handler: (commandId: string, reason: RejectReason) => void): () => void;
}

export function cardIdOf(payload: CommandPayload): string | null {
  if ('cardInstanceId' in payload && typeof payload.cardInstanceId === 'string') {
    return payload.cardInstanceId;
  }
  return null;
}

export type DecisionType =
  | 'play_card'
  | 'pass_by_choice'
  | 'no_matching'
  | 'timed_out'
  | 'dead_skip'
  | 'react_declined';

export type DecisionReason =
  | 'strategy'
  | 'no_card_in_hand'
  | 'already_used'
  | 'no_valid_target'
  | 'timeout'
  | 'player_dead';

export interface PlayerDecisionEventPayload {
  seatId: SeatId;
  nickname: string;
  round: number;
  phase: GamePhase;
  decisionType: DecisionType;
  reason: DecisionReason;
  cardId?: CardId;
  targetSeatId?: SeatId;
  timestamp: number;
}
