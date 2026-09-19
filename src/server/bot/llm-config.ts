import {
  LLM_TIMEOUT_MS,
  LLM_MAX_CALLS_PER_ROUND,
  LLM_MIN_INTERVAL_MS,
  LLM_MAX_CONCURRENT,
  LLM_FAILURE_THRESHOLD,
  LLM_CIRCUIT_BREAK_MS,
} from '../../shared/timeouts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface LlmConfig {
  enabled: boolean;
  endpoint: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  maxCallsPerRound: number;
  minIntervalMs: number;
  maxConcurrent: number;
  failureThreshold: number;
  circuitBreakMs: number;
  thinkingType: 'enabled' | 'disabled';
  reasoningEffort: 'low' | 'high' | 'max';
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

/** Server-only configuration. Never expose this object in a client payload. */
function loadServerEnv(): NodeJS.ProcessEnv {
  // Railway/production normally injects process.env. For local development,
  // read only the LLM variables from an optional .env.local without logging or
  // exposing the file contents. Explicitly supplied env objects stay isolated
  // for tests and callers that manage configuration themselves.
  const out: NodeJS.ProcessEnv = { ...process.env };
  try {
    const text = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*(LLM_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match || out[match[1]] !== undefined) continue;
      out[match[1]] = match[2]?.replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // Missing .env.local is normal in production.
  }
  return out;
}

export function readLlmConfig(env: NodeJS.ProcessEnv = loadServerEnv()): LlmConfig {
  const effort = env.LLM_REASONING_EFFORT;
  return {
    enabled: env.LLM_ENABLED === 'true',
    endpoint: (env.LLM_ENDPOINT?.trim() || 'https://api.deepseek.com').replace(/\/+$/, ''),
    model: env.LLM_MODEL?.trim() || 'deepseek-flash',
    apiKey: normalizeLlmApiKey(env.LLM_API_KEY) ?? '',
    timeoutMs: positiveInt(env.LLM_TIMEOUT_MS, LLM_TIMEOUT_MS),
    maxCallsPerRound: positiveInt(env.LLM_MAX_CALLS_PER_ROUND, LLM_MAX_CALLS_PER_ROUND),
    minIntervalMs: positiveInt(env.LLM_MIN_INTERVAL_MS, LLM_MIN_INTERVAL_MS),
    maxConcurrent: LLM_MAX_CONCURRENT,
    failureThreshold: LLM_FAILURE_THRESHOLD,
    circuitBreakMs: LLM_CIRCUIT_BREAK_MS,
    thinkingType: env.LLM_THINKING_TYPE === 'disabled' ? 'disabled' : 'enabled',
    reasoningEffort: effort === 'high' || effort === 'max' ? effort : 'low',
  };
}

/** Blank/example keys mean local-only; no credential is logged or persisted. */
export function normalizeLlmApiKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const key = value.trim();
  return key && key !== 'sk-REPLACE_ME' ? key : undefined;
}
