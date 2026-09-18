/** 6H-3 成就存储：纯本地 localStorage，不上报服务端。 */
import { ACHIEVEMENTS } from './definitions';

export interface AchievementStore {
  unlocked: Record<string, number>;
  wins: number;
}

export const ACHIEVEMENT_STORE_KEY = 'ninja-night:achievements';

function blank(): AchievementStore {
  return { unlocked: {}, wins: 0 };
}

export function loadAchievements(storage?: Pick<Storage, 'getItem'>): AchievementStore {
  const out = blank();
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(ACHIEVEMENT_STORE_KEY);
    if (!raw) return out;
    const p = JSON.parse(raw) as Partial<AchievementStore>;
    if (p.unlocked && typeof p.unlocked === 'object') {
      for (const a of ACHIEVEMENTS) {
        const ts = (p.unlocked as Record<string, unknown>)[a.id];
        if (typeof ts === 'number') out.unlocked[a.id] = ts;
      }
    }
    if (typeof p.wins === 'number' && Number.isFinite(p.wins) && p.wins >= 0) {
      out.wins = Math.floor(p.wins);
    }
  } catch {
    /* 损坏则回空 */
  }
  return out;
}

export function saveAchievements(s: AchievementStore, storage?: Pick<Storage, 'setItem'>): void {
  try {
    (storage ?? globalThis.localStorage).setItem(ACHIEVEMENT_STORE_KEY, JSON.stringify(s));
  } catch {
    /* 忽略 */
  }
}
