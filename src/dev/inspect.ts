import type { AppUI } from '../ui/app';
import type { PlayerView } from '../shared/types';

declare global {
  interface Window {
    __ninjaDebug?: {
      getView: () => string;
      getPhase: () => string | null;
      getPending: () => unknown;
      getLastViewAt: () => number;
    };
  }
}

export function attachInspect(ui: AppUI): void {
  window.__ninjaDebug = {
    getView: () => JSON.stringify(ui.currentView),
    getPhase: () => ui.currentView?.phase ?? null,
    getPending: () => ui.currentView?.pendingDecision?.kind ?? null,
    getLastViewAt: () => ui.lastViewTimestamp,
  };
}

export function logSnapshot(v: PlayerView, timestamp: number): void {
  const pending = v.pendingDecision ? `${v.pendingDecision.seatId}:${v.pendingDecision.kind}` : 'none';
  console.log(`[view.snapshot] phase=${v.phase} pending=${pending} at=${timestamp}`);
}
