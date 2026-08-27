import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { registerDevice } from '@/db/device';
import { searchYield, searchYieldBatch, setYieldOverride } from '@/db/yield';
import { hasDb, TEST_TAG, query, cleanup } from './helpers';

/**
 * Cross-device isolation of yield overrides.
 *
 * This is the security-relevant business rule in the yield feature: a
 * correction one user makes must never change what another user sees, and
 * must never mutate the shared defaults. Before overrides existed, the write
 * went straight into `yield_factor` — reference data every install reads — so
 * one user silently changed everyone's numbers.
 *
 * Mocking cannot test this. The isolation lives entirely in a JOIN predicate;
 * drop `AND o.device_id = $2` and every mocked test still passes.
 */
describe.skipIf(!hasDb)('yield overrides — cross-device isolation', () => {
  let deviceA: string;
  let deviceB: string;
  let factorId: number;

  beforeAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();

    const a = await registerDevice(TEST_TAG);
    const b = await registerDevice(TEST_TAG);
    if (!a || !b) throw new Error('device registration failed');
    deviceA = a.deviceId;
    deviceB = b.deviceId;

    const [row] = await query<{ id: number }>(
      `INSERT INTO yield_factor (name, category, factor, method, source)
       VALUES ($1, 'protein', 0.65, 'cozido', 'padrao')
       RETURNING id`,
      [`${TEST_TAG} frango peito`],
    );
    factorId = row.id;
  });

  afterAll(cleanup);

  it("A's correction does not reach B", async () => {
    await setYieldOverride(deviceA, factorId, 0.5);

    const [seenByA] = await searchYield(`${TEST_TAG} frango peito`, deviceA);
    const [seenByB] = await searchYield(`${TEST_TAG} frango peito`, deviceB);

    expect(seenByA.factor).toBeCloseTo(0.5);
    expect(seenByA.source).toBe('usuario');
    expect(seenByB.factor).toBeCloseTo(0.65);
    expect(seenByB.source).toBe('padrao');
  });

  it('never mutates the shared default', async () => {
    await setYieldOverride(deviceA, factorId, 0.5);

    const [shared] = await query<{ factor: number; source: string }>(
      `SELECT factor, source FROM yield_factor WHERE id = $1`,
      [factorId],
    );

    expect(shared.factor).toBeCloseTo(0.65);
    expect(shared.source).toBe('padrao');
  });

  it('a caller with no device sees defaults, never someone else s override', async () => {
    await setYieldOverride(deviceA, factorId, 0.5);

    const [anonymous] = await searchYield(`${TEST_TAG} frango peito`, null);

    expect(anonymous.factor).toBeCloseTo(0.65);
    expect(anonymous.source).toBe('padrao');
  });

  it('re-correcting replaces the previous value instead of stacking rows', async () => {
    await setYieldOverride(deviceA, factorId, 0.5);
    await setYieldOverride(deviceA, factorId, 0.7);

    const rows = await query(`SELECT 1 FROM yield_override WHERE device_id = $1`, [deviceA]);
    const [seen] = await searchYield(`${TEST_TAG} frango peito`, deviceA);

    expect(rows).toHaveLength(1);
    expect(seen.factor).toBeCloseTo(0.7);
  });

  it('refuses to record a correction against a factor that does not exist', async () => {
    const result = await setYieldOverride(deviceA, 2_000_000_000, 0.5);
    expect(result).toBeNull();
  });

  it('isolation holds through the batch path used by enrichment', async () => {
    await setYieldOverride(deviceA, factorId, 0.5);

    const forA = await searchYieldBatch([`${TEST_TAG} frango peito grelhado`], deviceA);
    const forB = await searchYieldBatch([`${TEST_TAG} frango peito grelhado`], deviceB);

    expect(forA.get(`${TEST_TAG} frango peito grelhado`)?.factor).toBeCloseTo(0.5);
    expect(forB.get(`${TEST_TAG} frango peito grelhado`)?.factor).toBeCloseTo(0.65);
  });

  it('deleting a device takes its overrides with it', async () => {
    await setYieldOverride(deviceA, factorId, 0.5);
    await query(`DELETE FROM device WHERE id = $1`, [deviceA]);

    const left = await query(`SELECT 1 FROM yield_override WHERE device_id = $1`, [deviceA]);
    expect(left).toHaveLength(0);
  });
});
