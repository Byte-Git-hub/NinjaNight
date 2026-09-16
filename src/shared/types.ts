/**
 * 共享类型骨架 — 阶段 0 冻结结构，禁止放业务逻辑。
 * LocalAdapter（单机）与 SocketAdapter（联机）必须共用本文件类型。
 */

/** 玩家座位标识（对局内稳定 ID，非登录账号） */
export type SeatId = string;

/** 会话凭证：加入房间后服务端签发，用于后续指令鉴权 */
export type SeatToken = string;

/** 指令窗口：同一决策窗口内的操作；过期消息不得作用于新窗口 */
export type WindowId = string;

/** 公共或共享卡牌/令牌的稳定英文标识 */
export type CardId = string;
export type HouseId = string;
export type HonorTokenId = string;

/** 全局对局阶段（主路径；细粒度子状态在实现阶段展开） */
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

/** 阶段内子状态：收集声明 / 结算队列 / 反应窗 / 选目标等 */
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

// ---------------------------------------------------------------------------
// Command — 玩家/房主请求进行的操作（意图，不是最终结果）
// ---------------------------------------------------------------------------

export type CommandType =
  // 房间
  | 'room.create'
  | 'room.join'
  | 'room.ready'
  | 'room.unready'
  | 'room.start'
  | 'room.leave'
  | 'room.chat'
  | 'room.forceAdvance'
  // 选牌
  | 'draft.pick'
  | 'draft.discard'
  // 夜晚 / 决策
  | 'night.declare'
  | 'night.passPhase'
  | 'night.chooseTarget'
  | 'night.chooseOptional'
  | 'react.decide'
  // 其余类型在后续阶段追加；未知 type 一律拒绝
  ;

/**
 * 指令信封。
 * LocalAdapter 与 SocketAdapter 共用：本地可将 seatToken 由调试器注入。
 */
export interface Command {
  /** 客户端生成的唯一 id；服务端按 (roomId, commandId) 幂等去重 */
  commandId: string;
  /** 会话凭证（非房间码）。房间码只用于 join */
  seatToken: SeatToken;
  /** 指令所属决策窗口；旧窗口消息不得影响当前局面 */
  windowId: WindowId;
  type: CommandType;
  payload: CommandPayload;
}

/** 指令载荷联合 — 各字段按 type 校验，禁止宽松 any */
export type CommandPayload =
  | RoomCreatePayload
  | RoomJoinPayload
  | RoomReadyPayload
  | RoomStartPayload
  | RoomChatPayload
  | DraftPickPayload
  | DraftDiscardPayload
  | NightDeclarePayload
  | NightPassPhasePayload
  | NightChooseTargetPayload
  | NightChooseOptionalPayload
  | ReactDecidePayload
  | Record<string, never>;

export interface RoomCreatePayload {
  nickname: string;
}

export interface RoomJoinPayload {
  roomCode: string;
  nickname: string;
}

export interface RoomReadyPayload {
  ready: boolean;
}

export interface RoomStartPayload {
  // 房主开始；无额外字段
}

export interface RoomChatPayload {
  text: string;
}

export interface DraftPickPayload {
  /** 从当前手牌区选择的牌实例 id */
  cardInstanceId: string;
}

export interface DraftDiscardPayload {
  cardInstanceId: string;
}

export interface NightDeclarePayload {
  /** 本阶段要打出的牌实例；空数组表示跳过 */
  cardInstanceIds: string[];
}

export interface NightPassPhasePayload {
  // 无 payload；等价于声明不打本阶段牌
}

export interface NightChooseTargetPayload {
  targetSeatId: SeatId;
}

export interface NightChooseOptionalPayload {
  /** true=执行可选效果，false=放弃 */
  choose: boolean;
}

export interface ReactDecidePayload {
  /** 是否翻开反应牌 */
  react: boolean;
}

// ---------------------------------------------------------------------------
// GameEvent — 规则产生的事实；带可见范围
// ---------------------------------------------------------------------------

export type EventVisibility =
  | { kind: 'public' }
  | { kind: 'seats'; seats: SeatId[] }
  | { kind: 'server' };

export type GameEventType =
  | 'room.playerJoined'
  | 'room.playerReady'
  | 'room.gameStarted'
  | 'draft.cardDealt'
  | 'draft.cardPicked'
  | 'draft.cardDiscarded'
  | 'night.phaseStarted'
  | 'night.cardsDeclared'
  | 'night.cardResolved'
  | 'night.targetChosen'
  | 'night.playerDied'
  | 'react.opened'
  | 'react.resolved'
  | 'score.honorAwarded'
  | 'score.victory'
  | 'chat.message'
  // 后续阶段追加
  ;

