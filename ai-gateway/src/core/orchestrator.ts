import {
  type LLMProvider,
  type LLMCompletion,
  type VisionExtractParams,
  type ProviderName,
  ProviderError,
} from './types';

export interface AttemptLog {
  provider: ProviderName;
  model: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
  retryable?: boolean;
}

export interface ExtractionResult {
  completion: LLMCompletion;
  /** The provider that ultimately answered. */
  providerUsed: LLMProvider;
  /** Full per-provider trace, including the failures we fell through. */
  attempts: AttemptLog[];
  /** Set when the primary failed and a fallback answered. */
  fallbackReason?: string;
}

/**
 * Runs the vision extraction across the provider chain with fallback.
 *
 * Tries each provider in order. On a RETRYABLE error (timeout, 5xx, 429) it
 * falls through to the next. On a NON-retryable error (4xx — our bug) it stops
 * immediately: failing over would just replay a broken request against another
 * provider's quota. Every attempt is logged for observability.
 */
export async function runExtraction(
  chain: LLMProvider[],
  params: VisionExtractParams,
): Promise<ExtractionResult> {
  if (chain.length === 0) throw new Error('No LLM providers configured');

  const attempts: AttemptLog[] = [];
  let firstFailure: string | undefined;

  for (const provider of chain) {
    const start = Date.now();
    try {
      const completion = await provider.extractStructured(params);
      attempts.push({
        provider: provider.name,
        model: provider.model,
        ok: true,
        latencyMs: Date.now() - start,
      });
      return {
        completion,
        providerUsed: provider,
        attempts,
        fallbackReason: attempts.length > 1 ? firstFailure : undefined,
      };
    } catch (err) {
      const retryable = err instanceof ProviderError ? err.retryable : false;
      const message = (err as Error).message;
      attempts.push({
        provider: provider.name,
        model: provider.model,
        ok: false,
        latencyMs: Date.now() - start,
        error: message,
        retryable,
      });
      if (!firstFailure) firstFailure = `${provider.name}: ${message}`;

      // Fail fast on our own bad request — don't burn the next provider on it.
      if (!retryable) {
        throw new ProviderError(
          `Non-retryable error from ${provider.name}; aborting: ${message}`,
          provider.name,
          false,
        );
      }
      // else: fall through to the next provider.
    }
  }

  throw new Error(
    `All providers failed: ${attempts.map((a) => `${a.provider}(${a.error})`).join(' → ')}`,
  );
}
