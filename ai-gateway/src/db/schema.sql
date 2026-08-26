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

-- ─── TACO (Tabela Brasileira de Composição de Alimentos, 4ª edição, 2011) ────
-- Nutrient data per 100 g. NULL = not available ("NA" in the original table).

CREATE TABLE IF NOT EXISTS taco_food (
  id          SERIAL PRIMARY KEY,
  taco_id     INT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  group_name  TEXT NOT NULL,
  energy_kcal REAL,
  protein_g   REAL,
  carb_g      REAL,
  fat_g       REAL,
  fiber_g     REAL,
  sodium_mg   REAL
);
CREATE INDEX IF NOT EXISTS idx_taco_food_name ON taco_food USING gin(to_tsvector('portuguese', name));

-- ─── Yield factors (peso_cozido / peso_cru) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS yield_factor (
  id       SERIAL PRIMARY KEY,
  name     TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  factor   REAL NOT NULL,
  method   TEXT DEFAULT 'cozido',
  source   TEXT DEFAULT 'padrao',
  notes    TEXT
);

-- ─── Devices ────────────────────────────────────────────────────────────────
-- One row per app install. Gives the gateway a per-caller identity that the
-- shared app key cannot provide: rate limits and quotas that survive an IP
-- change, and revocation of a single abuser instead of rotating everyone's key.
--
-- Only the SHA-256 of the token is stored. A database dump therefore does not
-- yield usable tokens, the same reason passwords are never stored in the clear.

CREATE TABLE IF NOT EXISTS device (
  id            UUID PRIMARY KEY,
  token_hash    TEXT UNIQUE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  revoked       BOOLEAN     NOT NULL DEFAULT false,
  revoked_at    TIMESTAMPTZ,
  revoke_reason TEXT,

  -- Daily quota accounting. `quota_date` is the UTC day the counter belongs to;
  -- a request on a later day resets it rather than needing a scheduled job.
  quota_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
  quota_used    INT         NOT NULL DEFAULT 0,

  -- Coarse provenance, for spotting mass registration from one source.
  registered_ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_device_token_hash ON device (token_hash);
CREATE INDEX IF NOT EXISTS idx_device_created_at ON device (created_at DESC);

-- ─── Per-device yield overrides ─────────────────────────────────────────────
-- Corrections to the shared `yield_factor` defaults, scoped to one install.
--
-- `yield_factor` is reference data every install reads. Letting a write land
-- there directly would mean one user's correction silently changed the numbers
-- for everyone, with no way to tell whose it was or to undo it. Overrides live
-- here instead: layered over the default at read time, and removed with the
-- device.
--
-- Declared after `device` because it references it.

CREATE TABLE IF NOT EXISTS yield_override (
  device_id       UUID        NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  yield_factor_id INT         NOT NULL REFERENCES yield_factor(id) ON DELETE CASCADE,
  factor          REAL        NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, yield_factor_id)
);
