/**
 * Core domain types for the AI gateway. Framework-agnostic — no Next, no React.
 * Everything a provider adapter needs to know flows through here.
 */

export type ProviderName = 'gemini' | 'openai' | 'anthropic';

export interface ImageInput {
  /** Raw base64, WITHOUT the `data:image/...;base64,` prefix. */
  base64: string;
  mimeType: 'image/jpeg' | 'image/png';
}

export interface LLMUsage {
  /** Full-price input tokens — EXCLUDES any cache-read tokens. */
  inputTokens: number;
  /**
   * Cache-read (discounted) input tokens. 0 unless provider-side prompt caching
   * is in use — which this gateway does not enable today (it caches whole
   * results in Redis instead). Captured so cost stays exact if caching is ever
   * turned on. Adapters normalize each provider's reporting into this field.
   */
  cachedInputTokens: number;
  outputTokens: number;
}

export interface LLMCompletion {
  /** Raw model output — expected to be a JSON string, but NOT yet validated. */
  text: string;
  /** Token counts, used downstream to estimate cost. */
  usage: LLMUsage;
  /** Concrete model id that actually answered (e.g. "gemini-2.5-flash"). */
  model: string;
  provider: ProviderName;
  /** Provider's raw response payload, kept for debugging. */
  raw?: unknown;
}

/** Input for a vision → structured-JSON extraction call. */
export interface VisionExtractParams {
  systemPrompt: string;
  images: ImageInput[];
}

/** Input for a cheap, text-only repair call (no images resent — see guardrail). */
export interface TextRepairParams {
  systemPrompt: string;
  /** The invalid output we are asking the model to fix. */
  brokenJson: string;
  /** The Zod validation error, fed back so the model knows what to correct. */
  validationError: string;
}

/**
 * Every provider adapter implements this. Two capabilities:
 *  - `extractStructured`: the expensive vision call (runs once).
 *  - `repairJson`: a cheap text-only call to fix STRUCTURE, not re-read images.
 * `repairJson` is optional; the orchestrator falls back to the next provider
 * that supports it.
 */
export interface LLMProvider {
  readonly name: ProviderName;
  readonly model: string;
  extractStructured(params: VisionExtractParams): Promise<LLMCompletion>;
  repairJson?(params: TextRepairParams): Promise<LLMCompletion>;
}

/**
 * Thrown by adapters. `retryable` tells the router whether to fall through to
 * the next provider (timeout, 5xx, 429) or fail fast (4xx caused by our bug).
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderName,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/**
 * The provider refused the INPUT on content-safety grounds.
 *
 * Deliberately not a `ProviderError`: that class answers "did this provider
 * fail, and is it worth trying another one?", and here the answer to the
 * second half is emphatically no. A safety refusal is a verdict about the
 * content, not a hiccup — the next provider will refuse the same bytes, so
 * falling through the chain just forwards material we already know is
 * unacceptable to every vendor we have an account with, and pays for the
 * privilege each time.
 *
 * It stops the chain, returns 422, and is recorded against the device.
 */
export class ContentRejectedError extends Error {
  constructor(
    readonly provider: ProviderName,
    /** The provider's own reason code, when it gives one. */
    readonly reason: string,
  ) {
    super(`${provider} refused the image content (${reason})`);
    this.name = 'ContentRejectedError';
  }
}