export interface GameEvent {
  eventId: string;
  /** 单调递增，便于客户端排序与丢包检测 */
  seq: number;
  type: GameEventType;
  /** 规则时间戳由 core 推进计数，不读取 Date.now() */
  round: number;
  phase: GamePhase;
  visibility: EventVisibility;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// PendingDecision — 尚待某人完成的选择
// ---------------------------------------------------------------------------

export type PendingDecisionKind =
  | 'draftPick'
  | 'draftDiscard'
  | 'declareCards'
  | 'chooseTarget'
  | 'chooseOptional'
  | 'reactDecide'
  ;

export interface PendingDecision {
  windowId: WindowId;
  kind: PendingDecisionKind;
  /** 等待中的座位；单人决策 */
  seatId: SeatId;
  /** 允许的操作说明（UI 提示用，非权威） */
  prompt?: string;
  /** 合法选项：牌实例 id、座位 id 等 */
  legalOptions: string[];
  /**
   * 超时自动策略（线上约定，可配置）。
   * 具体每张牌的默认目标映射在阶段 5 细化。
   */
  timeoutMs: number;
  /** 超时默认行为 */
  defaultAction:
    | { kind: 'pass' }
    | { kind: 'autoPick'; optionId: string }
    | { kind: 'decline' };
  /** 所属结算上下文，便于 ResolveQueue 恢复 */
  context: {
    phase: GamePhase;
    step: StepKind;
    relatedInstanceIds: string[];
  };
}

// ---------------------------------------------------------------------------
// PlayerView — 某玩家被允许看到的状态（单机/联机共用投影结果）
// ---------------------------------------------------------------------------

export interface PlayerSeatView {
  seatId: SeatId;
  nickname: string;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
  alive: boolean;
  /** 荣誉令牌枚数（公开）；面值与总分不在此处 */
  honorTokenCount: number;
  /**
   * 该玩家已向“你”公开的阵营身份快照（含技能查看记录）。
   * 注意：记录的是“当时看到的内容”，不随真实身份自动更新。
   */
  publicHouseId?: HouseId;
}

export interface SelfView {
  seatId: SeatId;
  /** 当前真实阵营；被 Shapeshifter 后按 FAQ 可能限制自由查看 — UI 勿滥用 */
  houseId: HouseId;
  /** 能否自由查看自己的 HOUSE（Shapeshifter 后可为 false） */
  canViewOwnHouse: boolean;
  /** 自己持有的忍者牌实例 */
  hand: NinjaCardInstanceView[];
  /** 自己的荣誉令牌面值明细（仅本人） */
  honorTokens: HonorTokenInstanceView[];
  /** 私密查看历史：当时看到的内容，不会自动刷新 */
  knownHouseHistory: KnownHouseRecord[];
}

export interface NinjaCardInstanceView {
  instanceId: string;
  cardId: CardId;
  /** 公开打印的阶段编号（出牌后公共可见）；手中时仅本人可见编号 */
  number?: number;
}

export interface HonorTokenInstanceView {
  instanceId: string;
  /** 面值 2|3|4；仅本人与服务器可见 */
  value: 2 | 3 | 4;
}

export interface KnownHouseRecord {
  /** 查看发生的回合 */
  round: number;
  targetSeatId: SeatId;
  /** 当时看到的 HOUSE */
  houseId: HouseId;
}

export interface PlayerView {
  roomId: string;
  roomCode: string;
  round: number;
  phase: GamePhase;
  step: StepKind;
  /** 当前对本座位打开的决策窗口；无则 null */
  pendingDecision: PendingDecision | null;
  seats: PlayerSeatView[];
  self: SelfView;
  /** 公共事件（已过滤到本玩家可见） */
  events: GameEvent[];
  /** 当前阶段已公开打出的牌（公共） */
  revealedCards: NinjaCardInstanceView[];
  /** 游戏是否结束 */
  gameOver: boolean;
}

// ---------------------------------------------------------------------------
// 本地 / 联机适配器共用的最小接口（阶段 0 只定义形状）
// ---------------------------------------------------------------------------

/** 单机调试与联机客户端共用：提交意图、接收投影 */
export interface GameClientAdapter {
  submit(command: Command): void;
  getView(): PlayerView | null;
  onView(handler: (view: PlayerView) => void): () => void;
  onEvent(handler: (event: GameEvent) => void): () => void;
  onReject(handler: (commandId: string, reasonCode: string) => void): () => void;
}
