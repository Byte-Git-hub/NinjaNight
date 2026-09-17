import type { Command, PlayerView, SeatId } from '../shared/types';
import { baseOf } from './deck';
import { createRng, type Rng } from './rng';

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

const ACTIVE_BASES = new Set(['spy', 'mystic', 'blind_assassin', 'shinobi']);

/**
 * 纯函数：给定 bot 视角 PlayerView 与当前窗口 ID，计算下一步决策 Command
 * 严禁依赖 DOM、Socket、时间、全局 Math.random
 */
export function botDecide(
  view: PlayerView,
  windowId: string,
  rng?: Rng,
): Command | null {
  const pending = view.pendingDecision;
  if (!pending) return null;

  // 窗口 ID 校验
  if (pending.id !== windowId && view.windowId !== windowId) {
    return null;
  }

  const effectiveRng =
    rng ?? createRng(hashString(`${windowId}:${view.self.seatId}:${view.round}:${view.step}`));

  const seatToken = ''; // 服务端调度器分发时补全真实 seatToken

  switch (pending.kind) {
    case 'draftPick': {
      if (pending.options.length === 0) return null;
      // 加权选择：主动牌（密探/隐士/刺客/上忍）权重为 3，其他为 1
      const weightedOptions: string[] = [];
      for (const opt of pending.options) {
        const cardPrefix = opt.split('#')[0] ?? opt;
        const b = baseOf(cardPrefix);
        const weight = ACTIVE_BASES.has(b) ? 3 : 1;
        for (let w = 0; w < weight; w += 1) {
          weightedOptions.push(opt);
        }
      }
      const chosen = weightedOptions[effectiveRng.int(weightedOptions.length)] ?? pending.options[0];
      return {
        commandId: `bot-draft-pick-${view.self.seatId}-${windowId}`,
        roomCode: view.roomCode,
        seatToken,
        windowId,
        type: 'draft.pick',
        payload: { cardInstanceId: chosen },
      };
    }

    // 6F-8 起不再生成 draftDiscard pending（pick2 后自动弃置），本分支保留为无调用兼容
    case 'draftDiscard': {
      if (pending.options.length === 0) return null;
      // 反向加权：优先弃掉被动牌或多余牌
      const weightedOptions: string[] = [];
      for (const opt of pending.options) {
        const cardPrefix = opt.split('#')[0] ?? opt;
        const b = baseOf(cardPrefix);
        const weight = ACTIVE_BASES.has(b) ? 1 : 3;
        for (let w = 0; w < weight; w += 1) {
          weightedOptions.push(opt);
        }
      }
      const chosen = weightedOptions[effectiveRng.int(weightedOptions.length)] ?? pending.options[0];
      return {
        commandId: `bot-draft-discard-${view.self.seatId}-${windowId}`,
        roomCode: view.roomCode,
        seatToken,
        windowId,
        type: 'draft.discard',
        payload: { cardInstanceId: chosen },
      };
    }

    case 'declareCards': {
      if (pending.options.length === 0) {
        return {
          commandId: `bot-pass-${view.self.seatId}-${windowId}`,
          roomCode: view.roomCode,
          seatToken,
          windowId,
          type: 'night.passPhase',
          payload: {},
        };
      }

      const handCount = view.self.hand.length;
      const isKeyPhase =
        view.phase === 'nightBlindAssassin' || view.phase === 'nightShinobi';
      // 若手牌 ≥ 2 张且是关键阶段，出牌概率 80%，否则 50%
      const playProb = handCount >= 2 && isKeyPhase ? 0.8 : 0.5;
      const roll = effectiveRng.next();

      if (roll < playProb) {
        // 出 1 张可选牌
        const chosen = pending.options[effectiveRng.int(pending.options.length)] ?? pending.options[0];
        return {
          commandId: `bot-declare-${view.self.seatId}-${windowId}`,
          roomCode: view.roomCode,
          seatToken,
          windowId,
          type: 'night.declare',
          payload: { cardInstanceIds: [chosen] },
        };
      }

      return {
        commandId: `bot-pass-${view.self.seatId}-${windowId}`,
        roomCode: view.roomCode,
        seatToken,
        windowId,
        type: 'night.passPhase',
        payload: {},
      };
    }

    case 'chooseTarget': {
      if (pending.options.length === 0) return null;
      // 若已知某目标是敌对阵营（通过 knownHouseHistory 快照），优先选他
      const knownEnemies = pending.options.filter((targetSeatId) => {
        const record = view.self.knownHouseHistory.find(
          (k) => k.targetSeatId === targetSeatId,
        );
        if (!record) return false;
        // 己方不是浪人且对方不同流派，或己方是浪人对方已知
        return record.houseId !== view.self.houseId;
      });

      const candidates =
        knownEnemies.length > 0 ? knownEnemies : pending.options;
      const chosen = candidates[effectiveRng.int(candidates.length)] ?? pending.options[0];

      return {
        commandId: `bot-target-${view.self.seatId}-${windowId}`,
        roomCode: view.roomCode,
        seatToken,
        windowId,
        type: 'night.chooseTarget',
        payload: { targetSeatId: chosen as SeatId },
      };
    }

    case 'merchantChoose': {
      if (pending.options.length === 0) return null;
      // 随机选一个（HONOR 或 HOUSE）
      const chosen = pending.options[effectiveRng.int(pending.options.length)] ?? pending.options[0];
      return {
        commandId: `bot-merch-choose-${view.self.seatId}-${windowId}`,
        roomCode: view.roomCode,
        seatToken,
        windowId,
        type: 'night.chooseTarget',
        payload: { targetSeatId: chosen as SeatId },
      };
    }

    case 'merchantExchange': {
      if (pending.options.length === 0) return null;
      // 30% 概率选择 no_swap
      const hasNoSwap = pending.options.includes('no_swap');
      const roll = effectiveRng.next();
      if (hasNoSwap && roll < 0.3) {
        return {
          commandId: `bot-merch-ex-${view.self.seatId}-${windowId}`,
          roomCode: view.roomCode,
          seatToken,
          windowId,
          type: 'night.chooseTarget',
          payload: { targetSeatId: 'no_swap' as SeatId },
        };
      }
      const swapOptions = pending.options.filter((o) => o !== 'no_swap');
      const candidates = swapOptions.length > 0 ? swapOptions : pending.options;
      const chosen = candidates[effectiveRng.int(candidates.length)] ?? pending.options[0];
      return {
        commandId: `bot-merch-ex-${view.self.seatId}-${windowId}`,
        roomCode: view.roomCode,
        seatToken,
        windowId,
        type: 'night.chooseTarget',
        payload: { targetSeatId: chosen as SeatId },
      };
    }

    case 'chooseOptional': {
      // 30% 概率选择 false，70% 概率选择 true
      const choose = effectiveRng.next() >= 0.3;
      return {
        commandId: `bot-opt-${view.self.seatId}-${windowId}`,
        roomCode: view.roomCode,
        seatToken,
        windowId,
        type: 'night.chooseOptional',
        payload: { choose },
      };
    }

    case 'reactDecide': {
      // 70% 概率发动反应，30% decline
      const react = effectiveRng.next() < 0.7;
      return {
        commandId: `bot-react-${view.self.seatId}-${windowId}`,
        roomCode: view.roomCode,
        seatToken,
        windowId,
        type: 'react.decide',
        payload: { react },
      };
    }

    default:
      return null;
  }
}
