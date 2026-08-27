import { getPool } from '@/db/client';

/**
 * Integration tests run against the real Postgres from `docker compose up -d`.
 *
 * They exist because the unit suite mocks the database, and both bugs that
 * actually reached a running server lived in the seam the mocks hide: an
 * off-by-one between the SQL quota guard and a JS re-check (whose unit test
 * PASSED while encoding the bug), and a yield lookup matching the wrong way
 * round, so no plan ever received a yield factor. Neither is reachable
 * without real SQL.
 *
 * Files here use `describe.skipIf(!hasDb)` so `npm test` still passes on a
 * machine with no Docker running — CI sets DATABASE_URL to get real coverage.
 */
export const hasDb = Boolean(process.env.DATABASE_URL);

/** Every row these tests create is tagged, so cleanup cannot touch seed data. */
export const TEST_TAG = '__itest__';

export async function query<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL must be set for integration tests');
  const { rows } = await pool.query<T>(sql, params);
  return rows;
}

/**
 * Removes only what the tests created. Deliberately narrow: a blanket
 * `TRUNCATE device` would wipe a developer's real local registrations.
 */
export async function cleanup(): Promise<void> {
  await query(`DELETE FROM audit_event WHERE caller_ip = $1`, [TEST_TAG]);
  await query(`DELETE FROM device WHERE registered_ip = $1`, [TEST_TAG]);
  await query(`DELETE FROM yield_factor WHERE name LIKE $1`, [`${TEST_TAG}%`]);
}

export async function closePool(): Promise<void> {
  await getPool()?.end();
}
