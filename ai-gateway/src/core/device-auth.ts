import { NextResponse } from 'next/server';
import { requireApiKey, callerIdentity } from './auth';
import { resolveDeviceAndConsumeQuota, lookupDevice, type DeviceLookup } from '@/db/device';

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

function interpret(lookup: DeviceLookup): CallerResult {
  switch (lookup.status) {
    // A row came back, so the quota check in SQL already allowed this request.
    // Re-checking `quota_used` here would reject the last allowed one: the
    // value is post-increment.
    case 'ok':
      return { ok: true, caller: { identity: `device:${lookup.device.id}`, deviceId: lookup.device.id } };

    case 'quota_exceeded':
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: 'Daily quota exceeded',
            detail: `This device has used its ${dailyQuota()} extractions for today.`,
          },
          { status: 429, headers: { 'Retry-After': String(secondsUntilUtcMidnight()) } },
        ),
      };

    case 'revoked':
      return {
        ok: false,
        response: NextResponse.json({ error: 'This device has been revoked' }, { status: 403 }),
      };

    case 'blocked': {
      const seconds = Math.max(1, Math.ceil((lookup.expiresAt.getTime() - Date.now()) / 1000));
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: 'This device is temporarily blocked',
            detail: 'Access resumes automatically when the block expires.',
            expiresAt: lookup.expiresAt.toISOString(),
          },
          // 403, like revocation: the app must not react by re-registering.
          { status: 403, headers: { 'Retry-After': String(seconds) } },
        ),
      };
    }

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

/**
 * Shared front half of both entry points: the app-level gate, then the
 * question of whether a device token is present at all.
 *
 * Returns the token to look up, or a finished CallerResult when there is
 * nothing to look up (no token, in either mode).
 */
function gate(req: Request): { token: string } | CallerResult {
  const unauthorized = requireApiKey(req);
  if (unauthorized) return { ok: false, response: unauthorized };

  const token = bearerToken(req);
  if (token) return { token };

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

/**
 * Resolves the caller AND spends one unit of its daily quota.
 *
 * Only for `/api/extract`. The quota exists to cap what a leaked token can
 * cost in LLM calls, so anything that doesn't make one must use
 * `identifyCaller` instead — otherwise reading a yield factor would charge
 * the user an extraction.
 */
export async function resolveCaller(req: Request): Promise<CallerResult> {
  const gated = gate(req);
  if (!('token' in gated)) return gated;

  return interpret(await resolveDeviceAndConsumeQuota(gated.token, dailyQuota()));
}

/**
 * Resolves the caller without touching its quota.
 *
 * For endpoints that need an identity — to scope a rate limit or a per-device
 * preference — but cost nothing to serve.
 */
export async function identifyCaller(req: Request): Promise<CallerResult> {
  const gated = gate(req);
  if (!('token' in gated)) return gated;

  return interpret(await lookupDevice(gated.token));
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
