import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { getPool } from './client';

/**
 * Device registry — the gateway's per-caller identity.
 *
 * ⚠️ This module deliberately does NOT follow the "never throw, return []"
 * convention used by `taco.ts` and `yield.ts`. Those back optional features
 * where degrading to empty results is correct. This one backs AUTHENTICATION:
 * if the database cannot be reached we must not guess, so lookups report
 * `unavailable` and callers reject the request. Failing open here would hand
 * out free access during a Postgres blip.
 */

export interface DeviceRow {
  id: string;
  revoked: boolean;
  quota_used: number;
}

export type DeviceLookup =
  | { status: 'ok'; device: DeviceRow }
  | { status: 'not_found' }
  | { status: 'revoked' }
  | { status: 'blocked'; expiresAt: Date; reason: string }
  | { status: 'quota_exceeded' }
  | { status: 'unavailable' };

/**
 * A live temporary block, folded into the lookup itself.
 *
 * Checking it in a separate round-trip would either add latency to every
 * request or leave a window where quota is spent before the block is noticed.
 * As a predicate it costs nothing extra and cannot be raced.
 */
const NOT_BLOCKED = `NOT EXISTS (
        SELECT 1 FROM device_block b
         WHERE b.device_id = device.id AND b.expires_at > now()
      )`;

/** Distinguishes the reasons a guarded UPDATE matched nothing. */
async function explainMiss(
  pool: NonNullable<ReturnType<typeof getPool>>,
  tokenHash: string,
): Promise<DeviceLookup> {
  const { rows } = await pool.query<{
    id: string;
    revoked: boolean;
    quota_used: number;
    expires_at: Date | null;
    reason: string | null;
  }>(
    `SELECT d.id, d.revoked, d.quota_used, b.expires_at, b.reason
       FROM device d
       LEFT JOIN device_block b
              ON b.device_id = d.id AND b.expires_at > now()
      WHERE d.token_hash = $1`,
    [tokenHash],
  );

  if (rows.length === 0) return { status: 'not_found' };
  const row = rows[0];
  if (row.revoked) return { status: 'revoked' };
  if (row.expires_at) {
    return { status: 'blocked', expiresAt: row.expires_at, reason: row.reason ?? 'unspecified' };
  }
  return { status: 'quota_exceeded' };
}

/** Tokens are stored hashed, so a database dump yields nothing usable. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface RegisteredDevice {
  deviceId: string;
  /** Returned to the client exactly once — the gateway keeps only its hash. */
  token: string;
}

/**
 * Creates a device and issues its token.
 *
 * 256 bits of entropy: the token is a bearer credential with no second factor,
 * so it must be infeasible to guess.
 */
export async function registerDevice(registeredIp: string): Promise<RegisteredDevice | null> {
  const pool = getPool();
  if (!pool) return null;

  const deviceId = randomUUID();
  const token = randomBytes(32).toString('base64url');

  try {
    await pool.query(
      `INSERT INTO device (id, token_hash, registered_ip) VALUES ($1, $2, $3)`,
      [deviceId, hashToken(token), registeredIp],
    );
    return { deviceId, token };
  } catch (err) {
    console.error('[device] registration failed:', (err as Error).message);
    return null;
  }
}

/**
 * Resolves a bearer token to its device WITHOUT touching the daily quota.
 *
 * For endpoints that only need to know who is calling — reads, preference
 * writes — where charging an extraction would be wrong. Only `/api/extract`
 * should spend quota; see `resolveDeviceAndConsumeQuota`.
 */
export async function lookupDevice(token: string): Promise<DeviceLookup> {
  const pool = getPool();
  if (!pool) return { status: 'unavailable' };

  try {
    const tokenHash = hashToken(token);
    const { rows } = await pool.query<DeviceRow>(
      `UPDATE device
          SET last_seen_at = now()
        WHERE token_hash = $1
          AND revoked = false
          AND ${NOT_BLOCKED}
        RETURNING id, revoked, quota_used`,
      [tokenHash],
    );

    if (rows.length > 0) return { status: 'ok', device: rows[0] };
    return explainMiss(pool, tokenHash);
  } catch (err) {
    console.error('[device] lookup failed:', (err as Error).message);
    return { status: 'unavailable' };
  }
}

/**
 * Resolves a bearer token to its device, consuming one unit of daily quota.
 *
 * The lookup and the quota increment are a SINGLE statement on purpose:
 * checking the quota and then updating it would let concurrent requests each
 * read the same value and slip past the cap together.
 *
 * `quota_date` doubles as the reset mechanism — a request on a new UTC day
 * restarts the counter, so no scheduled job is needed to clear it.
 *
 * The WHERE clause is the sole authority on whether the quota allows this
 * request: a row comes back only when it did. Callers must not re-check the
 * returned `quota_used` against the cap — that value is POST-increment, so
 * comparing it would reject the last allowed request of the day.
 */
export async function resolveDeviceAndConsumeQuota(
  token: string,
  dailyQuota: number,
): Promise<DeviceLookup> {
  const pool = getPool();
  if (!pool) return { status: 'unavailable' };

  const tokenHash = hashToken(token);

  try {
    const { rows } = await pool.query<DeviceRow>(
      `UPDATE device
          SET quota_used   = CASE WHEN quota_date = CURRENT_DATE THEN quota_used + 1 ELSE 1 END,
              quota_date   = CURRENT_DATE,
              last_seen_at = now()
        WHERE token_hash = $1
          AND revoked = false
          AND ${NOT_BLOCKED}
          AND (quota_date <> CURRENT_DATE OR quota_used < $2)
        RETURNING id, revoked, quota_used`,
      [tokenHash, dailyQuota],
    );

    if (rows.length > 0) return { status: 'ok', device: rows[0] };

    // No row updated: unknown, revoked, blocked, or out of quota. Tell those
    // apart with a read, so the caller can return an accurate status.
    return explainMiss(pool, tokenHash);
  } catch (err) {
    console.error('[device] lookup failed:', (err as Error).message);
    return { status: 'unavailable' };
  }
}

/**
 * Returns one unit of quota to a device.
 *
 * The quota is consumed at authentication, before the request is known to be
 * servable — that ordering is what makes the check atomic and unraceable. When
 * the request is then rejected without any provider call (an image that isn't
 * an image), the user has been charged an extraction that cost nothing, and a
 * bad photo would eat into their daily allowance. This gives it back.
 *
 * `GREATEST(quota_used - 1, 0)` because a refund must never drive the counter
 * negative, which would hand out free extractions. Guarded on `quota_date` so
 * a refund arriving after midnight cannot credit a day it was never spent on.
 */
export async function refundQuota(deviceId: string): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  try {
    await pool.query(
      `UPDATE device
          SET quota_used = GREATEST(quota_used - 1, 0)
        WHERE id = $1::uuid AND quota_date = CURRENT_DATE`,
      [deviceId],
    );
  } catch (err) {
    console.error('[device] quota refund failed:', (err as Error).message);
  }
}

/** Revokes one device without affecting any other install. */
export async function revokeDevice(deviceId: string, reason: string): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;

  try {
    const { rowCount } = await pool.query(
      `UPDATE device
          SET revoked = true, revoked_at = now(), revoke_reason = $2
        WHERE id = $1 AND revoked = false`,
      [deviceId, reason],
    );
    return (rowCount ?? 0) > 0;
  } catch (err) {
    console.error('[device] revoke failed:', (err as Error).message);
    return false;
  }
}
