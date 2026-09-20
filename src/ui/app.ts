import { TableMoments } from './effects/moments';
import type {
  PresencePayload,
  ChatEventPayload,
  VoiceSeatState,
  EffectBatchItem,
  MarkPair,
  ReactionEventPayload,
  ReactionKind,
  ReactionEmojiId,
} from '../shared/protocol';
import { MARK_PER_SEAT_MAX, parseGameSeed } from '../shared/timeouts';
import { ErrToastGate, shouldHandleImg } from './error-guard';
import type { ConnectionStatus, GameNet } from '../net/client';
import { VoiceNet } from '../net/voice';
import { EffectNet } from '../net/effects';
import { SocialNet } from '../net/social';
import { VoiceClient, type VoiceClientStatus } from './voice/client';
import { micBadge } from './voice/icons';
import { AudioManager, SFX_NAMES, type SfxName } from './audio';
import { AchievementTracker } from './achievements/tracker';
import { ACHIEVEMENTS, achievementDef } from './achievements/definitions';
import { buildHighlight, type RoundHighlight } from './highlights/summary';
import { highlightBannerHtml } from './highlights/banner';
import { voiceBannerHtml, voiceBarHtml } from './voice/controls';
import { EFFECT_ITEMS, QUICK_EMOJIS, getEffectItem } from './effects/items';
import { EffectLayer } from './effects/particles';
import { ItemFlightLayer } from './effects/flights';
import { CardDragController, type CardDropPayload } from './card-drag';
import { ItemDragController, type ItemDropPayload } from './item-drag';
import { mountCardTooltip } from './card-tooltip';
import { markBadge, markButton, myMarkedTargets } from './social/marks';
import { phrasesPanelHtml, getPhrasesPageCount } from './social/phrases';
import { PhraseTts } from './voice/tts';
import { initCardFlightLayer, CardFlightLayer } from './animations/card-flight';
import { EffectPresenter } from './effects/presenter';
import { helpModalHtml } from './help';
import { applyStampToSeat } from './animations/stamp';
import { getDrawPilePath } from './assets';
import { PHRASES } from '../data/phrases';
import type { PlayerView, PendingDecision, NinjaCardInstanceView, GameEvent } from '../shared/types';
import {
  assetUrl,
  getCardDisplayName,
  getEmojiPath,
  getHonorTokenPath,
  getItemPath,
  getHouseCardBackPath,
  getHouseDisplayName,
  getNinjaCardBackPath,
  getTableEmblemPath,
  getVisualId,
  getVisualPath,
  renderCardHtml,
} from './assets';

const PHASE_CN: Record<string, string> = {
  roomLobby: '大厅',
  dealHouses: '发身份',
  draftPick1: '选牌 1',
  draftPass2: '传牌',
  draftPick2: '选牌 2',
  draftDiscard: '弃牌',
  nightSpy: '密探',
  nightMystic: '隐士',
  nightTrickster: '骗徒',
  nightBlindAssassin: '刺客',
  nightShinobi: '上忍',
  mastermindReveal: '大将军',
  houseReveal: '亮身份',
  score: '计分',
  victoryCheck: '胜负',
  gameOver: '结束',
};

/** 中央公共区阶段分组展示顺序（6F-3；未知阶段排末尾） */
const CENTRAL_PHASE_ORDER = [
  'nightSpy',
  'nightMystic',
  'nightTrickster',
  'nightBlindAssassin',
  'nightShinobi',
];

/** 夜晚五阶段一句话说明（阶段横幅用；Q-D：只做横幅，不做倒计时/音效） */
const NIGHT_HINT: Record<string, string> = {
  nightSpy: '查看一名其他玩家的阵营牌',
  nightMystic: '查看一名玩家的阵营牌和一张忍者牌',
  nightTrickster: '打出本阶段牌，发动各自效果',
  nightBlindAssassin: '击杀一名其他玩家',
  nightShinobi: '查看阵营牌，可选择是否击杀',
};

const PRELOAD_VISUALS = [
  'spy',
  'mystic',
  'shapeshifter',
  'grave_digger',
  'troublemaker',
  'spirit_merchant',
  'thief',
  'judge',
  'blind_assassin',
  'shinobi',
  'mirror_monk',
  'martyr',
  'mastermind',
  'crane',
  'lotus',
  'ronin',
];



function preloadAssets(): void {
  if (typeof window === 'undefined') return;
  for (const v of PRELOAD_VISUALS) {
    const img = new Image();
    img.src = assetUrl(`assets/visuals/${v}.webp`);
  }
  const uiAssets = [
    'assets/ui/lobby-bg.webp',
    'assets/ui/table-texture.webp',
    'assets/ui/button-primary.webp',
    'assets/tokens/honor-token-cutout.webp',
    'assets/visuals/ninja-card-back.webp',
    'assets/visuals/house-card-back.webp',
    'assets/ui/table-emblem.webp',
    'assets/ui/washi-central-bg.webp',
    'assets/ui/identity-modal-bg.webp',
  ];
  for (const u of uiAssets) {
    const img = new Image();
    img.src = assetUrl(u);
  }
}

export class AppUI {
  private root: HTMLElement;
  private net: GameNet;
  private presence: PresencePayload | null = null;
  private view: PlayerView | null = null;
  private chat: ChatEventPayload[] = [];
  private status: ConnectionStatus = 'idle';
  private lastReject = '';
  /** 阶段横幅：记录最近一次 phase 切换（仅夜晚五阶段弹横幅，3s 后自行隐藏） */
  private bannerPhase: string | null = null;
  private bannerAt = 0;
  public lastViewTimestamp = 0;
  /** 6F-4 身份弹窗：每会话每轮一次（sessionStorage 标记），2.5s 自动关 */
  private identityModalOpen = false;
  private identityModalTimer: ReturnType<typeof setTimeout> | null = null;
  /** 身份弹窗常驻宿主（#ui 重绘不重建，动画只播一次，防开局快照流刷屏闪烁） */
  private modalHost: HTMLElement | null = null;
  private modalKey = '';
  /** 6F-4 身份窥视：点击自家卡背翻转查看（纯本地），再点/点外部盖回 */
  private housePeek = false;
  /** 自家手牌窥视：点击自家座位暗牌查看刚拿到的 1 张（纯本地，仅本人可见） */
  private handPeekIid: string | null = null;
  /** 6G-1 语音：房间级状态（ seatToken 鉴权后的 voice.state 快照），纯展示层 */
  private voiceNet: VoiceNet | null = null;
  private voiceClient: VoiceClient | null = null;
  private voiceSeats: VoiceSeatState[] = [];
  private voiceNotice = '';
  private voiceSupported = false;
  private voiceStatus: VoiceClientStatus = 'idle';
  /** 快捷短语本地播报（默认关闭，不经过服务端） */
  private phraseTts = new PhraseTts();
  /** 6H-1 音效（本地合成，不经 server） */
  private audio = new AudioManager();
  private lastSoundSeq = 0;
  private lastAnimationSeq = 0;
  private intelNoticeTimer: ReturnType<typeof setTimeout> | null = null;
  private hideCardTooltip: (() => void) | null = null;
  private lastSoundPhase = '';
  private soundPrimed = false;
  /** 6H-1：音效面板显隐（字段保持，避免重渲染丢失） */
  private audioPanelOpen = false;
  /** 死亡盖印：已落印座位（静态章防重播）；新死亡座位渲染动画章＋座位抖动 */
  private stampedSeats = new Set<string>();
  private stampedRound = 0;
  /** 效果聚光灯队列（每张牌依次中央展示，前一个完成才下一个） */
  private presenter = new EffectPresenter();
  /** 结算分步：大将军→身份牌→结算，按轮建一次 */
  private revealSteps: Array<{ title: string; html: string }> = [];
  private revealIdx = 0;
  private revealKey = '';
  /** 玩法说明弹窗显隐（大厅入口，字段保持，避免重渲染丢失） */
  private helpOpen = false;
  /** 6H-3 成就（纯本地 localStorage） */
  private achieve = new AchievementTracker();
  private achievePanelOpen = false;
  /** 6H-4 高光横幅（轮结束 5s，不阻塞） */
  private highlight: RoundHighlight | null = null;
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;
  private highlightExpanded = false;
  /** 6G-2 互动特效 + 怀疑标记（纯社交层；状态以服务端广播为准，本地只存快照） */
  private effectNet: EffectNet | null = null;
  private socialNet: SocialNet | null = null;
  private fxLayer: EffectLayer | null = null;
  private flightLayer: ItemFlightLayer | null = null;
  private cardFlight: CardFlightLayer | null = null;
  private lastHitAt = new Map<string, number>();
  private cardDrag: CardDragController | null = null;
  private itemDrag: ItemDragController | null = null;
  private dragIntent: { instanceId: string; targetSeatId: string; round: number; phase: string } | null = null;
  private playOrigins = new Map<string, { html: string; rect: DOMRect }>();
  private marks: MarkPair[] = [];
  private fxTarget = '';
  private reactionDraft: { kind: ReactionKind; emoji?: string; emojiId?: ReactionEmojiId } | null = null;
  private reactionTargetSeatId = '';
  private reactionLogs: string[] = [];
  private chatPanelOpen = false;
  private chatTab: 'chat' | 'log' | 'reaction' = 'chat';
  private phrasePanelOpen = false;
  private socialTab: 'effects' | 'emoji' | 'phrases' | 'chat' | null = null;
  private phrasePage = 0;
  private chatDraft = '';
  private socialPage = 0;
  private historyPage = 0;
  private centralPage = 0;
  private centralPhase = '';
  private infoOpen = false;
  private moments = new TableMoments();
  private selectedItem = '';
  private socialCount = 1;
  private unread = 0;
  /** 座位卡抖动：seatId → 命中时间戳（render 时超 350ms 的修剪，避免重渲染复播） */
  private fxHit = new Map<string, number>();
  /** 6J-2 全局错误 toast 节流 */
  private errGate = new ErrToastGate();
  private static errHooked = false;
  /** 6J 种子机制：房主指定的固定种子原文（重渲染不丢失；?seed=xxx 预填） */
  private pendingSeed: string | null = null;
  private llmSource: 'room' | 'server' | 'none' = 'none';
  private llmEnabled = false;
  private llmHasRoomKey = false;
  private llmStatusLoaded = false;
  /** LLM 面板与输入草稿只存在当前页面内存，普通快照重绘不应打断房主操作。 */
  private llmPanelOpen = false;
  private llmDraftKey = '';
  private createLlmDraftKey = '';

  public get currentView(): PlayerView | null {
    return this.view;
  }

  constructor(root: HTMLElement, net: GameNet) {
    this.root = root;
    this.net = net;
  }

  /**
   * 6J-2 前端错误边界（三件套，只 log + toast，不抛）：
   * 1. window.onerror / unhandledrejection → 节流 toast"发生错误，请刷新页面"。
   * 2. 资源加载失败（capture 期）：非卡面 img 破图时隐藏（卡面自带 onerror 占位，
   *    fx-btn 等按钮保留文字 label，不影响点击）。
   * 3. Socket 断开见 render 横幅（"正在重连"，Socket.IO 内置自动重连，恢复后隐藏）。
   */
  private mountErrorGuard(): void {
    if (AppUI.errHooked) return;
    AppUI.errHooked = true;
    window.addEventListener('error', (e) => {
      const t = e.target as unknown;
      if (t instanceof HTMLImageElement) {
        if (shouldHandleImg(t.className)) {
          t.style.visibility = 'hidden';
          if (t.alt && !t.title) t.title = t.alt;
        }
        return;
      }
      console.error('[ui-error]', e.message);
      if (this.errGate.allow(Date.now())) this.showToast('发生错误，请刷新页面');
    }, true);
    window.addEventListener('unhandledrejection', (e) => {
      console.error('[ui-rejection]', e.reason);
      if (this.errGate.allow(Date.now())) this.showToast('发生错误，请刷新页面');
    });
  }

