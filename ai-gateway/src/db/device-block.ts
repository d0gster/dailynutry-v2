import { getPool } from './client';

/**
 * Temporary blocks, distinct from the permanent `device.revoked`.
 *
 * Repeated content refusals are what this exists for: one refusal is a bad
 * photo or an over-eager filter, several in a day is someone probing what the
 * gateway will forward. A timed block stops the probing without an
 * irreversible ban — a false positive costs the user a day, not their account,
 * and expiry needs no scheduled job or manual intervention.
 *
 * Like device lookups, and unlike the optional-data modules, this reports
 * failure honestly instead of returning a safe-looking default: `unavailable`
 * lets the caller decide, rather than silently letting a blocked device
 * through during a database outage.
 */

export type BlockStatus =
  | { status: 'clear' }
  | { status: 'blocked'; expiresAt: Date; reason: string }
  | { status: 'unavailable' };

export async function checkDeviceBlock(deviceId: string): Promise<BlockStatus> {
  const pool = getPool();
  if (!pool) return { status: 'unavailable' };

  try {
    // Expiry is enforced on read rather than by a scheduled job. A lapsed row
    // is simply not returned; it is overwritten the next time this device is
    // blocked, so the table stays bounded by "devices ever blocked".
    const { rows } = await pool.query<{ expires_at: Date; reason: string }>(
      `SELECT expires_at, reason
         FROM device_block
        WHERE device_id = $1::uuid
          AND expires_at > now()`,
      [deviceId],
    );

    if (rows.length === 0) return { status: 'clear' };
    return { status: 'blocked', expiresAt: rows[0].expires_at, reason: rows[0].reason };
  } catch (err) {
    console.error('[device-block] check failed:', (err as Error).message);
    return { status: 'unavailable' };
  }
}

/**
 * Blocks a device for `hours`, or extends an existing block.
 *
 * `GREATEST` on conflict means a repeat offender's block only ever moves
 * further out — a second offence must never shorten the bar already in place.
 */
export async function blockDevice(
  deviceId: string,
  hours: number,
  reason: string,
): Promise<Date | null> {
  const pool = getPool();
  if (!pool) return null;

  try {
    const { rows } = await pool.query<{ expires_at: Date }>(
      `INSERT INTO device_block (device_id, expires_at, reason)
       VALUES ($1::uuid, now() + make_interval(hours => $2), $3)
       ON CONFLICT (device_id) DO UPDATE
         SET expires_at = GREATEST(device_block.expires_at, EXCLUDED.expires_at),
             reason     = EXCLUDED.reason,
             blocked_at = now()
       RETURNING expires_at`,
      [deviceId, hours, reason],
    );
    return rows[0]?.expires_at ?? null;
  } catch (err) {
    console.error('[device-block] block failed:', (err as Error).message);
    return null;
  }
}

/** Lifts a block early — the support path for a false positive. */
export async function unblockDevice(deviceId: string): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM device_block WHERE device_id = $1::uuid`,
      [deviceId],
    );
    return (rowCount ?? 0) > 0;
  } catch (err) {
    console.error('[device-block] unblock failed:', (err as Error).message);
    return false;
  }
}
