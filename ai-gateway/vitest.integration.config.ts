import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';

/**
 * Integration suite: runs against the real Postgres from `docker compose up -d`.
 *
 * These tests exist because mocking the database hides exactly the seam where
 * the two bugs that reached a running server lived — a quota off-by-one whose
 * unit test passed while asserting the wrong number, and a yield lookup
 * matching the wrong way round. Both are SQL, and only SQL can catch them.
 *
 * `.env` is loaded here and nowhere else, so the unit suite stays hermetic.
 * With no DATABASE_URL the files skip themselves rather than fail, so this is
 * still safe to run before `docker compose up`.
 */
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    setupFiles: ['test/integration/setup.ts'],
    // These share one database, so parallel files would clean up each other's
    // rows mid-test.
    fileParallelism: false,
  },
});
