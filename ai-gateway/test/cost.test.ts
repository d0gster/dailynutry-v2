import { describe, it, expect } from 'vitest';
import { estimateCost, addUsage } from '@/core/cost';
import { getModelPrice } from '@/core/pricing';

describe('estimateCost', () => {
  it('prices input, cache-read and output separately using the verified table', () => {
    // gemini-2.5-flash: input 0.30, cacheRead 0.03, output 2.50 per 1M.
    const c = estimateCost('gemini-2.5-flash', {
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(c.estimatedUsd).toBeCloseTo(0.3 + 0.03 + 2.5, 6);
  });

  it('returns null cost for an unknown model instead of guessing', () => {
    const c = estimateCost('some-unlisted-model', { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 1000 });
    expect(c.estimatedUsd).toBeNull();
  });

  it('is zero for zero usage', () => {
    const c = estimateCost('gemini-2.5-flash', { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });
    expect(c.estimatedUsd).toBe(0);
  });

  it('carries the token counts through to the breakdown', () => {
    const c = estimateCost('gpt-5.4-mini', { inputTokens: 10, cachedInputTokens: 5, outputTokens: 3 });
    expect(c).toMatchObject({ inputTokens: 10, cachedInputTokens: 5, outputTokens: 3 });
  });
});

describe('pricing table', () => {
  it('every priced model cites a source and a verification date', () => {
    for (const model of ['gemini-2.5-flash', 'gpt-5.4-mini', 'claude-haiku-4-5-20251001']) {
      const p = getModelPrice(model)!;
      expect(p.source).toMatch(/^https?:\/\//);
      expect(p.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('addUsage', () => {
  it('sums every token bucket', () => {
    const sum = addUsage(
      { inputTokens: 1, cachedInputTokens: 2, outputTokens: 3 },
      { inputTokens: 10, cachedInputTokens: 20, outputTokens: 30 },
    );
    expect(sum).toEqual({ inputTokens: 11, cachedInputTokens: 22, outputTokens: 33 });
  });
});