  mount(): void {
    preloadAssets();
    this.mountErrorGuard();
    // 6H-1：首次交互后初始化 AudioContext（浏览器自动播放策略）
    this.audio.attachGesture(window);
    this.renderShell();
    this.hideCardTooltip = mountCardTooltip(this.root);
    // 6H-4：高光横幅常驻节点只绑一次（render 不重建该节点，避免重复监听）
    this.root.querySelector('#highlight-pop')?.addEventListener('click', () => {
      if (!this.highlight) return;
      this.highlightExpanded = !this.highlightExpanded;
      this.renderHighlight();
    });
    this.net.setHandlers({
      onAck: () => {
        // 创建房间时输入的 key 只用于本次请求，成功后立即清掉页面草稿。
        this.createLlmDraftKey = '';
        this.socialNet?.sync();
        this.llmStatusLoaded = false;
        this.llmEnabled = false;
        void this.refreshLlmStatus();
        this.render();
      },
      onError: (e) => {
        this.lastReject = `${e.reasonCode}${e.message ? ': ' + e.message : ''}`;
        this.showToast(`错误：${this.lastReject}`);
        this.render();
      },
      onPresence: (p) => {
        this.presence = p;
        if (this.net.isHost && !this.llmStatusLoaded) void this.refreshLlmStatus();
        this.socialNet?.sync();
        this.render();
      },
      onStarted: () => {
        this.lastReject = '';
        this.socialNet?.sync();
        this.render();
      },
      onTerminated: () => {
        this.llmStatusLoaded = false;
        this.llmHasRoomKey = false;
        void this.refreshLlmStatus();
        this.view = null;
        this.selected.clear();
        this.resetIdentityUi();
        this.soundPrimed = false;
        this.achieve.resetGame();
        this.hideHighlight();
        this.audio.stopBgm();
        this.voiceClient?.leave();
        this.phraseTts.stop();
        this.voiceSeats = [];
        this.resetSocialUi();
        this.lastReject = '';
        this.showToast('对局已终止，回到大厅');
        this.render();
      },
      onView: (v) => {
        this.lastViewTimestamp = Date.now();
        if (import.meta.env.DEV) {
          const pending = v.pendingDecision ? v.pendingDecision.seatId : 'none';
          console.log(`[view.snapshot] phase=${v.phase} pending=${pending} at=${this.lastViewTimestamp}`);
        }
        if (this.view?.phase !== v.phase) {
          this.centralPhase = '';
          this.centralPage = 0;
          this.selected.clear();
        }
        if (this.view && this.view.round !== v.round) {
          this.housePeek = false;
          this.handPeekIid = null;
          // 换轮：印章/抖动/效果队列/亮牌分步全部重置
          this.stampedSeats.clear();
          this.stampedRound = v.round;
          this.presenter.clear();
          this.revealSteps = [];
          this.revealIdx = 0;
          this.revealKey = '';
        }
        // 复活座位清出集合（startNextRound 全员 alive）；首个快照初始化轮号
        if (this.stampedRound === 0) this.stampedRound = v.round;
        for (const s of v.seats) {
          if (s.alive) this.stampedSeats.delete(s.seatId);
        }
        const hadView = this.view !== null;
        this.view = v;
        // 6F-4：本会话首次见到该轮即弹身份（正常开局首个快照为 draft 系；新标签重连中途也提醒一次）
        // 6G-4b(C2)：终局快照不弹身份，避免结算排名被新轮弹窗覆盖
        if (!v.gameOver && !this.hasSeenHouse(v.roomCode, v.round)) {
          this.markHouseSeen(v.roomCode, v.round);
          this.openIdentityModal();
        }
        // 6H-1：新事件 → 音效（首个快照只记 seq，不补播）
        this.playViewSounds(v);
        this.render();
        this.syncIdentityModal(v);
        if (hadView) this.animateViewEvents(v);
        this.resolveDragIntent(v);
      },
      onChat: (c) => {
        this.chat.push(c);
        if (!this.chatPanelOpen) this.unread++;
        if (this.historyPage > 0 && this.chat.length % 5 === 1) this.historyPage++;
        if (this.chat.length > 80) this.chat.shift();
        this.render();
      },
      onReaction: (r) => this.onReaction(r),
      onStatus: (s) => {
        this.status = s;
        this.render();
      },
      onCommandReject: (_id, reason) => {
        this.dragIntent = null;
        this.playOrigins.clear();
        this.lastReject = reason;
        this.showToast(`指令被拒绝：${reason}`);
        this.render();
      },
      onPublicEvents: () => {
        /* view 已含 public events */
      },
    });
    // 6G-1 语音接线（独立于游戏 Command 链路；异常只降级不抛）
    this.voiceSupported = VoiceClient.isSupported();
    const vnet = new VoiceNet(this.net);
    vnet.attach();
    this.voiceNet = vnet;
    this.voiceClient = new VoiceClient(vnet, {
      onStatus: (s) => {
        this.voiceStatus = s;
        this.render();
      },
      onNotice: (msg) => {
        this.voiceNotice = msg;
        this.render();
      },
    });
    vnet.onStateChange((seats) => {
      this.voiceSeats = seats;
      this.render();
    });
    vnet.onUnavailableNotice((msg) => {
      this.voiceNotice = msg;
      this.render();
    });
    vnet.onProducersChange(() => {
      void this.voiceClient?.refreshRemote();
    });
    // 6G-2 特效 + 怀疑标记接线（独立 Canvas 层常驻 root，不随 #ui 重绘销毁）
    this.fxLayer = new EffectLayer();
    this.fxLayer.mount(this.root);
    this.flightLayer = new ItemFlightLayer({ onHit: (seatId, strength) => this.itemHit(seatId, strength) });
    this.flightLayer.mount(this.root);
    this.cardFlight = initCardFlightLayer(this.root);
    // 身份弹窗宿主：常驻 root，不随 render 的 innerHTML 重建（动画播一次，不闪烁）
    const modalHost = document.createElement('div');
    modalHost.id = 'modal-layer';
    this.root.appendChild(modalHost);
    this.modalHost = modalHost;
    const enet = new EffectNet(this.net);
    enet.attach();
    this.effectNet = enet;
    const snet = new SocialNet(this.net);
    snet.attach();
    this.socialNet = snet;
    enet.onBatchArrive((items) => this.onEffectBatch(items));
    snet.onMarksChange((marks) => {
      this.marks = marks;
      this.render();
    });
    // 6G-3 快捷短语：全房 toast 浮层 3s（#toast 在 #ui 之外，无需重渲染）
    snet.onPhraseArrive((p) => {
      this.showPhraseBubble(p);
      this.phraseTts.speak(p.text);
    });
    // 6G-2：根点击委托（mount 时一次）。render 会重建 #ui 内所有节点，
    // 逐个绑定会被重渲染竞态吞点击；委托挂在常驻 root 上，天然免疫。
    this.cardDrag = new CardDragController(this.root, {
      canStart: el => {
        const p = this.view?.pendingDecision;
        const iid = el.dataset['iid'] ?? '';
        return Boolean(p && ((p.kind === 'declareCards' && p.options.includes(iid) && el.closest('.hand')) || (p.kind === 'chooseTarget' && p.context.relatedInstanceIds.includes(iid))));
      },
      onDrop: drop => this.dropCard(drop),
    });
    this.cardDrag.mount();
    this.itemDrag = new ItemDragController(this.root, {
      getCount: () => this.socialCount,
      getSelectedItem: () => this.selectedItem,
      onDrop: (payload: ItemDropPayload) => {
        this.selectedItem = payload.itemId;
        this.socialCount = payload.count;
        this.fxTarget = payload.targetSeatId;
        this.effectNet?.send(payload.targetSeatId, payload.itemId, payload.count);
        this.render();
      },
    });
    this.itemDrag.mount();
    this.root.addEventListener('click', (ev) => this.onRootClick(ev));
    window.addEventListener('keydown', (ev) => {
      if ((ev.key === 'Enter' || ev.key === ' ') && document.activeElement?.matches('.seat-card[role="button"]')) { ev.preventDefault(); (document.activeElement as HTMLElement).click(); }
      if (ev.key === 'Escape' && this.helpOpen) {
        this.helpOpen = false;
        this.render();
        return;
      }
      if (ev.key === 'Escape' && this.revealIdx < this.revealSteps.length) {
        this.revealIdx = this.revealSteps.length;
        this.render();
        return;
      }
      if (ev.key === 'Escape' && (this.reactionDraft || this.selectedItem || this.socialTab)) {
        this.reactionDraft = null;
        this.reactionTargetSeatId = '';
        this.selectedItem = '';
        this.socialTab = null;
        this.render();
      }
    });
  }

  /**
   * 6G-2 根委托点击：怀疑标记切换 / 扔物品 / 快捷表情 / 快捷短语 / 座位卡选目标。
   * 顺序：先处理按钮类（[data-mark] 在座位卡 li 内，必须先于座位卡分支），
   * 再处理座位卡（按钮/卡背翻转/输入区点击不触发选目标）。
   */
  private onRootClick(ev: MouseEvent): void {
    const t = ev.target as HTMLElement | null;
    if (!t?.closest) return;
    // 6H-1：点击即手势，顺手确保 AudioContext 已建（幂等， cheap）
    void this.audio.ensure();
    // 玩法说明弹窗关闭：× 按钮或点击背景（内容区点击不关闭）
    const helpClose = t.closest('[data-help-close]');
    if (helpClose) {
      const isBackdrop = (helpClose as HTMLElement).id === 'help-modal';
      if (!isBackdrop || ev.target === helpClose) {
        this.helpOpen = false;
        this.render();
        return;
      }
    }
    // 结算分步弹窗：下一步 / 关闭（内容区点击不关闭）
    if (t.closest('[data-reveal-next]')) {
      this.revealIdx += 1;
      this.render();
      return;
    }
    const revealClose = t.closest('[data-reveal-close]');
    if (revealClose) {
      const isBackdrop = (revealClose as HTMLElement).id === 'reveal-modal';
      if (!isBackdrop || ev.target === revealClose) {
        this.revealIdx = this.revealSteps.length;
        this.render();
        return;
      }
    }
    const socialTab = t.closest('[data-social-tab]');
    if (socialTab) {
      const tab = (socialTab as HTMLElement).dataset['socialTab'];
      if (tab === 'effects' || tab === 'emoji' || tab === 'phrases' || tab === 'chat') {
        this.socialTab = this.socialTab === tab ? null : tab;
        this.socialPage = 0;
        this.render();
      }
      return;
    }
    const phraseSummary = t.closest('#phrase-panel > summary');
    if (phraseSummary) {
      const details = phraseSummary.parentElement as HTMLDetailsElement | null;
      this.phrasePanelOpen = Boolean(details?.open);
      return;
    }
    const markBtn = t.closest('[data-mark]');
    if (markBtn) {
      const target = (markBtn as HTMLElement).dataset['mark'] ?? '';
      if (!target || !this.socialNet) return;
      const selfId = this.view?.self.seatId ?? '';
      if (myMarkedTargets(this.marks, selfId).includes(target)) {
        this.socialNet.clearMark(target);
      } else {
        this.socialNet.setMark(target);
      }
      return;
    }
    const fxBtn = t.closest('[data-fx]');
    if (fxBtn) {
      const itemId = (fxBtn as HTMLElement).dataset['fx'] ?? '';
      if (!getEffectItem(itemId)) return;
      this.selectedItem = itemId;
      this.reactionDraft = null;
      this.render();
      return;
    }
    const pageBtn = t.closest<HTMLElement>('[data-page]');
    if (pageBtn) {
      const delta = Number(pageBtn.dataset['delta']);
      if (pageBtn.dataset['page'] === 'social') this.socialPage = Math.max(0, this.socialPage + delta);
      if (pageBtn.dataset['page'] === 'history') this.historyPage = Math.max(0, this.historyPage + delta);
      if (pageBtn.dataset['page'] === 'central') this.centralPage = Math.max(0, this.centralPage + delta);
      this.render(); return;
    }
    const phaseBtn = t.closest<HTMLElement>('[data-central-phase]');
    if (phaseBtn) { this.centralPhase = phaseBtn.dataset['centralPhase'] ?? ''; this.centralPage = 0; this.render(); return; }
    if (t.closest('[data-info-toggle]')) { this.infoOpen = !this.infoOpen; this.render(); return; }
    if (t.closest('[data-social-send]')) {
      if (!this.fxTarget) { this.showToast('请选择一个目标座位'); return; }
      if (this.selectedItem) {
        this.effectNet?.send(this.fxTarget, this.selectedItem, this.socialCount);
      } else if (this.reactionDraft) {
        this.net.sendReaction(this.fxTarget, this.reactionDraft.kind, this.socialCount, this.reactionDraft.emoji, this.reactionDraft.emojiId);
      }
      this.render(); return;
    }
    const phrasePageBtn = t.closest('[data-phrase-page-dir]');
    if (phrasePageBtn) {
      const dir = Number((phrasePageBtn as HTMLElement).dataset['phrasePageDir'] ?? '0');
      this.phrasePage = Math.max(0, this.phrasePage + dir);
      this.render();
      return;
    }
    const phraseBtn = t.closest('[data-phrase]');
    if (phraseBtn) {
      const raw = (phraseBtn as HTMLElement).dataset['phrase'] ?? '';
      const id = Number(raw);
      if (!Number.isInteger(id) || !this.socialNet) return;
      // 发送端强制本地试听：绕过 phraseTts.enabled 门控；接收端仍受开关控制
      try {
        if (typeof Audio !== 'undefined') {
          const preview = new Audio(assetUrl(`assets/audio/phrases/phrase_${id}.mp3`));
          void preview.play().catch(() => {});
        }
      } catch {}
      this.socialNet.sendPhrase(id);
      return;
    }
    const reactionBtn = t.closest('[data-reaction-kind], [data-reaction-emoji], [data-reaction-emoji-id]');
    if (reactionBtn) {
      const el = reactionBtn as HTMLElement;
      const kind = el.dataset['reactionKind'] as ReactionKind | undefined;
      const emoji = el.dataset['reactionEmoji'];
      const emojiId = el.dataset['reactionEmojiId'] as ReactionEmojiId | undefined;
      if (kind === 'emoji' && !emoji && !emojiId) {
        this.socialTab = 'effects';
        this.render();
        return;
      }
      if (kind === 'egg' || kind === 'flower' || (kind === 'emoji' && (emoji || emojiId))) {
        this.reactionDraft = kind === 'emoji'
          ? (emojiId ? { kind, emojiId } : { kind, emoji })
          : { kind };
        this.selectedItem = '';
        this.socialCount = Math.min(10, this.socialCount);
        this.reactionTargetSeatId = this.fxTarget;
        this.socialTab = 'emoji';
        this.render();
      }
      return;
    }
    const reactionCount = t.closest<HTMLElement>('[data-reaction-count]');
    if (reactionCount) { this.socialCount = Number(reactionCount.dataset['reactionCount']); this.render(); return; }
    const reactionCancel = t.closest('[data-reaction-cancel]');
    if (reactionCancel) {
      this.reactionDraft = null;
      this.selectedItem = '';
      this.reactionTargetSeatId = '';
      this.render();
      return;
    }
    const card = t.closest('.seat-card[data-seat]');
    if (card) {
      if (t.closest('button, .flip-wrap, a, input, summary')) return;
      const sid = (card as HTMLElement).dataset['seat'] ?? '';
      if (!sid) return;
      const pending = this.view?.pendingDecision;
      if (pending?.kind === 'chooseTarget' && pending.options.includes(sid)) {
        this.root.querySelector<HTMLButtonElement>(`.pending [data-opt="${cssEscape(sid)}"]`)?.click(); return;
      }
      if (this.reactionDraft || this.selectedItem) {
        this.fxTarget = sid; this.reactionTargetSeatId = sid; this.render(); return;
      }
      // 再点同一张取消选中
      // Social targeting starts only from the Dock.
      return;
    }
    if (t.closest('.central, .table') && !t.closest('button, input') && (this.selectedItem || this.reactionDraft)) {
      this.selectedItem = ''; this.reactionDraft = null; this.render();
    }
  }

  /** Broadcast is the only source of playback, including the sending client. */
  private onEffectBatch(items: EffectBatchItem[]): void {
    for (const item of items) {
      this.animateEffectItem(item);
      const to = this.view?.seats.find(s => s.seatId === item.targetSeatId)?.nickname ?? item.targetSeatId;
      this.reactionLogs.push(`${item.fromNickname} 向 ${to} 送出 ${item.count ?? 1} 个${getEffectItem(item.itemId)?.name ?? item.itemId}`);
    }
    this.reactionLogs = this.reactionLogs.slice(-80);
    if (!this.chatPanelOpen) this.unread += items.length;
    this.render();
  }

