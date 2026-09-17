/**
 * 6G-2 怀疑标记 UI：纯展示 + 切换意图计算（状态以服务端 mark.state 快照为准）。
 * 座位卡徽章显示被标次数；打标按钮文案按"我是否标过他"切换。
 */
import type { MarkPair } from '../../shared/protocol';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 该座位被多少人标记 */
export function markCountOn(marks: MarkPair[], targetSeatId: string): number {
  let n = 0;
  for (const m of marks) {
    if (m.target === targetSeatId) n += 1;
  }
  return n;
}

/** 我标记了谁（seatId 列表） */
export function myMarkedTargets(marks: MarkPair[], selfSeatId: string): string[] {
  return marks.filter((m) => m.from === selfSeatId).map((m) => m.target);
}

/** 座位卡怀疑徽章：无标记返回 ''（不占位） */
export function markBadge(marks: MarkPair[], targetSeatId: string): string {
  const n = markCountOn(marks, targetSeatId);
  if (n === 0) return '';
  return `<span class="mark-badge" title="被 ${n} 人怀疑">👁×${n}</span>`;
}

/**
 * 打标按钮（座位卡内，仅对局+非自己渲染；选择器 data-mark，不碰已有选择器）。
 * 已标过 → 显示取消态（服务端 clearMark）；未标 → 打标态（服务端 markSet，重复点同目标自动取消）。
 */
export function markButton(
  marks: MarkPair[],
  selfSeatId: string,
  targetSeatId: string,
  maxPerSeat: number,
): string {
  if (selfSeatId === '' || selfSeatId === targetSeatId) return '';
  const mine = myMarkedTargets(marks, selfSeatId);
  const marked = mine.includes(targetSeatId);
  const label = marked ? '取消怀疑' : '怀疑他';
  const disabled = !marked && mine.length >= maxPerSeat ? ' disabled' : '';
  const hint = !marked && mine.length >= maxPerSeat ? '（已达上限）' : '';
  return `<button type="button" class="mark-btn${marked ? ' on' : ''}" data-mark="${escapeHtml(targetSeatId)}"${disabled} title="${marked ? '点击取消对他的怀疑' : '点击怀疑他（每人最多标 2 人）'}">${marked ? '👁‍🗨' : '👁'} ${label}${hint}</button>`;
}
