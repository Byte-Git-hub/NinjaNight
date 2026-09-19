/**
 * Deterministic, read-only bot simulation used for balancing.
 *
 * This module deliberately lives outside the room runtime. It creates an
 * in-memory GameState, drives every pending decision with the same core bot
 * policy, and returns aggregate counters. No room, socket, log, or LLM state
 * is touched. Social personalities are labels here: social behaviour must not
 * change the authoritative game state or its seeded replay.
 */

import { botDecide } from '../../core/bot';
import { applyAllDefaults, applyCommand } from '../../core/engine';
import { createGame } from '../../core/setup';
import { createRng } from '../../core/rng';
import { projectView } from '../../core/project-view';
import { findSeat } from '../../core/utils';
import type { GameState } from '../../core/game-state';

export const SOCIAL_PERSONALITIES = ['aggressive', 'cautious', 'deceptive'] as const;
export type SocialPersonality = (typeof SOCIAL_PERSONALITIES)[number];

export interface WinRateBucket {
  attempts: number;
  wins: number;
  /** wins / attempts, in the range [0, 1]. */
  rate: number;
  /** Wilson score 95% confidence interval for the observed rate. */
  ci95: { low: number; high: number };
}

export interface WinRateGroup {
  personality: SocialPersonality;
  /** The seat's house in each scored round. */
  house: string;
  round: WinRateBucket;
  /** Games are attributed to the seat's initial house for that seed. */
  game: WinRateBucket;
}

export interface SeedWinRateResult {
  seed: number;
  completed: boolean;
  rounds: number;
  winnerSeatIds: string[];
  /** Personality and initial-house assignment for this game. */
  seats: Array<{ seatId: string; personality: SocialPersonality; house: string }>;
}

export interface WinRateReport {
  playerCount: number;
  seeds: number[];
  /** Simulation completion (this is not a player win rate). */
  games: WinRateBucket;
  rounds: WinRateBucket;
  byPersonality: Record<SocialPersonality, { round: WinRateBucket; game: WinRateBucket }>;
  /** Keys are house ids (for example crane:1, lotus:2, ronin). */
  byHouse: Record<string, { round: WinRateBucket; game: WinRateBucket }>;
  /** Keys are `${personality}|${initialHouse}`. */
  byPersonalityAndHouse: Record<string, WinRateGroup>;
  perSeed: SeedWinRateResult[];
}

export interface SimulateWinRatesOptions {
  seeds: readonly number[];
  playerCount?: number;
  /** Keep per-seed details in the result. Defaults to true for reproducibility. */
  includePerSeed?: boolean;
  /** Bound a malformed engine run instead of hanging a balancing job. */
  maxStepsPerGame?: number;
  /** Called after each seed; intended for CLI progress reporting. */
  onProgress?: (completed: number, total: number) => void;
}

interface SeatProfile {
  seatId: string;
  personality: SocialPersonality;
  initialHouse: string;
}

interface RoundRecord {
  round: number;
  seatId: string;
  personality: SocialPersonality;
  house: string;
  won: boolean;
}

function emptyBucket(): WinRateBucket {
  return { attempts: 0, wins: 0, rate: 0, ci95: { low: 0, high: 0 } };
}

function updateConfidence(bucket: WinRateBucket): void {
  if (bucket.attempts === 0) {
    bucket.ci95 = { low: 0, high: 0 };
    return;
  }
  // Wilson interval (z=1.96) remains useful for 0/1 rates and small samples.
  const n = bucket.attempts;
  const p = bucket.rate;
  const z = 1.96;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denominator;
  bucket.ci95 = { low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) };
}

function add(bucket: WinRateBucket, won: boolean): void {
  bucket.attempts += 1;
  if (won) bucket.wins += 1;
  bucket.rate = bucket.attempts === 0 ? 0 : bucket.wins / bucket.attempts;
  updateConfidence(bucket);
}

