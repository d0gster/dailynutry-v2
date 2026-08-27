import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey, callerIdentity } from '@/core/auth';
import { checkRateLimit, rateLimitHeaders } from '@/cache/redis';
import { registerDevice } from '@/db/device';
import { DEFAULT_DAILY_QUOTA } from '@/core/device-auth';
import { recordAuditEvent } from '@/db/audit';
import { beginRequest, baseContext, withRequestId } from '@/core/request-context';

export const runtime = 'nodejs';

/**
 * Registration is the weakest point of device auth: anyone holding the app key
 * — which ships inside the binary — can ask for a token. It cannot be made
 * unforgeable without platform attestation (Play Integrity / App Attest), so
 * instead it is made SLOW and ACCOUNTABLE:
 *
 *   - a hard per-IP ceiling, so one source cannot mint tokens in bulk;
 *   - the registering IP is recorded, so a bulk-registration pattern is visible
 *     in the data afterwards;
 *   - every attempt, refused or granted, lands in the audit trail — a burst of
 *     refusals from one source is exactly the shape token farming takes;
 *   - each issued token carries its own daily quota, so a token farm still
 *     cannot exceed quota × devices.
 *
 * Registration happens once per install, so a tight limit costs real users
 * nothing.
 */
const REGISTER_LIMIT = 5;
const REGISTER_WINDOW = 60 * 60; // 1 hour

export async function POST(req: NextRequest) {
  const ctx = beginRequest(req);
  const ip = callerIdentity(req);

  const unauthorized = requireApiKey(req);
  if (unauthorized) {
    await recordAuditEvent({
      event: 'auth_failed',
      severity: 'warning',
      callerIp: ip,
      reference: ctx.requestId,
      context: baseContext(ctx, { stage: 'app_key' }),
    });
    return unauthorized;
  }

  const limit = await checkRateLimit(`register:${ip}`, REGISTER_LIMIT, REGISTER_WINDOW);
  if (!limit.allowed) {
    await recordAuditEvent({
      event: 'rate_limited',
      severity: 'warning',
      callerIp: ip,
      reference: ctx.requestId,
      context: baseContext(ctx, { bucket: 'register', limit: REGISTER_LIMIT, windowSeconds: REGISTER_WINDOW }),
    });
    return NextResponse.json(
      {
        error: 'Too many registration attempts',
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { status: 429, headers: withRequestId(ctx, rateLimitHeaders(limit)) },
    );
  }

  const device = await registerDevice(ip);
  if (!device) {
    // Registration needs Postgres. Say so plainly rather than issuing a token
    // the gateway would have no way to verify or revoke later.
    return NextResponse.json(
      {
        error: 'Device registration is unavailable',
        detail: 'The gateway requires a configured, reachable database to issue device tokens.',
      },
      { status: 503, headers: withRequestId(ctx, { 'Retry-After': '30' }) },
    );
  }

  await recordAuditEvent({
    event: 'device_registered',
    deviceId: device.deviceId,
    callerIp: ip,
    reference: ctx.requestId,
    // The token itself is never recorded — not even hashed. The device row
    // already holds its hash, and a second copy is a second thing to leak.
    context: baseContext(ctx),
  });

  return NextResponse.json(
    {
      deviceId: device.deviceId,
      // Shown once. The gateway stores only a hash and cannot return it again.
      token: device.token,
      dailyQuota: Number(process.env.DEVICE_DAILY_QUOTA) || DEFAULT_DAILY_QUOTA,
    },
    { status: 201, headers: withRequestId(ctx, rateLimitHeaders(limit)) },
  );
}
