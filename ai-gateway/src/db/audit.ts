import { getPool } from './client';

/**
 * Audit trail — what happened to a device, and why.
 *
 * Written so that a later support conversation (today a human reading the
 * dashboard, tomorrow an agent answering on Telegram or WhatsApp) can
 * reconstruct a user's experience without access to what they uploaded.
 *
 * Two rules hold this together:
 *   1. Never store user content. Reasons and counts, never image bytes or
 *      extracted plan text. An audit trail that accumulated the material it
 *      was recording refusals of would become the liability it exists against.
 *   2. Never throw. Auditing runs alongside a user's request; a logging
 *      failure must not become their error. This is the one place where
 *      failing silently is right — the request itself already carries its own
 *      correct outcome.
 */

export type AuditEventName =
  | 'content_rejected'
  | 'image_invalid'
  | 'device_blocked'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'extraction_failed';

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditEntry {
  event: AuditEventName;
  severity?: AuditSeverity;
  deviceId?: string | null;
  callerIp?: string | null;
  /** Matches the `reference` handed to the client on a 5xx. */
  reference?: string | null;
  /** Machine-readable specifics. Must contain no user content. */
  context?: Record<string, unknown>;
}

export async function recordAuditEvent(entry: AuditEntry): Promise<void> {
  const pool = getPool();
  if (!pool) {
    // Still worth seeing in stdout when no database is configured.
    console.warn('[audit]', entry.event, JSON.stringify(entry.context ?? {}));
    return;
  }

  try {
    await pool.query(
      `INSERT INTO audit_event (device_id, caller_ip, event, severity, reference, context)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)`,
      [
        entry.deviceId ?? null,
        entry.callerIp ?? null,
        entry.event,
        entry.severity ?? 'info',
        entry.reference ?? null,
        JSON.stringify(entry.context ?? {}),
      ],
    );
  } catch (err) {
    console.error('[audit] write failed:', (err as Error).message);
  }
}

/** How many times this event fired for a device within the last N hours. */
export async function countRecentEvents(
  deviceId: string,
  event: AuditEventName,
  withinHours: number,
): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  try {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) AS count
         FROM audit_event
        WHERE device_id = $1::uuid
          AND event = $2
          AND created_at > now() - make_interval(hours => $3)`,
      [deviceId, event, withinHours],
    );
    return Number(rows[0]?.count ?? 0);
  } catch (err) {
    console.error('[audit] count failed:', (err as Error).message);
    // Counting is what decides whether to block. Failing to count must not
    // manufacture a block out of a database problem, so report "no history".
    return 0;
  }
}

export interface DeviceTimeline {
  created_at: Date;
  event: AuditEventName;
  severity: AuditSeverity;
  reference: string | null;
  context: Record<string, unknown>;
}

/**
 * Everything recorded about one device, newest first — the query a support
 * agent runs when a user says "it stopped working".
 */
export async function deviceTimeline(deviceId: string, limit = 50): Promise<DeviceTimeline[]> {
  const pool = getPool();
  if (!pool) return [];

  try {
    const { rows } = await pool.query<DeviceTimeline>(
      `SELECT created_at, event, severity, reference, context
         FROM audit_event
        WHERE device_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT $2`,
      [deviceId, limit],
    );
    return rows;
  } catch (err) {
    console.error('[audit] timeline failed:', (err as Error).message);
    return [];
  }
}
