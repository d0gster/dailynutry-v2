import { getPool } from './client';

export interface YieldFactor {
  id: number;
  name: string;
  category: string;
  factor: number;
  method: string;
  source: string;
  notes: string | null;
}

/**
 * `yield_factor` holds shared defaults; `yield_override` holds one device's
 * corrections to them. Reads layer the override over the default so a caller
 * sees its own number, and `source` reports which one it got.
 */
const SELECT_WITH_OVERRIDE = `
  SELECT y.id, y.name, y.category,
         COALESCE(o.factor, y.factor) AS factor,
         y.method,
         CASE WHEN o.factor IS NULL THEN y.source ELSE 'usuario' END AS source,
         y.notes
    FROM yield_factor y
    LEFT JOIN yield_override o
           ON o.yield_factor_id = y.id
          AND o.device_id = $2::uuid`;

/**
 * Search yield factors by name using ILIKE. Returns all matches (usually few).
 * `deviceId` may be null (transition mode, before device auth is enforced), in
 * which case only shared defaults are returned.
 * Never throws — returns [] if DB is unavailable.
 */
export async function searchYield(
  query: string,
  deviceId: string | null = null,
): Promise<YieldFactor[]> {
  const pool = getPool();
  if (!pool) return [];

  try {
    const { rows } = await pool.query<YieldFactor>(
      `${SELECT_WITH_OVERRIDE}
        WHERE y.name ILIKE $1
        ORDER BY length(y.name) ASC
        LIMIT 10`,
      [`%${query.trim()}%`, deviceId],
    );
    return rows;
  } catch (err) {
    console.error('[yield] search failed:', (err as Error).message);
    return [];
  }
}

/**
 * Resolve many food names to their best yield factor in a single query.
 *
 * Enriching a diet plan needs a factor per food; asking for them one at a time
 * made the extraction wait on serial database round-trips. `DISTINCT ON` keeps
 * the shortest (closest) match per requested name.
 *
 * Returns a map keyed by the ORIGINAL name passed in. Names with no match are
 * absent. Never throws — returns an empty map if the DB is unavailable.
 */
export async function searchYieldBatch(
  names: string[],
  deviceId: string | null = null,
): Promise<Map<string, YieldFactor>> {
  const matches = new Map<string, YieldFactor>();
  const pool = getPool();
  if (!pool || names.length === 0) return matches;

  try {
    const { rows } = await pool.query<YieldFactor & { query_name: string }>(
      `SELECT DISTINCT ON (q.orig)
              q.orig AS query_name,
              y.id, y.name, y.category,
              COALESCE(o.factor, y.factor) AS factor,
              y.method,
              CASE WHEN o.factor IS NULL THEN y.source ELSE 'usuario' END AS source,
              y.notes
         FROM unnest($1::text[]) AS q(orig)
         JOIN yield_factor y ON y.name ILIKE '%' || btrim(q.orig) || '%'
         LEFT JOIN yield_override o
                ON o.yield_factor_id = y.id
               AND o.device_id = $2::uuid
        ORDER BY q.orig, length(y.name) ASC`,
      [[...new Set(names)], deviceId],
    );
    for (const { query_name, ...factor } of rows) matches.set(query_name, factor);
  } catch (err) {
    console.error('[yield] batch search failed:', (err as Error).message);
  }

  return matches;
}

/**
 * Record one device's correction to a yield factor, replacing any previous
 * correction it made for the same factor. Shared defaults are never mutated,
 * so one user's number cannot leak into everyone else's plans.
 *
 * Returns the factor as that device now sees it, or null if the id does not
 * exist or the write failed.
 */
export async function setYieldOverride(
  deviceId: string,
  yieldFactorId: number,
  factor: number,
): Promise<YieldFactor | null> {
  const pool = getPool();
  if (!pool) return null;

  try {
    const { rows } = await pool.query<YieldFactor>(
      `WITH upserted AS (
         INSERT INTO yield_override (device_id, yield_factor_id, factor)
         SELECT $1::uuid, y.id, $3
           FROM yield_factor y
          WHERE y.id = $2
         ON CONFLICT (device_id, yield_factor_id)
         DO UPDATE SET factor = EXCLUDED.factor, updated_at = now()
         RETURNING yield_factor_id, factor
       )
       SELECT y.id, y.name, y.category, u.factor, y.method,
              'usuario' AS source, y.notes
         FROM upserted u
         JOIN yield_factor y ON y.id = u.yield_factor_id`,
      [deviceId, yieldFactorId, factor],
    );
    return rows[0] ?? null;
  } catch (err) {
    console.error('[yield] override failed:', (err as Error).message);
    return null;
  }
}
