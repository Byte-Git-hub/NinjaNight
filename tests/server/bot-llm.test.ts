import { describe, expect, it, vi } from 'vitest';
import { buildLlmSummary, createLlmClient, LLM_SYSTEM_PROMPT, type LlmSummary } from '../../src/server/bot/llm-client';
import { readLlmConfig } from '../../src/server/bot/llm-config';
import type { PlayerView } from '../../src/shared/types';

function view(): PlayerView {
  return {
    roomCode: 'ABC123',
    round: 2,
    phase: 'nightSpy',
    step: 'chooseTarget',
    windowId: 'w1',
    pendingDecision: null,
    seats: [
      { seatId: 'bot', nickname: 'bot', connected: true, alive: true, isHost: true, honorTokenCount: 1, handCount: 2, publicHouseId: 'HOUSE_B' as never },
      { seatId: 'p2', nickname: 'p2', connected: true, alive: true, isHost: false, honorTokenCount: 1, handCount: 2, publicHouseId: 'HOUSE_C' as never },
    ],
    self: {
      seatId: 'bot', houseId: 'HOUSE_A' as never, canViewOwnHouse: true,
      hand: [{ instanceId: 'secret-card', cardId: 'assassin' as never, number: null }],
      reserved: [], honorTokens: [], knownHouseHistory: [{ round: 1, targetSeatId: 'p2', houseId: 'HOUSE_C' as never }],
      declaredThisPhase: [], hasPending: false,
    },
    events: [], revealedCards: [], gameOver: false, winners: [],
  } as PlayerView;
}

function config(overrides: Partial<ReturnType<typeof readLlmConfig>> = {}) {
  return {
    ...readLlmConfig({ LLM_ENABLED: 'true', LLM_API_KEY: 'sk-test', LLM_TIMEOUT_MS: '50', LLM_MIN_INTERVAL_MS: '0' }),
    ...overrides,
  };
}

function response(content: string, ok = true): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: ok ? 200 : 500 });
}

