import { getPool } from './client';

export interface TacoFood {
  taco_id: number;
  name: string;
  group_name: string;
  energy_kcal: number | null;
  protein_g: number | null;
  carb_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
}

/**
 * Build a `to_tsquery` expression from free text.
 *
 * The input is a food name that came out of an LLM, so it can contain any
 * character. `to_tsquery` has its own operator syntax (`&`, `|`, `!`, `:`,
 * parentheses) and RAISES on malformed input rather than returning no rows —
 * which would turn a stray character in one food name into a failed lookup.
 * Stripping everything that isn't a letter, digit or space avoids that
 * entirely. (SQL injection was never the risk here — the value is passed as a
 * bound parameter — the risk is a thrown query.)
 */
function toTsQuery(text: string): string {
  return text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word}:*`)
    .join(' & ');
}

/**
 * Fuzzy search TACO foods by name. Uses PostgreSQL full-text search with
 * Portuguese dictionary, falling back to ILIKE for partial matches.
 * Returns top 5 results. Never throws — returns [] if DB is unavailable.
 */
export async function searchTaco(query: string): Promise<TacoFood[]> {
  const pool = getPool();
  if (!pool) return [];

  try {
    // First try full-text search (best ranking for Portuguese)
    const tsQuery = toTsQuery(query);
    if (!tsQuery) return [];

    const { rows } = await pool.query<TacoFood>(
      `SELECT taco_id, name, group_name,
              energy_kcal, protein_g, carb_g, fat_g, fiber_g, sodium_mg
         FROM taco_food
        WHERE to_tsvector('portuguese', name) @@ to_tsquery('portuguese', $1)
        ORDER BY ts_rank(to_tsvector('portuguese', name), to_tsquery('portuguese', $1)) DESC
        LIMIT 5`,
      [tsQuery],
    );

    if (rows.length > 0) return rows;

    // Fallback: ILIKE for simpler partial matches
    const { rows: ilike } = await pool.query<TacoFood>(
      `SELECT taco_id, name, group_name,
              energy_kcal, protein_g, carb_g, fat_g, fiber_g, sodium_mg
         FROM taco_food
        WHERE name ILIKE $1
        ORDER BY length(name) ASC
        LIMIT 5`,
      [`%${query.trim()}%`],
    );
    return ilike;
  } catch (err) {
    console.error('[taco] search failed:', (err as Error).message);
    return [];
  }
}

const TACO_COLUMNS = `taco_id, name, group_name,
        energy_kcal, protein_g, carb_g, fat_g, fiber_g, sodium_mg`;

/**
 * Resolve many food names to their best TACO match in two queries total,
 * regardless of how many names are asked for.
 *
 * Enriching a diet plan means looking up dozens of foods; doing that one
 * round-trip at a time made the whole extraction wait on serial database
 * latency. `unnest` turns the name list into rows, and `LATERAL` picks the
 * single best-ranked match per name inside the same query.
 *
 * Returns a map keyed by the ORIGINAL name string passed in, so callers can
 * look results up by the same value they supplied. Names with no match are
 * simply absent. Never throws — returns an empty map if the DB is unavailable.
 */
export async function searchTacoBatch(names: string[]): Promise<Map<string, TacoFood>> {
  const matches = new Map<string, TacoFood>();
  const pool = getPool();
  if (!pool || names.length === 0) return matches;

  const unique = [...new Set(names)];

  try {
    const tsQueries = unique.map(toTsQuery);
    const searchable = unique.filter((_, i) => tsQueries[i].length > 0);
    const searchableTsQueries = tsQueries.filter((q) => q.length > 0);

    if (searchable.length > 0) {
      const { rows } = await pool.query<TacoFood & { query_name: string }>(
        `SELECT q.orig AS query_name, t.*
           FROM unnest($1::text[], $2::text[]) AS q(orig, tsq)
           CROSS JOIN LATERAL (
             SELECT ${TACO_COLUMNS}
               FROM taco_food
              WHERE to_tsvector('portuguese', name) @@ to_tsquery('portuguese', q.tsq)
              ORDER BY ts_rank(to_tsvector('portuguese', name), to_tsquery('portuguese', q.tsq)) DESC
              LIMIT 1
           ) t`,
        [searchable, searchableTsQueries],
      );
      for (const { query_name, ...food } of rows) matches.set(query_name, food);
    }

    // Same ILIKE fallback as the single-name path, for whatever full-text missed.
    const unmatched = unique.filter((name) => !matches.has(name));
    if (unmatched.length > 0) {
      const { rows } = await pool.query<TacoFood & { query_name: string }>(
        `SELECT q.orig AS query_name, t.*
           FROM unnest($1::text[]) AS q(orig)
           CROSS JOIN LATERAL (
             SELECT ${TACO_COLUMNS}
               FROM taco_food
              WHERE name ILIKE '%' || btrim(q.orig) || '%'
              ORDER BY length(name) ASC
              LIMIT 1
           ) t`,
        [unmatched],
      );
      for (const { query_name, ...food } of rows) matches.set(query_name, food);
    }
  } catch (err) {
    console.error('[taco] batch search failed:', (err as Error).message);
  }

  return matches;
}