  private itemHit(seatId: string | undefined, strength: number): void {
    if (!seatId) return;
    const now = performance.now();
    if (now - (this.lastHitAt.get(seatId) ?? -Infinity) < 80) return;
    this.lastHitAt.set(seatId, now);
    const seat = this.root.querySelector<HTMLElement>(`.seat-card[data-seat="${cssEscape(seatId)}"]`);
    if (!seat) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      seat.dataset['hitNotice'] = '收到互动';
      window.setTimeout(() => delete seat.dataset['hitNotice'], 1200);
      return;
    }
    seat.style.setProperty('--hit-strength', `${Math.min(10, 4 + strength * 2)}px`);
    this.addAnimationElement(seat, 'fx-hit');
    this.fxHit.set(seatId, Date.now());
  }

  private animateEffectItem(item: EffectBatchItem): void {
    const source = this.root.querySelector<HTMLElement>(`.seat-card[data-seat="${cssEscape(item.fromSeatId)}"]`);
    const target = this.root.querySelector<HTMLElement>(`.seat-card[data-seat="${cssEscape(item.targetSeatId)}"]`);
    if (!source || !target || !getEffectItem(item.itemId)) return;
    this.flightLayer?.launch({ from: source.getBoundingClientRect(), to: target.getBoundingClientRect(), itemId: item.itemId, targetSeatId: item.targetSeatId, count: item.count ?? 1 });
  }

  private onReaction(event: ReactionEventPayload): void {
    const v = this.view;
    if (v) {
      const from = v.seats.find((s) => s.seatId === event.fromSeatId)?.nickname ?? event.fromSeatId;
      const to = v.seats.find((s) => s.seatId === event.targetSeatId)?.nickname ?? event.targetSeatId;
      const label = event.kind === 'egg' ? '砸了' : event.kind === 'flower' ? '送了' : '发送了';
      const item = event.kind === 'egg' ? `${event.count} 个蛋` : event.kind === 'flower' ? `${event.count} 朵花` : `${event.emoji ?? event.emojiId ?? ''}`;
      this.reactionLogs.push(`${from} 向 ${to} ${label} ${item}`);
      if (this.reactionLogs.length > 80) this.reactionLogs.shift();
    }
    this.render();
    window.setTimeout(() => this.animateReaction(event), 0);
  }

  private animateReaction(event: ReactionEventPayload): void {
    const target = this.root.querySelector<HTMLElement>(`.seat-card[data-seat="${cssEscape(event.targetSeatId)}"]`);
    if (!target) return;
    if (event.kind === 'egg' || event.kind === 'flower') {
      this.animateEffectItem({ fromSeatId: event.fromSeatId, fromNickname: '', targetSeatId: event.targetSeatId, itemId: event.kind === 'egg' ? 'egg' : 'sakura', comboId: 'legacy', count: event.count });
    } else if (event.emojiId) {
      this.flightLayer?.emojiPop(target.getBoundingClientRect(), event.emojiId, event.count, event.targetSeatId);
    } else {
      this.showPhraseBubble({ seatId: event.targetSeatId, nickname: '', text: event.emoji ?? '✨' } as ChatEventPayload);
    }
  }

  private resetSocialUi(): void {
    this.phraseTts.stop();
    if (this.intelNoticeTimer !== null) clearTimeout(this.intelNoticeTimer);
    this.intelNoticeTimer = null;
    this.root.querySelector('#intel-notice')?.setAttribute('hidden', '');
    this.hideCardTooltip?.();
    this.marks = [];
    this.fxTarget = '';
    this.fxHit.clear();
    this.lastHitAt.clear();
    this.cardDrag?.cancel();
    this.dragIntent = null;
    this.playOrigins.clear();
    this.fxLayer?.clear();
    this.flightLayer?.clear();
    this.cardFlight?.unmount();
    this.cardFlight = null;
    this.moments.clear();
    this.selectedItem = ''; this.reactionDraft = null; this.reactionTargetSeatId = '';
    this.socialTab = null;
    document.querySelectorAll('.phrase-bubble, .reaction-projectile, .reaction-pop, .effect-projectile, .played-card-flight').forEach(el => el.remove());
  }

  private renderShell(): void {
    this.root.innerHTML = `<div class="app" id="ui"></div><div id="toast" class="toast" hidden></div><div id="achieve-pop" aria-live="polite"></div><div id="highlight-pop" hidden></div><div id="intel-notice" class="intel-notice" role="status" aria-live="polite" hidden></div>`;
  }

  private showToast(msg: string, ms = 2500): void {
    const t = this.root.querySelector('#toast');
    if (!t) return;
    t.textContent = msg;
    t.removeAttribute('hidden');
    window.setTimeout(() => t.setAttribute('hidden', ''), ms);
  }

  private showPhraseBubble(p: ChatEventPayload): void {
    const source = this.root.querySelector<HTMLElement>(`.seat-card[data-seat="${cssEscape(p.seatId)}"]`);
    document.querySelector(`.phrase-bubble[data-speaker="${cssEscape(p.seatId)}"]`)?.remove();
    const bubble = document.createElement('div');
    bubble.dataset['speaker'] = p.seatId;
    bubble.className = 'phrase-bubble';
    bubble.textContent = p.nickname ? `${p.nickname}：${p.text}` : p.text;
    const r = source?.getBoundingClientRect();
    bubble.style.left = `${Math.max(130, Math.min(window.innerWidth - 130, (r?.left ?? window.innerWidth / 2) + (r?.width ?? 0) / 2))}px`;
    bubble.style.top = `${Math.max(110, (r?.top ?? window.innerHeight / 2) - 8)}px`;
    document.body.appendChild(bubble);
    window.setTimeout(() => bubble.remove(), 3200);
  }

  private ui(): HTMLElement | null {
    return this.root.querySelector('#ui');
  }

  render(): void {
    this.hideCardTooltip?.();
    if (import.meta.env.DEV) {
      console.log('[render]', {
        viewPhase: this.view?.phase,
        domPhase: document.querySelector('.phase')?.textContent,
      });
    }
    const el = this.ui();
    if (!el) return;
    const oldLlmPanel = this.root.querySelector<HTMLDetailsElement>('.llm-adv');
    if (oldLlmPanel) this.llmPanelOpen = oldLlmPanel.open;
    const oldRoomKey = this.root.querySelector<HTMLInputElement>('#llm-room-key');
    if (oldRoomKey) this.llmDraftKey = oldRoomKey.value;
    const oldCreateKey = this.root.querySelector<HTMLInputElement>('#llm-api-key');
    if (oldCreateKey) this.createLlmDraftKey = oldCreateKey.value;
    const isGame = Boolean(this.view);
    if (this.view && this.view.phase !== this.bannerPhase) {
      this.bannerPhase = this.view.phase;
      this.bannerAt = Date.now();
    }
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('in-game', isGame);
      document.body.classList.toggle('in-lobby', !isGame);
    }
    const banner =
      this.status === 'disconnected'
        ? `<div class="banner warn">连接已断开，正在重连…（Socket.IO 自动重连，恢复后自动隐藏）</div>`
        : this.status === 'connecting'
          ? `<div class="banner">连接中…</div>`
          : '';
    const reject = this.lastReject
      ? `<div class="banner err">${escapeHtml(this.lastReject)}</div>`
      : '';
    const voiceBanner = voiceBannerHtml(this.voiceNotice);
    const oldChat = this.root.querySelector<HTMLInputElement>('#chat-input');
    const chatFocused = document.activeElement === oldChat && !!oldChat;
    const chatCursor = oldChat?.selectionStart ?? 0;
    el.innerHTML = `
      ${banner}${reject}${voiceBanner}
      <header class="top">
        <div class="brand-group">
          <h1>忍者之夜</h1>
          ${this.view || this.presence ? `<span class="room">房间 <b>${this.net.roomCode ?? ''}</b></span>` : ''}
          ${this.net.seatId ? `<span class="seat">座位 <b>${this.net.seatId}</b></span>` : ''}
          ${this.seedBadge()}
        </div>
        ${this.view || this.presence ? `<button id="btn-leave-room" type="button" class="muted">返回大厅</button>` : ''}
        <div class="audio-ctl">
          <button id="btn-sound" type="button" title="音效设置" aria-label="音效设置">${this.audio.enabled ? '🔊' : '🔇'}</button>
          <button id="btn-achieve" type="button" title="成就" aria-label="成就">🏆</button>
          <div class="audio-pop" id="achieve-panel"${this.achievePanelOpen ? '' : ' hidden'}>
            <h4>成就（本地）</h4>
            <div class="achieve-list">${ACHIEVEMENTS.map((a) => {
              const un = this.achieve.isUnlocked(a.id);
              return `<div class="achieve-row${un ? '' : ' locked'}"><b>${un ? '🏵' : '🔒'} ${escapeHtml(a.name)}</b><span>${escapeHtml(a.desc)}</span></div>`;
            }).join('')}</div>
          </div>
          <div class="audio-pop" id="audio-panel"${this.audioPanelOpen ? '' : ' hidden'}>
            <label><input id="sound-enabled" type="checkbox" ${this.audio.enabled ? 'checked' : ''} /> 音效开</label>
            <label>音量 <input id="sound-volume" type="range" min="0" max="100" step="1" value="${Math.round(this.audio.volume * 100)}" /></label>
            <label><input id="bgm-enabled" type="checkbox" ${this.audio.bgmEnabled ? 'checked' : ''} /> BGM（夜晚/结算）</label>
            <label>BGM 音量 <input id="bgm-volume" type="range" min="0" max="100" step="1" value="${Math.round(this.audio.bgmVolume * 100)}" /></label>
            <div class="sfx-test">${SFX_NAMES.map((n) => `<button type="button" data-sfx-test="${n}" title="试听 ${n}">${sfxCn(n)}</button>`).join('')}</div>
          </div>
        </div>
      </header>
      ${!this.view && !this.presence ? this.lobbyForm() : this.gameBody()}
      ${this.helpOpen ? helpModalHtml() : ''}
      ${this.revealModalHtml()}
    `;
    this.bind();
    if (chatFocused) { const input = this.root.querySelector<HTMLInputElement>('#chat-input'); input?.focus(); input?.setSelectionRange(chatCursor,chatCursor); }
  }

  private lobbyForm(): string {
    return `
      <section class="panel">
        <h2>加入房间</h2>
        <label>昵称 <input id="nick" maxlength="16" placeholder="1–16 字" /></label>
        <label>LLM key（可选，仅房主内存保存） <input id="llm-api-key" type="password" maxlength="512" autocomplete="off" placeholder="留空使用服务器默认" value="${escapeHtml(this.createLlmDraftKey)}" /></label>
        <div class="row">
          <button id="btn-create" type="button">创建房间</button>
          <input id="code" maxlength="6" placeholder="6 位房间码" />
          <button id="btn-join" type="button">加入</button>
        </div>
        <div class="row">
          <button id="btn-help" class="muted" type="button">玩法说明</button>
        </div>
      </section>
    `;
  }

  /** 6F-4：本会话是否已弹过该轮身份（sessionStorage，纯本地） */
  private houseSeenKey(roomCode: string, round: number): string {
    return `ninja-night:houseSeen:${roomCode}:${round}`;
  }

  private hasSeenHouse(roomCode: string, round: number): boolean {
    try {
      return window.sessionStorage.getItem(this.houseSeenKey(roomCode, round)) !== null;
    } catch {
      return this.identityModalOpen;
    }
  }

  private markHouseSeen(roomCode: string, round: number): void {
    try {
      window.sessionStorage.setItem(this.houseSeenKey(roomCode, round), '1');
    } catch {
      /* 无痕模式等写入失败时退化为内存标记（本轮不再弹） */
    }
  }

  private openIdentityModal(): void {
    this.identityModalOpen = true;
    if (this.identityModalTimer !== null) clearTimeout(this.identityModalTimer);
    this.identityModalTimer = setTimeout(() => {
      this.identityModalOpen = false;
      this.identityModalTimer = null;
      this.render();
      this.syncIdentityModal(this.view);
    }, 2500);
  }

  private closeIdentityModal(): void {
    this.identityModalOpen = false;
    if (this.identityModalTimer !== null) {
      clearTimeout(this.identityModalTimer);
      this.identityModalTimer = null;
    }
    this.render();
    this.syncIdentityModal(this.view);
  }

  /** 6H-1：视图事件/阶段 → 本地音效（只播新增 seq，首快照静默记位） */
  private playViewSounds(v: PlayerView): void {
    const maxSeq = v.events.reduce((m, e) => Math.max(m, e.seq ?? 0), 0);
    if (!this.soundPrimed) {
      this.soundPrimed = true;
      this.lastSoundSeq = maxSeq;
      this.lastAnimationSeq = maxSeq;
      this.lastSoundPhase = v.phase;
      // 6H-2：首快照即同步 BGM 轨道
      this.audio.syncBgmToPhase(v.phase, Boolean(v.gameOver));
      return;
    }
    if (this.lastSoundPhase !== '' && this.lastSoundPhase !== v.phase) {
      this.audio.play('phase-change');
      // 6H-2：阶段变化自动切换 BGM
      this.audio.syncBgmToPhase(v.phase, Boolean(v.gameOver));
    }
    this.lastSoundPhase = v.phase;
    // 6H-3：同流喂成就判定（只含新增 seq）
    const selfAlive = v.seats.find((s) => s.seatId === v.self.seatId)?.alive ?? true;
    for (const e of v.events) {
      if ((e.seq ?? 0) <= this.lastSoundSeq) continue;
      this.audio.playForEvent(e.type, (e.payload ?? {}) as Record<string, unknown>, v.self.seatId);
      const fresh = this.achieve.handleEvent(
        e.type,
        (e.payload ?? {}) as Record<string, unknown>,
        v.self.seatId,
        selfAlive,
      );
      for (const id of fresh) this.showAchievementCard(id);
      // 6H-4：轮结束事件 → 高光横幅（本轮事件聚合，5s 淡出）
      if (e.type === 'score.roundWinner') this.showHighlight(v);
    }
    this.lastSoundSeq = Math.max(this.lastSoundSeq, maxSeq);
  }

  private dropCard(drop: CardDropPayload): void {
    const v = this.view, pending = v?.pendingDecision;
    if (!v || !pending || (!drop.targetSeatId && !drop.central)) return;
    if (pending.kind === 'chooseTarget' && drop.targetSeatId && pending.options.includes(drop.targetSeatId) && pending.context.relatedInstanceIds.includes(drop.instanceId)) {
      this.net.sendCommand(v.windowId, 'night.chooseTarget', { targetSeatId: drop.targetSeatId });
      this.playCardFlight(drop.html, drop.sourceRect, this.root.querySelector<HTMLElement>(`.seat-card[data-seat="${cssEscape(drop.targetSeatId)}"]`));
      return;
    }
    if (pending.kind !== 'declareCards' || !pending.options.includes(drop.instanceId)) return;
    this.playOrigins.set(drop.instanceId, { html: drop.html, rect: drop.sourceRect });
    this.dragIntent = drop.targetSeatId ? { instanceId: drop.instanceId, targetSeatId: drop.targetSeatId, round: v.round, phase: v.phase } : null;
    // 多张可打：拖入只暂存（纯本地，他人不可见），追问是否再打一张；确认经「确认打出选中」发出
    if (pending.options.length > 1) {
      this.selected.add(drop.instanceId);
      const card = v.self.hand.find((c) => c.instanceId === drop.instanceId);
      const name = card ? getCardDisplayName(card.cardId) : '';
      this.showToast(`已暂存「${name}」(${this.selected.size}/${pending.options.length})：可再拖一张，或点「确认打出选中」发出`);
      this.render();
      return;
    }
    this.net.sendCommand(v.windowId, 'night.declare', { cardInstanceIds: [drop.instanceId] });
    this.selected.clear();
  }

  private resolveDragIntent(v: PlayerView): void {
    const intent = this.dragIntent;
    if (!intent) return;
    if (intent.round !== v.round || intent.phase !== v.phase || v.gameOver) { this.dragIntent = null; return; }
    const p = v.pendingDecision;
    if (p?.kind !== 'chooseTarget' || !p.context.relatedInstanceIds.includes(intent.instanceId)) return;
    this.dragIntent = null;
    if (p.options.includes(intent.targetSeatId)) {
      this.net.sendCommand(v.windowId, 'night.chooseTarget', { targetSeatId: intent.targetSeatId });
    } else {
      this.showPhraseBubble({ seatId: v.self.seatId, nickname: '', text: '目标已不可选，请点击其他高亮座位' } as ChatEventPayload);
    }
  }

  private rememberPlayOrigins(): void {
    this.root.querySelectorAll<HTMLElement>('.hand .card.sel').forEach(el => {
      const id = el.dataset['iid'];
      if (id) this.playOrigins.set(id, { html: el.outerHTML, rect: el.getBoundingClientRect() });
    });
  }

  private playCardFlight(html: string, from: DOMRect, target: HTMLElement | null): void {
    if (!target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const to = target.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'played-card-flight';
    ghost.innerHTML = html;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.setProperty('--from-x', `${from.left}px`);
    ghost.style.setProperty('--from-y', `${from.top}px`);
    ghost.style.setProperty('--to-x', `${to.left + to.width / 2 - from.width / 2}px`);
    ghost.style.setProperty('--to-y', `${to.top + to.height / 2 - from.height / 2}px`);
    ghost.style.width = `${from.width}px`; ghost.style.height = `${from.height}px`;
    document.body.appendChild(ghost);
    ghost.addEventListener('animationend', () => { ghost.remove(); if(target.isConnected) this.addAnimationElement(target, 'card-arrival'); }, { once:true });
    window.setTimeout(() => ghost.remove(), 1000);
  }

  private animateViewEvents(v: PlayerView): void {
    const fresh = v.events.filter((e) => (e.seq ?? 0) > this.lastAnimationSeq);
    if (fresh.length === 0) return;
    // 只用当前客户端收到的私密事件；同一次查看的身份和忍者牌合并展示。
    const intel = fresh.filter(e =>
      (e.type === 'night.houseViewed' || e.type === 'night.ninjaViewed') &&
      (e.payload as Record<string, unknown>)['viewerSeatId'] === v.self.seatId,
    );
    if (intel.length) this.showIntelNotice(intel, v);
    // 效果聚光灯：本快照新结算的牌按 seq 排队，依次中央展示（reduced-motion 下内部丢弃）
    this.presenter.queueFromEvents(fresh, v);
    // 结算分步：大将军亮牌→身份牌→结算（同快照 seq 排序，一轮建一次）
    this.buildRevealSteps(fresh, v);
    for (const e of fresh) {
      const payload = (e.payload ?? {}) as Record<string, unknown>;
      if (e.type === 'night.phaseStarted') {
        this.moments.phase(phaseLabel(v.phase));
        // dealHouses 为历史文档概念（core 从未赋值该 phase），保留分支做兼容；实际开局触发为 draftPick1
        if (payload['phase'] === 'dealHouses' || payload['phase'] === 'draftPick1') {
          if (v && v.seats.length > 0) {
            void this.cardFlight?.playDealAnimation(v.seats.map(s => s.seatId));
          }
        }
      }
      if (e.type === 'night.playerDied' && typeof payload['seatId'] === 'string') {
        const sid = String(payload['seatId']);
        const seatEl = this.root.querySelector<HTMLElement>(`.seat-card[data-seat="${cssEscape(sid)}"]`);
        // 模板已为新死亡座位插入动画章＋抖动类；此处登记防重播＋兜底补章/补抖
        this.stampedSeats.add(sid);
        if (seatEl) {
          if (!seatEl.querySelector('.stamp-failed-overlay')) {
            void applyStampToSeat(seatEl);
          }
          seatEl.classList.remove('animate-seat-hit');
          void seatEl.offsetWidth;
          seatEl.classList.add('animate-seat-hit');
          window.setTimeout(() => seatEl.classList.remove('animate-seat-hit'), 950);
        }
        this.addAnimation(`.seat-card[data-seat="${cssEscape(sid)}"]`, 'animate-death');
        this.moments.kill();
      }
      if (e.type === 'draft.passed') {
        // 传牌轮：按座位序全桌传递（i+1 → i，与引擎 enterPassPhaseDraft 一致），卡背飞行
        void this.cardFlight?.playPassAround(v.seats.map(s => s.seatId), 2);
      }
      if (e.type === 'score.roundWinner') {
        const center = this.root.querySelector('.central')?.getBoundingClientRect();
        const awards = payload['awarded'] as Array<{ seatId: string; count: number }> | undefined;
        let offset = 0;
        for (const award of awards ?? []) {
          const target = this.root.querySelector<HTMLElement>(`.seat-card[data-seat="${cssEscape(award.seatId)}"] .token-stack`);
          if (center && target) this.moments.award(center, target, award.count, offset);
          offset += award.count;
        }
      }
      if (e.type === 'react.resolved' && typeof payload['victimSeatId'] === 'string') {
        this.addAnimation(`.seat-card[data-seat="${cssEscape(payload['victimSeatId'])}"] .hand-stack`, 'animate-reaction-flip');
      }
      if (e.type === 'score.victory') {
        const winners = (payload['winners'] as string[] | undefined) ?? [];
        this.moments.victory(`${winners.map(id => seatName(v, id)).join(' · ')} 获胜`);
      }
      if (e.type === 'night.cardsDeclared') {
        const cards = payload['cards'] as Array<{ instanceId: string; cardId: string; actorSeatId: string }> | undefined;
        for (const card of cards ?? []) {
          const origin = this.playOrigins.get(card.instanceId);
          const seat = this.root.querySelector<HTMLElement>(`.seat-card[data-seat="${cssEscape(card.actorSeatId)}"] .hand-stack`);
          const rect = origin?.rect ?? seat?.getBoundingClientRect();
          if (rect) this.playCardFlight(origin?.html ?? renderCardHtml(card.cardId, undefined, false), rect, this.root.querySelector<HTMLElement>(`.central [data-iid="${cssEscape(card.instanceId)}"]`) ?? this.root.querySelector('.central'));
          this.playOrigins.delete(card.instanceId);
        }
      }
    }
    this.lastAnimationSeq = Math.max(this.lastAnimationSeq, ...fresh.map((e) => e.seq ?? 0));
  }

  private async refreshLlmStatus(): Promise<void> {
    if (!this.net.isHost) return;
    const result = await this.net.configureLlm();
    if (!result.ok) return;
    this.llmSource = result.source;
    this.llmEnabled = result.enabled;
    this.llmHasRoomKey = result.hasRoomKey;
    this.llmStatusLoaded = true;
    this.render();
  }

  private showIntelNotice(events: GameEvent[], v: PlayerView): void {
    const host = this.root.querySelector<HTMLElement>('#intel-notice');
    if (!host) return;
    if (this.intelNoticeTimer !== null) clearTimeout(this.intelNoticeTimer);
    host.innerHTML = `<strong>获得情报</strong>${events.map(e => `<p>${escapeHtml(eventLabel(e, v))}</p>`).join('')}<small>仅你可见 · 可在对局日志中回看</small>`;
    host.hidden = false;
    // 浮层独立于牌桌重绘，后续快照和阶段切换不会提前清除提示。
    this.intelNoticeTimer = setTimeout(() => {
      host.hidden = true;
      this.intelNoticeTimer = null;
    }, 2500);
  }

  private addAnimation(selector: string, className: string): void {
    const el = this.root.querySelector<HTMLElement>(selector);
    if (el) this.addAnimationElement(el, className);
  }

  private addAnimationElement(el: HTMLElement, className: string): void {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    el.addEventListener('animationend', () => el.classList.remove(className), { once: true });
  }

  /** 6H-4：展示本轮高光（点击展开完整日志，5s 自动淡出，不阻塞下一轮） */
  private showHighlight(v: PlayerView): void {
    const roundEvents = v.events
      .filter((e) => (e as { round?: unknown }).round === v.round)
      .map((e) => ({ type: e.type, payload: (e.payload ?? {}) as Record<string, unknown> }));
    this.highlight = buildHighlight(roundEvents, (id) => seatName(v, id));
    this.highlightExpanded = false;
    this.renderHighlight();
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => this.hideHighlight(), 5000);
  }

  private renderHighlight(): void {
    const host = this.root.querySelector('#highlight-pop');
    if (!host || !this.highlight) return;
    host.innerHTML = highlightBannerHtml(this.highlight, this.highlightExpanded);
    host.toggleAttribute('hidden', false);
  }

  /** 结算分步：同快照按 seq 取 大将军→身份牌→结算，三段依次弹窗（客户端展示延迟，不改协议） */
  private buildRevealSteps(fresh: GameEvent[], v: PlayerView): void {
    const mm = fresh.find((e) => e.type === 'score.mastermindRevealed');
    const houses = fresh.filter((e) => e.type === 'house.revealed');
    const winner = [...fresh].reverse().find((e) => {
      if (e.type !== 'score.roundWinner') return false;
      const p = (e.payload ?? {}) as Record<string, unknown>;
      return Array.isArray(p['awarded']);
    });
    if (!mm && houses.length === 0 && !winner) return;
    const key = `${v.round}`;
    if (this.revealKey === key) return;
    this.revealKey = key;
    const steps: Array<{ title: string; html: string }> = [];
    if (mm) {
      const p = (mm.payload ?? {}) as Record<string, unknown>;
      const sid = String(p['seatId'] ?? '');
      const fam = String(p['family'] ?? '');
      const famZh = fam === 'ronin'
        ? getHouseDisplayName('ronin')
        : getHouseDisplayName(`${fam}:1`).split(' · ')[0] ?? fam;
      steps.push({
        title: '大将军亮牌',
        html: `${renderCardHtml('mastermind', undefined, false)}<p><b>${escapeHtml(seatName(v, sid))}</b> 亮出大将军——${escapeHtml(famZh)}阵营本轮获胜${fam === 'ronin' ? '（浪人：本轮无阵营获胜）' : ''}</p>`,
      });
    }
    const orderedHouses = houses.slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    for (const e of orderedHouses) {
      const p = (e.payload ?? {}) as Record<string, unknown>;
      const sid = String(p['seatId'] ?? '');
      const houseId = String(p['houseId'] ?? '');
      const art = houseId ? getVisualPath(getVisualId(houseId)) : '';
      steps.push({
        title: '身份揭晓',
        html: `${art ? `<img class="reveal-house-art" src="${art}" alt="" />` : ''}<p><b>${escapeHtml(seatName(v, sid))}</b>：<b>${escapeHtml(getHouseDisplayName(houseId))}</b></p>`,
      });
    }
    if (winner) {
      const p = (winner.payload ?? {}) as Record<string, unknown>;
      const awarded = (p['awarded'] as Array<{ seatId: string; count: number }> | undefined) ?? [];
      steps.push({
        title: '本轮结算',
        html: `<p>${escapeHtml(roundLabel(winner, v))}</p><p>${awarded.map((a) => `${escapeHtml(seatName(v, a.seatId))} ＋${a.count} 枚`).join('；') || '无人摸牌'}</p>`,
      });
    }
    this.revealSteps = steps;
    this.revealIdx = 0;
  }

  private revealModalHtml(): string {
    if (this.revealSteps.length === 0 || this.revealIdx >= this.revealSteps.length) return '';
    const step = this.revealSteps[this.revealIdx];
    if (!step) return '';
    const last = this.revealIdx === this.revealSteps.length - 1;
    return `<div class="identity-modal-backdrop" id="reveal-modal" data-reveal-close="1" style="z-index:2350">
      <div class="help-modal" role="dialog" aria-label="${escapeHtml(step.title)}">
        <div class="help-head"><h3>${escapeHtml(step.title)}（${this.revealIdx + 1}/${this.revealSteps.length}）</h3><button type="button" class="muted" data-reveal-close="1" aria-label="关闭结算展示">×</button></div>
        <div class="help-body"><section>${step.html}</section>
        <div class="row"><button type="button" class="btn-primary" data-reveal-next="1">${last ? '查看结算' : '下一步'}</button></div></div>
      </div>
    </div>`;
  }

  private hideHighlight(): void {
    this.highlightTimer = null;
    this.highlight = null;
    this.highlightExpanded = false;
    const host = this.root.querySelector('#highlight-pop');
    if (host) {
      host.toggleAttribute('hidden', true);
      host.innerHTML = '';
    }
  }

  /** 6H-3：成就解锁卡片（右上角滑入，3s 淡出，不阻塞） */
  private showAchievementCard(id: string): void {
    const def = achievementDef(id);
    if (!def) return;
    const host = this.root.querySelector('#achieve-pop');
    if (!host || typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.className = 'achieve-card';
    el.innerHTML = `<b>🏵 成就解锁：${escapeHtml(def.name)}</b><span>${escapeHtml(def.desc)}</span>`;
    host.appendChild(el);
    window.setTimeout(() => el.remove(), 3000);
  }

  private resetIdentityUi(): void {
    this.identityModalOpen = false;
    this.housePeek = false;
    this.handPeekIid = null;
    if (this.identityModalTimer !== null) {
      clearTimeout(this.identityModalTimer);
      this.identityModalTimer = null;
    }
    this.modalKey = '';
    if (this.modalHost) this.modalHost.innerHTML = '';
  }

  /**
   * 身份弹窗同步：只在 开/关/换轮 三种变迁时写宿主 DOM；
   * 普通重渲染不动宿主，identityPop 动画只播一次，不闪烁。
   */
  private syncIdentityModal(v: PlayerView | null): void {
    if (!this.modalHost) return;
    const key = this.identityModalOpen && v && !v.gameOver ? `${v.roomCode}:${v.round}` : '';
    if (key === this.modalKey) return;
    this.modalKey = key;
    this.modalHost.innerHTML = key && v ? this.identityModalHtml(v) : '';
  }

  /** 6F-4 开局身份弹窗（背景 identity-modal-bg，正面大卡 + 身份名） */
  private identityModalHtml(v: PlayerView): string {
    if (!this.identityModalOpen) return '';
    const front = getVisualPath(getVisualId(v.self.houseId));
    const name = getHouseDisplayName(v.self.houseId);
    return `<div class="identity-modal-backdrop" id="identity-modal">
      <div class="identity-modal" role="dialog" aria-label="你的身份">
        <img class="identity-front" src="${front}" alt="${escapeHtml(name)}" />
        <p class="identity-name">你的身份：<b>${escapeHtml(name)}</b></p>
        <p class="hint">2.5 秒后自动关闭，点击卡片关闭</p>
      </div>
    </div>`;
  }

  /** 自家新手牌弹窗：只看刚拿到的 1 张（选牌期取 draftHand 尾，否则取 hand 尾；有待选时优先待选项中最新者） */
  private newestSelfCard(v: PlayerView): { instanceId: string; cardId: string } | null {
    const piles = [...(v.self.draftHand ?? []), ...v.self.hand];
    if (piles.length === 0) return null;
    const opts = v.pendingDecision?.options;
    if (opts && opts.length > 0) {
      const inOpts = piles.filter((c) => opts.includes(c.instanceId));
      if (inOpts.length > 0) return inOpts[inOpts.length - 1]!;
    }
    return piles[piles.length - 1]!;
  }

  private handPeekModalHtml(v: PlayerView): string {
    if (!this.handPeekIid) return '';
    const card =
      [...(v.self.draftHand ?? []), ...v.self.hand].find((c) => c.instanceId === this.handPeekIid) ?? null;
    if (!card) {
      this.handPeekIid = null;
      return '';
    }
    return `<div class="identity-modal-backdrop" id="hand-peek-modal" data-hand-peek-close="1">
      <div class="identity-modal" role="dialog" aria-label="刚拿到的牌">
        ${renderCardHtml(card.cardId, card.instanceId, false)}
        <p class="hint">刚拿到的牌（仅你可见），点击任意处关闭</p>
      </div>
    </div>`;
  }

  /**
   * 6F-2 座位卡片：ul.seats > li 结构保留（e2e 靠 .seats li 计数/文本），
   * li 升级为 .seat-card（身份缩略 + 手牌背堆叠 + 令牌），自己置末全宽。
   */
  private seatCard(
    s: { seatId: string; nickname: string; connected: boolean; isHost: boolean; isBot?: boolean },
    v: PlayerView | null,
    isSelf: boolean,
    seatPosition = isSelf ? 'self' : 'top-1',
  ): string {
    const alive = 'alive' in s ? (s as { alive?: boolean }).alive : undefined;
    const tokens = 'honorTokenCount' in s ? (s as { honorTokenCount?: number }).honorTokenCount : undefined;
    const house = 'publicHouseId' in s ? (s as { publicHouseId?: string }).publicHouseId : undefined;
    const handCount = 'handCount' in s ? (s as { handCount?: number }).handCount : undefined;
    const ready = 'ready' in s ? (s as { ready?: boolean }).ready : false;
    const isBot = Boolean(s.isBot);
    const dead = alive === false;
    const inGame = Boolean(v);


    // 身份缩略：死者强制卡背；他人按 publicHouseId 切正/背；
    // 自己：卡背覆盖 + 点击翻转（6F-4 纯本地，窥视时才显示身份名）
    let houseImg = `<img class="house-mini back" src="${getHouseCardBackPath()}" alt="等待分配身份" />`;
    if (inGame) {
      if (isSelf && v) {
        const front = getVisualPath(getVisualId(v.self.houseId));
        const name = getHouseDisplayName(v.self.houseId);
        houseImg = `<span class="flip-wrap${this.housePeek ? ' show-front' : ''}" data-peek="1" title="${this.housePeek ? '点击盖回' : '点击查看身份'}">` +
          `<img class="face back" src="${getHouseCardBackPath()}" alt="你的身份牌（已覆盖，点击查看）" />` +
          `<img class="face front" src="${front}" alt="${escapeHtml(name)}" />` +
          `</span>`;
      } else if (!isSelf && !dead && house) {
        const front = getVisualPath(getVisualId(house));
        houseImg = `<img class="house-mini front" src="${front}" alt="${escapeHtml(getHouseDisplayName(house))}" title="${escapeHtml(getHouseDisplayName(house))}" />`;
      } else if (!isSelf) {
        houseImg = `<img class="house-mini back" src="${getHouseCardBackPath()}" alt="未公开身份" title="未公开身份" />`;
      }
    }

    // 座位手牌：真实叠放（最多 3 张错开显示，超过用 +N 角标；≤3 保持 ×N 角标以兼容 e2e）
    // 自己座位可点击暗牌翻看刚拿到的 1 张（data-hand-peek，纯本地弹窗）
    const shown = inGame && handCount !== undefined ? Math.min(Math.max(handCount, 0), 3) : 0;
    const badge = inGame && handCount !== undefined && handCount > 0
      ? `<i>${handCount > 3 ? `+${handCount}` : `×${handCount}`}</i>`
      : '';
    const handStack =
      inGame && handCount !== undefined
        ? `<span class="hand-stack fan" data-count="${handCount}"${isSelf ? ' data-hand-peek="1" role="button" tabindex="0"' : ''} title="${isSelf ? '点击查看刚拿到的牌' : `手牌 ${handCount} 张`}">${Array.from({ length: shown }, (_, i) => `<img src="${getNinjaCardBackPath()}" alt="手牌背面" style="--i:${i}" />`).join('')}${badge}</span>`
        : '';
    const tokenStack =
      inGame && tokens !== undefined
        ? `<span class="token-stack" title="令牌 ${tokens} 枚"><img src="${getHonorTokenPath()}" alt="令牌" style="visibility:hidden" onload="this.style.visibility='visible'" onerror="this.style.visibility='hidden'" /><i>×${tokens}</i></span>`
        : '';

    // 自己的身份/令牌面值：覆盖态只露令牌 + 点击查看提示；窥视态才显示身份名（6F-4）
    let selfMeta = '';
    if (inGame && isSelf && v) {
      const vals = v.self.honorTokens.map((t) => t.value).join(', ');
      const tokenPart = `令牌面值：[<span class="token-val">${escapeHtml(vals || '无')}</span>]`;
      selfMeta = this.housePeek
        ? `<div class="seat-meta self-meta">你的身份：<b class="house-badge">${escapeHtml(getHouseDisplayName(v.self.houseId))}</b> · ${tokenPart}</div>`
        : `<div class="seat-meta self-meta">${tokenPart} · <span class="peek-hint">点击卡背查看身份</span></div>`;
    }
    const metaBits = [
      tokens !== undefined ? `令牌:${tokens}` : '',
      !isSelf && !dead && house ? `身份:${escapeHtml(getHouseDisplayName(house))}` : '',
      dead ? '死亡' : '',
      !inGame && !isBot && ready ? '准备' : '',
    ].filter(Boolean);
    // 6G-1 语音徽章：纯社交层展示，不进规则
    const vs = this.voiceSeats.find((x) => x.seatId === s.seatId);
    const mic = vs
      ? micBadge({
          inVoice: vs.inVoice,
          muted: vs.muted,
          speaking: vs.speaking,
          listening: this.voiceClient?.listening ?? true,
        })
      : '';
    const speakingCls = vs?.speaking && !vs.muted ? ' speaking' : '';
    // 6G-2：命中抖动（fxHit 时间戳 350ms 内有效）+ 特效目标高亮 + 怀疑徽章/按钮（纯社交层）
    const hitAt = this.fxHit.get(s.seatId) ?? 0;
    const hitCls = inGame && Date.now() - hitAt < 350 ? ' fx-hit' : '';
    const targetCls = inGame && this.fxTarget === s.seatId ? ' fx-target' : '';
    const decisionTarget = v?.pendingDecision?.kind === 'chooseTarget' && v.pendingDecision.options.includes(s.seatId) ? ' game-target' : '';
    const socialTarget = this.selectedItem || this.reactionDraft ? ' social-target' : '';
    const selfId = v?.self.seatId ?? '';
    const markB = inGame ? markBadge(this.marks, s.seatId) : '';
    const markB2 = inGame && !isSelf ? markButton(this.marks, selfId, s.seatId, MARK_PER_SEAT_MAX) : '';
    // 新死亡座位：动画章（插入即播 stampSlam）＋座位抖动；已落印：静态章防重播
    const isNewDead = dead && !this.stampedSeats.has(s.seatId);
    const stampHtml = !dead
      ? ''
      : this.stampedSeats.has(s.seatId)
        ? '<div class="stamp-failed-overlay" style="animation:none;opacity:.92" aria-hidden="true"></div>'
        : '<div class="stamp-failed-overlay" aria-hidden="true"></div>';

    return `<li class="seat-card${s.isHost ? ' host' : ''}${isBot ? ' bot' : ''}${dead ? ' dead' : ''}${isSelf ? ' self' : ''}${isNewDead ? ' animate-seat-hit' : ''}${speakingCls}${hitCls}${targetCls}${decisionTarget}${socialTarget}" data-seat="${escapeHtml(s.seatId)}" data-seat-position="${escapeHtml(seatPosition)}"${decisionTarget || socialTarget ? ' tabindex="0" role="button"' : ''}>
      <div class="seat-head"><b>${isBot ? '🤖 ' : ''}${escapeHtml(s.nickname)}</b> <span class="seat-id">${escapeHtml(s.seatId)}</span>${s.isHost ? '👑' : ''} ${s.connected ? '●' : '○'}${mic}${markB}${isSelf ? '<em class="you">你</em>' : ''}</div>
      <div class="seat-body">${houseImg}${handStack}${tokenStack}</div>
      ${selfMeta}
      ${metaBits.length > 0 ? `<div class="seat-meta">${metaBits.join(' ')}</div>` : ''}
      ${markB2}
      ${stampHtml}
    </li>`;
  }

  private gameBody(): string {
    const p = this.presence;
    const v = this.view;
    // 6G-2：修剪过期抖动标记（>350ms），避免重渲染复播抖动动画
    const now = Date.now();
    for (const [sid, at] of this.fxHit) {
      if (now - at >= 350) this.fxHit.delete(sid);
    }
    // 对局中以 view.seats 为准（含 handCount/alive/house 等对局字段）；
    // 大厅才用 presence（含 ready）。反向会把对局字段遮掉（6F-4 目检发现）。
    const allSeats = v?.seats ?? p?.seats ?? [];
    const selfId = v?.self.seatId ?? this.net.seatId ?? '';
    const selfIndex = allSeats.findIndex(s => s.seatId === selfId);
    const others = [...allSeats.slice(selfIndex + 1), ...allSeats.slice(0, Math.max(0, selfIndex))];
    const bucket = playerCountBucket(allSeats.length);
    const positions = ringPositions(bucket, others.length);
    const seatByPosition = new Map<string, string>();
    others.forEach((s, i) => seatByPosition.set(positions[i] ?? `top-${i + 1}`, this.seatCard(s, v ?? null, false, positions[i] ?? `top-${i + 1}`)));
    const ring = (prefix: string) => [...seatByPosition.entries()]
      .filter(([p]) => p.startsWith(`${prefix}-`))
      .map(([, html]) => html)
      .join('');
    const selfSeat = allSeats.find((s) => s.seatId === selfId);
    const selfHtml = selfSeat ? this.seatCard(selfSeat, v ?? null, true, 'self') : '';
    const central = v ? this.centralArea(v) : '';
    const selfContent = v ? this.handDecisionHtml(v, v.pendingDecision ?? null) : '';

    const pending = v?.pendingDecision;

    return `
      <div class="grid table-layout${v ? ' game-layout' : ''}">
        <section class="panel seats-panel">
          <h2 class="table-caption">夜幕已至 · 忍者之夜</h2>
          <div class="table">
            <img class="table-emblem" src="${getTableEmblemPath()}" alt="" aria-hidden="true" />
            <div class="table-ring seats ring" data-player-count="${bucket}" data-seat-count="${allSeats.length}">
              <div class="self-zone" data-seat-position="self">${selfHtml}${selfContent}</div>
              <div class="ring-top" data-ring="top">${ring('top')}</div>
              <div class="ring-middle">
                <div class="ring-left" data-ring="left">${ring('left')}</div>
                ${central}
                <div class="ring-right" data-ring="right">${ring('right')}</div>
              </div>
              <div class="ring-bottom" data-ring="bottom">${ring('bottom')}</div>
            </div>
          </div>
          ${!v ? this.lobbyControls() : ''}
          
        </section>
        ${v && this.net.isHost && (v.phase === 'roomLobby' || v.phase === 'dealHouses' || !v.round || v.round === 0) ? `<section class="panel host-llm-panel">${this.llmControls()}</section>` : ''}
        ${v ? this.gamePanels(v, pending ?? null) : ''}
        ${v ? this.handPeekModalHtml(v) : ''}
        ${v ? this.socialDockHtml(v) : ''}
        ${this.chatLogPanel(v ?? null)}
      </div>
    `;
  }

  private lobbyControls(): string {
    const p = this.presence;
    const isHost = this.net.isHost;
    const n = p?.seats.length ?? 0;
    const botCount = p?.seats.filter((s) => s.isBot).length ?? 0;
    const allReady =
      n >= 4 && (p?.seats ?? []).every((s) => s.isHost || s.isBot || (s as { ready?: boolean }).ready);
    return `
      <div class="row">
        <button id="btn-ready" type="button">切换准备</button>
        ${isHost ? `<button id="btn-start" type="button" ${n < 4 ? 'disabled' : ''}>开始 (${n})</button>` : ''}
        ${isHost ? `<button id="btn-add-bot" type="button" ${n >= 11 ? 'disabled' : ''}>添加人机</button>` : ''}
        ${isHost && botCount > 0 ? `<button id="btn-remove-bot" type="button">移除人机</button>` : ''}
        ${isHost ? `<button id="btn-end" type="button" class="danger">终止本局</button>` : ''}
      </div>
      ${isHost ? this.kickButtons() : ''}
      <p class="hint">需要 ${allReady ? '可开始' : '4–11 人且全员准备（房主可不准备）'}</p>
      ${this.voiceBar()}
      ${isHost ? this.seedControls() : ''}
      ${isHost ? this.llmControls() : ''}
    `;
  }

  private llmControls(): string {
    const status = !this.llmEnabled
      ? this.llmHasRoomKey ? '已保存房主 key，但服务端开关未启用（当前仅本地启发式）' : '未启用（仅本地启发式）'
      : this.llmHasRoomKey ? '已启用：使用房主 key' : this.llmSource === 'server' ? '已启用：使用服务器默认 key' : '未配置 key（仅本地启发式）';
    return `<details class="llm-adv"${this.llmPanelOpen ? ' open' : ''}><summary>社交专家 / LLM</summary>
      <label>房主 key <input id="llm-room-key" type="password" maxlength="512" autocomplete="off" placeholder="输入新 key" value="${escapeHtml(this.llmDraftKey)}" /></label>
      <div class="row"><button id="btn-llm-save" type="button">保存 key</button><button id="btn-llm-clear" type="button" class="muted">撤回房主 key</button></div>
      <span class="seed-hint">状态：${status}。key 仅存于本房间内存，不会回显或写入浏览器。</span>
    </details>`;
  }

  /**
   * 6J 种子机制：房主隐藏入口（details 折叠 + URL ?seed=xxx 预填）。
   * 留空 = 随机；填数字 = 下局用固定种子（视图会显示，可复现、可截图报 bug）。
   */
  private urlSeed(): string {
    try {
      return new URLSearchParams(window.location.search).get('seed') ?? '';
    } catch {
      return '';
    }
  }

  private seedControls(): string {
    if (this.pendingSeed === null) this.pendingSeed = this.urlSeed();
    const v = this.pendingSeed.replace(/"/g, '&quot;');
    return `
      <details class="seed-adv">
        <summary>高级（种子复现）</summary>
        <label>固定种子 <input id="seed-input" inputmode="numeric" placeholder="留空=随机" value="${v}" /></label>
        <span class="seed-hint">?seed=xxx 可预填；固定局全员可见种子，随机局仅终局可见</span>
      </details>
    `;
  }

  /** 顶栏种子徽标：固定局全程显示，随机局仅终局显示（截图报 bug 用） */
  private seedBadge(): string {
    const s = this.view?.gameSeed;
    if (s === undefined || s === null) return '';
    return `<span class="seed">种子 <b>${s}</b></span>`;
  }

  /** 6G-1 语音条：房间内可见（大厅/对局）；离线连接时隐藏 */
  private voiceBar(): string {
    if (!this.presence && !this.view) return '';
    if (!this.voiceClient) return '';
    return voiceBarHtml({
      status: this.voiceStatus,
      muted: this.voiceClient.muted,
      listening: this.voiceClient.listening,
      supported: this.voiceSupported,
      speechEnabled: this.phraseTts.enabled,
      speechSupported: this.phraseTts.supported,
    });
  }

  private kickButtons(): string {    const seats = this.presence?.seats ?? [];
    const offline = seats.filter((s) => !s.connected && !s.isHost);
    if (offline.length === 0) return '';
    return `
      <div class="row kick-row">
        ${offline
          .map(
            (s) =>
              `<button type="button" class="danger kick" data-seat="${escapeHtml(s.seatId)}">踢出 ${escapeHtml(s.nickname)}（断线）</button>`,
          )
          .join('')}
      </div>
    `;
  }

  private gamePanels(v: PlayerView, pending: PendingDecision | null): string {
    const reserved = v.self.reserved
      .map((c) => renderCardHtml(c.cardId, c.instanceId, false))
      .join('');
    const known = v.self.knownHouseHistory
      .map((k) => {
        const targetSeat = v.seats.find((s) => s.seatId === k.targetSeatId);
        const targetName = targetSeat ? `${targetSeat.nickname} (${k.targetSeatId})` : k.targetSeatId;
        const via = k.viaCardId ? ` · 借由 ${getCardDisplayName(k.viaCardId)}` : '';
        return `<div class="known-item"><b>${escapeHtml(targetName)}</b> → <span class="house-name">${escapeHtml(getHouseDisplayName(k.houseId))}</span>${escapeHtml(via)}</div>`;
      })
      .join('');
    // 本轮横幅：只看本 round 的 roundWinner（跨轮后旧事件自动隐藏）
    const lastRound = [...v.events].reverse().find((e) => e.type === 'score.roundWinner');
    const roundBanner =
      !v.gameOver && lastRound && lastRound.round === v.round
        ? `<div class="round-banner panel">${escapeHtml(roundLabel(lastRound, v))}</div>`
        : '';

    const victoryEv = [...v.events].reverse().find((e) => e.type === 'score.victory');
    const gameOverBanner = v.gameOver
      ? `<div class="game-over-banner panel">
          <h3>🏆 对局结束</h3>
          <p>胜出玩家：<b>${v.winners.map((w) => v.seats.find((s) => s.seatId === w)?.nickname ?? w).join(', ') || '平局/无'}</b></p>
          ${rankingHtml(v, victoryEv)}
          ${this.net.isHost ? `<button id="btn-game-over-lobby" type="button">返回大厅（再来一局）</button>` : '<p class="hint">等待房主重置大厅…</p>'}
        </div>`
      : '';

    const nextRoundBtn =
      !v.gameOver && v.phase === 'victoryCheck'
        ? this.net.isHost
          ? `<div class="row"><button id="btn-next-round" type="button" class="btn-primary">开始下一轮</button></div>`
          : '<p class="hint">等待房主开始下一轮…</p>'
        : '';

    // 阶段横幅：夜晚五阶段切换后 3s 内展示（非阻塞浮层，CSS 淡出）
    const hint = NIGHT_HINT[this.bannerPhase ?? ''];
    const phaseBanner =
      hint && Date.now() - this.bannerAt < 3000
        ? `<div class="phase-banner"><b>当前阶段：${escapeHtml(phaseLabel(this.bannerPhase ?? ''))}</b><span>${escapeHtml(hint)}</span></div>`
        : '';

    return `
      ${phaseBanner}
      <section class="panel in-game-table">
        <h2>第 ${v.round} 轮 · <span class="phase">${escapeHtml(phaseLabel(v.phase))}</span></h2>
        ${gameOverBanner}
        ${roundBanner}
        ${nextRoundBtn}
        <button type="button" data-info-toggle class="info-toggle">情报 / 管理</button><div class="table-info"${this.infoOpen ? "" : " hidden"}>${this.voiceBar()}<div class="reserved"><b>预留：</b>${reserved || '无'}</div>
        <div class="known"><h3>已知身份</h3>${known || '无'}</div>
        <div class="row">
          ${this.net.isHost ? `<button id="btn-fa" type="button">强制推进</button>` : ''}
          ${this.net.isHost ? `<button id="btn-end" type="button" class="danger">终止本局</button>` : ''}
        </div>
        ${this.net.isHost ? this.kickButtons() : ''}</div>
      </section>
    `;
  }

  private handDecisionHtml(v: PlayerView, pending: PendingDecision | null): string {
    const playableSet = pending?.kind === 'declareCards' ? new Set<string>(pending.options) : null;
    const hand = v.self.hand.map((c) => {
      const isSel = this.selected.has(c.instanceId);
      const offPhase = playableSet !== null && !playableSet.has(c.instanceId);
      const cls = `${isSel ? 'sel' : ''}${offPhase ? ' dim' : ''}${playableSet?.has(c.instanceId) ? ' opt declare-opt' : ''}`.trim();
      return renderCardHtml(c.cardId, c.instanceId, true, cls, playableSet?.has(c.instanceId) ? c.instanceId : undefined);
    }).join('');
    return `<div class="bottom-bar self-hand-decision${pending?.kind.startsWith('draft') ? ' drafting' : ''}">
      <div class="hand-section"><h3>手牌</h3><div class="hand">${hand || '<i>无手牌</i>'}</div></div>
      <div id="decision-zone">${this.pendingPanel(pending)}</div>
    </div>`;
  }

  /** A single composer: each tab owns only its own content. */
  private socialDockHtml(v: PlayerView): string {
    const tabs = [['effects', '物品'], ['emoji', '表情'], ['phrases', '短语'], ['chat', '聊天']];
    const target = v.seats.find(s => s.seatId === this.fxTarget);
    const selecting = Boolean(this.selectedItem || this.reactionDraft);
    const items = this.socialTab === 'effects'
      ? EFFECT_ITEMS.map(m => `<button type="button" class="fx-btn${this.selectedItem === m.id ? ' active' : ''}" data-fx="${m.id}" title="${m.name}"><img src="${getItemPath(m.id)}" alt="${m.name}" /><i>${m.name}</i></button>`)
      : QUICK_EMOJIS.map(e => `<button type="button" class="fx-btn emoji" data-emoji="${e}" data-reaction-kind="emoji" data-reaction-emoji-id="${e}" title="${e}"><img src="${getEmojiPath(e)}" alt="${e}" /></button>`);
    const perPage = this.socialTab === 'phrases' ? 5 : 6;
    const pages = Math.ceil((this.socialTab === 'phrases' ? PHRASES.length : items.length) / perPage);
    this.socialPage = Math.min(this.socialPage, pages - 1);
    const picker = selecting ? `<div class="social-selection"><span>${target ? `目标：${escapeHtml(target.nickname)}` : '点击座位选择目标'}</span><div class="reaction-count-picker">${(this.selectedItem ? [1, 3, 10, 100, 1000] : [1, 3, 5, 10]).map(n => `<button type="button" class="${this.socialCount === n ? 'active' : ''}" data-reaction-count="${n}">${n}</button>`).join('')}</div><button type="button" data-social-send ${target ? '' : 'disabled'}>发送</button><button type="button" data-reaction-cancel>取消</button></div>` : '';
    let content = '';
    if (this.socialTab === 'chat') content = `<div class="social-chat-compose"><input id="chat-input" maxlength="200" placeholder="说点什么…" value="${escapeHtml(this.chatDraft)}" /><button id="btn-chat" type="button">发送</button></div>`;
    if (this.socialTab === 'phrases') {
      content = phrasesPanelHtml(this.phrasePage);
    }
    if (this.socialTab === 'effects' || this.socialTab === 'emoji') content = `<div class="fx-bar" aria-label="互动特效"><div class="fx-row">${items.slice(this.socialPage * perPage, (this.socialPage + 1) * perPage).join('')}</div><div class="fx-hint" id="fx-target-hint">${target ? `目标：${escapeHtml(target.nickname)}` : '选择内容 → 点击座位 → 选择数量 → 发送'}</div>${this.pager('social', this.socialPage, pages)}${picker}</div>`;
    return `<section class="social-dock" aria-label="社交互动"><div class="social-dock-tabs">${tabs.map(([id, label]) => `<button type="button" data-social-tab="${id}" class="${this.socialTab === id ? 'active' : ''}">${label}</button>`).join('')}</div>${this.socialTab ? `<div class="social-pop panel"><button type="button" class="social-close" data-social-tab="${this.socialTab}" aria-label="关闭社交">×</button>${content}</div>` : ''}</section>`;
  }

  private pager(area: string, page: number, total: number): string {
    return `<nav class="pager"><button type="button" data-page="${area}" data-delta="-1" ${page <= 0 ? 'disabled' : ''}>‹</button><span>${page+1} / ${Math.max(1,total)}</span><button type="button" data-page="${area}" data-delta="1" ${page >= total-1 ? 'disabled' : ''}>›</button></nav>`;
  }

  /** 6F-5 聊天/日志折叠面板（默认折叠；DOM 常驻，关闭态由 details 原生折叠） */
  private chatLogPanel(v: PlayerView | null): string {
    // 6G-4b(M4)：空态提示，避免大面积空白
    const chatHtml = this.chat.length > 0
      ? this.chat.slice(Math.max(0, this.chat.length - (this.historyPage+1)*5), Math.max(0, this.chat.length - this.historyPage*5))
          .map((c) => `<div><b>${escapeHtml(c.nickname)}</b>: ${escapeHtml(c.text)}</div>`)
          .join('')
      : '<div class="chat-empty">暂无消息，来说第一句话吧</div>';
    const logHtml = v
      ? v.events
          .slice(Math.max(0, v.events.length-(this.historyPage+1)*5), Math.max(0,v.events.length-this.historyPage*5))
          .map((e) => `<div class="ev" title="${escapeHtml(e.type)}">${escapeHtml(eventLabel(e, v))}</div>`)
          .join('')
      : '';
    const reactionLogs = this.reactionLogs.length > 0
      ? this.reactionLogs.slice(Math.max(0,this.reactionLogs.length-(this.historyPage+1)*5),Math.max(0,this.reactionLogs.length-this.historyPage*5)).map((x) => `<div class="ev reaction-log-entry">${escapeHtml(x)}</div>`).join('')
      : '<div class="chat-empty">暂无互动记录</div>';
    return `<details class="panel chat chat-panel collapsed-panel" id="chat-log-panel"${this.chatPanelOpen ? ' open' : ''}>
      <summary>记录${this.unread ? ` · ${this.unread}` : ''}</summary>
      <button type="button" id="btn-toggle-log" class="muted">展开/收起</button>
      <nav class="chat-tabs" aria-label="聊天日志互动">
        <button type="button" data-chat-tab="chat" class="${this.chatTab === 'chat' ? 'active' : ''}">聊天</button>
        <button type="button" data-chat-tab="log" class="${this.chatTab === 'log' ? 'active' : ''}">日志</button>
        <button type="button" data-chat-tab="reaction" class="${this.chatTab === 'reaction' ? 'active' : ''}">互动</button>
      </nav>
      <div class="chat-pane${this.chatTab === 'chat' ? ' active' : ''}" data-chat-pane="chat">
        <div class="chat-log" id="chat-log">${chatHtml}</div>${!v ? `<div class="social-chat-compose"><input id="chat-input" maxlength="200" placeholder="说点什么…" value="${escapeHtml(this.chatDraft)}" /><button id="btn-chat" type="button">发送</button></div>` : ''}
      </div>
      <div class="chat-pane${this.chatTab === 'log' ? ' active' : ''}" data-chat-pane="log">
        ${v ? `<h3 class="log-title">对局日志</h3><div class="log" id="game-log">${logHtml}</div>` : ''}
      </div>
      <div class="chat-pane${this.chatTab === 'reaction' ? ' active' : ''}" data-chat-pane="reaction">
        <div class="reaction-log">${reactionLogs}</div>
      </div>
      ${this.pager('history',this.historyPage,Math.ceil((this.chatTab === 'chat' ? this.chat.length : this.chatTab === 'log' ? v?.events.length ?? 0 : this.reactionLogs.length)/5))}
    </details>`;
  }

  /**
   * 6F-3 中央公共出牌区：本 round 全部 night.cardsDeclared 按 phase 分组，
   * 当前阶段高亮、过往半透明，每牌署名 + mini 正面。
   * TODO(6F-1 deferred)：掘墓人 play_now 即时带出的牌只进 revealedInPlay、
   * 不发 cardsDeclared（resolve.ts L656-672），此处缺署名映射，需 core 在
   * revealed 卡上补 actorSeatId/phase 元数据后接入。
   */
  private centralArea(v: PlayerView): string {
    const groups = new Map<
      string,
      Array<{ actorSeatId: string; cardId: string; instanceId: string }>
    >();
    for (const e of v.events) {
      if (e.type !== 'night.cardsDeclared' || e.round !== v.round) continue;
      const p = e.payload as
        | {
            phase?: string;
            cards?: Array<{ actorSeatId: string; cardId: string; instanceId: string }>;
          }
        | undefined;
      const phase = typeof p?.phase === 'string' ? p.phase : 'unknown';
      if (!groups.has(phase)) groups.set(phase, []);
      groups.get(phase)!.push(...(p?.cards ?? []));
    }
    const orderOf = (ph: string): number => {
      const i = CENTRAL_PHASE_ORDER.indexOf(ph);
      return i >= 0 ? i : 99;
    };
    // 过往空组（无人打出的阶段）不占位；当前阶段即使为空也保留并给空提示
    const phases = [...groups.keys()]
      .filter((ph) => ph === v.phase || (groups.get(ph) ?? []).length > 0)
      .sort((a, b) => orderOf(a) - orderOf(b));
    if (phases.length === 0) {
      // 牌堆只在发牌阶段的空中央区渲染（发牌动画起点）；有打出牌或非发牌阶段不渲染，杜绝遮挡
      const pile = v.phase.startsWith('draft') ? `<div class="draw-pile-container"><img class="draw-pile-image" src="${getDrawPilePath()}" alt="牌堆" /></div>` : '';
      return `<section class="central" aria-label="中央公共出牌区"><h3>中央公共出牌区</h3>${pile}<div class="central-empty">本轮暂无打出</div></section>`;
    }
    const phase = phases.includes(this.centralPhase) ? this.centralPhase : phases.includes(v.phase) ? v.phase : phases[phases.length - 1];
    const cards = groups.get(phase) ?? [];
    const pageCount = Math.max(1, Math.ceil(cards.length / 4));
    this.centralPage = Math.min(this.centralPage, pageCount - 1);
    const items = cards.slice(this.centralPage * 4, (this.centralPage + 1) * 4).map(c => `<span class="played-item" data-actor-seat="${escapeHtml(c.actorSeatId)}"><span class="played-who">${escapeHtml(seatName(v, c.actorSeatId))} · ${escapeHtml(getCardDisplayName(c.cardId))}</span>${renderCardHtml(c.cardId, c.instanceId, false, 'mini')}</span>`).join('');
    const phaseNav = `<nav class="central-nav" aria-label="阶段筛选">${phases.map(ph => `<button type="button" data-central-phase="${escapeHtml(ph)}" class="${phase === ph ? 'active' : ''}">${escapeHtml(phaseLabel(ph))}</button>`).join('')}</nav>`;
    return `<section class="central" aria-label="中央公共出牌区"><h3>中央公共出牌区</h3>${phaseNav}<div class="phase-group${phase === v.phase ? ' now' : ' past'}" data-phase="${escapeHtml(phase)}"><h4 class="phase-group-title">${escapeHtml(phaseLabel(phase))}${phase === v.phase ? ' · 进行中' : ''}</h4><div class="cards-row">${items || '<div class="central-empty">本阶段暂无打出</div>'}</div></div>${pageCount > 1 ? this.pager('central', this.centralPage, pageCount) : ''}</section>`;
  }

  private pendingPanel(pending: PendingDecision | null): string {
    if (!pending) return `<div class="pending">等待其他玩家…</div>`;
    const v = this.view;
    let opts = '';

    if (pending.kind === 'draftPick' || pending.kind === 'draftDiscard') {
      opts = pending.options
        .map((o: string) => {
          const card =
            v?.self.draftHand?.find((c) => c.instanceId === o) ??
            v?.self.hand.find((c) => c.instanceId === o);
          if (card) {
            return renderCardHtml(card.cardId, card.instanceId, true, 'opt', o);
          }
          return `<button class="card opt" data-opt="${escapeHtml(o)}" data-iid="${escapeHtml(o)}" type="button">
            <div class="card-inner">
              <div class="card-placeholder">
                <span class="card-placeholder-text">${escapeHtml(o)}</span>
              </div>
            </div>
          </button>`;
        })
        .join('');
    } else if (pending.kind === 'declareCards') {
      opts = ''; // Select the actual hand; no duplicate row of candidate cards.
    } else if (pending.kind === 'chooseTarget') {
      opts = pending.options
        .map((o: string) => {
          const s = v?.seats.find((st) => st.seatId === o);
          if (s) {
            const name = `${s.nickname} (${o})`;
            return `<button class="opt" data-opt="${escapeHtml(o)}" type="button">${escapeHtml(name)}</button>`;
          }
          // 非座位选项（如掘墓人 gravePick 的牌实例）：按卡面渲染，不再裸显 id
          const grave = pending.context.graveChoices?.find((g) => g.instanceId === o);
          if (grave) {
            return renderCardHtml(grave.cardId, o, true, 'opt', o);
          }
          return `<button class="card opt" data-opt="${escapeHtml(o)}" data-iid="${escapeHtml(o)}" type="button">
            <div class="card-inner">
              <div class="card-placeholder">
                <span class="card-placeholder-text">未知牌</span>
              </div>
            </div>
          </button>`;
        })
        .join('');
    } else if (pending.kind === 'reactDecide') {
      // 6G-4b(R1)：服务端 options 为 ['react','decline']，直出会裸显英文且点"react"误发 decline；
      // 此处压住通用渲染，只用下方专用的发动/放弃对（data-opt 保持 __true/__false 不动）。
      opts = '';
    } else {
      opts = pending.options
        .map((o: string) => `<button class="opt" data-opt="${escapeHtml(o)}" type="button">${escapeHtml(optLabel(o, v))}</button>`)
        .join('');
    }

    const kindLabel: Record<string, string> = {
      draftPick: '选一张留下（点击卡面确认）',
      draftDiscard: '弃一张（点击卡面确认）',
      declareCards: '拖动手牌到玩家或中央出牌，也可点选后确认',
      chooseTarget: '直接点击高亮座位，或将中央技能牌拖向目标',
      chooseOptional: '可选决策',
      reactDecide: '是否发动反应？',
      merchantChoose: '商人：查看身份或令牌（必选）',
      merchantExchange: '商人：交换令牌（可放弃）',
    };

    return `
      <div class="pending">
        <div>待你决策：${kindLabel[pending.kind] ?? pending.kind}</div>
        <div class="row opts">${opts}</div>
        ${pending.kind === 'declareCards' ? `<div class="row declare-actions" style="margin-top: 10px;"><button id="btn-declare" type="button" class="btn-primary">确认打出选中 (${this.selected.size})</button><button id="btn-pass" type="button" class="muted">跳过</button></div>` : ''}
        ${pending.kind === 'reactDecide' ? `<button class="opt" data-opt="__true" type="button">发动</button><button class="opt" data-opt="__false" type="button">放弃</button>` : ''}
      </div>
    `;
  }

  private selected = new Set<string>();

  private bind(): void {
    const $ = (sel: string) => this.root.querySelector(sel);
    $('#btn-create')?.addEventListener('click', () => {
      const nick = (this.root.querySelector('#nick') as HTMLInputElement)?.value ?? '';
      const key = (this.root.querySelector('#llm-api-key') as HTMLInputElement)?.value ?? '';
      this.net.createRoom(nick, key || undefined);
    });
    $('#llm-api-key')?.addEventListener('input', (e) => {
      this.createLlmDraftKey = (e.target as HTMLInputElement).value;
    });
    $('#btn-join')?.addEventListener('click', () => {
      const nick = (this.root.querySelector('#nick') as HTMLInputElement)?.value ?? '';
      const code = (this.root.querySelector('#code') as HTMLInputElement)?.value ?? '';
      this.net.joinRoom(code, nick);
    });
    $('#btn-help')?.addEventListener('click', () => {
      this.helpOpen = true;
      this.render();
    });
    $('#btn-ready')?.addEventListener('click', () => this.net.setReady(true));
    $('#btn-start')?.addEventListener('click', () => {
      const raw = (this.root.querySelector('#seed-input') as HTMLInputElement)?.value ?? '';
      this.pendingSeed = raw;
      const seed = parseGameSeed(raw === '' ? undefined : raw);
      this.net.startRoom(seed ?? undefined);
    });
    $('#seed-input')?.addEventListener('input', (e) => {
      this.pendingSeed = (e.target as HTMLInputElement).value;
    });
    $('#btn-llm-save')?.addEventListener('click', () => {
      const key = this.llmDraftKey.trim();
      if (!key) { this.showToast('请输入新的 key；如需撤回请点击“撤回房主 key”'); return; }
      void this.net.configureLlm(key).then((r) => {
        if (r.ok) {
          this.llmSource = r.source; this.llmEnabled = r.enabled; this.llmHasRoomKey = r.hasRoomKey; this.llmStatusLoaded = true;
          this.llmDraftKey = ''; this.llmPanelOpen = true; this.showToast('LLM 配置已保存'); this.render();
        } else this.showToast(`LLM 配置失败：${r.reasonCode}`);
      });
    });
    $('#btn-llm-clear')?.addEventListener('click', () => {
      void this.net.configureLlm(null).then((r) => {
        if (r.ok) {
          this.llmSource = r.source; this.llmEnabled = r.enabled; this.llmHasRoomKey = r.hasRoomKey; this.llmStatusLoaded = true;
          this.llmDraftKey = ''; this.llmPanelOpen = true; this.showToast('房主 key 已撤回'); this.render();
        } else this.showToast(`撤回失败：${r.reasonCode}`);
      });
    });
    $('#llm-room-key')?.addEventListener('input', (e) => {
      this.llmDraftKey = (e.target as HTMLInputElement).value;
    });
    $('#btn-add-bot')?.addEventListener('click', () => this.net.addBot());
    $('#btn-remove-bot')?.addEventListener('click', () => this.net.removeBot());
    $('#btn-fa')?.addEventListener('click', () => {
      this.showToast('已发送强制推进请求…');
      this.net.forceAdvance();
    });
    $('#btn-leave-room')?.addEventListener('click', () => {
      this.voiceClient?.leave();
      this.voiceSeats = [];
      this.voiceNotice = '';
      this.resetSocialUi();
      this.net.leaveRoom();
      this.view = null;
      this.presence = null;
      this.resetIdentityUi();
      this.presenter.clear();
      this.revealSteps = [];
      this.revealIdx = 0;
      this.revealKey = '';
      this.stampedSeats.clear();
      this.stampedRound = 0;
      this.soundPrimed = false;
      this.achieve.resetGame();
      this.hideHighlight();
      this.audio.stopBgm();
      this.render();
    });
    // 6G-1 语音三键（降级时 client 内部消化，不抛错）
    $('#btn-voice-join')?.addEventListener('click', () => {
      if (this.voiceStatus === 'active') {
        this.voiceClient?.leave();
        this.voiceSeats = [];
      } else {
        void this.voiceClient?.join();
      }
    });
    $('#btn-voice-mute')?.addEventListener('click', () => {
      const vc = this.voiceClient;
      if (vc) vc.setMuted(!vc.muted);
    });
    $('#btn-voice-listen')?.addEventListener('click', () => {
      const vc = this.voiceClient;
      if (vc) {
        vc.setListening(!vc.listening);
        this.render();
      }
    });
    $('#btn-voice-speech')?.addEventListener('click', () => {
      this.phraseTts.toggle();
      this.render();
    });
    // 6G-2 点击走根委托（见 mount 内 onRootClick），此处不逐个绑定。
    // 6F-4：身份弹窗点击关闭（宿主常驻，防重复绑定；backdrop 穿透不挡 e2e/游戏点击）
    const identityModal = $('#identity-modal') as HTMLElement | null;
    if (identityModal && !identityModal.dataset['bound']) {
      identityModal.dataset['bound'] = '1';
      identityModal.addEventListener('click', () => this.closeIdentityModal());
    }
    // 6H-3 成就面板显隐（新选择器）
    $('#btn-achieve')?.addEventListener('click', () => {
      this.achievePanelOpen = !this.achievePanelOpen;
      const panel = this.root.querySelector('#achieve-panel');
      if (panel) panel.toggleAttribute('hidden', !this.achievePanelOpen);
    });
    // 6H-1 音效设置：面板显隐 + 开关 + 音量 + 试听（新选择器，不碰旧 e2e）
    $('#btn-sound')?.addEventListener('click', () => {
      this.audioPanelOpen = !this.audioPanelOpen;
      const panel = this.root.querySelector('#audio-panel');
      if (panel) panel.toggleAttribute('hidden', !this.audioPanelOpen);
    });
    $('#sound-enabled')?.addEventListener('change', (ev) => {
      const on = (ev.target as HTMLInputElement).checked;
      this.audio.setEnabled(on);
      // 只换图标，不整页重渲染（避免面板被收起）
      const btn = this.root.querySelector('#btn-sound');
      if (btn) btn.textContent = on ? '🔊' : '🔇';
    });
    $('#sound-volume')?.addEventListener('input', (ev) => {
      this.audio.setVolume(Number((ev.target as HTMLInputElement).value) / 100);
    });
    // 6H-2 BGM 独立开关 + 音量（新选择器）
    $('#bgm-enabled')?.addEventListener('change', (ev) => {
      const on = (ev.target as HTMLInputElement).checked;
      void this.audio.ensure().then(() => this.audio.setBgmEnabled(on));
    });
    $('#bgm-volume')?.addEventListener('input', (ev) => {
      this.audio.setBgmVolume(Number((ev.target as HTMLInputElement).value) / 100);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-sfx-test]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.dataset['sfxTest'] as SfxName | undefined;
        if (!name) return;
        void this.audio.ensure().then((ok) => {
          if (ok) this.audio.play(name, name === 'effect-send' ? 'bright' : 'soft');
        });
      });
    });
    // 6F-4：自家卡背翻转（先播 250ms 动画再同步重渲染，更新身份名显隐）
    this.root.querySelectorAll<HTMLElement>('.flip-wrap[data-peek]').forEach((el) => {
      el.addEventListener('click', () => {
        el.classList.toggle('show-front');
        this.housePeek = el.classList.contains('show-front');
        el.setAttribute('title', this.housePeek ? '点击盖回' : '点击查看身份');
        window.setTimeout(() => this.render(), 300);
      });
    });
    // 自家手牌窥视：点座位暗牌只看刚拿到的 1 张（纯本地，无网络，他人不可见）
    this.root.querySelectorAll<HTMLElement>('.seat-card.self .hand-stack[data-hand-peek]').forEach((el) => {
      const open = () => {
        const v = this.view;
        if (!v) return;
        const newest = this.newestSelfCard(v);
        if (!newest) {
          this.showToast('暂无新手牌');
          return;
        }
        this.handPeekIid = newest.instanceId;
        this.render();
      };
      el.addEventListener('click', open);
      el.addEventListener('keydown', (ev) => {
        if ((ev as KeyboardEvent).key === 'Enter' || (ev as KeyboardEvent).key === ' ') {
          ev.preventDefault();
          open();
        }
      });
    });
    this.root.querySelector('#hand-peek-modal[data-hand-peek-close]')?.addEventListener('click', () => {
      this.handPeekIid = null;
      this.render();
    });
    // 6F-4：点座位区外部盖回身份
    this.root.querySelector('.table')?.addEventListener('click', (ev) => {
      if (!this.housePeek) return;
      const t = ev.target as HTMLElement | null;
      if (t?.closest?.('.flip-wrap')) return;
      this.housePeek = false;
      this.render();
    });
    $('#btn-game-over-lobby')?.addEventListener('click', () => {
      this.net.endGame();
    });
    $('#btn-next-round')?.addEventListener('click', () => {
      this.showToast('正在进入下一轮…');
      this.net.forceAdvance();
    });
    $('#chat-input')?.addEventListener('input', ev => { this.chatDraft = (ev.target as HTMLInputElement).value; });
    $('#chat-input')?.addEventListener('keydown', ev => { if ((ev as KeyboardEvent).key === 'Enter') this.root.querySelector<HTMLButtonElement>('#btn-chat')?.click(); });
    $('#btn-chat')?.addEventListener('click', () => {
      const input = this.root.querySelector('#chat-input') as HTMLInputElement | null;
      if (input?.value) {
        this.net.sendChat(input.value);
        input.value = '';
        this.chatDraft = '';
      }
    });
    $('#btn-pass')?.addEventListener('click', () => {
      const v = this.view;
      if (!v) return;
      this.net.sendCommand(v.windowId, 'night.passPhase', {});
    });
    $('#btn-declare')?.addEventListener('click', () => {
      const v = this.view;
      if (!v) return;
      if (this.selected.size === 0) {
        this.showToast('请先点击卡面选择要打出的牌，或直接点击「跳过」');
        return;
      }
      this.rememberPlayOrigins();
      this.net.sendCommand(v.windowId, 'night.declare', {
        cardInstanceIds: [...this.selected],
      });
      this.selected.clear();
    });
    $('#btn-end')?.addEventListener('click', () => this.net.endGame());
    $('#btn-toggle-log')?.addEventListener('click', () => {
      const d = this.root.querySelector<HTMLDetailsElement>('#chat-log-panel');
      if (d) {
        d.open = !d.open;
        this.chatPanelOpen = d.open;
      }
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-chat-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset['chatTab'];
        if (tab === 'chat' || tab === 'log' || tab === 'reaction') {
          this.chatTab = tab;
          this.historyPage = 0;
          this.chatPanelOpen = true;
          this.render();
        }
      });
    });
    this.root.querySelector<HTMLDetailsElement>('#chat-log-panel')?.addEventListener('toggle', (ev) => {
      const details = ev.currentTarget as HTMLDetailsElement;
      if (!details.isConnected) return;
      this.chatPanelOpen = details.open;
      if (details.open) this.unread = 0;
    });
    this.root.querySelector<HTMLDetailsElement>('#phrase-panel')?.addEventListener('toggle', (ev) => {
      this.phrasePanelOpen = (ev.currentTarget as HTMLDetailsElement).open;
    });
    this.root.querySelectorAll<HTMLButtonElement>('.kick[data-seat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const seat = btn.dataset['seat'];
        if (seat) this.net.kickSeat(seat);
      });
    });

    // 手牌区与声明待决策区可勾选多选状态（打出声明用）
    const toggleCardSelection = (id: string) => {
      if (this.selected.has(id)) {
        this.selected.delete(id);
      } else {
        this.selected.add(id);
      }
      this.root.querySelectorAll<HTMLElement>(`[data-iid="${id}"]`).forEach((el) => {
        el.classList.toggle('sel', this.selected.has(id));
      });
      const btnDeclare = this.root.querySelector<HTMLButtonElement>('#btn-declare');
      if (btnDeclare) {
        btnDeclare.textContent = `确认打出选中 (${this.selected.size})`;
      }
    };

    this.root.querySelectorAll<HTMLButtonElement>('.hand .card[data-iid]:not(.dim), .pending .declare-opt[data-iid]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset['iid'];
        if (id) toggleCardSelection(id);
      });
      // 双击取消选中（移动端）
      btn.addEventListener('dblclick', () => {
        const id = btn.dataset['iid'];
        if (id && this.selected.has(id)) toggleCardSelection(id);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('.opt[data-opt]:not(.declare-opt)').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = this.view;
        const pending = v?.pendingDecision;
        if (!v || !pending) return;
        const opt = btn.dataset['opt'] ?? '';
        if (pending.kind === 'chooseOptional') {
          // 显式映射表（kill/swap/reveal → true；spare/keep/hide → false）。
          // 新增 options 必须在此表登记，禁止 __true 暗语。
          const choose = CHOOSE_OPTIONAL_TRUE.has(opt);
          this.net.sendCommand(v.windowId, 'night.chooseOptional', { choose });
          return;
        }
        if (pending.kind === 'reactDecide') {
          const react = opt === '__true';
          this.net.sendCommand(v.windowId, 'react.decide', { react });
          return;
        }
        if (
          pending.kind === 'chooseTarget' ||
          pending.kind === 'merchantChoose' ||
          pending.kind === 'merchantExchange'
        ) {
          // 6H-1：目标选择"叮"
          this.audio.play('target-pick');
          this.net.sendCommand(v.windowId, 'night.chooseTarget', { targetSeatId: opt });
          return;
        }
        if (pending.kind === 'draftPick') {
          this.net.sendCommand(v.windowId, 'draft.pick', { cardInstanceId: opt });
          return;
        }
        if (pending.kind === 'draftDiscard') {
          this.net.sendCommand(v.windowId, 'draft.discard', { cardInstanceId: opt });
        }
      });
    });
  }
}

