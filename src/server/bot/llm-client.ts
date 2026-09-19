import type { PlayerView } from '../../shared/types';
import { logger } from '../logger';
import { normalizeLlmApiKey, readLlmConfig, type LlmConfig } from './llm-config';

export type LlmPersonality = 'aggressive' | 'cautious' | 'deceptive';

export interface LlmSummary {
  personality: LlmPersonality;
  trigger: string;
  round: number;
  phase: PlayerView['phase'];
  /** Optional for compatibility with the social scheduler's minimal summary. */
  step?: PlayerView['step'];
  aliveCount: number;
  self: { houseId: PlayerView['self']['houseId']; alive: boolean };
}

/** Explicit allowlist: even knowledge already visible to this bot stays local. */
export function buildLlmSummary(
  view: PlayerView,
  personality: LlmPersonality,
  trigger: string,
): LlmSummary {
  return {
    personality,
    trigger,
    round: view.round,
    phase: view.phase,
    step: view.step,
    aliveCount: view.seats.filter((seat) => seat.alive).length,
    self: {
      // A projected view may intentionally hide the bot's own HOUSE. Never
      // reconstruct or infer it from any other field in that case.
      houseId: view.self.canViewOwnHouse ? view.self.houseId : '',
      alive: view.seats.find((seat) => seat.seatId === view.self.seatId)?.alive ?? false,
    },
  };
}

export const LLM_SYSTEM_PROMPT = '你是《忍者之夜》的社交助手。根据性格和局面生成一句自然的中文短句，最多30个字。激进型偏挑衅，保守型偏观察，欺骗型可模糊暗示。只返回一句文本，不返回JSON或解释。你不负责游戏决策。';

/** Rebuild from an allowlist even when a caller passes a structurally-typed object. */
export function redactLlmSummary(summary: LlmSummary): LlmSummary {
  return {
    personality: summary.personality,
    trigger: summary.trigger,
    round: summary.round,
    phase: summary.phase,
    ...(summary.step === undefined ? {} : { step: summary.step }),
    aliveCount: summary.aliveCount,
    self: {
      houseId: summary.self.houseId,
      alive: summary.self.alive,
    },
  };
}

export function buildLlmRequest(
  config: LlmConfig,
  summary: LlmSummary,
  thinkingType: LlmConfig['thinkingType'] = config.thinkingType,
) {
  return {
    model: config.model,
    messages: [
      { role: 'system', content: LLM_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(redactLlmSummary(summary)) },
    ],
    thinking: { type: thinkingType },
    reasoning_effort: config.reasoningEffort,
    stream: false,
    max_tokens: 50,
  };
}

export interface LlmGenerateInput {
  roomCode: string;
  botSeat: string;
  round: number;
  personality: LlmPersonality;
  trigger: string;
  /** Already-redacted summary; callers should construct this with buildLlmSummary. */
  summary: LlmSummary;
  apiKeyOverride?: string;
  signal?: AbortSignal;
}

export interface LlmCallLog {
  roomCode: string;
  botSeat: string;
  latencyMs: number;
  ok: boolean;
}

export interface LlmRoomStatus {
  round: number;
  callsThisRound: number;
  lastCallAt: number;
  consecutiveFailures: number;
  pausedUntil: number;
}

interface RoomCalls extends LlmRoomStatus {
  revision: number;
  controllers: Set<AbortController>;
}

// One process-wide pool, including clients belonging to different game servers.
let activeRequests = 0;

