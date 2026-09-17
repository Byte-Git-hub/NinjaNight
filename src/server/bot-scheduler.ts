import type { RoomRuntime } from './room';
import { projectView } from '../core/project-view';
import { botDecide } from '../core/bot';
import type { Command } from '../shared/types';
import { logger } from './logger';

export type BotCommandExecutor = (room: RoomRuntime, cmd: Command) => void;

/**
 * 扫描 room 内所有 bot 座位，为当前有决策待办的 bot 排程拟人延迟后的决策
 */
export function scheduleBots(room: RoomRuntime, executeCommand: BotCommandExecutor): void {
  if (!room.state || room.bots.size === 0) return;
  if (room.state.pending.length === 0) return;

  const baseDelay = Number(process.env.BOT_DELAY_MS ?? 500);
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
      if (!stillPending) return;

      // 1. 严格使用 projectView 生成 bot 座位专属视图（硬约定：不使用全知 state 决策）
      const view = projectView(room.state, botSeatId);
      if (!view) return;

      // 2. 调用 core 纯函数决策
      const cmd = botDecide(view, pending.id);
      if (!cmd) return;

      // 3. 填入该 bot 的合法 seatToken
      const sess = room.findSessionBySeat(botSeatId);
      if (!sess) return;
      cmd.seatToken = sess.seatToken;

      // 4. 走服务端标准 Command 执行管道
      try {
        executeCommand(room, cmd);
      } catch (err) {
        const e = err as Error;
        logger.warn('bot.command_error', {
          roomCode: room.code,
          seatId: botSeatId,
          error: e.message,
        });
      }
    }, delayMs);

    room.botTimers.set(schedKey, timer);
    timer.unref?.();
  }
}
