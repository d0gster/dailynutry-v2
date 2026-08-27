import { defineConfig } from 'vitest/config';

/**
 * Unit suite: hermetic. Every external dependency is mocked, nothing reads
 * `.env`, and it passes on a laptop with no Docker running.
 *
 * The integration suite is deliberately NOT included here — see
 * `vitest.integration.config.ts`. Keeping them apart is what stops `npm test`
 * from quietly depending on a database being up, and stops the unit tests
 * from inheriting real credentials out of `.env`.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
});
