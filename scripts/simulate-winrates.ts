/**
 * Run deterministic seeded bot games and print single-round/full-game win
 * rates. This is intentionally a read-only balancing tool; it never starts a
 * server and never contacts an LLM.
 *
 * Examples:
 *   npx tsx scripts/simulate-winrates.ts --seed 42
 *   npx tsx scripts/simulate-winrates.ts --from 1 --to 100 --players 6
 *   npx tsx scripts/simulate-winrates.ts --from 1 --to 100 --json > winrates.json
 */

import { formatWinRateReport, simulateWinRates } from '../src/server/bot/winrate';

function numberArg(args: string[], name: string): number | null {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = Number(args[index + 1]);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} requires an integer`);
  return value;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function parseSeeds(args: string[]): number[] {
  const one = numberArg(args, '--seed');
  if (one !== null) return [one];
  const from = numberArg(args, '--from') ?? 1;
  const explicitCount = numberArg(args, '--count');
  const to = explicitCount === null ? (numberArg(args, '--to') ?? from) : from + explicitCount - 1;
  if (explicitCount !== null && explicitCount < 1) throw new Error('--count must be >= 1');
  if (to < from) throw new Error('--to must be >= --from');
  const seedCount = to - from + 1;
  if (seedCount > 100_000) throw new Error('refusing to run more than 100000 seeds');
  return Array.from({ length: seedCount }, (_, index) => from + index);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log([
    'NinjaNight seeded bot win-rate simulator',
    '',
    '  --seed N             simulate one seed (default: 1)',
    '  --from N --to N      inclusive seed range',
    '  --from N --count N   run N seeds starting at N',
    '  --players N          player count, 4–11 (default: 4)',
    '  --no-per-seed        omit verbose per-seed details (recommended for 1000+ seeds)',
    '  --progress           print progress to stderr every 1%',
    '  --json               print machine-readable JSON',
  ].join('\n'));
  process.exit(0);
}

try {
  const playerCount = numberArg(args, '--players') ?? 4;
  const seeds = parseSeeds(args);
  const progress = hasFlag(args, '--progress');
  const report = simulateWinRates({
    seeds,
    playerCount,
    includePerSeed: !hasFlag(args, '--no-per-seed'),
    onProgress: progress ? (completed, total) => {
      const step = Math.max(1, Math.ceil(total / 100));
      if (completed === total || completed % step === 0) {
        process.stderr.write(`progress ${completed}/${total} (${Math.round(completed / total * 100)}%)\r`);
        if (completed === total) process.stderr.write('\n');
      }
    } : undefined,
  });
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else console.log(formatWinRateReport(report));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
