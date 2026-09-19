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

/** 快捷短语折叠面板（3x3 九宫格分页展示；按钮选择器 data-phrase="{下标}"） */
export function phrasesPanelHtml(page = 0): string {
  const PAGE_SIZE = 9;
  const totalPages = Math.ceil(PHRASES.length / PAGE_SIZE);
  const curPage = Math.max(0, Math.min(page, totalPages - 1));
  const start = curPage * PAGE_SIZE;
  const pageItems = PHRASES.slice(start, start + PAGE_SIZE);

  const btns = pageItems.map((t, idx) => {
    const originalIdx = start + idx;
    return '<button type="button" class="fx-btn phrase" data-phrase="' + originalIdx + '" title="发送快捷短语">' + escapeHtml(t) + '</button>';
  }).join('');

  return '<details class="panel phrases collapsed-panel" id="phrase-panel">' +
    '<summary>快捷短语</summary>' +
    '<div class="phrase-grid-3x3">' + btns + '</div>' +
    '<div class="phrase-pagination">' +
      '<button type="button" data-phrase-page-dir="-1" class="phrase-page-btn" ' + (curPage === 0 ? 'disabled' : '') + '>上一页</button>' +
      '<span class="phrase-page-indicator">' + (curPage + 1) + ' / ' + totalPages + '</span>' +
      '<button type="button" data-phrase-page-dir="1" class="phrase-page-btn" ' + (curPage >= totalPages - 1 ? 'disabled' : '') + '>下一页</button>' +
    '</div>' +
  '</details>';
}

/** 短语 toast 文案：「昵称：短语」 */
export function phraseToastText(nickname: string, text: string): string {
  return nickname + '：' + text;
}
