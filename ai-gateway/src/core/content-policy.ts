import { recordAuditEvent, countRecentEvents } from '@/db/audit';
import { blockDevice } from '@/db/device-block';

/**
 * What happens after a provider refuses an image on content grounds.
 *
 * The shape of the policy matters more than the numbers. One refusal is not
 * evidence of anything — safety classifiers fire on bad lighting, on medical
 * imagery, on a photo of a page that happens to contain a word they dislike.
 * A pattern within a single day is different, and that is what gets acted on.
 *
 * The response is a TIMED block rather than revocation, because the cost of
 * being wrong is asymmetric: a false positive on a timed block costs a user
 * one day and resolves itself; a false positive on revocation costs them the
 * app until a human intervenes. Deliberate probing is not deterred much by the
 * difference, and honest users are protected a great deal by it.
 *
 * Every step is recorded to `audit_event`, without the content — reasons and
 * counts only. That trail is what lets a support conversation later answer
 * "why did this stop working" without anyone re-examining what was uploaded.
 */

/** Refusals within the window before a device is barred. */
export const REFUSALS_BEFORE_BLOCK = 3;
export const REFUSAL_WINDOW_HOURS = 24;
export const BLOCK_DURATION_HOURS = 24;

export interface RefusalOutcome {
  /** Refusals counted for this device inside the window, including this one. */
  count: number;
  blocked: boolean;
  blockedUntil: Date | null;
}

/**
 * Records a content refusal and blocks the device once they accumulate.
 *
 * A caller with no device id (transition mode) still gets the event logged —
 * the trail is worth having — but cannot be blocked, since there is no stable
 * identity to block. That gap closes when `REQUIRE_DEVICE_AUTH` is on.
 */
export async function recordContentRefusal(params: {
  deviceId: string | null;
  callerIp: string | null;
  provider: string;
  reason: string;
}): Promise<RefusalOutcome> {
  const { deviceId, callerIp, provider, reason } = params;

  await recordAuditEvent({
    event: 'content_rejected',
    severity: 'warning',
    deviceId,
    callerIp,
    // No image data, no extracted text — only the provider's verdict.
    context: { provider, reason },
  });

  if (!deviceId) return { count: 0, blocked: false, blockedUntil: null };

  const count = await countRecentEvents(deviceId, 'content_rejected', REFUSAL_WINDOW_HOURS);
  if (count < REFUSALS_BEFORE_BLOCK) {
    return { count, blocked: false, blockedUntil: null };
  }

  const blockedUntil = await blockDevice(
    deviceId,
    BLOCK_DURATION_HOURS,
    `${count} content refusals in ${REFUSAL_WINDOW_HOURS}h`,
  );

  await recordAuditEvent({
    event: 'device_blocked',
    severity: 'critical',
    deviceId,
    callerIp,
    context: {
      refusals: count,
      windowHours: REFUSAL_WINDOW_HOURS,
      blockHours: BLOCK_DURATION_HOURS,
      expiresAt: blockedUntil?.toISOString() ?? null,
    },
  });

  return { count, blocked: blockedUntil !== null, blockedUntil };
}
