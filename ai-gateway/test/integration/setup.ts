import { afterAll } from 'vitest';
import { closePool } from './helpers';

/**
 * Closes the connection pool once per test FILE, after every suite in it has
 * finished — so vitest exits instead of hanging on an open handle.
 *
 * Doing this in each `describe`'s own `afterAll` looked equivalent and was
 * not: with two suites in one file, the first one's teardown closed the pool
 * out from under the second, whose queries then failed into the "database
 * unavailable" path and silently returned empty results.
 */
afterAll(closePool);