function personalityFor(seed: number, seatIndex: number): SocialPersonality {
  // Assignment is deterministic and independent of GameState.rng. This keeps
  // a report reproducible without changing the game seed/replay stream.
  const n = Math.abs(Math.trunc(seed)) + seatIndex * 7;
  return SOCIAL_PERSONALITIES[n % SOCIAL_PERSONALITIES.length] as SocialPersonality;
}

function latestRoundEvents(state: GameState, seen: Set<number>): RoundRecord[] {
  const event = [...state.events]
    .reverse()
    .find((e) => e.type === 'score.roundWinner' && !seen.has(e.round));
  if (!event) return [];

  seen.add(event.round);
  const payload = event.payload as {
    awarded?: Array<{ seatId?: string }>;
  };
  // score.roundWinner exposes awarded seat ids for every normal/tie path. A
  // missing list means no one won this round (all-dead or an empty token pool).
  const winnerIds = new Set(
    (payload.awarded ?? [])
      .map((entry) => entry.seatId)
      .filter((id): id is string => typeof id === 'string'),
  );

  return state.seats.map((seat) => ({
    round: event.round,
    seatId: seat.seatId,
    personality: personalityFor(state.seed, Number(seat.seatId.slice(1)) || 0),
    house: seat.house,
    won: winnerIds.has(seat.seatId),
  }));
}

function driveGame(
  seed: number,
  playerCount: number,
  maxSteps: number,
): { state: GameState; profiles: SeatProfile[]; roundRecords: RoundRecord[]; completed: boolean } {
  let state = createGame({ seed, seedFixed: true, playerCount });
  const profiles: SeatProfile[] = state.seats.map((seat, index) => ({
    seatId: seat.seatId,
    personality: personalityFor(seed, index),
    initialHouse: seat.house,
  }));
  // Separate decision streams ensure bot choices do not consume the game RNG.
  const decisionRng = new Map<string, ReturnType<typeof createRng>>(
    state.seats.map((seat, index) => [seat.seatId, createRng((seed ^ 0x51f15e + index * 7919) >>> 0)]),
  );
  const seenRounds = new Set<number>();
  const roundRecords: RoundRecord[] = [];

  let step = 0;
  while (!state.gameOver && step < maxSteps) {
    step += 1;
    roundRecords.push(...latestRoundEvents(state, seenRounds));

    if (state.pending.length === 0) {
      const before = state;
      const result = applyAllDefaults(state);
      state = result.state;
      // A defensive guard for a future phase that has no transition.
      if (state === before && state.pending.length === 0 && !state.gameOver) break;
      continue;
    }

    let progressed = false;
    for (const pending of [...state.pending]) {
      const current = state.pending.find((candidate) => candidate.id === pending.id);
      if (!current) continue;
      const view = projectView(state, current.seatId);
      const seat = findSeat(state, current.seatId);
      if (!view || !seat) continue;
      const command = botDecide(view, current.id, decisionRng.get(current.seatId));
      if (!command) {
        const fallback = applyAllDefaults(state);
        state = fallback.state;
        progressed = true;
        break;
      }
      command.seatToken = seat.seatToken;
      command.commandId = `winrate-${seed}-${step}-${current.id}`;
      const result = applyCommand(state, command);
      state = result.state;
      if (!result.ok) {
        const fallback = applyAllDefaults(state);
        state = fallback.state;
      }
      progressed = true;
    }
    if (!progressed) break;
  }

  roundRecords.push(...latestRoundEvents(state, seenRounds));
  return { state, profiles, roundRecords, completed: state.gameOver };
}

function ensure<T extends { round: WinRateBucket; game: WinRateBucket }>(
  map: Record<string, T>,
  key: string,
  create: () => T,
): T {
  const existing = map[key];
  if (existing) return existing;
  const value = create();
  map[key] = value;
  return value;
}

