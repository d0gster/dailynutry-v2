import { NextRequest, NextResponse } from 'next/server';
import { searchYield, setYieldOverride } from '@/db/yield';
import { z } from 'zod';
import { requireApiKey, callerIdentity } from '@/core/auth';
import { resolveCaller } from '@/core/device-auth';
import { checkRateLimit, rateLimitHeaders } from '@/cache/redis';

export const runtime = 'nodejs';

const READ_LIMIT = 60;
const WRITE_LIMIT = 20;
const RATE_WINDOW = 60;

/**
 * GET /api/yield?q=frango
 * Search yield factors by name. Requires x-api-key. When a device token is
 * also supplied, that device's own corrections are layered over the defaults.
 */
export async function GET(req: NextRequest) {
  const unauthorized = requireApiKey(req);
  if (unauthorized) return unauthorized;

  const limit = await checkRateLimit(`yield-read:${callerIdentity(req)}`, READ_LIMIT, RATE_WINDOW);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  const q = req.nextUrl.searchParams.get('q');
  if (!q || q.trim().length === 0) {
    return NextResponse.json({ error: 'Missing query parameter "q"' }, { status: 400 });
  }

  // Reads stay open to callers without a device token; they just see defaults.
  const auth = await resolveCaller(req);
  const deviceId = auth.ok ? auth.caller.deviceId : null;

  const results = await searchYield(q, deviceId);
  return NextResponse.json({ results }, { headers: rateLimitHeaders(limit) });
}

const UpdateBody = z.object({
  id: z.number().int().positive(),
  factor: z.number().positive(),
});

/**
 * PUT /api/yield
 * Record this device's correction to a yield factor.
 *
 * Requires a device token, not just the app key: the correction is stored
 * against the calling device. Without an identity there is nothing to scope
 * the write to, and writing to the shared defaults instead would change every
 * other user's numbers.
 */
export async function PUT(req: NextRequest) {
  const auth = await resolveCaller(req);
  if (!auth.ok) return auth.response;

  const { deviceId } = auth.caller;
  if (!deviceId) {
    return NextResponse.json(
      {
        error: 'Device registration required',
        detail: 'POST /api/auth/register to obtain a device token — yield corrections are stored per device.',
      },
      { status: 401 },
    );
  }

  const limit = await checkRateLimit(`yield-write:${auth.caller.identity}`, WRITE_LIMIT, RATE_WINDOW);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  let body: z.infer<typeof UpdateBody>;
  try {
    body = UpdateBody.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: 'Invalid body', detail: 'Expected { id: positive integer, factor: positive number }.' },
      { status: 400, headers: rateLimitHeaders(limit) },
    );
  }

  const result = await setYieldOverride(deviceId, body.id, body.factor);
  if (!result) {
    return NextResponse.json(
      { error: 'Yield factor not found' },
      { status: 404, headers: rateLimitHeaders(limit) },
    );
  }
  return NextResponse.json({ result }, { headers: rateLimitHeaders(limit) });
}
