import { projectView } from '../../core/project-view';
import type { PlayerView } from '../../shared/types';
import { BOT_SOCIAL_ROUND_START_MIN_MS, BOT_SOCIAL_ROUND_START_MAX_MS, LLM_MIN_INTERVAL_MS } from '../../shared/timeouts';
import type { RoomRuntime } from '../room';
import { buildSocialSummary, chooseSocialAction, createBotProfile, socialTriggersFromEvents, type BotProfile, type SocialAction, type SocialRng, type SocialTrigger } from './social-heuristic';

export interface SocialRelay {
  (room: RoomRuntime, botSeatId: string, action: SocialAction): void | Promise<void>;
}
export interface SocialEnhanceContext {
  roomCode: string;
  botSeat: string;
  summary: ReturnType<typeof buildSocialSummary>;
  signal: AbortSignal;
  apiKeyOverride?: string;
}
export interface BotSocialSchedulerOptions {
  relay: SocialRelay;
  enhance?: (ctx: SocialEnhanceContext) => Promise<string | null>;
  minIntervalMs?: number;
  roundStartMinMs?: number;
  roundStartMaxMs?: number;
  rng?: SocialRng;
  now?: () => number;
}
interface SocialJob {
  trigger: SocialTrigger;
  round: number;
  phase: PlayerView['phase'];
  windowId: string;
  controller: AbortController;
  timer?: ReturnType<typeof setTimeout>;
}
interface RoomSocialState {
  profiles: Map<string, BotProfile>;
  cursors: Map<string, number>;
  roundSeen: Map<string, number>;
  triggerKeys: Set<string>;
  jobs: Map<string, SocialJob>;
}
const defaultRng: SocialRng = {
  next: () => Math.random(),
  int: (max) => max > 0 ? Math.floor(Math.random() * max) : 0,
};