export function simulateWinRates(options: SimulateWinRatesOptions): WinRateReport {
  const seeds = [...options.seeds];
  const playerCount = options.playerCount ?? 4;
  if (playerCount < 4 || playerCount > 11) throw new Error('playerCount must be 4–11');
  const maxSteps = options.maxStepsPerGame ?? 8_000;

  const games = emptyBucket();
  const rounds = emptyBucket();
  const byPersonality = Object.fromEntries(
    SOCIAL_PERSONALITIES.map((personality) => [personality, { round: emptyBucket(), game: emptyBucket() }]),
  ) as WinRateReport['byPersonality'];
  const byHouse: WinRateReport['byHouse'] = {};
  const byPersonalityAndHouse: WinRateReport['byPersonalityAndHouse'] = {};
  const perSeed: SeedWinRateResult[] = [];

  for (const [index, seed] of seeds.entries()) {
    const run = driveGame(seed, playerCount, maxSteps);
    add(games, run.completed);
    for (const record of run.roundRecords) {
      const profile = run.profiles.find((entry) => entry.seatId === record.seatId);
      if (!profile) continue;
      add(rounds, record.won);
      add(byPersonality[record.personality].round, record.won);
      const house = ensure(byHouse, record.house, () => ({ round: emptyBucket(), game: emptyBucket() }));
      add(house.round, record.won);
      const key = `${record.personality}|${profile.initialHouse}`;
      const combo = ensure(byPersonalityAndHouse, key, () => ({
        personality: record.personality,
        house: profile.initialHouse,
        round: emptyBucket(),
        game: emptyBucket(),
      }));
      add(combo.round, record.won);
    }

    const winnerIds = new Set(run.state.winners);
    for (const profile of run.profiles) {
      const gameWon = winnerIds.has(profile.seatId);
      add(byPersonality[profile.personality].game, gameWon);
      const house = ensure(byHouse, profile.initialHouse, () => ({ round: emptyBucket(), game: emptyBucket() }));
      add(house.game, gameWon);
      const key = `${profile.personality}|${profile.initialHouse}`;
      const combo = ensure(byPersonalityAndHouse, key, () => ({
        personality: profile.personality,
        house: profile.initialHouse,
        round: emptyBucket(),
        game: emptyBucket(),
      }));
      add(combo.game, gameWon);
    }

    if (options.includePerSeed !== false) {
      perSeed.push({
        seed,
        completed: run.completed,
        rounds: run.roundRecords.reduce((max, record) => Math.max(max, record.round), 0),
        winnerSeatIds: [...run.state.winners],
        seats: run.profiles.map((profile) => ({
          seatId: profile.seatId,
          personality: profile.personality,
          house: profile.initialHouse,
        })),
      });
    }
    options.onProgress?.(index + 1, seeds.length);
  }

  return {
    playerCount,
    seeds,
    games,
    rounds,
    byPersonality,
    byHouse,
    byPersonalityAndHouse,
    perSeed,
  };
}

/** Human-readable table for a balancing run. */
export function formatWinRateReport(report: WinRateReport): string {
  const pct = (bucket: WinRateBucket): string => {
    const rate = `${(bucket.rate * 100).toFixed(1)}% (${bucket.wins}/${bucket.attempts})`;
    if (bucket.attempts < 2) return rate;
    return `${rate} [95% ${(bucket.ci95.low * 100).toFixed(1)}–${(bucket.ci95.high * 100).toFixed(1)}]`;
  };
  const lines = [
    `games: ${pct(report.games)} completed`,
    `rounds: ${pct(report.rounds)}`,
    '',
    'personality             round             game',
  ];
  for (const personality of SOCIAL_PERSONALITIES) {
    const row = report.byPersonality[personality];
    lines.push(`${personality.padEnd(22)} ${pct(row.round).padEnd(17)} ${pct(row.game)}`);
  }
  lines.push('', 'house (round / game):');
  for (const house of Object.keys(report.byHouse).sort()) {
    const row = report.byHouse[house];
    lines.push(`${house.padEnd(14)} ${pct(row.round)} / ${pct(row.game)}`);
  }
  lines.push('', 'personality × initial house (round / game):');
  for (const key of Object.keys(report.byPersonalityAndHouse).sort()) {
    const row = report.byPersonalityAndHouse[key];
    lines.push(`${key.padEnd(28)} ${pct(row.round)} / ${pct(row.game)}`);
  }
  return lines.join('\n');
}
