-- DailyNutry AI Gateway — request log.
-- One row per extraction request, for cost & reliability observability.

CREATE TABLE IF NOT EXISTS request_log (
  id              BIGSERIAL PRIMARY KEY,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  success         BOOLEAN      NOT NULL,
  provider_used   TEXT,                       -- provider that ultimately answered
  model           TEXT,
  fallback_reason TEXT,                       -- set when a fallback had to answer
  cache_hit       BOOLEAN      NOT NULL DEFAULT false,

  image_count     INT          NOT NULL DEFAULT 0,
  input_tokens    INT          NOT NULL DEFAULT 0,
  cached_tokens   INT          NOT NULL DEFAULT 0,  -- cache-read input tokens
  output_tokens   INT          NOT NULL DEFAULT 0,
  estimated_usd   NUMERIC(12,6),              -- NULL when price unknown
  pricing_version TEXT,

  latency_ms      INT          NOT NULL DEFAULT 0,
  repair_count    INT          NOT NULL DEFAULT 0,

  attempts        JSONB,                      -- full per-provider trace
  repairs         JSONB,                      -- repair-loop trace
  error           TEXT
);

CREATE INDEX IF NOT EXISTS idx_request_log_created_at ON request_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_log_provider   ON request_log (provider_used);
