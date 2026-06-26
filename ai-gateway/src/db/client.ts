import { Pool } from 'pg';

/**
 * Lazily-created Postgres pool. The gateway degrades gracefully: if
 * DATABASE_URL is unset, `getPool()` returns null and callers fall back to
 * logging to stdout. This keeps the gateway runnable with zero infra.
 */
let pool: Pool | null | undefined;

export function getPool(): Pool | null {
  if (pool !== undefined) return pool;
  const url = process.env.DATABASE_URL;
  pool = url ? new Pool({ connectionString: url, max: 5 }) : null;
  return pool;
}

export function isDbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
