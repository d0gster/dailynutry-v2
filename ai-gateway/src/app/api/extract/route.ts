import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildProviderChain, getMaxRepairAttempts } from '@/core/config';
import { runExtraction } from '@/core/orchestrator';
import { validateAndRepair, GuardrailError } from '@/core/guardrail';
import { enrichPlan } from '@/core/enrichment';
import { EXTRACTION_SYSTEM_PROMPT } from '@/core/prompt';
import { estimateCost, addUsage } from '@/core/cost';
import { PRICING_VERSION } from '@/core/pricing';
import { ProviderError } from '@/core/types';
import { resolveCaller } from '@/core/device-auth';
import { serverError } from '@/core/errors';
import {
  enforceContentLength,
  MAX_IMAGE_BASE64_CHARS,
  MAX_IMAGES,
} from '@/core/limits';
import {
  imagesHash,
  getCached,
  setCached,
  checkRateLimit,
  rateLimitHeaders,
} from '@/cache/redis';
import { persistRequestLog } from '@/db/request-log';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Model ids are interpolated into the provider's request URL, so an unvalidated
 * value could reach paths other than the intended one. Restrict to the shape
 * real model names take.
 */
const MODEL_ID = /^[a-zA-Z0-9._-]{1,64}$/;

const BodySchema = z.object({
  images: z
    .array(
      z.object({
        base64: z
          .string()
          .min(1)
          .max(MAX_IMAGE_BASE64_CHARS, 'image is too large'),
        mimeType: z.enum(['image/jpeg', 'image/png']),
      }),
    )
    .min(1, 'at least one image is required')
    .max(MAX_IMAGES, 'too many images'),
  overrideModel: z
    .string()
    .regex(MODEL_ID, 'overrideModel is not a valid model id')
    .optional(),
});

const RATE_LIMIT = 20; // requests
const RATE_WINDOW = 60; // seconds

export async function POST(req: NextRequest) {
  const started = Date.now();

  // ── Auth: app key + device identity (and its daily quota). ───────────────
  const auth = await resolveCaller(req);
  if (!auth.ok) return auth.response;

  // ── Reject over-sized bodies before buffering them into memory. ──────────
  const tooLarge = enforceContentLength(req);
  if (tooLarge) return tooLarge;

  // ── Rate limit, scoped to the individual device rather than the shared
  //    gateway key, so one heavy caller cannot spend everyone else's budget.
  //    Falls back to an IP bucket until device auth is enforced. ────────────
  const limit = await checkRateLimit(auth.caller.identity, RATE_LIMIT, RATE_WINDOW);
  const limitHeaders = rateLimitHeaders(limit);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: limitHeaders },
    );
  }

  // ── Validate request body. ───────────────────────────────────────────────
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    // Validation failures describe the caller's OWN request, so the field-level
    // detail is safe and genuinely useful. Anything else here (malformed JSON,
    // a body that never arrived) is reported without its internal message.
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
        { status: 400, headers: limitHeaders },
      );
    }
    return NextResponse.json(
      { error: 'Request body could not be parsed as JSON' },
      { status: 400, headers: limitHeaders },
    );
  }

  const images = body.images;
  const baseCacheKey = imagesHash(images);
  const cacheKey = body.overrideModel
    ? `${baseCacheKey}:model:${body.overrideModel}`
    : baseCacheKey;

  // ── Cache: identical re-imports skip the LLM entirely. ───────────────────
  //    What's cached is the EXTRACTED plan, before enrichment. Enrichment now
  //    depends on the caller (a device sees its own yield corrections), so
  //    caching the enriched result would serve one device's numbers to the
  //    next. Extraction is the expensive part; enriching again costs two
  //    queries.
  const cached = await getCached(cacheKey);
  if (cached) {
    const enrichedFromCache = await enrichPlan(cached, auth.caller.deviceId);
    await persistRequestLog({
      success: true,
      providerUsed: null,
      model: null,
      cacheHit: true,
      imageCount: images.length,
      inputTokens: 0,
      cachedTokens: 0,
      outputTokens: 0,
      estimatedUsd: 0,
      pricingVersion: PRICING_VERSION,
      latencyMs: Date.now() - started,
      attempts: [],
      repairs: [],
    });
    return NextResponse.json(
      { plan: enrichedFromCache, meta: { cacheHit: true } },
      { headers: limitHeaders },
    );
  }

  const chain = buildProviderChain(process.env, body.overrideModel);
  if (chain.length === 0) {
    return NextResponse.json(
      {
        error: 'No LLM provider configured',
        detail: 'Set GEMINI_API_KEY (or OPENAI_API_KEY / ANTHROPIC_API_KEY) on the gateway.',
      },
      { status: 503, headers: limitHeaders },
    );
  }

  try {
    // ── 1. Vision extraction with provider fallback. ───────────────────────
    const extraction = await runExtraction(chain, {
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      images,
    });

    // ── 2. Guardrail: Zod validation + repair loop. ────────────────────────
    const guarded = await validateAndRepair(
      extraction.completion.text,
      extraction.providerUsed,
      getMaxRepairAttempts(),
    );

    // ── 3. Cache the extraction, THEN enrich per caller. ───────────────────
    //    Order matters: see the cache-read comment above.
    await setCached(cacheKey, guarded.plan);
    const enriched = await enrichPlan(guarded.plan, auth.caller.deviceId);

    // ── 4. Cost: vision usage + repair usage. ──────────────────────────────
    const totalUsage = addUsage(extraction.completion.usage, guarded.repairUsage);
    const cost = estimateCost(extraction.completion.model, totalUsage);

    await persistRequestLog({
      success: true,
      providerUsed: extraction.providerUsed.name,
      model: extraction.completion.model,
      fallbackReason: extraction.fallbackReason,
      cacheHit: false,
      imageCount: images.length,
      inputTokens: totalUsage.inputTokens,
      cachedTokens: totalUsage.cachedInputTokens,
      outputTokens: totalUsage.outputTokens,
      estimatedUsd: cost.estimatedUsd,
      pricingVersion: PRICING_VERSION,
      latencyMs: Date.now() - started,
      attempts: extraction.attempts,
      repairs: guarded.repairs,
    });

    return NextResponse.json(
      {
        plan: enriched,
        meta: {
          cacheHit: false,
          providerUsed: extraction.providerUsed.name,
          model: extraction.completion.model,
          fallbackReason: extraction.fallbackReason ?? null,
          attempts: extraction.attempts,
          repairs: guarded.repairs.map((r) => ({ attempt: r.attempt, provider: r.provider })),
          cost: { ...cost, pricingVersion: PRICING_VERSION },
          latencyMs: Date.now() - started,
        },
      },
      { headers: limitHeaders },
    );
  } catch (err) {
    const isGuardrail = err instanceof GuardrailError;
    const status = err instanceof ProviderError && !err.retryable ? 502 : 500;
    await persistRequestLog({
      success: false,
      providerUsed: null,
      model: null,
      cacheHit: false,
      imageCount: images.length,
      inputTokens: 0,
      cachedTokens: 0,
      outputTokens: 0,
      estimatedUsd: null,
      pricingVersion: PRICING_VERSION,
      latencyMs: Date.now() - started,
      attempts: [],
      repairs: [],
      error: (err as Error).message,
    });
    return serverError(
      'extract',
      err,
      isGuardrail ? 'Output failed validation and could not be repaired' : 'Extraction failed',
      { status, headers: limitHeaders },
    );
  }
}
