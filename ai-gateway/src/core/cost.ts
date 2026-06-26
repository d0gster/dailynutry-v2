import { getModelPrice } from './pricing';
import { type LLMUsage } from './types';

export interface CostBreakdown {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  /** USD. null when the model has no known price (so we never fake a number). */
  estimatedUsd: number | null;
}

/**
 * Estimates USD cost for a given model + token usage. Full-price input, cached
 * input (cache-read rate) and output are priced separately. Returns null when
 * the price is unknown, instead of guessing a value.
 */
export function estimateCost(model: string, usage: LLMUsage): CostBreakdown {
  const price = getModelPrice(model);
  const estimatedUsd = price
    ? (usage.inputTokens / 1_000_000) * price.inputPerMTok +
      (usage.cachedInputTokens / 1_000_000) * price.cacheReadPerMTok +
      (usage.outputTokens / 1_000_000) * price.outputPerMTok
    : null;
  return {
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    estimatedUsd,
  };
}

export function addUsage(a: LLMUsage, b: LLMUsage): LLMUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}
