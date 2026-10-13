-- Plan Illustrator — database schema
-- SQLite for local dev (file-based, zero setup). Written in portable SQL
-- so migrating to Postgres for production is a near-drop-in change later
-- (see docs/deployment.md for the specific differences to watch for).

PRAGMA foreign_keys = ON;

-- ============================================================
-- COMPANIES — the white-label / multi-tenant boundary.
-- Everything else hangs off a company_id.
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,       -- URL-safe identifier, e.g. "demo-insurer"
  logo_url        TEXT,
  color_primary   TEXT DEFAULT '#7c2434',
  color_secondary TEXT DEFAULT '#4c1520',
  color_accent    TEXT DEFAULT '#b8863a',
  contact_footer  TEXT,                        -- shown on printed illustrations
  disclaimer_text TEXT,                        -- shown on the terms-of-use gate
  currency_code   TEXT NOT NULL DEFAULT 'KES', -- ISO 4217 code used for display formatting only —
                                                -- does NOT change the underlying rate tables or tax rules
  locale          TEXT NOT NULL DEFAULT 'en-KE', -- BCP-47 locale used for number/date formatting only
  is_active       INTEGER NOT NULL DEFAULT 1,  -- 0 = suspended, keeps data but blocks login
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- PRODUCT LINES — which engine a company's product uses.
-- engine_type must match one of the pure engine modules in /engines.
-- ============================================================
CREATE TABLE IF NOT EXISTS product_lines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  engine_type   TEXT NOT NULL CHECK(engine_type IN ('fanaka','faida','smartsave')),
  display_name  TEXT NOT NULL,                 -- what agents/clients see, e.g. "Wealth Builder"
  is_active     INTEGER NOT NULL DEFAULT 0,     -- becomes 1 only once a version is validated+activated
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- PRODUCT DATA VERSIONS — the actual rate tables, one row per
-- upload. Nothing here is live until validated_at AND activated_at
-- are both set — this is the mandatory safety gate from the plan.
-- ============================================================
CREATE TABLE IF NOT EXISTS product_data_versions (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  product_line_id       INTEGER NOT NULL REFERENCES product_lines(id) ON DELETE CASCADE,
  version_number        INTEGER NOT NULL,       -- 1, 2, 3... per product_line_id
  source_filename       TEXT,                   -- the uploaded workbook's original name
  data_json             TEXT NOT NULL,           -- the extracted rate/table data, engine-ready
  mapping_notes         TEXT,                    -- admin's notes on how fields were mapped
  reference_filename    TEXT,                    -- the uploaded reference illustration used to validate
  validation_result_json TEXT,                   -- structured pass/fail detail from the validation run
  validated             INTEGER NOT NULL DEFAULT 0,  -- 1 only if validation run passed exactly
  validated_by          INTEGER REFERENCES admin_users(id),
  validated_at          TEXT,
  activated_by           INTEGER REFERENCES admin_users(id),
  activated_at           TEXT,                   -- set when an admin promotes this version live
  superseded_at          TEXT,                   -- set when a newer version is activated instead
  created_by             INTEGER REFERENCES admin_users(id),
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(product_line_id, version_number)
);

-- ============================================================
-- ADMIN USERS — company-scoped admin accounts for the onboarding
-- / rate-management panel. role='superadmin' can manage all
-- companies; role='company_admin' is scoped to one company_id.
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER REFERENCES companies(id) ON DELETE CASCADE,  -- NULL for superadmin
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK(role IN ('superadmin','company_admin')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  reset_token_hash TEXT,       -- bcrypt hash of the current password-reset token, NULL once consumed
  reset_token_expires_at TEXT, -- reset link is rejected after this (30 min from request)
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- ============================================================
-- AGENTS — replaces the device-local phone capture in the
-- standalone app once a company goes through the backend.
-- verified stays 0 until real OTP/SMS infra exists (see docs).
-- ============================================================
CREATE TABLE IF NOT EXISTS agents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,               -- normalized 07XXXXXXXX format
  password_hash TEXT,                         -- NULL until agent sets a password (local-dev: optional)
  verified      INTEGER NOT NULL DEFAULT 0,   -- set to 1 only after a real OTP verify-otp success
  otp_code_hash TEXT,                         -- bcrypt hash of the current one-time code, NULL once consumed
  otp_expires_at TEXT,                        -- code is rejected after this (10 min from send)
  otp_attempts  INTEGER NOT NULL DEFAULT 0,   -- wrong-code guesses against the current code; locked out past 5
  otp_last_sent_at TEXT,                      -- used to rate-limit resends independent of the IP-based limiter
  accepted_terms_at TEXT,                     -- when they accepted the liability gate
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(company_id, phone)
);

-- ============================================================
-- SMS OUTBOX — every OTP/notification message the system tried to
-- send, kept for audit and for local development monitoring (per
-- the project's standing rule: anything server-dependent gets a
-- local, inspectable substitute). In 'console' mode (the dev
-- default) this IS the delivery mechanism; in a real provider mode
-- it's a send log, and message bodies containing a code are only
-- ever returned to the API caller in console mode (see backend/sms.js).
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  phone       TEXT NOT NULL,
  message     TEXT NOT NULL,
  provider    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'sent',    -- sent | failed
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Same pattern as sms_outbox, for admin password-reset emails (see backend/email.js).
CREATE TABLE IF NOT EXISTS email_outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
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
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id              INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id                INTEGER REFERENCES agents(id),
  product_line_id         INTEGER NOT NULL REFERENCES product_lines(id),
  product_data_version_id INTEGER NOT NULL REFERENCES product_data_versions(id),
  client_name             TEXT,
  input_json              TEXT NOT NULL,   -- exactly what was entered
  result_json             TEXT NOT NULL,   -- exactly what was shown/printed
  created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- AUDIT LOG — generic append-only trail for admin actions
-- (rate uploads, activations, user management).
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id   INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  actor_type   TEXT NOT NULL CHECK(actor_type IN ('admin','agent','system')),
  actor_id     INTEGER,
  action       TEXT NOT NULL,              -- e.g. 'product_version.activated'
  details_json TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_product_lines_company ON product_lines(company_id);
CREATE INDEX IF NOT EXISTS idx_versions_product_line ON product_data_versions(product_line_id);
CREATE INDEX IF NOT EXISTS idx_agents_company ON agents(company_id);
CREATE INDEX IF NOT EXISTS idx_illustrations_company ON illustrations(company_id);
CREATE INDEX IF NOT EXISTS idx_illustrations_agent ON illustrations(agent_id);
CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_log(company_id);
