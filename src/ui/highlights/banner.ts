/** 6H-4 高光横幅 HTML（纯函数；显隐/定时由 app 控制）。 */
import type { RoundHighlight } from './summary';
import { escapeHtml } from './escape';

export function highlightBannerHtml(h: RoundHighlight, expanded: boolean): string {
  const lines = h.lines.map((l) => `<div>${escapeHtml(l)}</div>`).join('');
  const full = expanded
    ? `<div class="hl-full">${h.full.map((l) => `<div>${escapeHtml(l)}</div>`).join('')}</div>`
    : '';
  return `<div class="hl-body"><div class="hl-title">✨ 本轮高光（点击展开/收起）</div>${lines}${full}</div>`;
}
