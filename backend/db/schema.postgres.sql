-- Plan Illustrator — PostgreSQL schema.
-- This is the Postgres-equivalent of schema.sql (the SQLite schema used by
-- default in local dev). The two are kept deliberately parallel table-by-
-- table and column-by-column; the differences below are ONLY what Postgres
-- requires, never a change in meaning:
--   - INTEGER PRIMARY KEY AUTOINCREMENT -> SERIAL PRIMARY KEY
--   - Tables are ordered so a REFERENCES target always exists already —
--     SQLite tolerates forward references inside one exec() batch, Postgres
--     does not.
--   - Boolean-shaped columns (is_active, verified, validated...) stay
--     INTEGER (0/1), not Postgres BOOLEAN, so the API keeps returning the
--     exact 0/1 JSON values the admin panel, the agent app, and the test
--     suite already compare against (`=== 1`, `=== 0`) — switching to a
--     real boolean would silently change every one of those responses to
--     true/false.
--   - A SQL-level `datetime(...)` function is defined below that mimics
--     the two call shapes used throughout backend/server.js —
--     datetime('now') and datetime('now','+30 minutes') — and returns the
--     same 'YYYY-MM-DD HH:MI:SS' text format SQLite produces. This means
--     every existing query string that calls datetime(...) works
--     completely unchanged against Postgres; nothing in server.js needed
--     to be rewritten for date handling.

CREATE OR REPLACE FUNCTION datetime(ts_spec text, modifier text DEFAULT NULL)
RETURNS text AS $$
DECLARE
  base_ts timestamp;
  result_ts timestamp;
BEGIN
  IF ts_spec = 'now' THEN
    base_ts := (now() AT TIME ZONE 'utc');
  ELSE
    base_ts := ts_spec::timestamp;
  END IF;
  IF modifier IS NULL THEN
    result_ts := base_ts;
  ELSE
    result_ts := base_ts + modifier::interval;
  END IF;
  RETURN to_char(result_ts, 'YYYY-MM-DD HH24:MI:SS');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- COMPANIES — the white-label / multi-tenant boundary.
-- Everything else hangs off a company_id.
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  logo_url        TEXT,
  color_primary   TEXT DEFAULT '#7c2434',
  color_secondary TEXT DEFAULT '#4c1520',
  color_accent    TEXT DEFAULT '#b8863a',
  contact_footer  TEXT,
  disclaimer_text TEXT,
  currency_code   TEXT NOT NULL DEFAULT 'KES',
  locale          TEXT NOT NULL DEFAULT 'en-KE',
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- ADMIN USERS — ordered before product_lines/product_data_versions
-- because both reference it.
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_users (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK(role IN ('superadmin','company_admin')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  reset_token_hash TEXT,
  reset_token_expires_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- ============================================================
-- PRODUCT LINES — which engine a company's product uses.
-- ============================================================
CREATE TABLE IF NOT EXISTS product_lines (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  engine_type   TEXT NOT NULL CHECK(engine_type IN ('fanaka','faida','smartsave')),
  display_name  TEXT NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- PRODUCT DATA VERSIONS — the actual rate tables, one row per
-- upload. Nothing here is live until validated_at AND activated_at
-- are both set — this is the mandatory safety gate from the plan.
-- ============================================================
CREATE TABLE IF NOT EXISTS product_data_versions (
  id                    SERIAL PRIMARY KEY,
  product_line_id       INTEGER NOT NULL REFERENCES product_lines(id) ON DELETE CASCADE,
  version_number        INTEGER NOT NULL,
  source_filename       TEXT,
  data_json             TEXT NOT NULL,
  mapping_notes         TEXT,
  reference_filename    TEXT,
  validation_result_json TEXT,
  validated             INTEGER NOT NULL DEFAULT 0,
  validated_by          INTEGER REFERENCES admin_users(id),
  validated_at          TEXT,
  activated_by           INTEGER REFERENCES admin_users(id),
  activated_at           TEXT,
  superseded_at          TEXT,
  created_by             INTEGER REFERENCES admin_users(id),
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(product_line_id, version_number)
);

-- ============================================================
-- AGENTS — replaces the device-local phone capture in the
-- standalone app once a company goes through the backend.
-- ============================================================
CREATE TABLE IF NOT EXISTS agents (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  password_hash TEXT,
  verified      INTEGER NOT NULL DEFAULT 0,
  otp_code_hash TEXT,
  otp_expires_at TEXT,
  otp_attempts  INTEGER NOT NULL DEFAULT 0,
  otp_last_sent_at TEXT,
  accepted_terms_at TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(company_id, phone)
);

-- ============================================================
-- SMS OUTBOX — see backend/sms.js.
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_outbox (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  phone       TEXT NOT NULL,
  message     TEXT NOT NULL,
  provider    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'sent',
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Same pattern as sms_outbox, for admin password-reset emails (see backend/email.js).
CREATE TABLE IF NOT EXISTS email_outbox (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  to_email    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  provider    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'sent',
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- ILLUSTRATIONS — every illustration an agent generates, for
-- traceability (this is the accountability record the liability
-- gate promises exists).
-- ============================================================
CREATE TABLE IF NOT EXISTS illustrations (
  id                      SERIAL PRIMARY KEY,
  company_id              INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id                INTEGER REFERENCES agents(id),
  product_line_id         INTEGER NOT NULL REFERENCES product_lines(id),
  product_data_version_id INTEGER NOT NULL REFERENCES product_data_versions(id),
  client_name             TEXT,
  input_json              TEXT NOT NULL,
  result_json             TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- AUDIT LOG — generic append-only trail for admin actions
-- (rate uploads, activations, user management).
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  actor_type   TEXT NOT NULL CHECK(actor_type IN ('admin','agent','system')),
  actor_id     INTEGER,
  action       TEXT NOT NULL,
  details_json TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_product_lines_company ON product_lines(company_id);
CREATE INDEX IF NOT EXISTS idx_versions_product_line ON product_data_versions(product_line_id);
CREATE INDEX IF NOT EXISTS idx_agents_company ON agents(company_id);
CREATE INDEX IF NOT EXISTS idx_illustrations_company ON illustrations(company_id);
CREATE INDEX IF NOT EXISTS idx_illustrations_agent ON illustrations(agent_id);
CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_log(company_id);
