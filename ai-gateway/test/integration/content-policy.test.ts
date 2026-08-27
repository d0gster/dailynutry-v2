import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { registerDevice, resolveDeviceAndConsumeQuota, lookupDevice } from '@/db/device';
import { checkDeviceBlock, blockDevice, unblockDevice } from '@/db/device-block';
import {
  recordAuditEvent,
  countRecentEvents,
  deviceTimeline,
  sightingsOfHash,
  eventsForReference,
} from '@/db/audit';
import {
  recordContentRefusal,
  REFUSALS_BEFORE_BLOCK,
  BLOCK_DURATION_HOURS,
} from '@/core/content-policy';
import { hasDb, TEST_TAG, query, cleanup } from './helpers';

/**
 * The refusal → audit → block pipeline, against real Postgres.
 *
 * These are the rules a support conversation will later be argued from, so
 * they need to hold against the actual SQL rather than against a mock of it:
 * that a block really bars the device, that it expires on its own, and that
 * the audit trail records why without recording what.
 */
describe.skipIf(!hasDb)('content refusal policy', () => {
  const QUOTA = 10;
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

  it('lets isolated refusals pass without blocking — one bad photo is not abuse', async () => {
    for (let i = 0; i < REFUSALS_BEFORE_BLOCK - 1; i++) {
      const outcome = await recordContentRefusal({
        deviceId,
        callerIp: TEST_TAG,
        provider: 'gemini',
        reason: 'IMAGE_SAFETY',
      });
      expect(outcome.blocked).toBe(false);
    }

    expect((await checkDeviceBlock(deviceId)).status).toBe('clear');
    expect((await resolveDeviceAndConsumeQuota(token, QUOTA)).status).toBe('ok');
  });

  it('blocks once refusals accumulate inside the window', async () => {
    let outcome;
    for (let i = 0; i < REFUSALS_BEFORE_BLOCK; i++) {
      outcome = await recordContentRefusal({
        deviceId,
        callerIp: TEST_TAG,
        provider: 'gemini',
        reason: 'PROHIBITED_CONTENT',
      });
    }

    expect(outcome!.blocked).toBe(true);
    expect(outcome!.count).toBe(REFUSALS_BEFORE_BLOCK);

    const block = await checkDeviceBlock(deviceId);
    expect(block.status).toBe('blocked');
  });

  it('a blocked device is refused BEFORE its quota is spent', async () => {
    await blockDevice(deviceId, BLOCK_DURATION_HOURS, 'test');

    const before = await query<{ quota_used: number }>(
      `SELECT quota_used FROM device WHERE id = $1`,
      [deviceId],
    );
    const result = await resolveDeviceAndConsumeQuota(token, QUOTA);
    const after = await query<{ quota_used: number }>(
      `SELECT quota_used FROM device WHERE id = $1`,
      [deviceId],
    );

    expect(result.status).toBe('blocked');
    // Being barred must not also cost the user their daily allowance.
    expect(after[0].quota_used).toBe(before[0].quota_used);
  });

  it('a blocked device cannot even identify itself for free endpoints', async () => {
    await blockDevice(deviceId, BLOCK_DURATION_HOURS, 'test');
    expect((await lookupDevice(token)).status).toBe('blocked');
  });

  it('the block lifts itself once it expires — no scheduled job', async () => {
    await blockDevice(deviceId, BLOCK_DURATION_HOURS, 'test');
    expect((await checkDeviceBlock(deviceId)).status).toBe('blocked');

    // Wind the expiry into the past, as the clock would.
    await query(`UPDATE device_block SET expires_at = now() - interval '1 minute' WHERE device_id = $1`, [
      deviceId,
    ]);

    expect((await checkDeviceBlock(deviceId)).status).toBe('clear');
    expect((await resolveDeviceAndConsumeQuota(token, QUOTA)).status).toBe('ok');
  });

  it('re-offending extends a block, never shortens it', async () => {
    const long = await blockDevice(deviceId, 48, 'first');
    const short = await blockDevice(deviceId, 1, 'second');

    // The second, shorter block must not have brought the bar forward.
    expect(short!.getTime()).toBe(long!.getTime());
  });

  it('blocking one device leaves others untouched', async () => {
    const other = await registerDevice(TEST_TAG);
    if (!other) throw new Error('registration failed');

    await blockDevice(deviceId, BLOCK_DURATION_HOURS, 'test');

    expect((await resolveDeviceAndConsumeQuota(token, QUOTA)).status).toBe('blocked');
    expect((await resolveDeviceAndConsumeQuota(other.token, QUOTA)).status).toBe('ok');
  });

  it('support can lift a block early, for a false positive', async () => {
    await blockDevice(deviceId, BLOCK_DURATION_HOURS, 'test');

    expect(await unblockDevice(deviceId)).toBe(true);
    expect((await checkDeviceBlock(deviceId)).status).toBe('clear');
    expect((await resolveDeviceAndConsumeQuota(token, QUOTA)).status).toBe('ok');
  });

  it('counts only refusals inside the window', async () => {
    await recordAuditEvent({ event: 'content_rejected', deviceId, callerIp: TEST_TAG });
    await query(
      `UPDATE audit_event SET created_at = now() - interval '48 hours' WHERE device_id = $1`,
      [deviceId],
    );
    await recordAuditEvent({ event: 'content_rejected', deviceId, callerIp: TEST_TAG });

    expect(await countRecentEvents(deviceId, 'content_rejected', 24)).toBe(1);
  });

  it('counts each device separately, so one abuser cannot bar another user', async () => {
    const other = await registerDevice(TEST_TAG);
    if (!other) throw new Error('registration failed');

    for (let i = 0; i < REFUSALS_BEFORE_BLOCK; i++) {
      await recordContentRefusal({
        deviceId,
        callerIp: TEST_TAG,
        provider: 'gemini',
        reason: 'SAFETY',
      });
    }

    expect((await checkDeviceBlock(deviceId)).status).toBe('blocked');
    expect((await checkDeviceBlock(other.deviceId)).status).toBe('clear');
  });

  it('records WHY without recording WHAT', async () => {
    // A base64 payload stands in for a real image, to prove none of it lands
    // in the trail no matter how the refusal is recorded.
    const payload = Buffer.from('pretend-image-bytes').toString('base64');
    const hash = `extract:${createHash('sha256').update(payload).digest('hex')}`;

    await recordContentRefusal({
      deviceId,
      callerIp: TEST_TAG,
      provider: 'gemini',
      reason: 'IMAGE_SAFETY',
      imagesHash: hash,
    });

    const [event] = await deviceTimeline(deviceId);

    expect(event.event).toBe('content_rejected');
    expect(event.context.provider).toBe('gemini');
    expect(event.context.reason).toBe('IMAGE_SAFETY');
    expect(event.context.imagesHash).toBe(hash);

    // The point of the hash: it identifies the submission without being
    // reversible into it.
    const serialised = JSON.stringify(event.context);
    expect(serialised).not.toContain(payload);
    expect(serialised).not.toMatch(/base64|image\/|data:/i);
  });

  it('correlates one image across devices, which is what the hash is for', async () => {
    // One device sending many different images is a person with a bad camera.
    // One image arriving from many devices is a campaign. Only the hash tells
    // them apart — and it does so without the bytes ever being stored.
    const other = await registerDevice(TEST_TAG);
    if (!other) throw new Error('registration failed');
    const shared = `extract:${createHash('sha256').update('same-image').digest('hex')}`;

    for (const id of [deviceId, other.deviceId]) {
      await recordContentRefusal({
        deviceId: id,
        callerIp: TEST_TAG,
        provider: 'gemini',
        reason: 'IMAGE_SAFETY',
        imagesHash: shared,
      });
    }

    const sightings = await sightingsOfHash(shared);
    const devices = new Set(sightings.map((s) => s.device_id));

    expect(devices.size).toBe(2);
  });

  it('ties every event of one request together by its reference', async () => {
    const reference = randomUUID();

    await recordAuditEvent({ event: 'rate_limited', deviceId, callerIp: TEST_TAG, reference });
    await recordAuditEvent({ event: 'image_invalid', deviceId, callerIp: TEST_TAG, reference });
    await recordAuditEvent({ event: 'extraction_failed', deviceId, callerIp: TEST_TAG });

    const trace = await eventsForReference(reference);

    // "It failed, code abc-123" must resolve to that request and nothing else.
    expect(trace).toHaveLength(2);
    expect(trace.map((e) => e.event)).toEqual(['rate_limited', 'image_invalid']);
  });

  it('records a mutation with its before and after', async () => {
    // An audit that only says "a value was set" cannot answer whether anything
    // changed, which is the question an audit exists for.
    await recordAuditEvent({
      event: 'yield_override_set',
      deviceId,
      callerIp: TEST_TAG,
      context: { yieldFactorId: 1, before: 0.65, after: 0.5, replacedExisting: false },
    });

    const [event] = await deviceTimeline(deviceId);

    expect(event.event).toBe('yield_override_set');
    expect(event.context.before).toBe(0.65);
    expect(event.context.after).toBe(0.5);
  });

  it('gives support a timeline, newest first', async () => {
    await recordAuditEvent({ event: 'quota_exceeded', deviceId, callerIp: TEST_TAG });
    await recordAuditEvent({ event: 'content_rejected', deviceId, callerIp: TEST_TAG });

    const timeline = await deviceTimeline(deviceId);

    expect(timeline.length).toBeGreaterThanOrEqual(2);
    expect(timeline[0].event).toBe('content_rejected');
  });

  it('keeps the audit trail when the device is deleted', async () => {
    await recordContentRefusal({
      deviceId,
      callerIp: TEST_TAG,
      provider: 'gemini',
      reason: 'SAFETY',
    });
    await query(`DELETE FROM device WHERE id = $1`, [deviceId]);

    // Deleting a device must not erase the record of why it was refused.
    const rows = await query(`SELECT device_id FROM audit_event WHERE caller_ip = $1`, [TEST_TAG]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].device_id).toBeNull();
  });
});
