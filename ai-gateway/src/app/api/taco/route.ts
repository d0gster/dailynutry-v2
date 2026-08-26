import { NextRequest, NextResponse } from 'next/server';
import { searchTaco } from '@/db/taco';
import { requireApiKey, callerIdentity } from '@/core/auth';
import { checkRateLimit, rateLimitHeaders } from '@/cache/redis';

export const runtime = 'nodejs';

/** Cheap DB reads — a looser budget than the LLM path. */
const RATE_LIMIT = 60;
const RATE_WINDOW = 60;

/**
 * GET /api/taco?q=frango+grelhado
 * Search TACO food database. Requires x-api-key.
 */
export async function GET(req: NextRequest) {
  const unauthorized = requireApiKey(req);
  if (unauthorized) return unauthorized;

  const limit = await checkRateLimit(`taco:${callerIdentity(req)}`, RATE_LIMIT, RATE_WINDOW);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  const q = req.nextUrl.searchParams.get('q');
  if (!q || q.trim().length === 0) {
    return NextResponse.json({ error: 'Missing query parameter "q"' }, { status: 400 });
  }

  const results = await searchTaco(q);
  return NextResponse.json({ results });
}
