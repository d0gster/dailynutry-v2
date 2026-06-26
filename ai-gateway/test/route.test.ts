import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/extract/route';

const KEY = 'test-gateway-key';

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:4000/api/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const validBody = { images: [{ base64: 'AAAA', mimeType: 'image/jpeg' }] };

describe('POST /api/extract', () => {
  beforeEach(() => {
    process.env.GATEWAY_API_KEY = KEY;
    // No provider keys → honest 503, never fabricated data.
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('rejects a request with no x-api-key (401)', async () => {
    const res = await POST(req(validBody));
    expect(res.status).toBe(401);
  });

  it('rejects a request with the wrong key (401)', async () => {
    const res = await POST(req(validBody, { 'x-api-key': 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('rejects an invalid body (400)', async () => {
    const res = await POST(req({ images: [] }, { 'x-api-key': KEY }));
    expect(res.status).toBe(400);
  });

  it('returns an honest 503 when no provider is configured', async () => {
    const res = await POST(req(validBody, { 'x-api-key': KEY }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toMatch(/No LLM provider/i);
  });
});
