/**
 * 6H-3 成就判定：监听本地 GameEvent（只读），返回新解锁 id 列表。
 * 击杀归因说明（本地趣味成就，非权威裁定）：上忍/刺客结算（cardResolved）
 * 后出现的下一次他人死亡，计为本人击杀；可选击杀（optionalResolved killed）直接计。
 */
import { loadAchievements, saveAchievements, type AchievementStore } from './store';

const KILL_CARDS = new Set(['blind_assassin', 'shinobi']);

export class AchievementTracker {
  private store: AchievementStore;
  private storage?: Pick<Storage, 'getItem' | 'setItem'>;
  private viewed = new Set<string>();
  private kills = 0;
  private pendingKillCredit = false;
  private declared = 0;
  private smashed = 0;

  constructor(storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    this.storage = storage;
    this.store = loadAchievements(storage);
  }

  resetGame(): void {
    this.viewed.clear();
    this.kills = 0;
    this.pendingKillCredit = false;
    this.declared = 0;
    this.smashed = 0;
  }

  get wins(): number {
    return this.store.wins;
  }

  isUnlocked(id: string): boolean {
    return id in this.store.unlocked;
  }

  unlockedIds(): string[] {
    return Object.keys(this.store.unlocked);
  }

  /** 被砸（特效目标是自己时由 UI 调用）。 */
  hitByEffect(): string[] {
    this.smashed += 1;
    if (this.smashed >= 5) return this.unlock('target-dummy');
    return [];
  }

  handleEvent(
    type: string,
    payload: Record<string, unknown>,
    selfSeatId: string,
    selfAlive: boolean,
  ): string[] {
    const out: string[] = [];
    const unlock = (id: string): void => {
      out.push(...this.unlock(id));
    };
    switch (type) {
      case 'game.started':
        this.resetGame();
        break;
      case 'night.houseViewed':
      case 'night.ninjaViewed': {
        if (String(payload['viewerSeatId'] ?? '') === selfSeatId) {
          const t = String(payload['targetSeatId'] ?? '');
          if (t) this.viewed.add(t);
          if (this.viewed.size >= 3) unlock('eye-spy');
        }
        break;
      }
      case 'night.cardsDeclared': {
        const cards = payload['cards'];
        if (Array.isArray(cards)) {
          for (const c of cards) {
            if ((c as { actorSeatId?: unknown }).actorSeatId === selfSeatId) this.declared += 1;
          }
        }
        break;
      }
      case 'night.cardResolved': {
        if (
          String(payload['actorSeatId'] ?? '') === selfSeatId &&
          KILL_CARDS.has(String(payload['cardId'] ?? ''))
        ) {
          this.pendingKillCredit = true;
        }
        break;
      }
      case 'night.optionalResolved': {
        if (String(payload['actorSeatId'] ?? '') === selfSeatId && payload['killed'] === true) {
          this.registerKill(unlock);
        }
        break;
      }
      case 'night.playerDied': {
        const victim = String(payload['seatId'] ?? '');
        if (victim && victim !== selfSeatId && this.pendingKillCredit) {
          this.pendingKillCredit = false;
          this.registerKill(unlock);
        }
        break;
      }
      case 'score.victory': {
        const winners = Array.isArray(payload['winners']) ? (payload['winners'] as unknown[]) : [];
        const scores = Array.isArray(payload['scores']) ? (payload['scores'] as Array<{ seatId?: unknown; score?: unknown }>) : [];
        const won = winners.includes(selfSeatId);
        const myScore = scores.find((s) => s.seatId === selfSeatId);
        if (typeof myScore?.score === 'number' && myScore.score >= 10) unlock('rich');
        if (this.declared === 0 && selfAlive) unlock('hermit');
        if (won) {
          this.store.wins += 1;
          unlock('first-win');
          if (this.store.wins >= 10) unlock('master');
          saveAchievements(this.store, this.storage);
        }
        break;
      }
      default:
        break;
    }
    return out;
  }

  private registerKill(unlock: (id: string) => void): void {
    this.kills += 1;
    unlock('first-kill');
    if (this.kills >= 2) unlock('double-kill');
  }

  private unlock(id: string): string[] {
    if (id in this.store.unlocked) return [];
    this.store.unlocked[id] = Date.now();
    saveAchievements(this.store, this.storage);
    return [id];
  }
}
