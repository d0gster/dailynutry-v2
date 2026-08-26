import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

/**
 * Gateway authentication — a single shared key sent as `x-api-key`.
 *
 * ⚠️ This is a SERVICE-level key, not a user identity. It cannot distinguish
 * one caller from another, so anything derived from it (rate limits, quotas,
 * audit trails) is global. Any client that ships this key — a mobile app in
 * particular — hands it to whoever unpacks the binary. Per-user tokens are the
 * real fix; this module only makes the shared-key path as safe as it can be.
 */

/**
 * Compares two secrets without leaking their contents through timing.
 *
 * Both sides are hashed first so the buffers are always the same length: a
 * plain `timingSafeEqual` throws on length mismatch, and that throw would
 * itself reveal the expected key's length.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Verifies the caller's `x-api-key` against `GATEWAY_API_KEY`.
 *
 * Returns `null` when the request is authorized, or a ready-to-return 401/503
 * response when it is not. Fails CLOSED: with no key configured on the gateway
 * every request is rejected, because an unauthenticated gateway spends real
 * money on every call.
 */
export function requireApiKey(req: Request): NextResponse | null {
  const expected = process.env.GATEWAY_API_KEY;
  if (!expected) {
    console.error('[auth] GATEWAY_API_KEY is not set — refusing all requests');
    return NextResponse.json(
      { error: 'Gateway is not configured for authentication' },
      { status: 503 },
    );
  }

  const provided = req.headers.get('x-api-key');
  if (!provided || !secretsMatch(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

/**
 * The identity used to scope rate limits. Today the gateway has no per-user
 * auth, so callers are bucketed by client IP — imperfect behind a shared NAT,
 * but far better than one global bucket for every user of the app.
 *
 * Only trusts `x-forwarded-for` when TRUST_PROXY is set, since a client can
 * forge that header freely when the gateway is exposed directly.
 */
export function callerIdentity(req: Request): string {
  if (process.env.TRUST_PROXY === 'true') {
    // Left-most entry is the original client; the rest are proxies.
    const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return `ip:${forwarded}`;
  }
  const real = req.headers.get('x-real-ip');
  if (real) return `ip:${real.trim()}`;
  return 'ip:unknown';
}
