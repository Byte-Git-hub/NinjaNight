import type { PresencePayload, ChatEventPayload } from '../shared/protocol';
import type { ConnectionStatus, GameNet } from '../net/client';
import type { PlayerView, PendingDecision, NinjaCardInstanceView, GameEvent } from '../shared/types';
import { getCardDisplayName, getHouseDisplayName, renderCardHtml } from './assets';

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
  public lastViewTimestamp = 0;

  public get currentView(): PlayerView | null {
    return this.view;
  }

  constructor(root: HTMLElement, net: GameNet) {
    this.root = root;
    this.net = net;
  }

  mount(): void {
    preloadAssets();
    this.renderShell();
    this.net.setHandlers({
      onAck: () => this.render(),
      onError: (e) => {
        this.lastReject = `${e.reasonCode}${e.message ? ': ' + e.message : ''}`;
        this.showToast(`错误：${this.lastReject}`);
        this.render();
      },
      onPresence: (p) => {
        this.presence = p;
        this.render();
      },
      onStarted: () => {
        this.lastReject = '';
        this.render();
      },
      onTerminated: () => {
        this.view = null;
        this.selected.clear();
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
        this.view = v;
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
  }

  private renderShell(): void {
    this.root.innerHTML = `<div class="app" id="ui"></div><div id="toast" class="toast" hidden></div>`;
  }

  private showToast(msg: string): void {
    const t = this.root.querySelector('#toast');
    if (!t) return;
    t.textContent = msg;
    t.removeAttribute('hidden');
    window.setTimeout(() => t.setAttribute('hidden', ''), 2500);
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
    el.innerHTML = `
      ${banner}${reject}
      <header class="top">
        <div class="brand-group">
          <h1>忍者之夜</h1>
          ${this.view || this.presence ? `<span class="room">房间 <b>${this.net.roomCode ?? ''}</b></span>` : ''}
          ${this.net.seatId ? `<span class="seat">座位 <b>${this.net.seatId}</b></span>` : ''}
        </div>
        ${this.view || this.presence ? `<button id="btn-leave-room" type="button" class="muted">返回大厅</button>` : ''}
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

  private gameBody(): string {
    const p = this.presence;
    const v = this.view;
    const seats = (p?.seats ?? v?.seats ?? [])
      .map((s) => {
        const ready = 'ready' in s ? (s as { ready?: boolean }).ready : false;
        const alive = 'alive' in s ? (s as { alive?: boolean }).alive : undefined;
        const tokens = 'honorTokenCount' in s ? (s as { honorTokenCount?: number }).honorTokenCount : undefined;
        const house = 'publicHouseId' in s ? (s as { publicHouseId?: string }).publicHouseId : undefined;
        const isBot = Boolean(s.isBot);
        return `<li class="${s.isHost ? 'host' : ''} ${isBot ? 'bot' : ''} ${alive === false ? 'dead' : ''}">
          <b>${isBot ? '🤖 ' : ''}${escapeHtml(s.nickname)}</b> ${s.seatId}
          ${s.isHost ? '👑' : ''}
          ${s.connected ? '●' : '○'}
          ${!isBot && ready ? '准备' : ''}
          ${alive === false ? '死亡' : ''}
          ${tokens !== undefined ? `令牌:${tokens}` : ''}
          ${house ? `身份:${escapeHtml(getHouseDisplayName(house))}` : ''}
        </li>`;
      })
      .join('');

    const pending = v?.pendingDecision;

    return `
      <div class="grid">
        <section class="panel">
          <h2>座位</h2>
          <ul class="seats">${seats}</ul>
          ${!v ? this.lobbyControls() : ''}
        </section>
        ${v ? this.gamePanels(v, pending ?? null) : ''}
        <section class="panel chat">
          <h2>聊天</h2>
          <div class="chat-log" id="chat-log">${this.chat
            .map(
              (c) =>
                `<div><b>${escapeHtml(c.nickname)}</b>: ${escapeHtml(c.text)}</div>`,
            )
            .join('')}</div>
          <div class="row">
            <input id="chat-input" maxlength="200" placeholder="说点什么…" />
            <button id="btn-chat" type="button">发送</button>
          </div>
        </section>
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

  private kickButtons(): string {
    const seats = this.presence?.seats ?? [];
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
    const revealed = v.revealedCards && v.revealedCards.length > 0
      ? v.revealedCards.map((c) => renderCardHtml(c.cardId, c.instanceId, false)).join('')
      : '';
    const known = self.knownHouseHistory
      .map((k) => {
        const targetSeat = v.seats.find((s) => s.seatId === k.targetSeatId);
        const targetName = targetSeat ? `${targetSeat.nickname} (${k.targetSeatId})` : k.targetSeatId;
        const via = k.viaCardId ? ` · 借由 ${getCardDisplayName(k.viaCardId)}` : '';
        return `<div class="known-item"><b>${escapeHtml(targetName)}</b> → <span class="house-name">${escapeHtml(getHouseDisplayName(k.houseId))}</span>${escapeHtml(via)}</div>`;
      })
      .join('');
    const tokens = self.honorTokens.map((t) => t.value).join(', ');
    // 日志：中文友好行 + 全量 payload（超长由 CSS 省略，不再硬截断丢字符）
    const events = v.events
      .slice(-40)
      .map((e) => `<div class="ev" title="${escapeHtml(e.type)}">${escapeHtml(eventLabel(e, v))}</div>`)
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

    return `
      <section class="panel in-game-table">
        <h2>对局 <span class="phase">${escapeHtml(phaseLabel(v.phase))}</span></h2>
        ${gameOverBanner}
        ${roundBanner}
        ${nextRoundBtn}
        <div class="private-info">
          <p>你的身份：<b class="house-badge">${escapeHtml(getHouseDisplayName(self.houseId))}</b> · 令牌面值：[<span class="token-val">${escapeHtml(tokens || '无')}</span>]</p>
        </div>
        <div class="hand-section">
          <h3>手牌</h3>
          <div class="hand">${hand || '<i>无手牌</i>'}</div>
        </div>
        ${revealed ? `<div class="revealed-section"><h3>已公开打出牌</h3><div class="cards-row">${revealed}</div></div>` : ''}
        <div class="reserved"><b>预留：</b>${reserved || '无'}</div>
        <div class="known"><h3>已知身份</h3>${known || '无'}</div>
        ${this.pendingPanel(pending)}
        <div class="row">
          ${this.net.isHost ? `<button id="btn-fa" type="button">强制推进</button>` : ''}
          ${this.net.isHost ? `<button id="btn-end" type="button" class="danger">终止本局</button>` : ''}
        </div>
        ${this.net.isHost ? this.kickButtons() : ''}
        <button type="button" id="btn-toggle-log" class="muted">日志折叠</button>
        <div class="log" id="game-log">${events}</div>
      </section>
    `;
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
      this.net.leaveRoom();
      this.view = null;
      this.presence = null;
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
      this.root.querySelector('#game-log')?.classList.toggle('collapsed');
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
        ? `${sid('actorSeatId')} 选择${p['killed'] ? '击杀' : '放过'}`
        : `可选决策：${JSON.stringify(p)}`;
    case 'night.houseViewed':
      return `👁 你查看了身份`;
    case 'night.ninjaViewed':
      return `👁 你查看了忍者牌`;
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
