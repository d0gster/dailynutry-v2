/**
 * LLM price table. USD per 1,000,000 tokens.
 *
 * Each entry carries the `source` it was read from and the date it was
 * `verifiedAt` against that source. Prices change, and vision/image tokens may
 * be priced differently than text on some providers — these cover text+image
 * input at the standard (non-batch, non-cache) tier and are estimates for
 * observability, not billing truth. A model not in this table gets a `null`
 * cost (see `cost.ts`) instead of a guessed number.
 *
 * `PRICING_VERSION` is the date the whole table was last reviewed.
 */
export const PRICING_VERSION = '2026-06-26';

export interface ModelPrice {
  inputPerMTok: number;
  /** Price for cache-read (discounted) input tokens. */
  cacheReadPerMTok: number;
  outputPerMTok: number;
  source: string;
  verifiedAt: string;
}

const GEMINI_SRC = 'https://ai.google.dev/gemini-api/docs/pricing';
const OPENAI_SRC = 'https://developers.openai.com/api/docs/pricing';
const ANTHROPIC_SRC = 'https://platform.claude.com/docs/en/about-claude/pricing';

const PRICES: Record<string, ModelPrice> = {
  // Google Gemini — standard tier, text+image input. cacheRead = context-cache
  // token rate (text/image/video); the separate per-hour storage cost is not
  // modeled (it is time-based and only applies when using Gemini caching).
  'gemini-2.5-flash': { inputPerMTok: 0.3, cacheReadPerMTok: 0.03, outputPerMTok: 2.5, source: GEMINI_SRC, verifiedAt: '2026-06-26' },
  // 2.0 Flash is listed as obsolete (deactivated 2026-06-01); kept for older configs.
  'gemini-2.0-flash': { inputPerMTok: 0.1, cacheReadPerMTok: 0.025, outputPerMTok: 0.4, source: GEMINI_SRC, verifiedAt: '2026-06-26' },

  // OpenAI — standard tier, with cached input rate.
  'gpt-5.4-mini': { inputPerMTok: 0.75, cacheReadPerMTok: 0.075, outputPerMTok: 4.5, source: OPENAI_SRC, verifiedAt: '2026-06-26' },
  'gpt-5.4-nano': { inputPerMTok: 0.2, cacheReadPerMTok: 0.02, outputPerMTok: 1.25, source: OPENAI_SRC, verifiedAt: '2026-06-26' },
  'gpt-5.4': { inputPerMTok: 2.5, cacheReadPerMTok: 0.25, outputPerMTok: 15, source: OPENAI_SRC, verifiedAt: '2026-06-26' },

  // Anthropic — base input / cache read (0.1x base) / output.
  'claude-haiku-4-5-20251001': { inputPerMTok: 1, cacheReadPerMTok: 0.1, outputPerMTok: 5, source: ANTHROPIC_SRC, verifiedAt: '2026-06-26' },
};

export function getModelPrice(model: string): ModelPrice | undefined {
  return PRICES[model];
}
