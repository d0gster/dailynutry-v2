import { describe, it, expect, beforeEach } from 'vitest';
import { fakeJpegBase64 } from './helpers/fake-image';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/extract/route';
import { MAX_IMAGE_BASE64_CHARS, MAX_REQUEST_BYTES } from '@/core/limits';

const KEY = 'test-gateway-key';

/**
 * Each test uses a distinct client IP. Rate limits are per-caller, so sharing
 * one identity would make tests interfere as the suite grows — the 21st
 * request in the file would fail for reasons unrelated to what it asserts.
 */
function req(body: unknown, headers: Record<string, string> = {}, ip = 'test-default') {
  return new NextRequest('http://localhost:4000/api/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': ip, ...headers },
    body: JSON.stringify(body),
  });
}

const validBody = { images: [{ base64: fakeJpegBase64(), mimeType: 'image/jpeg' }] };

describe('POST /api/extract', () => {
  beforeEach(() => {
    process.env.GATEWAY_API_KEY = KEY;
    // No provider keys → honest 503, never fabricated data.
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('rejects a request with no x-api-key (401)', async () => {
    const res = await POST(req(validBody, {}, 'no-key'));
    expect(res.status).toBe(401);
  });

  it('rejects a request with the wrong key (401)', async () => {
    const res = await POST(req(validBody, { 'x-api-key': 'wrong' }, 'wrong-key'));
    expect(res.status).toBe(401);
  });

  it('rejects an invalid body (400)', async () => {
    const res = await POST(req({ images: [] }, { 'x-api-key': KEY }, 'empty-body'));
    expect(res.status).toBe(400);
  });

  it('returns an honest 503 when no provider is configured', async () => {
    const res = await POST(req(validBody, { 'x-api-key': KEY }, 'no-provider'));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toMatch(/No LLM provider/i);
  });

  // ── Auth fails closed ─────────────────────────────────────────────────────

  it('refuses every request when GATEWAY_API_KEY is unset (503, not open)', async () => {
    delete process.env.GATEWAY_API_KEY;
    const res = await POST(req(validBody, { 'x-api-key': 'anything' }, 'no-gateway-key'));
    expect(res.status).toBe(503);
    // The important part: it must NOT fall through to the provider chain.
    expect(res.status).not.toBe(200);
  });

  // ── Request size limits ───────────────────────────────────────────────────

  it('rejects an over-sized body on Content-Length alone (413)', async () => {
    const res = await POST(
      req(validBody, {
        'x-api-key': KEY,
        'content-length': String(MAX_REQUEST_BYTES + 1),
      }, 'too-large'),
    );
    expect(res.status).toBe(413);
  });

  it('rejects an image whose base64 exceeds the per-image cap (400)', async () => {
    const oversized = { images: [{ base64: 'A'.repeat(MAX_IMAGE_BASE64_CHARS + 1), mimeType: 'image/jpeg' }] };
    const res = await POST(req(oversized, { 'x-api-key': KEY }, 'big-image'));
    expect(res.status).toBe(400);
  });

  it('rejects more images than the cap allows (400)', async () => {
    const many = { images: Array.from({ length: 9 }, () => ({ base64: fakeJpegBase64(), mimeType: 'image/jpeg' })) };
    const res = await POST(req(many, { 'x-api-key': KEY }, 'many-images'));
    expect(res.status).toBe(400);
  });

  // ── overrideModel is interpolated into a provider URL ─────────────────────

  it('rejects an overrideModel containing path traversal (400)', async () => {
    const body = { ...validBody, overrideModel: '../../../v1beta/models/other' };
    const res = await POST(req(body, { 'x-api-key': KEY }, 'traversal'));
    expect(res.status).toBe(400);
  });

  it('accepts a well-formed overrideModel', async () => {
    const body = { ...validBody, overrideModel: 'gemini-2.5-flash' };
    const res = await POST(req(body, { 'x-api-key': KEY }, 'good-model'));
    // Passes validation and reaches the provider check (503, no keys configured).
    expect(res.status).toBe(503);
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  it('advertises the remaining budget on a successful response', async () => {
    const res = await POST(req(validBody, { 'x-api-key': KEY }, 'headers-check'));
    expect(res.headers.get('X-RateLimit-Limit')).toBe('20');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('19');
  });

  it('returns 429 with Retry-After once the budget is spent', async () => {
    const ip = 'rate-limited-caller';
    // Budget is 20/min; the 21st request must be rejected.
    for (let i = 0; i < 20; i++) {
      await POST(req(validBody, { 'x-api-key': KEY }, ip));
    }

    const res = await POST(req(validBody, { 'x-api-key': KEY }, ip));
    expect(res.status).toBe(429);

    // Without these a client has no way to know when to retry.
    const retryAfter = Number(res.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('limits each caller separately', async () => {
    const ip = 'noisy-neighbour';
    for (let i = 0; i < 21; i++) {
      await POST(req(validBody, { 'x-api-key': KEY }, ip));
    }
    expect((await POST(req(validBody, { 'x-api-key': KEY }, ip))).status).toBe(429);

    // A different caller must be unaffected by the first one's spending.
    const other = await POST(req(validBody, { 'x-api-key': KEY }, 'quiet-neighbour'));
    expect(other.status).not.toBe(429);
  });
});
