import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildProviderChain, getMaxRepairAttempts } from '@/core/config';
import { runExtraction } from '@/core/orchestrator';
import { validateAndRepair, GuardrailError } from '@/core/guardrail';
import { enrichPlan } from '@/core/enrichment';
import { EXTRACTION_SYSTEM_PROMPT } from '@/core/prompt';
import { estimateCost, addUsage } from '@/core/cost';
import { PRICING_VERSION } from '@/core/pricing';
import { ProviderError, ContentRejectedError } from '@/core/types';
import { resolveCaller } from '@/core/device-auth';
import { serverError } from '@/core/errors';
import { validateImage } from '@/core/image-validation';
import { recordContentRefusal } from '@/core/content-policy';
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
import { recordAuditEvent } from '@/db/audit';
import { refundQuota } from '@/db/device';
import { callerIdentity } from '@/core/auth';
import { beginRequest, baseContext, withRequestId } from '@/core/request-context';

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
  const ctx = beginRequest(req);

  // ── Auth: app key + device identity (and its daily quota). ───────────────
  const auth = await resolveCaller(req);
  if (!auth.ok) {
    // The refusal already carries its own status; what the audit adds is that
    // it HAPPENED, and to whom. A burst of these from one source is the shape
    // credential probing takes.
    await recordAuditEvent({
      event: auth.response.status === 429 ? 'quota_exceeded' : 'auth_failed',
      severity: 'warning',
      callerIp: callerIdentity(req),
      reference: ctx.requestId,
      context: baseContext(ctx, { status: auth.response.status }),
    });
    return auth.response;
  }

  // ── Reject over-sized bodies before buffering them into memory. ──────────
  const tooLarge = enforceContentLength(req);
  if (tooLarge) return tooLarge;

  // ── Rate limit, scoped to the individual device rather than the shared
  //    gateway key, so one heavy caller cannot spend everyone else's budget.
  //    Falls back to an IP bucket until device auth is enforced. ────────────
  const limit = await checkRateLimit(auth.caller.identity, RATE_LIMIT, RATE_WINDOW);
  const limitHeaders = withRequestId(ctx, rateLimitHeaders(limit));
  if (!limit.allowed) {
    await recordAuditEvent({
      event: 'rate_limited',
      severity: 'warning',
      deviceId: auth.caller.deviceId,
      callerIp: auth.caller.identity,
      reference: ctx.requestId,
      context: baseContext(ctx, { bucket: 'extract', limit: RATE_LIMIT, windowSeconds: RATE_WINDOW }),
    });
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
    await recordAuditEvent({
      event: 'request_invalid',
      severity: 'warning',
      deviceId: auth.caller.deviceId,
      callerIp: auth.caller.identity,
      reference: ctx.requestId,
      context: baseContext(ctx, {
        // Field paths, never field values: a rejected body can contain anything.
        issues: err instanceof z.ZodError ? err.issues.map((i) => i.path.join('.')) : ['malformed_json'],
      }),
    });

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

  // ── Prove each image IS an image, before it costs a provider call. ───────
  //    The declared mimeType is the caller's claim; only the bytes settle it.
  //    Validation also strips EXIF, so a photo of a printed sheet stops
  //    carrying the GPS of the room it was taken in to a third-party provider.
  const checked = body.images.map((img) => validateImage(img.base64, img.mimeType));
  const rejected = checked.flatMap((result, index) =>
    result.ok ? [] : [{ index, reason: result.reason, detail: result.detail }],
  );

  if (rejected.length > 0) {
    // Nothing was sent to a provider, so nothing was spent. Quota is consumed
    // at authentication (that ordering is what makes it unraceable), so it has
    // to be handed back here — otherwise a blurry photo would silently cost a
    // user one of their day's extractions.
    if (auth.caller.deviceId) await refundQuota(auth.caller.deviceId);

    // Still recorded: one malformed image is an accident, a stream of them is
    // someone testing what the gateway will forward.
    await recordAuditEvent({
      event: 'image_invalid',
      severity: 'warning',
      deviceId: auth.caller.deviceId,
      callerIp: auth.caller.identity,
      reference: ctx.requestId,
      context: baseContext(ctx, {
        reasons: rejected.map((r) => r.reason),
        imageCount: body.images.length,
        declaredTypes: body.images.map((i) => i.mimeType),
        // Size is a useful abuse signal and reveals nothing about content.
        base64Lengths: body.images.map((i) => i.base64.length),
      }),
    });

    return NextResponse.json(
      { error: 'One or more images were rejected', rejected },
      { status: 422, headers: limitHeaders },
    );
  }

  const images = checked.map((result) => {
    if (!result.ok) throw new Error('unreachable: rejections returned above');
    return { base64: result.image.base64, mimeType: result.image.mimeType };
  });

  // Hashing the SANITISED bytes, so two photos differing only in EXIF share a
  // cache entry instead of paying for the same extraction twice.
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

    await recordAuditEvent({
      event: 'extraction_succeeded',
      deviceId: auth.caller.deviceId,
      callerIp: auth.caller.identity,
      reference: ctx.requestId,
      context: baseContext(ctx, {
        // The hash — not the image. It answers "has this exact image been sent
        // before, by whom, how often" without the gateway holding one byte of
        // it. Already computed for the cache key, so it costs nothing.
        imagesHash: baseCacheKey,
        imageCount: images.length,
        dimensions: checked.map((c) => (c.ok ? `${c.image.width}x${c.image.height}` : null)),
        exifStripped: checked.some((c) => c.ok && c.image.exifStripped),
        provider: extraction.providerUsed.name,
        model: extraction.completion.model,
        fallbackReason: extraction.fallbackReason ?? null,
        repairs: guarded.repairs.length,
        estimatedUsd: cost.estimatedUsd,
        // Counts describe the SHAPE of the plan. The plan itself — patient
        // name, prescribed foods — is health data and stays out of the log.
        mealCount: enriched.meals.length,
        itemCount: enriched.meals.reduce(
          (sum, meal) => sum + meal.groups.reduce((n, g) => n + g.items.length, 0),
          0,
        ),
      }),
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
    // A content refusal is a verdict about the input, not a gateway failure.
    // It stops here rather than reaching the generic 500 path: the caller gets
    // a 422 they can act on, and the device's refusal count moves — which is
    // what eventually bars someone probing what the gateway will forward.
    if (err instanceof ContentRejectedError) {
      const outcome = await recordContentRefusal({
        deviceId: auth.caller.deviceId,
        callerIp: auth.caller.identity,
        provider: err.provider,
        reason: err.reason,
        reference: ctx.requestId,
        // The hash lets an investigation ask "was this same image sent by
        // other devices too?" — the question that separates one bad photo from
        // a campaign — while the bytes themselves are never persisted. Storing
        // those would mean holding exactly what the filter refused.
        imagesHash: baseCacheKey,
      });

      await persistRequestLog({
        success: false,
        providerUsed: err.provider,
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
        error: `content_rejected: ${err.reason}`,
      });

      return NextResponse.json(
        {
          error: 'This image was rejected by the content filter',
          detail: outcome.blocked
            ? 'Repeated rejections have temporarily blocked this device.'
            : 'Send a photo of a printed diet plan.',
          blocked: outcome.blocked,
        },
        { status: 422, headers: limitHeaders },
      );
    }

    const isGuardrail = err instanceof GuardrailError;
    const status = err instanceof ProviderError && !err.retryable ? 502 : 500;

    await recordAuditEvent({
      event: 'extraction_failed',
      severity: 'critical',
      deviceId: auth.caller.deviceId,
      callerIp: auth.caller.identity,
      reference: ctx.requestId,
      context: baseContext(ctx, {
        imagesHash: baseCacheKey,
        imageCount: images.length,
        status,
        guardrail: isGuardrail,
        // The failure class, not the message: provider messages carry hosts,
        // ports and occasionally fragments of a credential.
        errorType: (err as Error).name,
      }),
    });
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
