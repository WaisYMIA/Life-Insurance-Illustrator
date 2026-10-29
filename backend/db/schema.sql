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
  email         TEXT,                         -- agent's own email, editable from the app profile
  agency_code   TEXT,                         -- agent's agency/agent code, editable from the app profile
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

-- ============================================================
-- USAGE EVENTS — one row per thing an agent did in the app (opened
-- it, ran a calculation, viewed/printed an illustration, finished a
-- needs diagnosis, hit an error ...). Deliberately holds NO client
-- personal data: no client names, dates of birth or amounts — only
-- which product/feature, rough shape (term, frequency) and the app
-- version/display mode, so usage can be reported without exposing
-- the agent's clients. Disclosed to agents in the Terms gate.
-- ============================================================
CREATE TABLE IF NOT EXISTS usage_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id    INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  session_id  TEXT,
  event       TEXT NOT NULL,
  props_json  TEXT,
  app_version TEXT,
  display_mode TEXT,
  occurred_at TEXT NOT NULL,                 -- client clock, as reported (may be offline-queued)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))   -- server receipt time; all reporting uses this
);
CREATE INDEX IF NOT EXISTS idx_usage_company_created ON usage_events(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_agent_created ON usage_events(agent_id, created_at);

-- ============================================================
-- FEEDBACK — messages agents send from the in-app Feedback button.
-- Each one is also emailed (see backend/analytics.js); emailed_status
-- records whether that hand-off succeeded so nothing is silently lost.
-- ============================================================
CREATE TABLE IF NOT EXISTS feedback (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id      INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  category      TEXT NOT NULL,
  rating        INTEGER,
  message       TEXT NOT NULL,
  app_version   TEXT,
  emailed_status TEXT NOT NULL DEFAULT 'pending',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feedback_company ON feedback(company_id, created_at);

-- ============================================================
-- APP CONTROL — per-company update policy the installed PWAs obey:
-- how often to check, the newest release, the oldest release still
-- allowed to run (forces an update), and how long a device may go
-- without a successful check before it must reconnect.
-- ============================================================
CREATE TABLE IF NOT EXISTS app_control (
  company_id           INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  latest_version       TEXT,
  min_version          TEXT,
  check_interval_days  INTEGER NOT NULL DEFAULT 7,
  max_offline_days     INTEGER NOT NULL DEFAULT 30,
  require_update INTEGER NOT NULL DEFAULT 1, -- 1 = an agent must install a newer release before the app opens
  notice               TEXT,
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- SMS SETTINGS — per-company switch for live SMS (Africa's Talking).
-- Off by default; an admin turns it on once credentials are saved.
-- The API key is stored encrypted and never returned to any client.
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_settings (
  company_id    INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  enabled       INTEGER NOT NULL DEFAULT 0,
  provider      TEXT NOT NULL DEFAULT 'africastalking',
  username      TEXT,
  api_key_enc   TEXT,
  sender_id     TEXT,
  email_fallback INTEGER NOT NULL DEFAULT 1,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- LEADS — a quote handed from an agent to the sales / underwriting team.
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id      INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  client_name   TEXT NOT NULL,
  client_phone  TEXT,
  client_email  TEXT,
  product       TEXT,
  needs_summary TEXT,
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'new',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_company ON leads(company_id, created_at);

-- ============================================================
-- TARGETS — monthly activity targets per agent, set by the company.
-- ============================================================
CREATE TABLE IF NOT EXISTS targets (
  company_id        INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  calcs_per_month   INTEGER NOT NULL DEFAULT 0,
  prints_per_month  INTEGER NOT NULL DEFAULT 0,
  leads_per_month   INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- QUOTE RECORDS — compliance trail. One row per illustration an agent
-- printed or shared: product inputs (no client name/phone/DOB), the
-- headline result, the rate-table version and the disclaimer version.
-- ============================================================
CREATE TABLE IF NOT EXISTS quote_records (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id       INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  product        TEXT,
  action         TEXT,
  rates_version  TEXT,
  app_version    TEXT,
  terms_version  TEXT,
  language       TEXT,
  inputs_json    TEXT,
  result_json    TEXT,
  occurred_at    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_quotes_company ON quote_records(company_id, created_at);

-- ============================================================
-- v2026.11 additions: company config, applications, policies, complaints,
-- suitability, payments, release plans, integration, custom products, quiz.
-- ============================================================
CREATE TABLE IF NOT EXISTS company_config (
  company_id   INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  config_json  TEXT NOT NULL DEFAULT '{}',
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id      INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  ref           TEXT NOT NULL,
  client_key    TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  product       TEXT,
  plan_json     TEXT,
  client_json   TEXT,
  beneficiaries_json TEXT,
  declaration_json   TEXT,
  signature     TEXT,
  signed_at     TEXT,
  consent_at    TEXT,
  premium_amount REAL,
  payment_status TEXT NOT NULL DEFAULT 'none',
  policy_no     TEXT,
  admin_note    TEXT,
  submitted_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_applications_company ON applications(company_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_ref ON applications(company_id, ref);

CREATE TABLE IF NOT EXISTS application_docs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,
  filename       TEXT,
  mime           TEXT,
  size           INTEGER,
  data           TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_appdocs_app ON application_docs(application_id);

CREATE TABLE IF NOT EXISTS payments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  policy_id      INTEGER,
  agent_id       INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  phone          TEXT,
  amount         REAL NOT NULL,
  provider       TEXT NOT NULL DEFAULT 'manual',
  status         TEXT NOT NULL DEFAULT 'pending',
  checkout_id    TEXT,
  receipt        TEXT,
  note           TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_company ON payments(company_id, created_at);

CREATE TABLE IF NOT EXISTS policies (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id       INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  application_id INTEGER,
  policy_no      TEXT NOT NULL,
  client_name    TEXT NOT NULL,
  client_phone   TEXT,
  client_email   TEXT,
  product        TEXT,
  sum_assured    REAL,
  premium        REAL,
  frequency      TEXT NOT NULL DEFAULT 'monthly',
  start_date     TEXT,
  next_due_date  TEXT,
  maturity_date  TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_policies_company ON policies(company_id, agent_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_policies_no ON policies(company_id, policy_no);

CREATE TABLE IF NOT EXISTS complaints (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id       INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  ref            TEXT NOT NULL,
  client_name    TEXT NOT NULL,
  client_phone   TEXT,
  policy_no      TEXT,
  category       TEXT,
  description    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open',
  resolution     TEXT,
  due_at         TEXT,
  acknowledged_at TEXT,
  resolved_at    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_complaints_company ON complaints(company_id, status);

CREATE TABLE IF NOT EXISTS suitability_records (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id       INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  client_name    TEXT,
  client_phone   TEXT,
  needs_json     TEXT,
  recommended    TEXT,
  chosen         TEXT,
  rationale      TEXT,
  deviation_reason TEXT,
  disclosures_json TEXT,
  signature      TEXT,
  occurred_at    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_suit_company ON suitability_records(company_id, created_at);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id       INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  score          INTEGER NOT NULL,
  total          INTEGER NOT NULL,
  passed         INTEGER NOT NULL DEFAULT 0,
  quiz_version   TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_quiz_agent ON quiz_attempts(agent_id);

CREATE TABLE IF NOT EXISTS release_plans (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version        TEXT NOT NULL,
  target_group   TEXT,
  announce_at    TEXT,
  enforce_at     TEXT,
  banner         TEXT,
  status         TEXT NOT NULL DEFAULT 'scheduled',
  created_by     INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_release_company ON release_plans(company_id);

CREATE TABLE IF NOT EXISTS api_keys (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  key_prefix     TEXT NOT NULL,
  key_hash       TEXT NOT NULL,
  scope          TEXT NOT NULL DEFAULT 'read',
  revoked        INTEGER NOT NULL DEFAULT 0,
  last_used_at   TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS outbound_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event          TEXT NOT NULL,
  payload_json   TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  attempts       INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbound_status ON outbound_events(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS custom_products (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pkey           TEXT NOT NULL,
  name           TEXT NOT NULL,
  kind           TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft',
  version        INTEGER NOT NULL DEFAULT 1,
  change_note    TEXT,
  created_by     INTEGER,
  approved_by    INTEGER,
  approved_at    TEXT,
  pending_json   TEXT,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_products_key ON custom_products(company_id, pkey);

CREATE TABLE IF NOT EXISTS report_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,
  period_key     TEXT,
  recipients     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
