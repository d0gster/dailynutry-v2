import { NextResponse } from 'next/server';
import { requireApiKey, callerIdentity } from './auth';
import { resolveDeviceAndConsumeQuota } from '@/db/device';

/**
 * Resolves WHO is calling.
 *
 * Two credentials, with different jobs:
 *   - `x-api-key` says "this is the DailyNutry app". Shared by every install
 *     and extractable from the binary, so it is a weak gate, not an identity.
 *   - `Authorization: Bearer <device token>` says "this is install #1234".
 *     Unique per install, revocable, and quota-bearing — this is the identity
 *     rate limits should key on.
 *
 * Both are checked. The app key alone can no longer buy unlimited extraction
 * once `REQUIRE_DEVICE_AUTH` is on.
 */

/** Daily extraction budget per device. Caps what one leaked token can spend. */
export const DEFAULT_DAILY_QUOTA = 30;

export interface ResolvedCaller {
  /** Rate-limit bucket key — per device when known, per IP otherwise. */
  identity: string;
  /** Null while running in transition mode without a device token. */
  deviceId: string | null;
}

export type CallerResult =
  | { ok: true; caller: ResolvedCaller }
  | { ok: false; response: NextResponse };

function dailyQuota(): number {
  const configured = Number(process.env.DEVICE_DAILY_QUOTA);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_DAILY_QUOTA;
}

/**
 * True once device tokens are mandatory. Defaults to OFF so an app build that
 * predates device registration keeps working; flip it on after the new app
 * ships. Leaving it off indefinitely means the shared key is still the only
 * thing standing between the internet and your provider bill.
 */
function deviceAuthRequired(): boolean {
  return process.env.REQUIRE_DEVICE_AUTH === 'true';
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export async function resolveCaller(req: Request): Promise<CallerResult> {
  // ── 1. App-level gate. ────────────────────────────────────────────────────
  const unauthorized = requireApiKey(req);
  if (unauthorized) return { ok: false, response: unauthorized };

  // ── 2. Device identity. ───────────────────────────────────────────────────
  const token = bearerToken(req);

  if (!token) {
    if (deviceAuthRequired()) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: 'Device registration required',
            detail: 'POST /api/auth/register to obtain a device token, then send it as a Bearer token.',
          },
          { status: 401 },
        ),
      };
    }
    // Transition mode: fall back to an IP bucket so there is still a limit.
    return { ok: true, caller: { identity: callerIdentity(req), deviceId: null } };
  }

  const lookup = await resolveDeviceAndConsumeQuota(token, dailyQuota());

  switch (lookup.status) {
    case 'ok': {
      const quota = dailyQuota();
      if (lookup.device.quota_used >= quota) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: 'Daily quota exceeded',
              detail: `This device has used its ${quota} extractions for today.`,
            },
            { status: 429, headers: { 'Retry-After': String(secondsUntilUtcMidnight()) } },
          ),
        };
      }
      return { ok: true, caller: { identity: `device:${lookup.device.id}`, deviceId: lookup.device.id } };
    }

    case 'revoked':
      return {
        ok: false,
        response: NextResponse.json({ error: 'This device has been revoked' }, { status: 403 }),
      };

    case 'not_found':
      return {
        ok: false,
        response: NextResponse.json({ error: 'Unknown device token' }, { status: 401 }),
      };

    case 'unavailable':
      // Cannot verify the token, so we must not honour it. Failing open here
      // would turn every database outage into an open, billable gateway.
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Authentication is temporarily unavailable' },
          { status: 503, headers: { 'Retry-After': '30' } },
        ),
      };
  }
}

/** Quota resets on the UTC day boundary, matching `quota_date` in Postgres. */
function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(1, Math.ceil((midnight - now.getTime()) / 1000));
}