/** Separate from Command timers and game RNG. Only llm-client owns the circuit breaker. */
export function createBotSocialScheduler(options: BotSocialSchedulerOptions) {
  const states = new Map<RoomRuntime, RoomSocialState>();
  const rng = options.rng ?? defaultRng;
  const now = options.now ?? Date.now;
  const interval = Math.max(0, options.minIntervalMs ?? LLM_MIN_INTERVAL_MS);
  const startMin = Math.max(0, options.roundStartMinMs ?? BOT_SOCIAL_ROUND_START_MIN_MS);
  const startMax = Math.max(startMin, options.roundStartMaxMs ?? BOT_SOCIAL_ROUND_START_MAX_MS);
  let closed = false;

  function stateFor(room: RoomRuntime): RoomSocialState {
    let state = states.get(room);
    if (!state) {
      state = { profiles: new Map(), cursors: new Map(), roundSeen: new Map(), triggerKeys: new Set(), jobs: new Map() };
      states.set(room, state);
    }
    return state;
  }

  function cancel(job: SocialJob): void {
    clearTimeout(job.timer);
    job.controller.abort();
  }

  function currentView(room: RoomRuntime, state: RoomSocialState, seatId: string, job: SocialJob): PlayerView | null {
    if (closed || states.get(room) !== state || state.jobs.get(seatId) !== job || job.controller.signal.aborted ||
      !room.started || !room.state || room.state.gameOver || !room.bots.has(seatId)) return null;
    const view = projectView(room.state, seatId);
    if (!view || view.round !== job.round) return null;
    const alive = view.seats.find((seat) => seat.seatId === seatId)?.alive;
    if (job.trigger.kind === 'lastWords') return alive === false ? view : null;
    if (!alive) return null;
    if (job.trigger.kind === 'beforeHouseReveal') return view.phase === 'nightShinobi' ? view : null;
    if (job.trigger.kind === 'reactionOpened') {
      return view.windowId === job.windowId && view.step === 'reactWindow' && view.phase === job.phase ? view : null;
    }
    if (job.trigger.kind === 'roundStart') {
      return view;
    }
    return view.phase === job.phase ? view : null;
  }

  async function run(room: RoomRuntime, state: RoomSocialState, seatId: string, profile: BotProfile, job: SocialJob): Promise<void> {
    try {
      const view = currentView(room, state, seatId, job);
      if (!view) return;
      const local = chooseSocialAction(view, profile, job.trigger, rng);
      if (!local) return;
      let action = local;
      if (options.enhance && rng.next() < profile.llmChance) {
        try {
          const text = await options.enhance({
            roomCode: room.code, botSeat: seatId,
            summary: buildSocialSummary(view, profile, job.trigger),
            signal: job.controller.signal, apiKeyOverride: room.llmOverrideKey,
          });
          if (text) action = { kind: 'chat', text };
        } catch {
          // Errors use the selected local action; cancellations never send a fallback.
        }
      }
      if (!currentView(room, state, seatId, job)) return;
      if (now() - profile.lastSocialAt < interval) return;
      await options.relay(room, seatId, action);
      profile.lastSocialAt = now();
      if (job.trigger.kind === 'lastWords') profile.lastWordsUsed = true;
    } catch {
      // A social relay failure must never reject into the game loop.
    } finally {
      if (state.jobs.get(seatId) === job) state.jobs.delete(seatId);
    }
  }

  function queue(room: RoomRuntime, state: RoomSocialState, view: PlayerView, profile: BotProfile, trigger: SocialTrigger): void {
    const seatId = profile.seatId;
    const key = `${seatId}:${trigger.key}`;
    if (state.triggerKeys.has(key)) return;
    state.triggerKeys.add(key);
    if (trigger.kind === 'lastWords' && profile.lastWordsUsed) return;
    const existing = state.jobs.get(seatId);
    if (existing) {
      // A death cancels obsolete live commentary. Every other bot has one pending/in-flight job.
      if (trigger.kind !== 'lastWords') return;
      cancel(existing);
      state.jobs.delete(seatId);
    }
    const job: SocialJob = { trigger, round: view.round, phase: view.phase, windowId: view.windowId, controller: new AbortController() };
    const triggerDelay = trigger.kind === 'roundStart' ? startMin + rng.int(startMax - startMin + 1) : 0;
    const cooldownDelay = Math.max(0, profile.lastSocialAt + interval - now());
    state.jobs.set(seatId, job);
    job.timer = setTimeout(() => {
      job.timer = undefined;
      void run(room, state, seatId, profile, job);
    }, Math.max(triggerDelay, cooldownDelay));
    job.timer.unref?.();
  }

  function sync(room: RoomRuntime): void {
    if (closed || !room.started || !room.state || room.state.gameOver) {
      clear(room);
      return;
    }
    const state = stateFor(room);
    for (const [seatId, job] of state.jobs) {
      if (!currentView(room, state, seatId, job)) {
        cancel(job);
        state.jobs.delete(seatId);
      }
    }
    for (const seatId of room.bots) {
      const view = projectView(room.state, seatId);
      if (!view) continue;
      let profile = state.profiles.get(seatId);
      if (!profile) {
        profile = createBotProfile(seatId, rng);
        state.profiles.set(seatId, profile);
      }
      const cursor = state.cursors.get(seatId) ?? 0;
      const triggers = socialTriggersFromEvents(view, cursor);
      // Prefer a last word over other simultaneous events.
      triggers.sort((a, b) => Number(b.kind === 'lastWords') - Number(a.kind === 'lastWords'));
      for (const trigger of triggers) queue(room, state, view, profile, trigger);
      if (state.roundSeen.get(seatId) !== view.round) {
        state.roundSeen.set(seatId, view.round);
        queue(room, state, view, profile, { kind: 'roundStart', key: `round:${view.round}` });
      }
      if (view.phase === 'nightShinobi') queue(room, state, view, profile, { kind: 'beforeHouseReveal', key: `reveal:${view.round}` });
      state.cursors.set(seatId, view.events.reduce((seq, event) => Math.max(seq, event.seq), cursor));
    }
  }

  /** Key replacement cancels work but preserves personality, event cursor and last words. */
  function invalidate(room: RoomRuntime): void {
    const state = states.get(room);
    if (!state) return;
    for (const job of state.jobs.values()) cancel(job);
    state.jobs.clear();
  }
  function clear(room: RoomRuntime): void {
    invalidate(room);
    states.delete(room);
  }
  function close(): void {
    closed = true;
    for (const room of states.keys()) clear(room);
  }
  return { sync, clear, invalidate, close };
}
export type { BotProfile, SocialAction, SocialTrigger };

