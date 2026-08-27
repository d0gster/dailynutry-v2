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

-- Trigram similarity, for foods whose prescribed name carries a qualifier the
-- table does not use ("Filé de merluza grelhado" vs "Merluza, filé, assado").
-- Full-text alone either demands every word (matching nothing) or accepts any
-- word (ranking merluza, salmão, abadejo and beef identically, then picking
-- one arbitrarily). Similarity is what actually orders them correctly.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_taco_food_name_trgm ON taco_food USING gin(name gin_trgm_ops);

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

-- ─── Audit trail ────────────────────────────────────────────────────────────
-- One row per action: registrations, revocations, authentication outcomes,
-- mutations, refusals, blocks, rate limiting, quota exhaustion, and successful
-- extractions.
--
-- Separate from `request_log`, which answers "what did this cost and how fast
-- was it". This answers "what did this caller DO, and how did the gateway
-- answer" — where a support conversation starts. It is written to be read
-- later by a person or an agent handling a complaint, so `context` carries
-- machine-readable specifics rather than prose that would have to be parsed
-- back out.
--
-- COVERAGE is total; CONTENT is not, and the two are separate decisions:
--
--   Recorded: who, when, from where, endpoint, status, duration, counts,
--   dimensions, refusal reasons, before/after for every mutation, and the
--   SHA-256 of submitted images.
--
--   Not recorded, for two narrow and legal reasons:
--     * image bytes — persisting content a safety filter refused would turn a
--       refusal into hosting the very material it declined;
--     * extracted plan text (patient names, prescribed foods) — health data,
--       "dado pessoal sensível" under LGPD Art. 5 II. Audit tables are the ones
--       nobody deletes, so copying plan content here would quietly make this a
--       medical record with its own retention and erasure obligations.
--
-- The image HASH is what replaces the bytes, and it answers the questions an
-- investigation actually asks: has this exact image been submitted before, by
-- how many devices, how often. Already computed for the cache key.
--
-- `device_id` is nullable and ON DELETE SET NULL on purpose: an event about a
-- caller with no device (transition mode, or a failed registration) is still
-- worth keeping, and deleting a device must not erase the history of why it
-- was blocked.

CREATE TABLE IF NOT EXISTS audit_event (
  id         BIGSERIAL   PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  device_id  UUID        REFERENCES device(id) ON DELETE SET NULL,
  -- Coarse origin, for spotting one source driving many devices.
  caller_ip  TEXT,

  -- Machine-readable; see AuditEventName in src/db/audit.ts for the catalogue.
  event      TEXT        NOT NULL,
  severity   TEXT        NOT NULL DEFAULT 'info'
             CHECK (severity IN ('info', 'warning', 'critical')),

  -- Correlates with the `reference` returned to the client on a 5xx, so a user
  -- saying "it failed, code abc-123" lands on the exact row.
  reference  TEXT,

  context    JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_event_device  ON audit_event (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_created ON audit_event (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_event   ON audit_event (event, created_at DESC);
-- Correlating one image across devices is the core investigative query, and
-- without this it is a sequential scan of the whole trail.
CREATE INDEX IF NOT EXISTS idx_audit_event_hash    ON audit_event ((context->>'imagesHash'));
CREATE INDEX IF NOT EXISTS idx_audit_event_ref     ON audit_event (reference);

-- ─── Device blocks ──────────────────────────────────────────────────────────
-- A temporary bar, distinct from the permanent `device.revoked`.
--
-- Repeated content refusals are the signal this exists for: one is a bad
-- photo, several in a day is someone probing. A timed block stops the probing
-- without an irreversible ban that a false positive would make permanent —
-- expiry is automatic, so nobody has to remember to lift it.

CREATE TABLE IF NOT EXISTS device_block (
  device_id  UUID        PRIMARY KEY REFERENCES device(id) ON DELETE CASCADE,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  reason     TEXT        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_block_expires ON device_block (expires_at);
