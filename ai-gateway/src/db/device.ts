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
  | { status: 'unavailable' };

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
 * Resolves a bearer token to its device, consuming one unit of daily quota.
 *
 * The lookup and the quota increment are a SINGLE statement on purpose:
 * checking the quota and then updating it would let concurrent requests each
 * read the same value and slip past the cap together.
 *
 * `quota_date` doubles as the reset mechanism — a request on a new UTC day
 * restarts the counter, so no scheduled job is needed to clear it.
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
          AND (quota_date <> CURRENT_DATE OR quota_used < $2)
        RETURNING id, revoked, quota_used`,
      [tokenHash, dailyQuota],
    );

    if (rows.length > 0) return { status: 'ok', device: rows[0] };

    // No row updated: the token is unknown, revoked, or out of quota. Tell
    // those apart with a read, so the caller can return an accurate status.
    const { rows: existing } = await pool.query<DeviceRow>(
      `SELECT id, revoked, quota_used FROM device WHERE token_hash = $1`,
      [tokenHash],
    );

    if (existing.length === 0) return { status: 'not_found' };
    if (existing[0].revoked) return { status: 'revoked' };
    return { status: 'ok', device: { ...existing[0], quota_used: dailyQuota } };
  } catch (err) {
    console.error('[device] lookup failed:', (err as Error).message);
    return { status: 'unavailable' };
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
