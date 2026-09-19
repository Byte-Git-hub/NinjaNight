import { describe, expect, it } from 'vitest';
import { formatWinRateReport, simulateWinRates } from '../../src/server/bot/winrate';

describe('seeded bot win-rate simulator', () => {
  it('returns deterministic single-round and full-game counters', () => {
    const options = { seeds: [42, 43], playerCount: 4 } as const;
    const first = simulateWinRates(options);
    const second = simulateWinRates(options);

    expect(second).toEqual(first);
    expect(first.games.attempts).toBe(2);
    expect(first.games.wins).toBe(first.games.attempts);
    expect(first.rounds.attempts).toBeGreaterThan(0);
    expect(first.rounds.wins).toBeLessThanOrEqual(first.rounds.attempts);
    expect(Object.keys(first.byPersonality)).toEqual(['aggressive', 'cautious', 'deceptive']);
    expect(first.perSeed).toHaveLength(2);
    expect(first.perSeed.every((result) => result.completed)).toBe(true);
  });

  it('does not expose game state or mutate the seeded game stream', () => {
    const report = simulateWinRates({ seeds: [7], playerCount: 5, includePerSeed: false });
    expect(report.perSeed).toEqual([]);
    expect(Object.keys(report.byHouse).some((house) => house === 'ronin')).toBe(true);
    expect(formatWinRateReport(report)).toContain('personality');
    expect(formatWinRateReport(report)).toContain('round');
    expect(formatWinRateReport(report)).toContain('personality × initial house');
    expect(report.byPersonality.aggressive.round.ci95.low).toBeLessThanOrEqual(
      report.byPersonality.aggressive.round.ci95.high,
    );
  });

  it('reports deterministic progress without retaining per-seed details', () => {
    const progress: number[] = [];
    const report = simulateWinRates({
      seeds: [1, 2, 3],
      playerCount: 4,
      includePerSeed: false,
      onProgress: (completed, total) => {
        expect(total).toBe(3);
        progress.push(completed);
      },
    });
    expect(progress).toEqual([1, 2, 3]);
    expect(report.perSeed).toEqual([]);
  });

  it('rejects unsupported player counts', () => {
    expect(() => simulateWinRates({ seeds: [1], playerCount: 3 })).toThrow(/4–11/);
    expect(() => simulateWinRates({ seeds: [1], playerCount: 12 })).toThrow(/4–11/);
  });
});
