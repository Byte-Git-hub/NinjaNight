// 阶段 2 dev 控制台：切座位、查看视图、自动跑 draft+spy 路径
import { createLocalAdapter } from './local-adapter';
import { findSeat } from '../core/utils';

function log(...args: unknown[]): void {
  console.log(...args);
}

export function runSmoke(seed = 42): void {
  const adapter = createLocalAdapter({ seed, roomCode: 'DEV' });
  const seatIds = adapter.getState().seats.map((s) => s.seatId);
  log('seats', seatIds);
  log('phase', adapter.getState().phase);

  // 自动完成 draft：每个座位永远选 draftHand[0]
  let guard = 0;
  while (
    (adapter.getState().phase === 'draftPick1' ||
      adapter.getState().phase === 'draftPick2' ||
      adapter.getState().phase === 'draftDiscard') &&
    guard < 50
  ) {
    guard += 1;
    for (const id of seatIds) {
      const hand = adapter.draftHandIdsOf(id);
      const pick = hand[0];
      if (!pick) continue;
      if (adapter.getState().phase === 'draftDiscard') {
        adapter.draftDiscard(id, pick);
      } else if (adapter.getState().phase === 'draftPick1' || adapter.getState().phase === 'draftPick2') {
        adapter.draftPick(id, pick);
      }
    }
  }

  log('after draft phase', adapter.getState().phase, 'hash', adapter.hash());

  // 自动声明所有可出牌，并应对 chooseTarget / optional
  guard = 0;
  while (!adapter.getState().gameOver && guard < 200) {
    guard += 1;
    const st = adapter.getState();
    let progressed = false;

    for (const p of st.pending) {
      const seat = findSeat(st, p.seatId);
      if (!seat) continue;
      if (p.kind === 'declareCards') {
        const playable = adapter.playableOf(p.seatId);
        if (playable.length > 0) {
          adapter.declare(p.seatId, playable);
        } else {
          adapter.passPhase(p.seatId);
        }
        progressed = true;
      } else if (p.kind === 'chooseTarget') {
        const target = p.options.find((o) => o !== p.seatId) ?? p.options[0];
        if (target) {
          adapter.chooseTarget(p.seatId, target);
          progressed = true;
        }
      } else if (p.kind === 'chooseOptional') {
        adapter.chooseOptional(p.seatId, true);
        progressed = true;
      }
    }

    if (!progressed) break;
  }

  const view = adapter.getView('s0');
  log('view s0', {
    phase: adapter.getState().phase,
    known: view?.self.knownHouseHistory,
    tokens: view?.self.honorTokens.length,
    alive: adapter.getState().seats.map((s) => `${s.seatId}:${s.alive}`),
  });
  log('omniscient houses (dev only)', adapter.getState().seats.map((s) => `${s.seatId}=${s.house}`));
  log('final hash', adapter.hash());
}

// 导出供测试/脚本调用；生产构建勿引用 src/dev
export {};
