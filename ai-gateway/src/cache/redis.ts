import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { type ImageInput } from '@/core/types';
import { type DietPlanExtraction } from '@/core/schema';

/**
 * Optional Redis layer: result cache (keyed by image content hash) + a simple
 * per-key rate limiter. Both are no-ops when REDIS_URL is unset, so the gateway
 * runs without Redis — you just lose caching and rate-limiting, not function.
 */
let client: Redis | null | undefined;

function getClient(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.REDIS_URL;
  client = url ? new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 }) : null;
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

/**
 * Fixed-window rate limit. Returns true if the request is allowed. Fails OPEN
 * (allows) if Redis is unavailable — we never block users on a cache outage.
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const redis = getClient();
  if (!redis) return true;
  try {
    const k = `rl:${key}`;
    const count = await redis.incr(k);
    if (count === 1) await redis.expire(k, windowSeconds);
    return count <= limit;
  } catch {
    return true;
  }
}
