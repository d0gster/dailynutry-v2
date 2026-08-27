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
function words(text: string): string[] {
  return text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word}:*`);
}

const TACO_COLUMNS = `taco_id, name, group_name,
        energy_kcal, protein_g, carb_g, fat_g, fiber_g, sodium_mg`;

/** Every word required. Precise, and the right first attempt. */
function toTsQuery(text: string): string {
  return words(text).join(' & ');
}

/**
 * Minimum trigram similarity to accept a loose match.
 *
 * Calibrated against the real seed: genuine matches score 0.50–1.00
 * ("Filé de merluza grelhado" → "Merluza, filé, assado" = 0.50), while foods
 * absent from TACO top out around 0.12. The gap is wide, and 0.35 sits inside
 * it deliberately — with merluza removed, the next candidate
 * ("Abadejo, filé, congelado, grelhado" = 0.34) falls below the line rather
 * than being served as if it were the right fish.
 *
 * Erring toward "no data" is the correct bias here: a missing calorie count is
 * visible, a confidently wrong one is not.
 */
const MIN_SIMILARITY = 0.35;

/**
 * Fuzzy search TACO foods by name, widening in two steps: every word via
 * full-text first, then trigram similarity above `MIN_SIMILARITY`. Returns
 * the top 5. Never throws — returns [] if the DB is unavailable.
 */
export async function searchTaco(query: string): Promise<TacoFood[]> {
  const pool = getPool();
  if (!pool) return [];

  try {
    const tsQuery = toTsQuery(query);
    if (!tsQuery) return [];

    const { rows: strict } = await pool.query<TacoFood>(
      `SELECT ${TACO_COLUMNS}
         FROM taco_food
        WHERE to_tsvector('portuguese', name) @@ to_tsquery('portuguese', $1)
        ORDER BY ts_rank(to_tsvector('portuguese', name), to_tsquery('portuguese', $1)) DESC
        LIMIT 5`,
      [tsQuery],
    );
    if (strict.length > 0) return strict;

    const { rows: similar } = await pool.query<TacoFood>(
      `SELECT ${TACO_COLUMNS}
         FROM taco_food
        WHERE similarity(name, $1) >= $2
        ORDER BY similarity(name, $1) DESC
        LIMIT 5`,
      [query.trim(), MIN_SIMILARITY],
    );
    return similar;
  } catch (err) {
    console.error('[taco] search failed:', (err as Error).message);
    return [];
  }
}

/** The full-text tier, run once for a whole batch of names. */
const BATCH_FULLTEXT = `
  SELECT q.orig AS query_name, t.*
    FROM unnest($1::text[], $2::text[]) AS q(orig, tsq)
    CROSS JOIN LATERAL (
      SELECT ${TACO_COLUMNS}
        FROM taco_food
       WHERE to_tsvector('portuguese', name) @@ to_tsquery('portuguese', q.tsq)
       ORDER BY ts_rank(to_tsvector('portuguese', name), to_tsquery('portuguese', q.tsq)) DESC
       LIMIT 1
    ) t`;

/**
 * Resolve many food names to their best TACO match in two queries, regardless
 * of how many names are asked for.
 *
 * Enriching a diet plan means looking up dozens of foods; doing that one
 * round-trip at a time made the whole extraction wait on serial database
 * latency. `unnest` turns the name list into rows, and `LATERAL` picks the
 * single best match per name inside the same query.
 *
 * The tiers mirror `searchTaco`: full-text with every word, then trigram
 * similarity for whatever it missed — the second running only over the names
 * still unmatched, so it costs nothing when the first already answered.
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

  const absorb = (rows: Array<TacoFood & { query_name: string }>) => {
    for (const { query_name, ...food } of rows) matches.set(query_name, food);
  };

  try {
    const pairs = unique
      .map((name) => [name, toTsQuery(name)] as const)
      .filter(([, tsq]) => tsq.length > 0);

    if (pairs.length > 0) {
      const { rows } = await pool.query<TacoFood & { query_name: string }>(BATCH_FULLTEXT, [
        pairs.map(([name]) => name),
        pairs.map(([, tsq]) => tsq),
      ]);
      absorb(rows);
    }

    const unmatched = unique.filter((name) => !matches.has(name));
    if (unmatched.length > 0) {
      const { rows } = await pool.query<TacoFood & { query_name: string }>(
        `SELECT q.orig AS query_name, t.*
           FROM unnest($1::text[]) AS q(orig)
           CROSS JOIN LATERAL (
             SELECT ${TACO_COLUMNS}
               FROM taco_food
              WHERE similarity(name, q.orig) >= $2
              ORDER BY similarity(name, q.orig) DESC
              LIMIT 1
           ) t`,
        [unmatched, MIN_SIMILARITY],
      );
      absorb(rows);
    }
  } catch (err) {
    console.error('[taco] batch search failed:', (err as Error).message);
  }

  return matches;
}
