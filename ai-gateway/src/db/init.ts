/**
 * One-shot schema initializer. Run with: `npm run db:init`.
 * Reads schema.sql and applies it (idempotent — uses CREATE TABLE IF NOT EXISTS).
 * Then applies seed files (taco-seed.sql, yield-seed.sql) using ON CONFLICT DO NOTHING.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Pool } from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set — nothing to initialize.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));

/** Read and execute a SQL file. Returns true on success. */
async function applySql(pool: Pool, filename: string, label: string): Promise<boolean> {
  const path = join(here, filename);
  if (!existsSync(path)) {
    console.warn(`⚠ ${label} not found at ${path} — skipping`);
    return false;
  }
  const sql = readFileSync(path, 'utf8');
  await pool.query(sql);
  console.log(`✓ ${label} applied`);
  return true;
}

const pool = new Pool({ connectionString: url });
try {
  await applySql(pool, 'schema.sql', 'schema (request_log + taco_food + yield_factor)');
  await applySql(pool, 'taco-seed.sql', 'taco-seed');
  await applySql(pool, 'yield-seed.sql', 'yield-seed');
} catch (err) {
  console.error('Schema init failed:', (err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
