import { ProviderError, type ProviderName } from './types';

/**
 * `fetch` with a hard timeout. On timeout we throw a RETRYABLE ProviderError so
 * the router falls through to the next provider — a hung primary should never
 * block the whole request.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  provider: ProviderName,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ProviderError(`${provider} timed out after ${timeoutMs}ms`, provider, true);
    }
    // Network-level failures (DNS, connection reset) are retryable.
    throw new ProviderError(
      `${provider} network error: ${(err as Error).message}`,
      provider,
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Maps an HTTP status to "should the router try the next provider?".
 * 408/429/5xx → yes (transient/overloaded). Other 4xx → no (our bug; failing
 * over would just burn another provider's quota on the same broken request).
 */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
