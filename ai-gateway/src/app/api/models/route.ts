import { NextRequest, NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/core/http';
import { requireApiKey, callerIdentity } from '@/core/auth';
import { checkRateLimit, rateLimitHeaders } from '@/cache/redis';
import { serverError } from '@/core/errors';

export const runtime = 'nodejs';

/**
 * Deliberately tight: one call here fans out into a ping per catalogue model,
 * so this endpoint amplifies a single request into dozens of upstream calls.
 */
const RATE_LIMIT = 5;
const RATE_WINDOW = 60;

const DEFAULT_MODEL = 'gemini-2.5-flash';
const LIST_TIMEOUT_MS = 15_000;
/** Timeout for each individual model ping — short because we run many in parallel. */
const PING_TIMEOUT_MS = 10_000;
/** Max models to ping concurrently to avoid hammering the API. */
const PING_CONCURRENCY = 6;

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiModelInfo {
  name: string;
  displayName: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportedGenerationMethods: string[];
}

interface GeminiListResponse {
  models: GeminiModelInfo[];
}

/**
 * Ping a single model with the cheapest possible generateContent call
 * (1 token prompt, 1 token max output). Returns true if the model is
 * actually usable with this API key, false otherwise.
 */
async function pingModel(modelId: string, geminiKey: string): Promise<boolean> {
  const url = `${BASE}/${modelId}:generateContent?key=${geminiKey}`;
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'hi' }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
      },
      PING_TIMEOUT_MS,
      'gemini',
    );

    // 200 → model works. Anything else (403, 404, 429 billing, etc.) → unavailable.
    return res.ok;
  } catch {
    // Timeout or network error → treat as unavailable.
    return false;
  }
}

/**
 * Run pings with bounded concurrency so we don't fire 50 requests at once.
 */
async function pingAllModels(
  models: { id: string }[],
  geminiKey: string,
): Promise<Set<string>> {
  const available = new Set<string>();
  const queue = [...models];

  async function worker() {
    while (queue.length > 0) {
      const model = queue.shift()!;
      if (await pingModel(model.id, geminiKey)) {
        available.add(model.id);
      }
    }
  }

  const workers = Array.from({ length: Math.min(PING_CONCURRENCY, models.length) }, () => worker());
  await Promise.all(workers);
  return available;
}

/**
 * GET /api/models
 *
 * Lists Gemini models that support `generateContent` AND are actually
 * accessible with the configured API key. Each candidate model is pinged
 * with a minimal 1-token call; only models that respond 200 are returned.
 */
export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const unauthorized = requireApiKey(req);
  if (unauthorized) return unauthorized;

  const limit = await checkRateLimit(`models:${callerIdentity(req)}`, RATE_LIMIT, RATE_WINDOW);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY is not configured on the gateway' },
      { status: 503 },
    );
  }

  try {
    // ── 1. List all models from Google's catalog. ─────────────────────────
    const url = `${BASE}?key=${geminiKey}`;
    const res = await fetchWithTimeout(url, { method: 'GET' }, LIST_TIMEOUT_MS, 'gemini');

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        { error: 'Failed to list models from Gemini API', detail: text },
        { status: 502 },
      );
    }

    const data = (await res.json()) as GeminiListResponse;

    const candidates = data.models
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => ({
        id: m.name.replace(/^models\//, ''),
        displayName: m.displayName,
        description: m.description,
        inputTokenLimit: m.inputTokenLimit,
        outputTokenLimit: m.outputTokenLimit,
      }));

    // ── 2. Ping each candidate to verify real availability. ───────────────
    const availableIds = await pingAllModels(candidates, geminiKey);

    const available = candidates
      .filter((m) => availableIds.has(m.id))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return NextResponse.json({
      defaultModel: process.env.GEMINI_MODEL ?? DEFAULT_MODEL,
      models: available,
      _meta: {
        candidatesTested: candidates.length,
        availableCount: available.length,
      },
    });
  } catch (err) {
    return serverError('models', err, 'Failed to fetch models');
  }
}
