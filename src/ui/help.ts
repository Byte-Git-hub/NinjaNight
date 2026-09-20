/**
 * 游戏说明弹窗（首页大厅入口）。
 * 卡牌中文名/效果/阶段全部从数据源组装，不硬编码中文：
 * - CARD_CN / getCardDisplayName / getHouseDisplayName 来自 ./assets（译名唯一来源）
 * - CARD_DESCRIPTION_ZH / CARD_PHASE_ZH 来自 ../data/card-text
 * - 超时秒数来自 ../shared/timeouts（DEFAULT_WINDOW_MS）
 * 规则数字（33/35/10 分等）转述 docs/01_GAME_RULES.md，分布类标注【待确认】。
 */
import { CARD_DESCRIPTION_ZH, CARD_PHASE_ZH } from '../data/card-text';
import { CARD_CN, getHouseDisplayName } from './assets';
import { DEFAULT_WINDOW_MS, MIN_PLAYERS, MAX_PLAYERS } from '../shared/timeouts';

/** 效果表展示顺序：密探→隐士→骗徒 6→刺客/上忍→反应 2→揭示 1 */
const CARD_ORDER = [
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
] as const;

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cardTableHtml(): string {
  const rows = CARD_ORDER.filter((id) => CARD_DESCRIPTION_ZH[id])
    .map((id) => {
      const name = CARD_CN[id] ?? id;
      const phase = CARD_PHASE_ZH[id] ?? '';
      const desc = CARD_DESCRIPTION_ZH[id] ?? '';
      return `<tr><td class="help-card-name">${esc(name)}</td><td class="help-card-phase">${esc(phase)}</td><td>${esc(desc)}</td></tr>`;
    })
    .join('');
  return `<table class="help-table"><thead><tr><th>牌</th><th>阶段</th><th>效果</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function helpModalHtml(): string {
  const windowSec = Math.round(DEFAULT_WINDOW_MS / 1000);
  const crane1 = esc(getHouseDisplayName('crane:1'));
  const lotus1 = esc(getHouseDisplayName('lotus:1'));
  const ronin = esc(getHouseDisplayName('ronin'));
  return `<div class="identity-modal-backdrop" id="help-modal" data-help-close="1">
    <div class="help-modal" role="dialog" aria-label="玩法说明">
      <div class="help-head"><h3>玩法说明 · 忍者之夜</h3><button type="button" class="muted" data-help-close="1" aria-label="关闭玩法说明">×</button></div>
      <div class="help-body">
        <section><h4>游戏目标</h4>
          <p>4–11 人参与。每轮获胜阵营成员各摸 1 枚荣誉令牌（面值 2 / 3 / 4 分，数字朝下保密）；回合结束时累计 ≥10 分者亮牌获胜，多人达标比分高者胜，同分共享胜利。令牌枚数公开、面值与总分私密。</p>
        </section>
        <section><h4>游戏准备</h4>
          <p>33 张忍者牌；11 张身份牌（${crane1.split(' · ')[0]} 1–5 ＋ ${lotus1.split(' · ')[0]} 1–5 ＋ ${ronin}）；35 枚荣誉令牌数字朝下堆成一堆。每人发 1 张身份牌（自己可看，不得亮出）。按人数取等量${crane1.split(' · ')[0]}与${lotus1.split(' · ')[0]}（4 人用地位 1–2，人多按序加 3、4、5），奇数人数加${ronin}。</p>
          <table class="help-table"><thead><tr><th>人数</th><th>${crane1.split(' · ')[0]}</th><th>${lotus1.split(' · ')[0]}</th><th>${ronin}</th></tr></thead><tbody>
          <tr><td>4</td><td>1–2</td><td>1–2</td><td>否</td></tr>
          <tr><td>5</td><td>1–2</td><td>1–2</td><td>是</td></tr>
          <tr><td>6</td><td>1–3</td><td>1–3</td><td>否</td></tr>
          <tr><td>7</td><td>1–3</td><td>1–3</td><td>是</td></tr>
          <tr><td>8</td><td>1–4</td><td>1–4</td><td>否</td></tr>
          <tr><td>9</td><td>1–4</td><td>1–4</td><td>是</td></tr>
          <tr><td>10</td><td>1–5</td><td>1–5</td><td>否</td></tr>
          <tr><td>11</td><td>1–5</td><td>1–5</td><td>是</td></tr>
          </tbody></table>
          <p class="hint">网页版建房限制 ${MIN_PLAYERS}–${MAX_PLAYERS} 人。</p>
        </section>
        <section><h4>轮抽阶段</h4>
          <p>每人发 3 张忍者牌：选 1 张扣置面前，剩余 2 张传给左手邻居；再选 1 张扣置，最后 1 张弃到中央。最终每人持有 2 张忍者牌。</p>
        </section>
        <section><h4>夜晚五阶段（按序结算）</h4>
          <p>1 ${esc(CARD_CN['spy'] ?? 'spy')} → 2 ${esc(CARD_CN['mystic'] ?? 'mystic')} → 3 骗徒（${esc(CARD_CN['shapeshifter'] ?? '')} / ${esc(CARD_CN['grave_digger'] ?? '')} / ${esc(CARD_CN['troublemaker'] ?? '')} / ${esc(CARD_CN['spirit_merchant'] ?? '')} / ${esc(CARD_CN['thief'] ?? '')} / ${esc(CARD_CN['judge'] ?? '')}，编号 1→6 升序） → 4 ${esc(CARD_CN['blind_assassin'] ?? '')}（直接杀死，不看身份） → 5 ${esc(CARD_CN['shinobi'] ?? '')}（先看身份，可选择杀死）。先收集声明再统一公开，结算到某张牌时再选目标；本轮跳过即作废。</p>
        </section>
        <section><h4>忍者牌效果表（13 种效果，33 张实例共用，实例编号分布【待确认】）</h4>
          ${cardTableHtml()}
        </section>
        <section><h4>特殊牌说明</h4>
          <p>${esc(CARD_CN['mirror_monk'] ?? '')}：被${esc(CARD_CN['shinobi'] ?? '')}或${esc(CARD_CN['blind_assassin'] ?? '')}选杀时翻开，反杀对方。${esc(CARD_CN['martyr'] ?? '')}：被选杀时翻开，得 1 枚荣誉令牌。${esc(CARD_CN['judge'] ?? '')}的杀不开启反应窗。${esc(CARD_CN['mastermind'] ?? '')}：夜晚结束仍存活则亮出，己方阵营本轮获胜；若为${ronin}则本轮无阵营获胜。</p>
        </section>
        <section><h4>死亡</h4>
          <p>被杀时不亮身份牌，放倒立牌表示死亡；仍可发言、劝说，但不可再打出新牌。</p>
        </section>
        <section><h4>阵营结算</h4>
          <p>夜晚结束后存活者亮身份牌：比较各阵营存活成员地位序列，地位 1 最大，逐级比；胜方全员（含本轮死者）各摸 1 枚；${ronin}存活自摸 1 枚；地位全平则每名存活者各摸 1 枚；全灭则本轮无人得分。</p>
        </section>
        <section><h4>网页版约定</h4>
          <p>决策超时约 ${windowSec} 秒自动跳过（以服务端配置为准）；房主可强制推进全员未响应；断线后凭座位令牌在保留期内重连回座位。发言可以说真话也可以说谎。</p>
        </section>
      </div>
    </div>
  </div>`;
}
