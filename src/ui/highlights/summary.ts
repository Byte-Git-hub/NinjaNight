/**
 * 6H-4 高光时刻：事件聚合（纯函数，可单测）。
 * 输入本轮事件（按 seq 排序），输出 5 秒横幅摘要 + 可展开完整日志。
 * 保密：密探/隐士/上忍的查看结果不展示（查看类一律过滤）。
 */

import { getCardDisplayName } from '../assets';

export interface HighlightEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface RoundHighlight {
  /** 横幅摘要行（≤5 行） */
  lines: string[];
  /** 完整日志行（点击展开） */
  full: string[];
}

/** 查看类卡牌：只记"有人行动"，不展示目标与结果 */
const VIEW_CARDS = new Set(['spy', 'mystic', 'shinobi', 'spirit_merchant']);

/** 轮获胜方中文（与 app winnerLabel 同行为，highlights 独立） */
function winnerCn(winner: string): string {
  if (winner === 'crane') return '仙鹤';
  if (winner === 'lotus') return '莲花';
  if (winner === 'tie') return '平局（存活者各得）';
  return winner;
}

export function buildHighlight(
  roundEvents: HighlightEvent[],
  nameOf: (seatId: string) => string,
): RoundHighlight {
  const kills: string[] = [];
  const plays: string[] = [];
  const full: string[] = [];
  let winnerLine = '';

  for (const e of roundEvents) {
    const p = e.payload;
    switch (e.type) {
      case 'night.playerDied': {
        const victim = nameOf(String(p['seatId'] ?? ''));
        const by = typeof p['by'] === 'string' ? p['by'] : '';
        const how = by === 'mirror_monk' ? '被镜僧反杀' : by === 'martyr' ? '殉道而死' : '出局';
        if (victim) {
          kills.push(`💀 ${victim} ${how}`);
          full.push(`💀 ${victim} ${how}`);
        }
        break;
      }
      case 'night.cardsDeclared': {
        const cards = Array.isArray(p['cards']) ? (p['cards'] as Array<{ actorSeatId?: unknown; cardId?: unknown }>) : [];
        for (const c of cards) {
          const who = nameOf(String(c.actorSeatId ?? ''));
          const card = String(c.cardId ?? '');
          const disp = card ? getCardDisplayName(card) : '';
          const line = who && disp ? `${who} 打出了 ${disp}` : '';
          if (line) full.push(line);
          // 查看类只进完整日志，不进横幅
          if (who && card && !VIEW_CARDS.has(card.split(':')[0] ?? '')) {
            plays.push(`🃏 ${line}`);
          }
        }
        break;
      }
      case 'night.targetChosen': {
        const card = String(p['cardId'] ?? '');
        const base = card.split(':')[0] ?? '';
        const actor = nameOf(String(p['actorSeatId'] ?? ''));
        const target = nameOf(String(p['targetSeatId'] ?? ''));
        const disp = card ? getCardDisplayName(card) : '?';
        if (actor && target) full.push(`${actor} 对 ${target} 行动（${disp}）`);
        if (actor && target && card && !VIEW_CARDS.has(base)) {
          plays.push(`🎯 ${actor} 对 ${target} 使用${disp}`);
        }
        break;
      }
      case 'score.roundWinner': {
        const winner = String(p['winner'] ?? '');
        const awarded = Array.isArray(p['awarded'])
          ? (p['awarded'] as Array<{ seatId?: unknown; count?: unknown }>)
              .map((a) => `${nameOf(String(a.seatId ?? ''))}+${String(a.count ?? '')}`)
              .join('、')
          : '';
        winnerLine = `🏆 本轮${winnerCn(winner)}获胜${awarded ? `（${awarded}）` : ''}`;
        full.push(winnerLine);
        break;
      }
      default:
        break;
    }
  }

  const lines = [...kills.slice(0, 3), ...plays.slice(0, 3 - Math.min(kills.length, 3))];
  if (winnerLine) lines.push(winnerLine);
  return { lines: lines.slice(0, 5), full };
}
