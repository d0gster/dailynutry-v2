import { getPool } from './client';
import { type AttemptLog } from '@/core/orchestrator';
import { type RepairLog } from '@/core/guardrail';

export interface RequestLogRow {
  success: boolean;
  providerUsed: string | null;
  model: string | null;
  fallbackReason?: string;
  cacheHit: boolean;
  imageCount: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  estimatedUsd: number | null;
  pricingVersion: string;
  latencyMs: number;
  attempts: AttemptLog[];
  repairs: RepairLog[];
  error?: string;
}

/**
 * Persists one request to Postgres. If the DB is disabled, logs the same record
 * to stdout instead — observability never silently disappears, it just changes
 * sink. Never throws into the request path: a logging failure must not fail the
 * user's extraction.
 */
export async function persistRequestLog(row: RequestLogRow): Promise<void> {
  const pool = getPool();
  if (!pool) {
    console.log('[request_log]', JSON.stringify(row));
    return;
  }
  try {
    await pool.query(
      `INSERT INTO request_log
        (success, provider_used, model, fallback_reason, cache_hit, image_count,
         input_tokens, cached_tokens, output_tokens, estimated_usd, pricing_version,
         latency_ms, repair_count, attempts, repairs, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        row.success,
        row.providerUsed,
        row.model,
        row.fallbackReason ?? null,
        row.cacheHit,
        row.imageCount,
        row.inputTokens,
        row.cachedTokens,
        row.outputTokens,
        row.estimatedUsd,
        row.pricingVersion,
        row.latencyMs,
        row.repairs.length,
        JSON.stringify(row.attempts),
        JSON.stringify(row.repairs),
        row.error ?? null,
      ],
    );
  } catch (err) {
    // Logging must never break extraction — degrade to stdout.
    console.error('[request_log] DB write failed, falling back to stdout:', (err as Error).message);
    console.log('[request_log]', JSON.stringify(row));
  }
}

export interface RecentStats {
  total: number;
  fallbacks: number;
  failures: number;
  totalUsd: number;
  rows: Array<{
    created_at: string;
    success: boolean;
    provider_used: string | null;
    model: string | null;
    fallback_reason: string | null;
    estimated_usd: number | null;
    latency_ms: number;
    repair_count: number;
    cache_hit: boolean;
  }>;
}

/** Reads recent requests for the observability dashboard. */
export async function getRecentStats(limit = 50): Promise<RecentStats | null> {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT created_at, success, provider_used, model, fallback_reason,
            estimated_usd, latency_ms, repair_count, cache_hit
       FROM request_log ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return {
    total: rows.length,
    fallbacks: rows.filter((r) => r.fallback_reason).length,
    failures: rows.filter((r) => !r.success).length,
    totalUsd: rows.reduce((s, r) => s + Number(r.estimated_usd ?? 0), 0),
    rows,
  };
}
