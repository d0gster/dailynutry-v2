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
  if (!url) {
    pool = null;
    return pool;
  }

  pool = new Pool({
    connectionString: url,
    max: 5,

    /**
     * Bounded waits, all of them. `pg` defaults every one of these to "wait
     * forever", which is the wrong default for a request path: a Postgres that
     * accepts TCP but never answers would hang the extraction response too,
     * since request logging is awaited before responding.
     *
     * A slow database should cost a request its logging, never its response.
     */
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
    statement_timeout: 10_000,
    idleTimeoutMillis: 30_000,
  });

  /**
   * REQUIRED, not defensive. `pg` emits 'error' on the pool when an IDLE client
   * fails — a backend restart, a network partition, a connection refused during
   * a reconnect. That event fires outside any request's try/catch, and an
   * unhandled 'error' event on an EventEmitter terminates the Node process.
   *
   * Without this listener a brief Postgres outage does not degrade the gateway,
   * it kills it — including the extraction path, which does not need the
   * database at all.
   */
  pool.on('error', (err) => {
    console.error('[db] idle client error (pool stays usable):', err.message);
  });

  return pool;
}

export function isDbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