function phaseLabel(phase: string): string {
  return PHASE_CN[phase] ?? phase;
}

type PlayerCountBucket = '4-5' | '6-7' | '8-9' | '10-11';

function playerCountBucket(count: number): PlayerCountBucket {
  if (count >= 10) return '10-11';
  if (count >= 8) return '8-9';
  if (count >= 6) return '6-7';
  return '4-5';
}

function ringPositions(_bucket: PlayerCountBucket, count: number): string[] {
  const tops = count <= 4 ? count-2 : count <= 6 ? 3 : count <= 8 ? 4 : 5;
  return [...Array.from({length:Math.max(0,tops)},(_,i)=>`top-${i+1}`),'left-1','right-1',...Array.from({length:3},(_,i)=>`bottom-${i+1}`)].slice(0,count);
}

/** 6H-1：音效试听按钮中文名 */
function sfxCn(n: string): string {
  const map: Record<string, string> = {
    'card-play': '出牌',
    'card-reveal': '翻开',
    'target-pick': '选目标',
    'view-success': '查看',
    kill: '击杀',
    'self-die': '死亡',
    'token-gain': '令牌',
    'phase-change': '阶段',
    'round-win': '本轮胜',
    'game-win': '整局胜',
    'effect-send': '砸物',
  };
  return map[n] ?? n;
}

