import type {
  PresencePayload,
  ChatEventPayload,
  VoiceSeatState,
  EffectBatchItem,
  MarkPair,
} from '../shared/protocol';
import { MARK_PER_SEAT_MAX } from '../shared/timeouts';
import type { ConnectionStatus, GameNet } from '../net/client';
import { VoiceNet } from '../net/voice';
import { EffectNet } from '../net/effects';
import { SocialNet } from '../net/social';
import { VoiceClient, type VoiceClientStatus } from './voice/client';
import { micBadge } from './voice/icons';
import { AudioManager, SFX_NAMES, effectTimbre, type SfxName } from './audio';
import { voiceBannerHtml, voiceBarHtml } from './voice/controls';
import { EFFECT_ITEMS, QUICK_EMOJIS, getEffectItem, isQuickEmoji } from './effects/items';
import { EffectLayer } from './effects/particles';
import { markBadge, markButton, myMarkedTargets } from './social/marks';
import { phrasesPanelHtml, phraseToastText } from './social/phrases';
import type { PlayerView, PendingDecision, NinjaCardInstanceView, GameEvent } from '../shared/types';
import {
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
    img.src = `/assets/visuals/${v}.webp`;
  }
  const uiAssets = [
    '/assets/ui/lobby-bg.webp',
    '/assets/ui/table-texture.webp',
    '/assets/ui/button-primary.webp',
    '/assets/tokens/honor-token.webp',
    '/assets/visuals/ninja-card-back.webp',
    '/assets/visuals/house-card-back.webp',
    '/assets/ui/table-emblem.webp',
    '/assets/ui/washi-central-bg.webp',
    '/assets/ui/identity-modal-bg.webp',
  ];
  for (const u of uiAssets) {
    const img = new Image();
    img.src = u;
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
  /** 6F-4 身份窥视：点击自家卡背翻转查看（纯本地），再点/点外部盖回 */
  private housePeek = false;
  /** 6G-1 语音：房间级状态（ seatToken 鉴权后的 voice.state 快照），纯展示层 */
  private voiceNet: VoiceNet | null = null;
  private voiceClient: VoiceClient | null = null;
  private voiceSeats: VoiceSeatState[] = [];
  private voiceNotice = '';
  private voiceSupported = false;
  private voiceStatus: VoiceClientStatus = 'idle';
  /** 6H-1 音效（本地合成，不经 server） */
  private audio = new AudioManager();
  private lastSoundSeq = 0;
  private lastSoundPhase = '';
  private soundPrimed = false;
  /** 6H-1：音效面板显隐（字段保持，避免重渲染丢失） */
  private audioPanelOpen = false;
  /** 6G-2 互动特效 + 怀疑标记（纯社交层；状态以服务端广播为准，本地只存快照） */
  private effectNet: EffectNet | null = null;
  private socialNet: SocialNet | null = null;
  private fxLayer: EffectLayer | null = null;
  private marks: MarkPair[] = [];
  private fxTarget = '';
  /** 座位卡抖动：seatId → 命中时间戳（render 时超 350ms 的修剪，避免重渲染复播） */
  private fxHit = new Map<string, number>();

  public get currentView(): PlayerView | null {
    return this.view;
  }

  constructor(root: HTMLElement, net: GameNet) {
    this.root = root;
    this.net = net;
  }

  mount(): void {
    preloadAssets();
    // 6H-1：首次交互后初始化 AudioContext（浏览器自动播放策略）
    this.audio.attachGesture(window);
    this.renderShell();
    this.net.setHandlers({
      onAck: () => {
        this.socialNet?.sync();
        this.render();
      },
      onError: (e) => {
        this.lastReject = `${e.reasonCode}${e.message ? ': ' + e.message : ''}`;
        this.showToast(`错误：${this.lastReject}`);
        this.render();
      },
      onPresence: (p) => {
        this.presence = p;
        this.socialNet?.sync();
        this.render();
      },
      onStarted: () => {
        this.lastReject = '';
        this.socialNet?.sync();
        this.render();
      },
      onTerminated: () => {
        this.view = null;
        this.selected.clear();
        this.resetIdentityUi();
        this.soundPrimed = false;
        this.audio.stopBgm();
        this.voiceClient?.leave();
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
          this.selected.clear();
        }
        if (this.view && this.view.round !== v.round) {
          this.housePeek = false;
        }
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
      },
      onChat: (c) => {
        this.chat.push(c);
        if (this.chat.length > 80) this.chat.shift();
        this.render();
      },
      onStatus: (s) => {
        this.status = s;
        this.render();
      },
      onCommandReject: (_id, reason) => {
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
      this.showToast(phraseToastText(p.nickname, p.text), 3000);
    });
    // 6G-2：根点击委托（mount 时一次）。render 会重建 #ui 内所有节点，
    // 逐个绑定会被重渲染竞态吞点击；委托挂在常驻 root 上，天然免疫。
    this.root.addEventListener('click', (ev) => this.onRootClick(ev));
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
      const meta = getEffectItem(itemId);
      if (!meta || !this.effectNet) return;
      if (!this.fxTarget) {
        this.showToast('先点一张座位卡选目标');
        return;
      }
      const target = this.fxTarget;
      // 6H-1：砸物音（按物品三类音色）
      this.audio.play('effect-send', effectTimbre(itemId));
      if (this.effectNet.send(target, itemId) === 'local-only') {
        this.renderEffectLocal(target, itemId);
      }
      return;
    }
    const phraseBtn = t.closest('[data-phrase]');
    if (phraseBtn) {
      const raw = (phraseBtn as HTMLElement).dataset['phrase'] ?? '';
      const id = Number(raw);
      if (!Number.isInteger(id) || !this.socialNet) return;
      this.socialNet.sendPhrase(id);
      return;
    }
    const emojiBtn = t.closest('[data-emoji]');
    if (emojiBtn) {
      const emojiId = (emojiBtn as HTMLElement).dataset['emoji'] ?? '';
      if (!isQuickEmoji(emojiId)) return;
      if (!this.fxTarget) {
        this.showToast('先点一张座位卡选目标');
        return;
      }
      const el = this.root.querySelector(`.seat-card[data-seat="${this.fxTarget}"]`);
      if (el) this.fxLayer?.emojiAt(el, emojiId);
      return;
    }
    const card = t.closest('.seat-card[data-seat]');
    if (card) {
      if (t.closest('button, .flip-wrap, a, input, summary')) return;
      const sid = (card as HTMLElement).dataset['seat'] ?? '';
      if (!sid) return;
      // 再点同一张取消选中
      this.fxTarget = this.fxTarget === sid ? '' : sid;
      this.render();
    }
  }

  /** 6G-2：收到特效广播 → Canvas 爆发 + 座位卡抖动 + 连击飘字（同 comboId 1.5s 内累计） */
  private onEffectBatch(items: EffectBatchItem[]): void {
    const layer = this.fxLayer;
    if (!layer) return;
    const now = Date.now();
    for (const it of items) {
      const el = this.root.querySelector(`.seat-card[data-seat="${it.targetSeatId}"]`);
      if (!el) continue;
      const meta = getEffectItem(it.itemId);
      if (!meta) continue;
      const combo = layer.combos.hit(it.comboId, now);
      // 6G-4a：连击主粒子放大至 particleMax（48px 上限），不遮挡公共区
      layer.burstAt(el, meta, combo >= 2 ? { big: true } : undefined);
      this.fxHit.set(it.targetSeatId, now);
      if (combo >= 2) layer.textAt(el, `${combo} 连击`);
    }
    this.render();
  }

  /** 6G-2：本地回退渲染（镜像限频/离线时只画本地，不发网） */
  private renderEffectLocal(targetSeatId: string, itemId: string): void {
    const layer = this.fxLayer;
    if (!layer) return;
    const el = this.root.querySelector(`.seat-card[data-seat="${targetSeatId}"]`);
    if (!el) return;
    const meta = getEffectItem(itemId);
    if (!meta) return;
    const now = Date.now();
    const combo = layer.combos.hit(`local-${targetSeatId}-${itemId}`, now);
    layer.burstAt(el, meta, combo >= 2 ? { big: true } : undefined);
    this.fxHit.set(targetSeatId, now);
    if (combo >= 2) layer.textAt(el, `${combo} 连击`);
    this.render();
  }

  private resetSocialUi(): void {
    this.marks = [];
    this.fxTarget = '';
    this.fxHit.clear();
    this.fxLayer?.clear();
  }

  private renderShell(): void {
    this.root.innerHTML = `<div class="app" id="ui"></div><div id="toast" class="toast" hidden></div>`;
  }

  private showToast(msg: string, ms = 2500): void {
    const t = this.root.querySelector('#toast');
    if (!t) return;
    t.textContent = msg;
    t.removeAttribute('hidden');
    window.setTimeout(() => t.setAttribute('hidden', ''), ms);
  }

  private ui(): HTMLElement | null {
    return this.root.querySelector('#ui');
  }

  render(): void {
    if (import.meta.env.DEV) {
      console.log('[render]', {
        viewPhase: this.view?.phase,
        domPhase: document.querySelector('.phase')?.textContent,
      });
    }
    const el = this.ui();
    if (!el) return;
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
        ? `<div class="banner warn">连接已断开。请刷新页面重新加入（首版不自动重同步）。</div>`
        : this.status === 'connecting'
          ? `<div class="banner">连接中…</div>`
          : '';
    const reject = this.lastReject
      ? `<div class="banner err">${escapeHtml(this.lastReject)}</div>`
      : '';
    const voiceBanner = voiceBannerHtml(this.voiceNotice);
    el.innerHTML = `
      ${banner}${reject}${voiceBanner}
      <header class="top">
        <div class="brand-group">
          <h1>忍者之夜</h1>
          ${this.view || this.presence ? `<span class="room">房间 <b>${this.net.roomCode ?? ''}</b></span>` : ''}
          ${this.net.seatId ? `<span class="seat">座位 <b>${this.net.seatId}</b></span>` : ''}
        </div>
        ${this.view || this.presence ? `<button id="btn-leave-room" type="button" class="muted">返回大厅</button>` : ''}
        <div class="audio-ctl">
          <button id="btn-sound" type="button" title="音效设置" aria-label="音效设置">${this.audio.enabled ? '🔊' : '🔇'}</button>
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
    `;
    this.bind();
  }

  private lobbyForm(): string {
    return `
      <section class="panel">
        <h2>加入房间</h2>
        <label>昵称 <input id="nick" maxlength="16" placeholder="1–16 字" /></label>
        <div class="row">
          <button id="btn-create" type="button">创建房间</button>
          <input id="code" maxlength="6" placeholder="6 位房间码" />
          <button id="btn-join" type="button">加入</button>
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
    }, 2500);
  }

  private closeIdentityModal(): void {
    this.identityModalOpen = false;
    if (this.identityModalTimer !== null) {
      clearTimeout(this.identityModalTimer);
      this.identityModalTimer = null;
    }
    this.render();
  }

  /** 6H-1：视图事件/阶段 → 本地音效（只播新增 seq，首快照静默记位） */
  private playViewSounds(v: PlayerView): void {
    const maxSeq = v.events.reduce((m, e) => Math.max(m, e.seq ?? 0), 0);
    if (!this.soundPrimed) {
      this.soundPrimed = true;
      this.lastSoundSeq = maxSeq;
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
    for (const e of v.events) {
      if ((e.seq ?? 0) <= this.lastSoundSeq) continue;
      this.audio.playForEvent(e.type, (e.payload ?? {}) as Record<string, unknown>, v.self.seatId);
    }
    this.lastSoundSeq = Math.max(this.lastSoundSeq, maxSeq);
  }

  private resetIdentityUi(): void {
    this.identityModalOpen = false;
    this.housePeek = false;
    if (this.identityModalTimer !== null) {
      clearTimeout(this.identityModalTimer);
      this.identityModalTimer = null;
    }
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

  /**
   * 6F-2 座位卡片：ul.seats > li 结构保留（e2e 靠 .seats li 计数/文本），
   * li 升级为 .seat-card（身份缩略 + 手牌背堆叠 + 令牌），自己置末全宽。
   */
  private seatCard(
    s: { seatId: string; nickname: string; connected: boolean; isHost: boolean; isBot?: boolean },
    v: PlayerView | null,
    isSelf: boolean,
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
    let houseImg = '';
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

    const handStack =
      inGame && !isSelf && handCount !== undefined
        ? `<span class="hand-stack" title="手牌 ${handCount} 张"><img src="${getNinjaCardBackPath()}" alt="手牌背面" /><i>×${handCount}</i></span>`
        : '';
    const tokenStack =
      inGame && tokens !== undefined
        ? `<span class="token-stack" title="令牌 ${tokens} 枚"><img src="${getHonorTokenPath()}" alt="令牌" /><i>×${tokens}</i></span>`
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
    const targetCls = inGame && !isSelf && this.fxTarget === s.seatId ? ' fx-target' : '';
    const selfId = v?.self.seatId ?? '';
    const markB = inGame ? markBadge(this.marks, s.seatId) : '';
    const markB2 = inGame && !isSelf ? markButton(this.marks, selfId, s.seatId, MARK_PER_SEAT_MAX) : '';

    return `<li class="seat-card${s.isHost ? ' host' : ''}${isBot ? ' bot' : ''}${dead ? ' dead' : ''}${isSelf ? ' self' : ''}${speakingCls}${hitCls}${targetCls}" data-seat="${escapeHtml(s.seatId)}">
      <div class="seat-head"><b>${isBot ? '🤖 ' : ''}${escapeHtml(s.nickname)}</b> <span class="seat-id">${escapeHtml(s.seatId)}</span>${s.isHost ? '👑' : ''} ${s.connected ? '●' : '○'}${mic}${markB}${isSelf ? '<em class="you">你</em>' : ''}</div>
      ${inGame ? `<div class="seat-body">${houseImg}${handStack}${tokenStack}</div>` : ''}
      ${selfMeta}
      ${metaBits.length > 0 ? `<div class="seat-meta">${metaBits.join(' ')}</div>` : ''}
      ${markB2}
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
    // 保持服务端座位顺序（e2e 靠 nth() 定位）；自己视觉置底由 CSS order + grid-column 实现
    const seats = allSeats.map((s) => this.seatCard(s, v ?? null, s.seatId === selfId)).join('');

    const pending = v?.pendingDecision;

    return `
      <div class="grid table-layout">
        <section class="panel seats-panel">
          <h2>座位</h2>
          <div class="table">
            <img class="table-emblem" src="${getTableEmblemPath()}" alt="" aria-hidden="true" />
            <ul class="seats ring">${seats}</ul>
          </div>
          ${!v ? this.lobbyControls() : ''}
          ${this.voiceBar()}
        </section>
        ${v ? this.gamePanels(v, pending ?? null) : ''}
        ${v ? this.identityModalHtml(v) : ''}
        ${this.chatLogPanel(v ?? null)}
        ${phrasesPanelHtml()}
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
    `;
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
    const self = v.self;
    // 声明窗口：仅 pending.options 内的牌可打，其余置灰且不可勾选
    const playableSet =
      pending?.kind === 'declareCards' ? new Set<string>(pending.options) : null;
    const hand = self.hand
      .map((c) => {
        const isSel = this.selected.has(c.instanceId);
        const offPhase = playableSet !== null && !playableSet.has(c.instanceId);
        const cls = `${isSel ? 'sel' : ''}${offPhase ? ' dim' : ''}`.trim();
        return renderCardHtml(c.cardId, c.instanceId, true, cls);
      })
      .join('');
    const reserved = self.reserved
      .map((c) => renderCardHtml(c.cardId, c.instanceId, false))
      .join('');
    const central = this.centralArea(v);
    const known = self.knownHouseHistory
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
        <h2>对局 <span class="phase">${escapeHtml(phaseLabel(v.phase))}</span></h2>
        ${gameOverBanner}
        ${roundBanner}
        ${nextRoundBtn}
        ${central}
        ${this.fxBarHtml(v)}
        <div class="bottom-bar">
          <div class="hand-section">
            <h3>手牌</h3>
            <div class="hand">${hand || '<i>无手牌</i>'}</div>
          </div>
          <div id="decision-zone">${this.pendingPanel(pending)}</div>
        </div>
        <div class="reserved"><b>预留：</b>${reserved || '无'}</div>
        <div class="known"><h3>已知身份</h3>${known || '无'}</div>
        <div class="row">
          ${this.net.isHost ? `<button id="btn-fa" type="button">强制推进</button>` : ''}
          ${this.net.isHost ? `<button id="btn-end" type="button" class="danger">终止本局</button>` : ''}
        </div>
        ${this.net.isHost ? this.kickButtons() : ''}
      </section>
    `;
  }

  /**
   * 6G-2b 互动条：9 物品 + 12 快捷表情（图集切图）+ 目标提示。
   * 点座位卡选目标（高亮 fx-target），再点物品发网（effect.send 批发送）；
   * 表情为本地渲染（不发网）；怀疑标记点座位卡上的 👁 按钮。选择器均为新增 data-*，不动已有选择器。
   */
  private fxBarHtml(v: PlayerView): string {
    const target = v.seats.find((s) => s.seatId === this.fxTarget);
    const hint = target ? `目标：${escapeHtml(target.nickname)}` : '先点座位卡选目标';
    const items = EFFECT_ITEMS.map(
      (m) =>
        `<button type="button" class="fx-btn" data-fx="${m.id}" title="扔${m.name}"><img src="${getItemPath(m.id)}" alt="${m.name}" draggable="false" /><i>${m.name}</i></button>`,
    ).join('');
    const emojis = QUICK_EMOJIS.map(
      (e) =>
        `<button type="button" class="fx-btn emoji" data-emoji="${e}" title="表情 ${e}"><img src="${getEmojiPath(e)}" alt="${e}" draggable="false" /></button>`,
    ).join('');
    return `<div class="fx-bar" aria-label="互动特效">
      <div class="fx-row">${items}</div>
      <div class="fx-row">${emojis}</div>
      <div class="fx-hint" id="fx-target-hint">${hint} · 怀疑标记点座位卡上的 👁</div>
    </div>`;
  }

  /** 6F-5 聊天/日志折叠面板（默认折叠；DOM 常驻，关闭态由 details 原生折叠） */
  private chatLogPanel(v: PlayerView | null): string {
    // 6G-4b(M4)：空态提示，避免大面积空白
    const chatHtml = this.chat.length > 0
      ? this.chat
          .map((c) => `<div><b>${escapeHtml(c.nickname)}</b>: ${escapeHtml(c.text)}</div>`)
          .join('')
      : '<div class="chat-empty">暂无消息，来说第一句话吧</div>';
    const logHtml = v
      ? v.events
          .slice(-40)
          .map((e) => `<div class="ev" title="${escapeHtml(e.type)}">${escapeHtml(eventLabel(e, v))}</div>`)
          .join('')
      : '';
    return `<details class="panel chat collapsed-panel" id="chat-log-panel">
      <summary>聊天/日志</summary>
      <button type="button" id="btn-toggle-log" class="muted">展开/收起</button>
      <div class="chat-log" id="chat-log">${chatHtml}</div>
      <div class="row">
        <input id="chat-input" maxlength="200" placeholder="说点什么…" />
        <button id="btn-chat" type="button">发送</button>
      </div>
      ${v ? `<h3 class="log-title">对局日志</h3><div class="log" id="game-log">${logHtml}</div>` : ''}
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
      return `<section class="central" aria-label="中央公共出牌区"><h3>中央公共出牌区</h3><div class="central-empty">本轮暂无打出</div></section>`;
    }
    const body = phases
      .map((ph) => {
        const isNow = ph === v.phase;
        const cards = groups.get(ph) ?? [];
        const items =
          cards.length > 0
            ? cards
                .map(
                  (c) =>
                    `<span class="played-item"><span class="played-who">${escapeHtml(seatName(v, c.actorSeatId))} 打出了 ${escapeHtml(getCardDisplayName(c.cardId))}</span>${renderCardHtml(c.cardId, c.instanceId, false, 'mini')}</span>`,
                )
                .join('')
            : '<div class="central-empty">本阶段暂无打出</div>';
        return `<div class="phase-group${isNow ? ' now' : ' past'}" data-phase="${escapeHtml(ph)}"><h4>${escapeHtml(phaseLabel(ph))}${isNow ? ' <span class="phase-now">进行中</span>' : ''}</h4><div class="cards-row">${items}</div></div>`;
      })
      .join('');
    return `<section class="central" aria-label="中央公共出牌区"><h3>中央公共出牌区</h3>${body}</section>`;
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
      opts = pending.options
        .map((o: string) => {
          const card = v?.self.hand.find((c) => c.instanceId === o);
          const isSel = this.selected.has(o);
          const cls = `opt declare-opt${isSel ? ' sel' : ''}`;
          if (card) {
            return renderCardHtml(card.cardId, card.instanceId, true, cls, o);
          }
          return `<button class="card opt declare-opt${isSel ? ' sel' : ''}" data-opt="${escapeHtml(o)}" data-iid="${escapeHtml(o)}" type="button">
            <div class="card-inner">
              <div class="card-placeholder">
                <span class="card-placeholder-text">${escapeHtml(o)}</span>
              </div>
            </div>
          </button>`;
        })
        .join('');
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
      declareCards: '声明打出（点击卡面选择，再点确认）或跳过',
      chooseTarget: '选择目标',
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
      this.net.createRoom(nick);
    });
    $('#btn-join')?.addEventListener('click', () => {
      const nick = (this.root.querySelector('#nick') as HTMLInputElement)?.value ?? '';
      const code = (this.root.querySelector('#code') as HTMLInputElement)?.value ?? '';
      this.net.joinRoom(code, nick);
    });
    $('#btn-ready')?.addEventListener('click', () => this.net.setReady(true));
    $('#btn-start')?.addEventListener('click', () => this.net.startRoom());
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
      this.soundPrimed = false;
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
    // 6G-2 点击走根委托（见 mount 内 onRootClick），此处不逐个绑定。
    // 6F-4：身份弹窗点击关闭（backdrop 穿透不挡 e2e/游戏点击）
    $('#identity-modal')?.addEventListener('click', () => this.closeIdentityModal());
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
    $('#btn-chat')?.addEventListener('click', () => {
      const input = this.root.querySelector('#chat-input') as HTMLInputElement | null;
      if (input?.value) {
        this.net.sendChat(input.value);
        input.value = '';
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
      this.net.sendCommand(v.windowId, 'night.declare', {
        cardInstanceIds: [...this.selected],
      });
      this.selected.clear();
    });
    $('#btn-end')?.addEventListener('click', () => this.net.endGame());
    $('#btn-toggle-log')?.addEventListener('click', () => {
      const d = this.root.querySelector<HTMLDetailsElement>('#chat-log-panel');
      if (d) d.open = !d.open;
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
const CHOOSE_OPTIONAL_TRUE = new Set(['kill', 'swap', 'reveal']);

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
    case 'night.houseViewed':
      return `👁 你查看了身份`;
    case 'night.ninjaViewed':
      return `👁 你查看了忍者牌`;
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