export function createLlmClient(
  config: LlmConfig = readLlmConfig(),
  dependencies: {
    fetch?: typeof fetch;
    now?: () => number;
    log?: (fields: LlmCallLog) => void;
  } = {},
) {
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? Date.now;
  const writeLog = dependencies.log ?? ((fields: LlmCallLog) => logger.info('bot.llm', { ...fields }));
  const rooms = new Map<string, RoomCalls>();

  function invalidateRoom(roomCode: string): void {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.revision += 1;
    for (const controller of room.controllers) controller.abort();
    room.controllers.clear();
    // Key/configuration changes only invalidate in-flight responses. Keep this
    // room's call budget and circuit breaker so a new key cannot bypass a
    // five-minute Layer 2 pause.
  }

  function clearRoom(roomCode: string): void {
    invalidateRoom(roomCode);
    rooms.delete(roomCode);
  }

  /** null means use the already-selected local action; this never throws. */
  async function generate(input: LlmGenerateInput): Promise<string | null> {
    const apiKey = normalizeLlmApiKey(input.apiKeyOverride) ?? config.apiKey;
    if (!config.enabled || !apiKey || input.signal?.aborted) return null;
    const startedAt = now();
    let room = rooms.get(input.roomCode);
    if (!room) {
      room = {
        round: input.round,
        callsThisRound: 0,
        lastCallAt: Number.NEGATIVE_INFINITY,
        consecutiveFailures: 0,
        pausedUntil: 0,
        revision: 0,
        controllers: new Set(),
      };
      rooms.set(input.roomCode, room);
    }
    if (room.round !== input.round) {
      room.round = input.round;
      room.callsThisRound = 0;
    }
    if (startedAt < room.pausedUntil) return null;
    if (room.pausedUntil !== 0) {
      room.pausedUntil = 0;
      room.consecutiveFailures = 0;
    }
    if (room.callsThisRound >= config.maxCallsPerRound
      || startedAt - room.lastCallAt < config.minIntervalMs
      || activeRequests >= config.maxConcurrent) return null;

    room.callsThisRound += 1;
    room.lastCallAt = startedAt;
    activeRequests += 1;
    const revision = room.revision;
    const controller = new AbortController();
    room.controllers.add(controller);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    let onExternalAbort: (() => void) | undefined;
    let ok = false;
    let cancelled = false;
    try {
      const aborted = new Promise<never>((_resolve, reject) => {
        abortListener = () => reject(new Error('LLM_ABORTED'));
        controller.signal.addEventListener('abort', abortListener, { once: true });
        onExternalAbort = () => controller.abort();
        input.signal?.addEventListener('abort', onExternalAbort, { once: true });
        timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      });
      const request = async (thinkingType: LlmConfig['thinkingType']): Promise<string | null> => {
        const response = await fetcher(`${config.endpoint.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(buildLlmRequest(config, input.summary, thinkingType)),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('LLM_HTTP_FAILED');
        const body: unknown = await response.json();
        const content = (body as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
        if (typeof content !== 'string') throw new Error('LLM_INVALID_RESPONSE');
        const text = content.trim();
        // DeepSeek thinking can consume the complete 50-token budget before
        // emitting the final message. An empty content is recoverable; the
        // caller may retry once with thinking disabled for this social-only
        // request. Length violations remain hard failures.
        if (!text) return null;
        if (Array.from(text).length > 30) throw new Error('LLM_INVALID_LENGTH');
        return text;
      };
      let result = await Promise.race([request(config.thinkingType), aborted]);
      if (result === null && config.thinkingType === 'enabled' && !controller.signal.aborted) {
        result = await Promise.race([request('disabled'), aborted]);
      }
      if (result === null) throw new Error('LLM_EMPTY_RESPONSE');
      if (rooms.get(input.roomCode) !== room || revision !== room.revision || input.signal?.aborted) {
        cancelled = true;
        return null;
      }
      ok = true;
      room.consecutiveFailures = 0;
      return result;
    } catch {
      cancelled = rooms.get(input.roomCode) !== room || revision !== room.revision || !!input.signal?.aborted;
      if (!cancelled) {
        room.consecutiveFailures += 1;
        if (room.consecutiveFailures >= config.failureThreshold) room.pausedUntil = now() + config.circuitBreakMs;
      }
      return null;
    } finally {
      clearTimeout(timeout);
      if (abortListener) controller.signal.removeEventListener('abort', abortListener);
      if (onExternalAbort) input.signal?.removeEventListener('abort', onExternalAbort);
      room.controllers.delete(controller);
      activeRequests -= 1;
      // No request/response body, error object, prompt, or credentials enter logs.
      if (!cancelled) writeLog({ roomCode: input.roomCode, botSeat: input.botSeat, latencyMs: Math.max(0, now() - startedAt), ok });
    }
  }

  return {
    generate,
    invalidateRoom,
    clearRoom,
    status(roomCode: string): LlmRoomStatus | null {
      const room = rooms.get(roomCode);
      if (!room) return null;
      const { round, callsThisRound, lastCallAt, consecutiveFailures, pausedUntil } = room;
      return { round, callsThisRound, lastCallAt, consecutiveFailures, pausedUntil };
    },
    dispose(): void {
      for (const code of rooms.keys()) clearRoom(code);
    },
  };
}

export type LlmClient = ReturnType<typeof createLlmClient>;
