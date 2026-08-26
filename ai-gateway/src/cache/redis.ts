import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { type ImageInput } from '@/core/types';
import { type DietPlanExtraction } from '@/core/schema';

/**
 * Optional Redis layer: result cache (keyed by image content hash) + a
 * per-caller rate limiter.
 *
 * The two have deliberately DIFFERENT failure policies:
 *   - The cache fails OPEN. Losing it costs money and latency, never
 *     correctness, so a Redis outage must not fail the user's request.
 *   - The rate limiter falls back to an in-process limiter. It never simply
 *     stops enforcing, because "no Redis" would otherwise mean "no limit" —
 *     the exact hole an attacker looks for.
 */
let client: Redis | null | undefined;

/** Give up on a reconnect cycle rather than retrying forever behind every request. */
const MAX_RECONNECT_ATTEMPTS = 10;

function getClient(): Redis | null {
  if (client !== undefined) return client;

  const url = process.env.REDIS_URL;
  if (!url) {
    client = null;
    return client;
  }

  client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,

    /**
     * Fail commands immediately while disconnected instead of queueing them.
     *
     * With the default offline queue, a command issued during an outage waits
     * for a reconnect that may never come — so a Redis failure turns into
     * REQUESTS THAT HANG rather than requests that fall back. Both the cache
     * and the rate limiter already handle a thrown error correctly; neither can
     * do anything useful with a promise that never settles.
     */
    enableOfflineQueue: false,

    /** Back off, then stop. Returning null ends the reconnect loop. */
    retryStrategy(attempts) {
      if (attempts > MAX_RECONNECT_ATTEMPTS) return null;
      return Math.min(attempts * 200, 3000);
    },
  });

  /**
   * REQUIRED. ioredis emits 'error' on the client for every failed connection
   * attempt, and an unhandled 'error' event on an EventEmitter terminates the
   * Node process. Logging here is what keeps a Redis outage a degradation
   * instead of an outage of the whole gateway.
   */
  client.on('error', (err: Error) => {
    console.error('[redis] connection error (falling back to in-process limits):', err.message);
  });

  return client;
}

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

/** Stable cache key from the image bytes — identical re-imports hit the cache. */
export function imagesHash(images: ImageInput[]): string {
  const h = createHash('sha256');
  for (const img of images) h.update(img.base64);
  return `extract:${h.digest('hex')}`;
}

export async function getCached(key: string): Promise<DietPlanExtraction | null> {
  const redis = getClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as DietPlanExtraction) : null;
  } catch {
    return null; // cache is best-effort
  }
}

export async function setCached(key: string, plan: DietPlanExtraction): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(plan), 'EX', CACHE_TTL_SECONDS);
  } catch {
    /* best-effort */
  }
}

// ─── Rate limiting ──────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  /** Requests still available in the current window (never negative). */
  remaining: number;
  /** Seconds until the window resets — what the client should wait on a 429. */
  retryAfterSeconds: number;
}

/**
 * Increment a fixed-window counter and read its TTL atomically.
 *
 * Doing this as one script matters: an INCR followed by a separate EXPIRE
 * leaves a window where the key has no TTL, and a process that dies in between
 * would strand the counter forever — locking that caller out permanently.
 */
const INCR_AND_EXPIRE = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return {current, redis.call('TTL', KEYS[1])}
`;

/**
 * In-process fallback counter. Per-instance, so with several gateway replicas
 * the effective limit is `limit × replicas` — approximate, but bounded, which
 * is the point. Redis is what makes the limit exact across instances.
 */
const memoryWindows = new Map<string, { count: number; resetAt: number }>();

/** Drops expired windows so a flood of distinct keys can't grow the map forever. */
function sweepMemoryWindows(now: number): void {
  if (memoryWindows.size < 10_000) return;
  for (const [key, window] of memoryWindows) {
    if (window.resetAt <= now) memoryWindows.delete(key);
  }
}

function checkInMemory(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  sweepMemoryWindows(now);

  const existing = memoryWindows.get(key);
  const window =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + windowSeconds * 1000 };

  window.count += 1;
  memoryWindows.set(key, window);

  const retryAfterSeconds = Math.max(1, Math.ceil((window.resetAt - now) / 1000));
  return {
    allowed: window.count <= limit,
    limit,
    remaining: Math.max(0, limit - window.count),
    retryAfterSeconds,
  };
}

/**
 * Fixed-window rate limit for one caller.
 *
 * Uses Redis when reachable so the limit holds across every gateway instance,
 * and falls back to the in-process counter otherwise. It never returns an
 * unlimited result.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redis = getClient();
  if (!redis) return checkInMemory(key, limit, windowSeconds);

  try {
    const raw = (await redis.eval(INCR_AND_EXPIRE, 1, `rl:${key}`, windowSeconds)) as [
      number,
      number,
    ];
    const [count, ttl] = raw;
    // TTL is -1 (no expiry) or -2 (missing) in edge cases; fall back to the
    // full window rather than telling the client to retry immediately.
    const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds;

    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds,
    };
  } catch (err) {
    console.error('[rate-limit] Redis unavailable, using in-process limiter:', (err as Error).message);
    return checkInMemory(key, limit, windowSeconds);
  }
}

/**
 * Standard rate-limit headers. Sent on every response, not just 429s, so a
 * well-behaved client can slow down before it gets rejected.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.retryAfterSeconds),
  };
  if (!result.allowed) headers['Retry-After'] = String(result.retryAfterSeconds);
  return headers;
}
