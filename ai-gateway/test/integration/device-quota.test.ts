import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { registerDevice, resolveDeviceAndConsumeQuota, lookupDevice, revokeDevice } from '@/db/device';
import { hasDb, TEST_TAG, query, cleanup } from './helpers';

/**
 * Device quota and revocation against real Postgres.
 *
 * The quota is the cap on what a single leaked token can cost in provider
 * spend, so its edges are worth pinning down exactly — and the unit suite
 * cannot reach them: the guard lives in a WHERE clause. The off-by-one that
 * shipped (every device losing one extraction a day) had a green unit test
 * that asserted the wrong number.
 */
describe.skipIf(!hasDb)('device quota', () => {
  const QUOTA = 5;
  let deviceId: string;
  let token: string;

  beforeEach(async () => {
    await cleanup();
    const registered = await registerDevice(TEST_TAG);
    if (!registered) throw new Error('registration failed');
    deviceId = registered.deviceId;
    token = registered.token;
  });

  afterAll(cleanup);

  it('stores only a hash — a database dump yields no usable token', async () => {
    const [row] = await query<{ token_hash: string }>(
      `SELECT token_hash FROM device WHERE id = $1`,
      [deviceId],
    );

    expect(row.token_hash).not.toBe(token);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    // The plaintext must not appear anywhere in the stored value.
    expect(row.token_hash).not.toContain(token);
  });

  it('issues tokens with enough entropy to be unguessable', async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const registered = await registerDevice(TEST_TAG);
      expect(registered).not.toBeNull();
      // 32 random bytes, base64url — a bearer credential with no second factor.
      expect(registered!.token.length).toBeGreaterThanOrEqual(43);
      seen.add(registered!.token);
    }
    expect(seen.size).toBe(5);
  });

  it('allows exactly QUOTA requests, then refuses', async () => {
    const statuses: string[] = [];
    for (let i = 0; i < QUOTA + 2; i++) {
      statuses.push((await resolveDeviceAndConsumeQuota(token, QUOTA)).status);
    }

    expect(statuses.slice(0, QUOTA)).toEqual(Array(QUOTA).fill('ok'));
    expect(statuses.slice(QUOTA)).toEqual(['quota_exceeded', 'quota_exceeded']);
  });

  it('does not over-spend under concurrency', async () => {
    // The lookup and the increment are one statement precisely so parallel
    // requests cannot each read the same count and slip past the cap together.
    const results = await Promise.all(
      Array.from({ length: 20 }, () => resolveDeviceAndConsumeQuota(token, QUOTA)),
    );

    const allowed = results.filter((r) => r.status === 'ok').length;
    expect(allowed).toBe(QUOTA);

    const [row] = await query<{ quota_used: number }>(
      `SELECT quota_used FROM device WHERE id = $1`,
      [deviceId],
    );
    expect(row.quota_used).toBe(QUOTA);
  });

  it('resets on the UTC day boundary with no scheduled job', async () => {
    await query(
      `UPDATE device SET quota_used = $2, quota_date = CURRENT_DATE - 1 WHERE id = $1`,
      [deviceId, QUOTA],
    );

    const result = await resolveDeviceAndConsumeQuota(token, QUOTA);

    expect(result.status).toBe('ok');
    const [row] = await query<{ quota_used: number }>(
      `SELECT quota_used FROM device WHERE id = $1`,
      [deviceId],
    );
    // Counter restarted at 1 for the new day, not resumed at QUOTA + 1.
    expect(row.quota_used).toBe(1);
  });

  it('refuses an unknown token without creating anything', async () => {
    const before = await query(`SELECT 1 FROM device WHERE registered_ip = $1`, [TEST_TAG]);
    const result = await resolveDeviceAndConsumeQuota('a-token-nobody-issued', QUOTA);
    const after = await query(`SELECT 1 FROM device WHERE registered_ip = $1`, [TEST_TAG]);

    expect(result.status).toBe('not_found');
    expect(after).toHaveLength(before.length);
  });

  it('a tampered token does not authenticate as its original', async () => {
    // Flipping one character must not survive the hash comparison.
    const tampered = token.slice(0, -1) + (token.at(-1) === 'A' ? 'B' : 'A');

    expect((await resolveDeviceAndConsumeQuota(tampered, QUOTA)).status).toBe('not_found');
  });

  it('spends no quota when the device is revoked', async () => {
    await resolveDeviceAndConsumeQuota(token, QUOTA);
    await revokeDevice(deviceId, 'test');

    const result = await resolveDeviceAndConsumeQuota(token, QUOTA);

    expect(result.status).toBe('revoked');
    const [row] = await query<{ quota_used: number }>(
      `SELECT quota_used FROM device WHERE id = $1`,
      [deviceId],
    );
    expect(row.quota_used).toBe(1);
  });

  it('revocation is permanent — a revoked device never comes back on its own', async () => {
    await revokeDevice(deviceId, 'abuse');

    for (let i = 0; i < 3; i++) {
      expect((await resolveDeviceAndConsumeQuota(token, QUOTA)).status).toBe('revoked');
      expect((await lookupDevice(token)).status).toBe('revoked');
    }
  });

  it('revoking one device leaves every other one working', async () => {
    const other = await registerDevice(TEST_TAG);
    if (!other) throw new Error('registration failed');

    await revokeDevice(deviceId, 'abuse');

    expect((await resolveDeviceAndConsumeQuota(token, QUOTA)).status).toBe('revoked');
    expect((await resolveDeviceAndConsumeQuota(other.token, QUOTA)).status).toBe('ok');
  });

  it('revoking twice reports that the second call changed nothing', async () => {
    expect(await revokeDevice(deviceId, 'first')).toBe(true);
    expect(await revokeDevice(deviceId, 'second')).toBe(false);
  });

  it('lookupDevice identifies without spending quota', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await lookupDevice(token)).status).toBe('ok');
    }

    const [row] = await query<{ quota_used: number }>(
      `SELECT quota_used FROM device WHERE id = $1`,
      [deviceId],
    );
    // Ten identifications, zero extractions charged.
    expect(row.quota_used).toBe(0);
  });
});