describe('server bot LLM client', () => {
  it('构造最小摘要：只允许自身 house，不含他人 house/手牌/knownHouseHistory', () => {
    const summary = buildLlmSummary(view(), 'cautious', 'roundStart');
    const json = JSON.stringify(summary);
    expect(summary.self.houseId).toBe('HOUSE_A');
    expect(json).toContain('HOUSE_A');
    expect(json).not.toContain('HOUSE_B');
    expect(json).not.toContain('HOUSE_C');
    expect(json).not.toContain('secret-card');
    expect(json).not.toContain('knownHouseHistory');
    expect(json).not.toContain('hand');
  });

  it('自身 HOUSE 不可见时不猜测或发送真实 HOUSE', () => {
    const hidden = { ...view(), self: { ...view().self, canViewOwnHouse: false } } as PlayerView;
    const summary = buildLlmSummary(hidden, 'cautious', 'roundStart');
    expect(summary.self.houseId).toBe('');
    expect(JSON.stringify(summary)).not.toContain('HOUSE_A');
  });

  it('发送 OpenAI 兼容请求并返回短文本', async () => {
    let request: RequestInit | undefined;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      request = init;
      return response('先观察一下');
    });
    const client = createLlmClient(config(), { fetch: fetcher });
    const summary = buildLlmSummary(view(), 'aggressive', 'reactionOpen');
    await expect(client.generate({ roomCode: 'ABC123', botSeat: 'bot', round: 2, personality: 'aggressive', trigger: 'reactionOpen', summary })).resolves.toBe('先观察一下');
    expect(fetcher).toHaveBeenCalledOnce();
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>;
    expect(body.model).toBe('deepseek-flash');
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBe(50);
    expect(JSON.stringify(body)).not.toContain('HOUSE_B');
    expect(JSON.stringify(body)).not.toContain('knownHouseHistory');
  });

  it('思考模式耗尽短 token 预算时，社交请求降级为关闭思考再取一次文本', async () => {
    const requests: Record<string, unknown>[] = [];
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(body);
      return response(requests.length === 1 ? '' : '我先观察');
    });
    const client = createLlmClient(config(), { fetch: fetcher });
    const summary = buildLlmSummary(view(), 'cautious', 'roundStart');
    await expect(client.generate({ roomCode: 'EMPTY', botSeat: 'bot', round: 1, personality: 'cautious', trigger: 'roundStart', summary })).resolves.toBe('我先观察');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((requests[0]?.thinking as { type: string }).type).toBe('enabled');
    expect((requests[1]?.thinking as { type: string }).type).toBe('disabled');
  });

  it('即使调用方传入额外字段，请求 JSON 仍按摘要白名单重建', async () => {
    let request: RequestInit | undefined;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      request = init;
      return response('收到');
    });
    const summary = {
      ...buildLlmSummary(view(), 'cautious', 'roundStart'),
      hand: ['secret-card'],
      knownHouseHistory: [{ houseId: 'HOUSE_C' }],
      otherHouse: 'HOUSE_B',
    } as unknown as LlmSummary;
    const client = createLlmClient(config(), { fetch: fetcher });
    await client.generate({ roomCode: 'ABC123', botSeat: 'bot', round: 2, personality: 'cautious', trigger: 'roundStart', summary });
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>;
    const user = (body.messages as { content: string }[])[1]?.content ?? '';
    expect(user).toContain('HOUSE_A');
    expect(user).not.toContain('HOUSE_B');
    expect(user).not.toContain('HOUSE_C');
    expect(user).not.toContain('knownHouseHistory');
    expect(user).not.toContain('secret-card');
  });

  it('超时回退，并连续失败三次后本房间熔断', async () => {
    let now = 1_000;
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const logs: unknown[] = [];
    const client = createLlmClient(config({ timeoutMs: 5, minIntervalMs: 0 }), { fetch: fetcher, now: () => now, log: (x) => logs.push(x) });
    const summary = buildLlmSummary(view(), 'cautious', 'roundStart');
    for (let i = 0; i < 3; i += 1) {
      await expect(client.generate({ roomCode: 'ABC123', botSeat: 'bot', round: i + 1, personality: 'cautious', trigger: 'roundStart', summary })).resolves.toBeNull();
      now += 1;
    }
    expect(client.status('ABC123')?.consecutiveFailures).toBe(3);
    expect(client.status('ABC123')?.pausedUntil).toBeGreaterThan(now);
    const calls = fetcher.mock.calls.length;
    await expect(client.generate({ roomCode: 'ABC123', botSeat: 'bot', round: 4, personality: 'cautious', trigger: 'roundStart', summary })).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(calls);
    expect(logs).toHaveLength(3);
  });

  it('默认超时精确为 8 秒', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }));
      const client = createLlmClient(config({ timeoutMs: 8_000, minIntervalMs: 0 }), { fetch: fetcher });
      const summary = buildLlmSummary(view(), 'cautious', 'roundStart');
      const pending = client.generate({ roomCode: 'TIME', botSeat: 'bot', round: 1, personality: 'cautious', trigger: 'roundStart', summary });
      await vi.advanceTimersByTimeAsync(7_999);
      expect(fetcher).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('熔断期间只暂停故障房间，5 分钟后成功会清除失败计数', async () => {
    let now = 1_000;
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      return calls <= 3 ? response('', false) : response('恢复');
    });
    const client = createLlmClient(config({ minIntervalMs: 0 }), { fetch: fetcher, now: () => now });
    const summary = buildLlmSummary(view(), 'cautious', 'roundStart');
    for (let round = 1; round <= 3; round += 1) {
      await client.generate({ roomCode: 'FAIL', botSeat: 'bot', round, personality: 'cautious', trigger: 'roundStart', summary });
    }
    expect(client.status('FAIL')?.pausedUntil).toBe(301_000);
    await expect(client.generate({ roomCode: 'FAIL', botSeat: 'bot', round: 4, personality: 'cautious', trigger: 'roundStart', summary })).resolves.toBeNull();
    expect(calls).toBe(3);
    await expect(client.generate({ roomCode: 'OK', botSeat: 'bot', round: 1, personality: 'cautious', trigger: 'roundStart', summary })).resolves.toBe('恢复');
    now = 301_001;
    await expect(client.generate({ roomCode: 'FAIL', botSeat: 'bot', round: 4, personality: 'cautious', trigger: 'roundStart', summary })).resolves.toBe('恢复');
    expect(client.status('FAIL')?.consecutiveFailures).toBe(0);
  });

  it('过滤空文本/超长文本；仅做长度校验', async () => {
    const fetcher = vi.fn(async () => response('x'.repeat(100)));
    const client = createLlmClient(config(), { fetch: fetcher });
    const summary: LlmSummary = buildLlmSummary(view(), 'deceptive', 'death');
    await expect(client.generate({ roomCode: 'ABC123', botSeat: 'bot', round: 2, personality: 'deceptive', trigger: 'death', summary })).resolves.toBeNull();
  });

  it('无 key、关闭 LLM、并发池满与限频均不计入失败', async () => {
    const summary = buildLlmSummary(view(), 'cautious', 'roundStart');
    const disabled = createLlmClient(config({ enabled: false }), { fetch: vi.fn() });
    await expect(disabled.generate({ roomCode: 'D', botSeat: 'bot', round: 1, personality: 'cautious', trigger: 'roundStart', summary })).resolves.toBeNull();
    expect(disabled.status('D')).toBeNull();
    const noKey = createLlmClient(config({ apiKey: '' }), { fetch: vi.fn() });
    await expect(noKey.generate({ roomCode: 'N', botSeat: 'bot', round: 1, personality: 'cautious', trigger: 'roundStart', summary })).resolves.toBeNull();
    expect(noKey.status('N')).toBeNull();

    const release: (() => void)[] = [];
    const pendingFetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      release.push(() => resolve(response('ok')));
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const pool = createLlmClient(config({ minIntervalMs: 100 }), { fetch: pendingFetch });
    const requests = Array.from({ length: 5 }, (_, i) => pool.generate({ roomCode: `P${i}`, botSeat: 'bot', round: 1, personality: 'cautious', trigger: 'roundStart', summary }));
    await Promise.resolve();
    await expect(pool.generate({ roomCode: 'P5', botSeat: 'bot', round: 1, personality: 'cautious', trigger: 'roundStart', summary })).resolves.toBeNull();
    expect(pool.status('P5')?.consecutiveFailures).toBe(0);
    for (const done of release) done();
    await Promise.all(requests);
    const limitedFetch = vi.fn(async () => response('ok'));
    const limited = createLlmClient(config({ minIntervalMs: 5_000 }), { fetch: limitedFetch });
    await limited.generate({ roomCode: 'LIMIT', botSeat: 'bot', round: 1, personality: 'cautious', trigger: 'roundStart', summary });
    await limited.generate({ roomCode: 'LIMIT', botSeat: 'bot', round: 1, personality: 'cautious', trigger: 'roundStart', summary });
    expect(limitedFetch).toHaveBeenCalledOnce();
    expect(limited.status('LIMIT')?.consecutiveFailures).toBe(0);
  });

  it('房间 override Authorization 隔离，日志不含 key/prompt/output', async () => {
    const seen: { init?: RequestInit }[] = [];
    const logs: object[] = [];
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push({ init });
      return response('房间输出');
    });
    const client = createLlmClient(config({ minIntervalMs: 0 }), { fetch: fetcher, log: (entry) => logs.push(entry) });
    const summary = buildLlmSummary(view(), 'cautious', 'roundStart');
    await client.generate({ roomCode: 'A', botSeat: 'bot', round: 1, personality: 'cautious', trigger: 'roundStart', summary, apiKeyOverride: 'key-A' });
    await client.generate({ roomCode: 'B', botSeat: 'bot', round: 1, personality: 'cautious', trigger: 'roundStart', summary, apiKeyOverride: 'key-B' });
    expect((seen[0]?.init?.headers as Record<string, string>).Authorization).toBe('Bearer key-A');
    expect((seen[1]?.init?.headers as Record<string, string>).Authorization).toBe('Bearer key-B');
    const logText = JSON.stringify(logs);
    expect(logText).not.toContain('key-A');
    expect(logText).not.toContain('key-B');
    expect(logText).not.toContain('房间输出');
    expect(logText).not.toContain(LLM_SYSTEM_PROMPT);
  });

  it('每轮最多三次且间隔不足时不调用；可切换房间 key', async () => {
    let now = 10_000;
    const fetcher = vi.fn(async () => response('好'));
    const client = createLlmClient(config({ maxCallsPerRound: 3, minIntervalMs: 100 }), { fetch: fetcher, now: () => now });
    const summary = buildLlmSummary(view(), 'cautious', 'roundStart');
    const input = { roomCode: 'A', botSeat: 'bot', round: 1, personality: 'cautious' as const, trigger: 'roundStart', summary };
    await client.generate(input);
    await client.generate(input);
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += 100;
    await client.generate(input);
    now += 100;
    await client.generate(input);
    now += 100;
    await client.generate(input);
    expect(fetcher).toHaveBeenCalledTimes(3);
    await client.generate({ ...input, roomCode: 'B' });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('房主撤回 key 会中断旧请求，旧结果不返回也不计入熔断', async () => {
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const client = createLlmClient(config({ timeoutMs: 10_000 }), { fetch: fetcher });
    const summary = buildLlmSummary(view(), 'cautious', 'roundStart');
    const pending = client.generate({ roomCode: 'A', botSeat: 'bot', round: 1, personality: 'cautious', trigger: 'roundStart', summary });
    client.invalidateRoom('A');
    await expect(pending).resolves.toBeNull();
    expect(client.status('A')).not.toBeNull();
  });
});
