import { describe, it, expect } from 'vitest';
import { runExtraction } from '@/core/orchestrator';
import { ProviderError } from '@/core/types';
import { StubProvider, VALID_EXTRACTION_JSON } from './helpers/stub-provider';

const params = { systemPrompt: 'x', images: [{ base64: 'AAAA', mimeType: 'image/jpeg' as const }] };

describe('runExtraction (router + fallback)', () => {
  it('falls through to the next provider on a retryable error', async () => {
    const primary = new StubProvider('gemini', 'gemini-2.5-flash', {
      throws: new ProviderError('overloaded', 'gemini', true, 503),
    });
    const secondary = new StubProvider('openai', 'gpt-5.4-mini', { extractText: VALID_EXTRACTION_JSON });

    const res = await runExtraction([primary, secondary], params);

    expect(res.providerUsed.name).toBe('openai');
    expect(res.fallbackReason).toContain('gemini');
    expect(res.attempts).toHaveLength(2);
    expect(res.attempts[0].ok).toBe(false);
    expect(res.attempts[1].ok).toBe(true);
  });

  it('fails fast on a non-retryable error without trying the next provider', async () => {
    const primary = new StubProvider('gemini', 'gemini-2.5-flash', {
      throws: new ProviderError('bad request', 'gemini', false, 400),
    });
    const secondary = new StubProvider('openai', 'gpt-5.4-mini', { extractText: VALID_EXTRACTION_JSON });

    await expect(runExtraction([primary, secondary], params)).rejects.toThrow(/Non-retryable/);
  });

  it('uses the primary and sets no fallbackReason when it succeeds', async () => {
    const primary = new StubProvider('gemini', 'gemini-2.5-flash', { extractText: VALID_EXTRACTION_JSON });
    const res = await runExtraction([primary], params);
    expect(res.providerUsed.name).toBe('gemini');
    expect(res.fallbackReason).toBeUndefined();
    expect(res.attempts).toHaveLength(1);
  });

  it('throws when every provider fails with a retryable error', async () => {
    const a = new StubProvider('gemini', 'm', { throws: new ProviderError('a', 'gemini', true, 503) });
    const b = new StubProvider('openai', 'm', { throws: new ProviderError('b', 'openai', true, 500) });
    await expect(runExtraction([a, b], params)).rejects.toThrow(/All providers failed/);
  });

  it('throws when the chain is empty', async () => {
    await expect(runExtraction([], params)).rejects.toThrow(/No LLM providers/);
  });
});
