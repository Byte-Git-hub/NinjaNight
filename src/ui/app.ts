import type { PresencePayload, ChatEventPayload, RoomErrorPayload } from '../shared/protocol';
import type { ConnectionStatus, GameNet } from '../net/client';
import type { PlayerView, PendingDecision, NinjaCardInstanceView } from '../shared/types';
import { getCardDisplayName, renderCardHtml } from './assets';

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

function cardName(cardId: string): string {
  return getCardDisplayName(cardId);
}

export class AppUI {
  private root: HTMLElement;
  private net: GameNet;
  private presence: PresencePayload | null = null;
  private view: PlayerView | null = null;
  private chat: ChatEventPayload[] = [];
  private status: ConnectionStatus = 'idle';
  private lastReject = '';
  private deadlineLeft = 60;

  constructor(root: HTMLElement, net: GameNet) {
    this.root = root;
    this.net = net;
  }

  mount(): void {
    this.renderShell();
    this.net.setHandlers({
      onAck: () => this.render(),
      onError: (e) => {
        this.lastReject = `${e.reasonCode}${e.message ? ': ' + e.message : ''}`;
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
      onView: (v) => {
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
    this.root.innerHTML = `<div class="app" id="ui"><div id="toast" class="toast" hidden></div></div>`;
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
    const el = this.ui();
    if (!el) return;
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
        <h1>忍者之夜</h1>
        ${this.view || this.presence ? `<span class="room">房间 ${this.net.roomCode ?? ''}</span>` : ''}
        ${this.net.seatId ? `<span class="seat">座位 ${this.net.seatId}</span>` : ''}
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
        return `<li class="${s.isHost ? 'host' : ''} ${alive === false ? 'dead' : ''}">
          <b>${escapeHtml(s.nickname)}</b> ${s.seatId}
          ${s.isHost ? '👑' : ''}
          ${s.connected ? '●' : '○'}
          ${ready ? '准备' : ''}
          ${alive === false ? '死亡' : ''}
          ${tokens !== undefined ? `令牌${tokens}` : ''}
          ${house ? `身份:${escapeHtml(house)}` : ''}
        </li>`;
      })
      .join('');

    const phase = v ? (PHASE_CN[v.phase] ?? v.phase) : (PHASE_CN[p?.phase ?? ''] ?? '');
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
    const allReady =
      n >= 4 && (p?.seats ?? []).every((s) => s.isHost || (s as { ready?: boolean }).ready);
    return `
      <div class="row">
        <button id="btn-ready" type="button">切换准备</button>
        ${isHost ? `<button id="btn-start" type="button" ${n < 4 ? 'disabled' : ''}>开始 (${n})</button>` : ''}
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
    const hand = self.hand
      .map((c) => renderCardHtml(c.cardId, c.instanceId, true))
      .join('');
    const reserved = self.reserved
      .map((c) => renderCardHtml(c.cardId, c.instanceId, false))
      .join('');
    const known = self.knownHouseHistory
      .map((k) => `<div>${escapeHtml(k.targetSeatId)} → ${escapeHtml(k.houseId)}（${escapeHtml(k.viaCardId ?? '')}）</div>`)
      .join('');
    const tokens = self.honorTokens.map((t) => t.value).join(', ');
    const events = v.events
      .slice(-40)
      .map((e) => `<div class="ev">${escapeHtml(e.type)} ${escapeHtml(JSON.stringify(e.payload).slice(0, 80))}</div>`)
      .join('');

    return `
      <section class="panel">
        <h2>对局 <span class="phase">${escapeHtml(phaseLabel(v.phase))}</span></h2>
        <p>你的身份：<b>${escapeHtml(self.houseId)}</b> · 令牌面值：[${escapeHtml(tokens)}]</p>
        <div class="hand">${hand || '<i>无手牌</i>'}</div>
        <div class="reserved">预留：${reserved || '无'}</div>
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
    const opts = pending.options
      .map((o: string) => `<button class="opt" data-opt="${escapeHtml(o)}" type="button">${escapeHtml(optLabel(o))}</button>`)
      .join('');
    const kindLabel: Record<string, string> = {
      draftPick: '选一张留下',
      draftDiscard: '弃一张',
      declareCards: '声明打出（可多选后确认）或跳过',
      chooseTarget: '选择目标',
      chooseOptional: '可选决策',
      reactDecide: '是否发动反应？',
      merchantChoose: '商人：查看 HOUSE 或 HONOR（必选）',
      merchantExchange: '商人：交换令牌（可放弃）',
    };
    return `
      <div class="pending">
        <div>待你决策：${kindLabel[pending.kind] ?? pending.kind}</div>
        <div class="row opts">${opts}</div>
        ${pending.kind === 'declareCards' ? `<button id="btn-declare" type="button">确认打出选中</button><button id="btn-pass" type="button">跳过</button>` : ''}
        ${pending.kind === 'chooseOptional' ? `<button class="opt" data-opt="__true" type="button">是</button><button class="opt" data-opt="__false" type="button">否</button>` : ''}
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
    $('#btn-fa')?.addEventListener('click', () => this.net.forceAdvance());
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
      if (!v || this.selected.size === 0) return;
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

    this.root.querySelectorAll<HTMLButtonElement>('.card[data-iid]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset['iid'];
        if (!id) return;
        if (this.selected.has(id)) {
          this.selected.delete(id);
          btn.classList.remove('sel');
        } else {
          this.selected.add(id);
          btn.classList.add('sel');
        }
      });
      // 双击取消选中（移动端）
      btn.addEventListener('dblclick', () => {
        const id = btn.dataset['iid'];
        if (!id) return;
        this.selected.delete(id);
        btn.classList.remove('sel');
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('.opt[data-opt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = this.view;
        const pending = v?.pendingDecision;
        if (!v || !pending) return;
        const opt = btn.dataset['opt'] ?? '';
        if (pending.kind === 'chooseOptional' || pending.kind === 'reactDecide') {
          const choose = opt === '__true';
          const type = pending.kind === 'reactDecide' ? 'react.decide' : 'night.chooseOptional';
          const payload = pending.kind === 'reactDecide' ? { react: choose } : { choose };
          this.net.sendCommand(v.windowId, type, payload);
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

function optLabel(o: string): string {
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
  if (o.startsWith('s')) return o;
  if (o.startsWith('tok-') || o.startsWith('t') || o.startsWith('x')) return `令牌 ${o}`;
  return o;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type { NinjaCardInstanceView };
