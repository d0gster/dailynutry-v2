import { NextRequest, NextResponse } from 'next/server';
import { searchYield, setYieldOverride } from '@/db/yield';
import { z } from 'zod';
import { identifyCaller } from '@/core/device-auth';
import { recordAuditEvent } from '@/db/audit';
import { beginRequest, baseContext, withRequestId } from '@/core/request-context';
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
  // identifyCaller, not resolveCaller: reading a yield factor costs nothing to
  // serve and must not spend an extraction from the daily quota.
  const auth = await identifyCaller(req);
  if (!auth.ok) return auth.response;

  const limit = await checkRateLimit(`yield-read:${auth.caller.identity}`, READ_LIMIT, RATE_WINDOW);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  const q = req.nextUrl.searchParams.get('q');
  if (!q || q.trim().length === 0) {
    return NextResponse.json(
      { error: 'Missing query parameter "q"' },
      { status: 400, headers: rateLimitHeaders(limit) },
    );
  }

  const results = await searchYield(q, auth.caller.deviceId);
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
  const ctx = beginRequest(req);

  // Also identifyCaller: recording a preference is not an extraction.
  const auth = await identifyCaller(req);
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
    await recordAuditEvent({
      event: 'rate_limited',
      severity: 'warning',
      deviceId,
      callerIp: auth.caller.identity,
      reference: ctx.requestId,
      context: baseContext(ctx, { bucket: 'yield-write', limit: WRITE_LIMIT }),
    });
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: withRequestId(ctx, rateLimitHeaders(limit)) },
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
      { status: 404, headers: withRequestId(ctx, rateLimitHeaders(limit)) },
    );
  }

  // A mutation, so the audit records what changed — not just that something
  // did. Numbers and the factor's id only; nothing here is user content.
  await recordAuditEvent({
    event: 'yield_override_set',
    deviceId,
    callerIp: auth.caller.identity,
    reference: ctx.requestId,
    context: baseContext(ctx, {
      yieldFactorId: body.id,
      before: result.previousFactor,
      after: result.factor,
      replacedExisting: result.replacedExisting,
    }),
  });

  return NextResponse.json({ result }, { headers: withRequestId(ctx, rateLimitHeaders(limit)) });
}
