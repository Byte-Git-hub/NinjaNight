import { describe, expect, it, vi } from 'vitest';
import { logger } from '../../src/server/logger';

describe('LLM log redaction', () => {
  it('does not print key, prompt, or model output fields', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    logger.info('bot.llm', { roomCode: 'ABCDEF', apiKey: 'sk-secret', prompt: 'hidden', output: 'hidden' });
    expect(String(spy.mock.calls[0]?.[0] ?? '')).not.toContain('sk-secret');
    expect(String(spy.mock.calls[0]?.[0] ?? '')).not.toContain('hidden');
    spy.mockRestore();
  });
});
