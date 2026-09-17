/**
 * 6G-3 快捷短语面板：纯展示（折叠，与聊天同区）。
 * 点击只发 phraseId，文本以服务端广播为准，全房 toast 浮层 3s。
 */
import { PHRASES } from '../../data/phrases';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 快捷短语折叠面板（details 原生折叠；按钮选择器 data-phrase="{下标}"，均为新增） */
export function phrasesPanelHtml(): string {
  const btns = PHRASES.map(
    (t, i) =>
      `<button type="button" class="fx-btn phrase" data-phrase="${i}" title="发送快捷短语">${escapeHtml(t)}</button>`,
  ).join('');
  return `<details class="panel phrases collapsed-panel" id="phrase-panel">
    <summary>快捷短语</summary>
    <div class="fx-row">${btns}</div>
  </details>`;
}

/** 短语 toast 文案：「昵称：短语」 */
export function phraseToastText(nickname: string, text: string): string {
  return `${nickname}：${text}`;
}
