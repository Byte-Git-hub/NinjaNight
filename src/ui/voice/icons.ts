/**
 * 6G-1 麦克风状态图标（内联 SVG，不生图、不引新资产）。
 * 四态：open（开麦）/ closed（闭麦）/ deaf（不听语音）/ absent（未加入语音）。
 * 深底 #0a0f1e 场景下用 currentColor，调用方以 CSS 控制颜色。
 */

export type MicIconKind = 'open' | 'closed' | 'deaf' | 'absent';

const WRAP_OPEN = '<svg class="mic mic-open" viewBox="0 0 24 24" width="14" height="14" aria-label="开麦">';
const WRAP_CLOSED =
  '<svg class="mic mic-closed" viewBox="0 0 24 24" width="14" height="14" aria-label="闭麦">';
const WRAP_DEAF =
  '<svg class="mic mic-deaf" viewBox="0 0 24 24" width="14" height="14" aria-label="未听语音">';
const WRAP_ABSENT =
  '<svg class="mic mic-absent" viewBox="0 0 24 24" width="14" height="14" aria-label="未加入语音">';

const MIC_BODY =
  '<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/>' +
  '<path d="M6 11a6 6 0 0 0 12 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>' +
  '<line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
  '<line x1="9" y1="21" x2="15" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';

const SLASH = '<line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';

/** 座位卡/控制区统一入口：kind → 内联 SVG 字符串 */
export function micIcon(kind: MicIconKind): string {
  switch (kind) {
    case 'open':
      return `${WRAP_OPEN}${MIC_BODY}</svg>`;
    case 'closed':
      return `${WRAP_CLOSED}${MIC_BODY}${SLASH}</svg>`;
    case 'deaf':
      return `${WRAP_DEAF}<path d="M4 10v4h4l5 4V6l-5 4H4z" fill="currentColor"/>${SLASH}</svg>`;
    case 'absent':
      return `${WRAP_ABSENT}<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="3 3"/>${SLASH}</svg>`;
  }
}

/** 座位语音徽章：未加入不占位；speaking 时加光效类（CSS 负责动画） */
export function micBadge(opts: {
  inVoice: boolean;
  muted: boolean;
  speaking: boolean;
  listening: boolean;
}): string {
  if (!opts.inVoice) return `<span class="mic-badge absent" title="未加入语音">${micIcon('absent')}</span>`;
  const cls = opts.speaking && !opts.muted ? 'speaking' : '';
  if (!opts.listening) return `<span class="mic-badge deaf ${cls}" title="你已关闭听语音">${micIcon('deaf')}</span>`;
  if (opts.muted) return `<span class="mic-badge muted ${cls}" title="已闭麦">${micIcon('closed')}</span>`;
  return `<span class="mic-badge live ${cls}" title="开麦中">${micIcon('open')}</span>`;
}
