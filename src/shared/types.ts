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
  | 'react.resolved';

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
  | 'reactDecide';

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
  publicHouseId?: HouseId;
}

export interface SelfView {
  seatId: SeatId;
  houseId: HouseId;
  canViewOwnHouse: boolean;
  hand: NinjaCardInstanceView[];
  reserved: NinjaCardInstanceView[];
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