/**
 * chooseOptional 选项 → boolean 显式映射（Q4 裁定）。
 * true 侧：kill（上忍击杀）/ swap（百变者交换）/ reveal（捣蛋鬼公开）；
 * 其余（spare/keep/hide 等）一律 false。新增 options 必须在此登记。
 */
const CHOOSE_OPTIONAL_TRUE = new Set(['kill', 'swap', 'reveal', 'play_now']);

function optLabel(o: string, v?: PlayerView | null): string {
  if (o === 'view_honor') return '查看令牌';
  if (o === 'view_house') return '查看身份';
  if (o === 'play_now') return '立即打出';
  if (o === 'reserve') return '预留';
  if (o === 'swap') return '交换';
  if (o === 'no_swap') return '不交换';
  if (o === 'seen') return '刚看的那枚';
  if (o === 'random') return '随机一枚';
  if (o === 'keep' || o === 'no' || o === 'hide' || o === 'spare') return '否';
  if (o === 'kill') return '击杀';
  if (o === 'reveal') return '公开';
  if (o.startsWith('s') && v) {
    const s = v.seats.find((st) => st.seatId === o);
    if (s) return `${s.nickname} (${o})`;
  }
  if (v) {
    const allCards = [
      ...v.self.hand,
      ...v.self.reserved,
      ...(v.self.draftHand ?? []),
      ...(v.revealedCards ?? []),
    ];
    const foundCard = allCards.find((c) => c.instanceId === o);
    if (foundCard) {
      return getCardDisplayName(foundCard.cardId);
    }
  }
  if (o.startsWith('tok-') || o.startsWith('t') || o.startsWith('x')) return `令牌 ${o.replace(/^(tok-|t-|x-)/, '')}`;
  return o;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cssEscape(s: string): string {
  const esc = (globalThis as { CSS?: { escape?: (value: string) => string } }).CSS?.escape;
  return esc ? esc(s) : s.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function seatName(v: PlayerView, seatId: string): string {
  const s = v.seats.find((st) => st.seatId === seatId);
  return s ? `${s.nickname} (${seatId})` : seatId;
}

function winnerLabel(winner: unknown): string {
  if (winner === 'crane') return '仙鹤';
  if (winner === 'lotus') return '莲花';
  if (winner === 'tie') return '平局（存活者各得）';
  if (winner === 'none') return '无人获胜';
  if (winner === 'mastermind_ronin') return '浪人（大将军）';
  return String(winner ?? '未知');
}

/** 本轮横幅：得主 + 获奖名单（只用公开的枚数，不碰面值） */
function roundLabel(e: GameEvent, v: PlayerView): string {
  const p = e.payload as { winner?: unknown; awarded?: Array<{ seatId: string; count: number }> };
  const awarded = p.awarded ?? [];
  const mine = awarded.find((a) => a.seatId === v.self.seatId)?.count ?? 0;
  const names = awarded.map((a) => seatName(v, a.seatId)).join('、');
  return `本轮：${winnerLabel(p.winner)}获胜${names ? `；获奖：${names}（各 +1 枚）` : ''}${mine > 0 ? `，你 +${mine} 枚` : ''}`;
}

/** 终局排名：取 score.victory 公开总分排序（Q5：只显示总分，不显示面值明细） */
function rankingHtml(v: PlayerView, victoryEv?: GameEvent): string {
  const scores = (victoryEv?.payload as { scores?: Array<{ seatId: string; score: number }> } | undefined)
    ?.scores;
  if (!scores || scores.length === 0) return '';
  const rows = [...scores]
    .sort((a, b) => b.score - a.score)
    .map(
      (s, i) =>
        `<tr><td>${i + 1}</td><td>${escapeHtml(seatName(v, s.seatId))}</td><td>${s.score} 分</td></tr>`,
    )
    .join('');
  return `<table class="rank-table"><tbody>${rows}</tbody></table>`;
}

/** 日志中文友好行；未知类型回退全量 JSON（不再截断，超长由 CSS 省略） */
function eventLabel(e: GameEvent, v: PlayerView): string {
  const p = e.payload as Record<string, unknown>;
  const sid = (k: string): string => seatName(v, String(p[k] ?? ''));
  switch (e.type) {
    case 'game.started':
      return '对局开始';
    case 'draft.cardPicked':
      return `${sid('seatId')} 选牌`;
    case 'draft.cardDiscarded':
      return `${sid('seatId')} 弃牌`;
    case 'draft.passed':
      return '传牌（左手）';
    case 'night.phaseStarted':
      return `进入阶段：${phaseLabel(String(p['phase'] ?? ''))}`;
    case 'night.playerDied':
      return `💀 ${sid('seatId')} 出局`;
    case 'night.optionalResolved':
      return 'killed' in p
        ? `${sid('actorSeatId')} 选择了${p['killed'] ? '击杀' : '放过'}`
        : `${sid('actorSeatId')} 作出可选决策`;
    case 'night.targetChosen': {
      const card = typeof p['cardId'] === 'string' ? `（${getCardDisplayName(p['cardId'])}）` : '';
      return `${sid('actorSeatId')}${card}查看了 ${sid('targetSeatId')} 的身份`;
    }
    case 'night.cardResolved': {
      const who = 'actorSeatId' in p ? sid('actorSeatId') : '有人';
      const cn = typeof p['cardId'] === 'string' ? getCardDisplayName(p['cardId']) : '牌';
      return `${who} 的 ${cn} 结算完毕`;
    }
    case 'night.houseViewed': {
      if (p['view'] === 'honor') return `👁 ${sid('targetSeatId')} → 令牌面值 ${String(p['honorFace'] ?? '')}`;
      if (Array.isArray(p['seats']) && Array.isArray(p['houses'])) {
        const houses = p['houses'];
        return p['seats'].map((id, i) => `${seatName(v, String(id))} → ${getHouseDisplayName(String(houses[i] ?? ''))}`).join('；');
      }
      const via = typeof p['viaCardId'] === 'string' ? ` · 借由 ${getCardDisplayName(p['viaCardId'])}` : '';
      return `👁 ${sid('targetSeatId')} → ${getHouseDisplayName(String(p['houseId'] ?? ''))}${via}`;
    }
    case 'night.ninjaViewed':
      return `👁 ${sid('targetSeatId')} 的忍者牌 → ${getCardDisplayName(String(p['cardId'] ?? ''))}`;
    case 'night.cardsDeclared': {
      const cards =
        (p['cards'] as Array<{ actorSeatId: string; cardId: string }> | undefined) ?? [];
      if (cards.length === 0) return '本阶段无人打出';
      return cards
        .map((c) => `${seatName(v, c.actorSeatId)} 打出了 ${getCardDisplayName(c.cardId)}`)
        .join('、');
    }
    case 'house.revealed': {
      const h = typeof p['houseId'] === 'string' ? getHouseDisplayName(p['houseId']) : '';
      return `👁 ${sid('seatId')} 亮出身份${h ? `：${h}` : ''}`;
    }
    case 'score.honorAwarded':
      if ('tokenValue' in p) return `🎖 你获得 1 枚令牌（${String(p['tokenValue'])} 分）`;
      if ('swapped' in p) return `🔄 ${sid('a')} 与 ${sid('b')} 交换了令牌`;
      if ('from' in p) return `🥷 ${sid('to')} 从 ${sid('from')} 处夺得 1 枚令牌`;
      return `令牌变动：${JSON.stringify(p)}`;
    case 'score.roundWinner': {
      const aw = (p['awarded'] as Array<{ seatId: string; count: number }> | undefined) ?? [];
      const detail = aw.map((a) => `${seatName(v, a.seatId)}+${a.count}`).join('、');
      return `🏆 本轮：${winnerLabel(p['winner'])}获胜${detail ? `（${detail}）` : ''}`;
    }
    case 'score.victory': {
      const w = (p['winners'] as string[] | undefined) ?? [];
      return `🏆 整局结束：${w.map((id) => seatName(v, id)).join('、') || '无'}获胜`;
    }
    case 'react.opened':
      return '⚔ 有人受到致命威胁（反应窗开启）';
    case 'react.resolved':
      return '⚔ 反应结算';
    default:
      return `${e.type} ${JSON.stringify(p)}`;
  }
}

export type { NinjaCardInstanceView };
