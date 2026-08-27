import { getPool } from './client';

/**
 * Audit trail — every action, and what came of it.
 *
 * Written so that a later investigation (today a person reading the dashboard,
 * tomorrow an agent answering on Telegram or WhatsApp) can reconstruct exactly
 * what a caller did and how the gateway answered.
 *
 * ---------------------------------------------------------------------------
 * COVERAGE IS TOTAL. CONTENT IS NOT.
 *
 * These are separate decisions and it is worth not confusing them:
 *
 * WHICH EVENTS — everything. Authentication outcomes, registrations,
 * revocations, mutations with their before/after, refusals, rate limiting,
 * quota exhaustion, successful extractions. An audit that only records
 * failures cannot answer "what was this user doing before it broke", which is
 * the question support actually starts from.
 *
 * WHICH FIELDS — everything except two narrow categories, excluded for legal
 * reasons rather than tidiness:
 *
 *   1. Bytes of images a content filter refused. Persisting those would mean
 *      the gateway now STORES the material it just declined to process. For
 *      the category of content that filter exists to catch, that converts a
 *      refusal into hosting.
 *
 *   2. Extracted plan text — patient names, prescribed foods. That is health
 *      data, "dado pessoal sensível" under LGPD Art. 5 II. Audit tables are
 *      the ones nobody ever deletes, so copying plan content here would
 *      quietly turn the log into a medical record carrying its own retention,
 *      consent and erasure obligations.
 *
 * What replaces them is a HASH. `imagesHash` is already computed for the cache
 * key, so recording it costs nothing and answers the investigative questions
 * that matter — has this exact image been submitted before, by how many
 * devices, how often — without holding a single byte of it.
 *
 * The other rule: NEVER THROW. Auditing runs alongside a user's request; a
 * logging failure must not become their error.
 * ---------------------------------------------------------------------------
 */

export type AuditEventName =
  // Authentication and identity
  | 'device_registered'
  | 'device_revoked'
  | 'device_blocked'
  | 'auth_failed'
  // Refusals and limits
  | 'content_rejected'
  | 'image_invalid'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'request_invalid'
  // Work performed
  | 'extraction_succeeded'
  | 'extraction_failed'
  // State changes made by a caller
  | 'yield_override_set';

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditEntry {
  event: AuditEventName;
  severity?: AuditSeverity;
  deviceId?: string | null;
  callerIp?: string | null;
  /** Correlates with the id echoed to the client in `x-request-id`. */
  reference?: string | null;
  /**
   * Machine-readable specifics: endpoint, status, durations, counts, reasons,
   * hashes, and before/after for mutations.
   *
   * Must contain no image bytes and no extracted plan text — see the header
   * comment for why those two, and only those two, are excluded.
   */
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

export interface HashSighting {
  device_id: string | null;
  caller_ip: string | null;
  event: AuditEventName;
  created_at: Date;
}

/**
 * Every time this exact image was seen, across all devices.
 *
 * This is what the stored hash buys, and the reason storing bytes is not
 * needed to investigate: one device sending many different refused images is a
 * person with a bad camera or bad judgment; one image arriving from twenty
 * devices is a campaign, and only this query can tell them apart.
 */
export async function sightingsOfHash(imagesHash: string, limit = 100): Promise<HashSighting[]> {
  const pool = getPool();
  if (!pool) return [];

  try {
    const { rows } = await pool.query<HashSighting>(
      `SELECT device_id, caller_ip, event, created_at
         FROM audit_event
        WHERE context->>'imagesHash' = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [imagesHash, limit],
    );
    return rows;
  } catch (err) {
    console.error('[audit] hash lookup failed:', (err as Error).message);
    return [];
  }
}

/**
 * Everything that happened under one request id, across every event it
 * produced — the query that turns "it failed, code abc-123" into a full trace.
 */
export async function eventsForReference(reference: string): Promise<DeviceTimeline[]> {
  const pool = getPool();
  if (!pool) return [];

  try {
    const { rows } = await pool.query<DeviceTimeline>(
      `SELECT created_at, event, severity, reference, context
         FROM audit_event
        WHERE reference = $1
        ORDER BY created_at ASC`,
      [reference],
    );
    return rows;
  } catch (err) {
    console.error('[audit] reference lookup failed:', (err as Error).message);
    return [];
  }
}
