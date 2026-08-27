import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Device auth is the control that stops a leaked app key from buying unlimited
 * extraction, so its FAILURE paths matter more than its happy path — most of
 * all that it never falls open when the database is unreachable.
 *
 * The `device` DB module is mocked: these assert the policy decisions in
 * `resolveCaller`, not Postgres itself.
 */
const resolveDeviceAndConsumeQuota = vi.hoisted(() => vi.fn());
const lookupDevice = vi.hoisted(() => vi.fn());
vi.mock('@/db/device', () => ({ resolveDeviceAndConsumeQuota, lookupDevice }));

const { resolveCaller, identifyCaller, DEFAULT_DAILY_QUOTA } = await import('@/core/device-auth');

const KEY = 'test-gateway-key';

function request(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:4000/api/extract', {
    method: 'POST',
    headers: { 'x-api-key': KEY, ...headers },
  });
}

describe('resolveCaller', () => {
  beforeEach(() => {
    process.env.GATEWAY_API_KEY = KEY;
    delete process.env.REQUIRE_DEVICE_AUTH;
    resolveDeviceAndConsumeQuota.mockReset();
    lookupDevice.mockReset();
  });

  afterEach(() => {
    delete process.env.REQUIRE_DEVICE_AUTH;
  });

  it('rejects a caller without the app key, before touching the database', async () => {
    const res = await resolveCaller(
      new Request('http://localhost:4000/api/extract', { method: 'POST' }),
    );
    expect(res.ok).toBe(false);
    expect(resolveDeviceAndConsumeQuota).not.toHaveBeenCalled();
  });

  // ── Transition mode: device token optional ────────────────────────────────

  it('falls back to an IP bucket when device auth is not yet required', async () => {
    const res = await resolveCaller(request({ 'x-real-ip': '203.0.113.9' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.caller.deviceId).toBeNull();
    expect(res.caller.identity).toBe('ip:203.0.113.9');
  });

  it('demands registration once REQUIRE_DEVICE_AUTH is on', async () => {
    process.env.REQUIRE_DEVICE_AUTH = 'true';
    const res = await resolveCaller(request());
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.response.status).toBe(401);
    expect((await res.response.json()).error).toMatch(/registration required/i);
  });

  // ── Token resolution ──────────────────────────────────────────────────────

  it('keys the rate limit on the device, not the IP', async () => {
    resolveDeviceAndConsumeQuota.mockResolvedValue({
      status: 'ok',
      device: { id: 'dev-1', revoked: false, quota_used: 1 },
    });

    const res = await resolveCaller(request({ authorization: 'Bearer good-token', 'x-real-ip': '203.0.113.9' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Identity must survive an IP change — that is the whole point.
    expect(res.caller.identity).toBe('device:dev-1');
    expect(res.caller.deviceId).toBe('dev-1');
  });

  it('rejects an unknown token (401)', async () => {
    resolveDeviceAndConsumeQuota.mockResolvedValue({ status: 'not_found' });
    const res = await resolveCaller(request({ authorization: 'Bearer nope' }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.response.status).toBe(401);
  });

  it('rejects a revoked device with 403, not 401', async () => {
    resolveDeviceAndConsumeQuota.mockResolvedValue({ status: 'revoked' });
    const res = await resolveCaller(request({ authorization: 'Bearer revoked' }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    // 403 matters: the app retries a 401 by re-registering, which would undo
    // the revocation. A revoked device must stay revoked.
    expect(res.response.status).toBe(403);
  });

  it('rejects when the quota is spent, with a Retry-After', async () => {
    resolveDeviceAndConsumeQuota.mockResolvedValue({ status: 'quota_exceeded' });

    const res = await resolveCaller(request({ authorization: 'Bearer spent' }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.response.status).toBe(429);
    expect(Number(res.response.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('ALLOWS the last request of the day', async () => {
    // `quota_used` comes back POST-increment, so the final allowed request
    // reports a count equal to the cap. The SQL WHERE clause is what decides
    // — a returned row means "allowed". Re-checking the count here used to
    // reject this request, costing every device one extraction per day.
    resolveDeviceAndConsumeQuota.mockResolvedValue({
      status: 'ok',
      device: { id: 'dev-1', revoked: false, quota_used: DEFAULT_DAILY_QUOTA },
    });

    const res = await resolveCaller(request({ authorization: 'Bearer last' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.caller.deviceId).toBe('dev-1');
  });

  // ── The one that matters most ─────────────────────────────────────────────

  it('FAILS CLOSED when the database is unreachable', async () => {
    resolveDeviceAndConsumeQuota.mockResolvedValue({ status: 'unavailable' });

    const res = await resolveCaller(request({ authorization: 'Bearer any-token' }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    // A DB outage must never turn the gateway into an open, billable endpoint.
    expect(res.response.status).toBe(503);
  });
});

describe('identifyCaller', () => {
  beforeEach(() => {
    process.env.GATEWAY_API_KEY = KEY;
    delete process.env.REQUIRE_DEVICE_AUTH;
    resolveDeviceAndConsumeQuota.mockReset();
    lookupDevice.mockReset();
  });

  afterEach(() => {
    delete process.env.REQUIRE_DEVICE_AUTH;
  });

  it('does NOT spend quota — only /api/extract may', async () => {
    // The quota caps what a leaked token can cost in LLM calls. Charging it for
    // a yield-factor read burned a user's daily extractions on free requests.
    lookupDevice.mockResolvedValue({
      status: 'ok',
      device: { id: 'dev-1', revoked: false, quota_used: 3 },
    });

    const res = await identifyCaller(request({ authorization: 'Bearer t' }));

    expect(res.ok).toBe(true);
    expect(lookupDevice).toHaveBeenCalledOnce();
    expect(resolveDeviceAndConsumeQuota).not.toHaveBeenCalled();
  });

  it('still refuses a revoked device', async () => {
    lookupDevice.mockResolvedValue({ status: 'revoked' });

    const res = await identifyCaller(request({ authorization: 'Bearer revoked' }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.response.status).toBe(403);
  });

  it('still FAILS CLOSED when the database is unreachable', async () => {
    lookupDevice.mockResolvedValue({ status: 'unavailable' });

    const res = await identifyCaller(request({ authorization: 'Bearer any' }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.response.status).toBe(503);
  });
});
