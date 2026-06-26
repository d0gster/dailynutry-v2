import { describe, it, expect } from 'vitest';
import { isRetryableStatus } from '@/core/http';

describe('isRetryableStatus', () => {
  it('treats 408/429 and 5xx as retryable (fall through to next provider)', () => {
    for (const s of [408, 429, 500, 502, 503, 504]) expect(isRetryableStatus(s)).toBe(true);
  });

  it('treats other 4xx as non-retryable (fail fast — our bug)', () => {
    for (const s of [400, 401, 403, 404, 422]) expect(isRetryableStatus(s)).toBe(false);
  });
});
