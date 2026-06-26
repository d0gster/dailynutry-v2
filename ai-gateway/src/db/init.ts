/**
 * One-shot schema initializer. Run with: `npm run db:init`.
 * Reads schema.sql and applies it (idempotent — uses CREATE TABLE IF NOT EXISTS).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Pool } from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set — nothing to initialize.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, 'schema.sql'), 'utf8');

const pool = new Pool({ connectionString: url });
try {
  await pool.query(sql);
  console.log('✓ request_log schema applied');
} catch (err) {
  console.error('Schema init failed:', (err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
