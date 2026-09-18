import type { RoomRuntime } from './room';
import { projectView } from '../core/project-view';
import { botDecide } from '../core/bot';
import type { Command } from '../shared/types';
import { logger } from './logger';

/** true = 决策被接受（推进了 state）；false = 被拒收/无决策 */
export type BotCommandExecutor = (room: RoomRuntime, cmd: Command) => boolean;

/**
 * 拒收后的有界重试计数（key = schedKey）。决策是确定性的，重试只覆盖瞬态竞态；
 * 超过上限后停手，交由窗口超时（applyAllDefaults）推进，绝不无限空转。
 */
const retryCounts = new WeakMap<RoomRuntime, Map<string, number>>();
const MAX_BOT_RETRIES = 3;

function retriesOf(room: RoomRuntime): Map<string, number> {
  let m = retryCounts.get(room);
  if (!m) {
    m = new Map();
    retryCounts.set(room, m);
  }
  return m;
}

/**
 * 扫描 room 内所有 bot 座位，为当前有决策待办的 bot 排程拟人延迟后的决策
 */
export function scheduleBots(room: RoomRuntime, executeCommand: BotCommandExecutor): void {
  if (!room.state || room.bots.size === 0) return;
  if (room.state.pending.length === 0) return;

  // 给每次人机决策留出可感知的停顿，避免多个阶段在一瞬间连续结算。
  // 仍保留环境变量覆盖，测试/调试可显式设为更短的值。
  const baseDelay = Number(process.env.BOT_DELAY_MS ?? 1000);
  const jitter = Number(process.env.BOT_JITTER_MS ?? 1000);

  for (const botSeatId of room.bots) {
    const pending = room.state.pending.find((p) => p.seatId === botSeatId);
    if (!pending) continue;

    const schedKey = `${botSeatId}:${pending.id}`;
    if (room.botScheduledKeys.has(schedKey)) continue;
    room.botScheduledKeys.add(schedKey);

    const delayMs = baseDelay + (jitter > 0 ? Math.floor(Math.random() * jitter) : 0);

    const timer = setTimeout(() => {
      room.botTimers.delete(schedKey);
      if (!room.state) return;

      // 验证待办窗口是否仍然有效
      const stillPending = room.state.pending.find(
        (p) => p.seatId === botSeatId && p.id === pending.id,
      );
      if (!stillPending) {
        retriesOf(room).delete(schedKey);
        return;
      }

      // 1. 严格使用 projectView 生成 bot 座位专属视图（硬约定：不使用全知 state 决策）
      const view = projectView(room.state, botSeatId);
      if (!view) return;

      // 2. 调用 core 纯函数决策
      const cmd = botDecide(view, pending.id);
      if (cmd) {
        // 3. 填入该 bot 的合法 seatToken
        const sess = room.findSessionBySeat(botSeatId);
        if (!sess) return;
        cmd.seatToken = sess.seatToken;
      }

      // 4. 走服务端标准 Command 执行管道
      let accepted = false;
      try {
        accepted = cmd ? executeCommand(room, cmd) : false;
      } catch (err) {
        const e = err as Error;
        logger.warn('bot.command_error', {
          roomCode: room.code,
          seatId: botSeatId,
          error: e.message,
        });
        accepted = false;
      }

      if (accepted) {
        retriesOf(room).delete(schedKey);
        return;
      }
      // 5. 被拒收/无决策：旧实现直接 return 且 schedKey 已消费 → 同一 pending 永不重试。
      //    有界重试 3 次后停手，交由窗口超时推进。
      const counts = retriesOf(room);
      const n = (counts.get(schedKey) ?? 0) + 1;
      if (n > MAX_BOT_RETRIES) {
        counts.delete(schedKey);
        logger.warn('bot.retry_exhausted', { roomCode: room.code, seatId: botSeatId });
        return;
      }
      counts.set(schedKey, n);
      room.botScheduledKeys.delete(schedKey);
      room.botTimers.delete(schedKey);
      scheduleBots(room, executeCommand);
    }, delayMs);

    room.botTimers.set(schedKey, timer);
    timer.unref?.();
  }
}
