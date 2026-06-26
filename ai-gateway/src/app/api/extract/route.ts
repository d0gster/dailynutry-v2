import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildProviderChain, getMaxRepairAttempts } from '@/core/config';
import { runExtraction } from '@/core/orchestrator';
import { validateAndRepair, GuardrailError } from '@/core/guardrail';
import { EXTRACTION_SYSTEM_PROMPT } from '@/core/prompt';
import { estimateCost, addUsage } from '@/core/cost';
import { PRICING_VERSION } from '@/core/pricing';
import { ProviderError } from '@/core/types';
import { imagesHash, getCached, setCached, checkRateLimit } from '@/cache/redis';
import { persistRequestLog } from '@/db/request-log';

export const runtime = 'nodejs';
export const maxDuration = 120;

const BodySchema = z.object({
  images: z
    .array(
      z.object({
        base64: z.string().min(1),
        mimeType: z.enum(['image/jpeg', 'image/png']),
      }),
    )
    .min(1, 'at least one image is required')
    .max(8, 'too many images'),
});

const RATE_LIMIT = 20; // requests
const RATE_WINDOW = 60; // seconds

export async function POST(req: NextRequest) {
  const started = Date.now();

  // ── Auth ─────────────────────────────────────────────────────────────────
  const apiKey = req.headers.get('x-api-key');
  if (!process.env.GATEWAY_API_KEY || apiKey !== process.env.GATEWAY_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Rate limit (per gateway key). ────────────────────────────────────────
  if (!(await checkRateLimit(apiKey, RATE_LIMIT, RATE_WINDOW))) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // ── Validate request body. ───────────────────────────────────────────────
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid request', detail: (err as Error).message },
      { status: 400 },
    );
  }

  const images = body.images;
  const cacheKey = imagesHash(images);

  // ── Cache: identical re-imports are instant and free. ────────────────────
  const cached = await getCached(cacheKey);
  if (cached) {
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
    return NextResponse.json({ plan: cached, meta: { cacheHit: true } });
  }

  const chain = buildProviderChain();
  if (chain.length === 0) {
    return NextResponse.json(
      {
        error: 'No LLM provider configured',
        detail: 'Set GEMINI_API_KEY (or OPENAI_API_KEY / ANTHROPIC_API_KEY) on the gateway.',
      },
      { status: 503 },
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

    // ── 3. Cost: vision usage + repair usage. ──────────────────────────────
    const totalUsage = addUsage(extraction.completion.usage, guarded.repairUsage);
    const cost = estimateCost(extraction.completion.model, totalUsage);

    await setCached(cacheKey, guarded.plan);
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

    return NextResponse.json({
      plan: guarded.plan,
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
    });
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
    return NextResponse.json(
      {
        error: isGuardrail ? 'Output failed validation and could not be repaired' : 'Extraction failed',
        detail: (err as Error).message,
      },
      { status },
    );
  }
}
