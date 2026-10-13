# Deployment guide

This covers taking the system from "runs on my machine" to "live on the
internet." Read `architecture.md` first if you haven't — it explains the
pieces this guide moves.

## 1. What you're deploying

One Node/Express process (`backend/server.js`) that also serves the two
static front-ends:

- `/admin` — the admin console (`admin-panel.html`) for company staff
- `/app` — the public agent-facing illustrator (`plan-illustrator.html`)
- everything under `/api/*` — the REST backend both of those talk to

That means **one deployable service**, not three. Any host that runs a
Node app (Render, Railway, Fly.io, a plain VPS, an EC2 instance) works.

## 2. Before you deploy: database

The system ships with SQLite (via Node's built-in `node:sqlite`) so it
needs zero setup for local development. SQLite is fine for a low-to-moderate
traffic single-region deployment — it's a real transactional database, not
a toy — but it has two real limits in production:

- **The database file must live on persistent disk.** Most "serverless"
  or auto-scaling hosts (Vercel, most container platforms without a volume
  attached) wipe the filesystem between deploys or across instances. Use a
  host that gives you a persistent volume (Render disks, Railway volumes,
  a VPS's own disk, an EBS volume on EC2) and point `DB_PATH` at it.
- **Only one process can write at a time.** Fine for one server instance;
  not fine if you plan to run multiple instances behind a load balancer for
  redundancy or scale.

**If you outgrow SQLite — Postgres is already built in, not just planned.**
This isn't a sketch of how a migration *would* work; it's wired up, and the
full 49-check integration suite has actually been run against a live
Postgres 16 instance (not just SQLite) to prove it, alongside the usual
SQLite run. To use it:

1. `npm install` (the `pg` driver is already a dependency).
2. Set `DATABASE_URL` to a Postgres connection string, e.g.
   `postgresql://user:pass@host:5432/plan_illustrator`. That's the whole
   switch — `backend/db/index.js` detects it and uses the Postgres-backed
   implementation instead of SQLite; nothing else needs to change or know
   which driver is active.
3. Run `node backend/seed.js` as usual — it creates the schema (from
   `backend/db/schema.postgres.sql`, the Postgres-equivalent of
   `schema.sql`, table-for-table and column-for-column) and the first
   superadmin, exactly like the SQLite path.
4. Start the server the same way: `node backend/server.js`.

What makes this a real migration rather than a thin wrapper, in case you're
auditing it before trusting it with production data:

- **Every database call in the backend is `await`ed**, including inside
  Express route handlers (which Express 5 supports natively). On SQLite
  this is a no-op (`await` on a plain value just resolves immediately,
  since `node:sqlite`'s `DatabaseSync` is synchronous) — so the SQLite path
  is unchanged. On Postgres those same calls are real async network
  queries. One call-site shape, both drivers.
- **The one multi-statement transaction in the system** — activating a
  product-data version, which supersedes the previous one and flips the
  product line live in a single atomic step — uses a `db.transaction(fn)`
  helper rather than raw `BEGIN`/`COMMIT` text. On Postgres this checks
  out one dedicated connection from the pool for the whole callback (via
  `AsyncLocalStorage`), because handing `BEGIN`/`COMMIT`/`ROLLBACK` to a
  connection *pool* directly would not actually be atomic — different
  statements can land on different connections. This was deliberately
  tested, not assumed: the integration suite's "Version activated" and
  "Cannot activate a version that has not passed validation" checks both
  pass against live Postgres.
- **`?` placeholders and `lastInsertRowid` need no changes anywhere.** The
  Postgres adapter translates `?` → `$1, $2, ...` and auto-appends
  `RETURNING id` to every `INSERT`, so the ~65 call sites across
  `server.js`, `sms.js`, and `email.js` that use SQLite's placeholder and
  `.lastInsertRowid` style work completely unchanged against Postgres too.
- **`datetime('now')` and `datetime('now','+30 minutes')`** (used
  throughout for OTP and password-reset expiry) also needed no query
  changes: `schema.postgres.sql` defines a small SQL-level `datetime()`
  function that mimics exactly those two call shapes and returns the same
  `'YYYY-MM-DD HH:MM:SS'` text format SQLite produces, so every existing
  date comparison in the app code (which parses that exact string format)
  keeps working unmodified.
- **Boolean-shaped columns** (`is_active`, `verified`, `validated`, ...)
  stay `INTEGER` (0/1) in the Postgres schema, not a real `BOOLEAN` —
  switching to `BOOLEAN` would silently turn every `is_active: 1` in the
  API's JSON responses into `is_active: true`, which would break the
  admin panel's and the test suite's existing `=== 1` / `=== 0` checks.
- **What this does *not* give you**: SQLite's zero-setup nature. A
  Postgres deployment needs you to actually provision and manage a
  Postgres instance (a managed one from your host is the easy route —
  Render, Railway, Neon, RDS, etc. all offer one); `DATABASE_URL` just
  needs to point at it.

`backend/test-integration.js` is itself Postgres-aware: run it with
`DATABASE_URL` set and it truncates tables between runs instead of
deleting a SQLite file, so the exact same 49 checks that validate the
SQLite path validate the Postgres path too — this is how the above was
actually proven, not just written down. There's no separate
Postgres-only test file to fall out of sync.

## 3. Environment variables

Copy `backend/.env.example` to `backend/.env` and fill in real values
before deploying — never commit the real `.env` file. At minimum:

| Variable | What it does | Production requirement |
|---|---|---|
| `JWT_SECRET` | Signs admin login tokens | **Must** be a long random value — the code ships an insecure dev default and will log a warning if you deploy with it unchanged |
| `DB_PATH` | Where the SQLite file lives | Point at your persistent volume's path. Ignored if `DATABASE_URL` is set. |
| `DATABASE_URL` | Switches the database layer to Postgres (see §2) | Leave unset to use SQLite (the default). Set to a Postgres connection string to use Postgres instead. |
| `CORS_ORIGIN` | Which origin(s) may call the API from a browser | Set to your real domain(s), not `*`, once you have one |
| `PORT` | What port the server listens on | Set to whatever your host expects (many set this for you automatically) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | The first superadmin account, created by `node backend/seed.js` | Use a real email and a strong password; run the seed script once, then rotate the password through "My account" → change password (or "Forgot password?") once logged in |

## 4. Deploy steps (generic — adapt to your host)

```bash
# On the server, or in your host's build step:
npm install --omit=dev
node backend/seed.js            # creates the first superadmin, once
node backend/server.js          # starts the API + serves /admin and /app
```

For anything beyond a quick demo, run it under a process manager so it
restarts on crash and on server reboot — `pm2 start backend/server.js
--name plan-illustrator`, or your host's built-in equivalent (most
PaaS hosts — Render, Railway, Fly — do this for you automatically from a
start command of `node backend/server.js`).

Put a reverse proxy in front of it for TLS (HTTPS) unless your host
terminates TLS for you already (most PaaS hosts do). A bare `nginx`
config forwarding `:443` to the Node process's port, with a free
Let's Encrypt certificate, is enough.

## 5. First-run checklist on a fresh deployment

1. `node backend/seed.js` — creates the superadmin from your env vars.
2. Log into `/admin` with that account.
3. Create your first company (name + slug).
4. Add a product line (pick the engine type: Fanaka, Faida, or Smart
   Save/Scholar). Either paste already-structured rate data as JSON, or
   upload the original `.xlsx`/`.xlsm` with "Scan workbook" first — it
   auto-extracts a flat rate table where it can recognize one and drafts
   the JSON for you to review (see "Workbook scanning" below).
5. **Validate it** against at least one real reference scenario taken from
   an actual printed illustration — the admin panel's validate screen asks
   for the input and the expected figures. Do not skip this; it's the only
   thing standing between a rate-data mistake and a client seeing a wrong
   number.
6. Activate the version.
7. Set the company's branding (colors, logo URL, footer text, disclaimer).
8. Share `/app?api=<your-api-url>&company=<companyId>` with agents. The
   `api`/`company` params turn on real SMS OTP verification (see "Agent
   verification" below); omit them to run the app in local-only mode with
   no backend at all (device-captured name/phone, unverified).

## 5a. Agent verification (real OTP)

Agents verify their phone number by SMS before the app unlocks, via
`POST /agents/request-otp` then `POST /agents/verify-otp` (see `server.js`
for the exact contract). Which SMS provider actually sends the code is
controlled by `SMS_PROVIDER`:

- **`console` (the default, and what local dev/testing uses):** no real SMS
  is sent. The code is written to the `sms_outbox` table (visible in the
  admin panel's Agents tab, under "SMS outbox") and returned directly in
  the API response as `devCode` — this is the project's local substitute
  for a live SMS gateway, exactly per the standing development rule, and
  it's what the automated test suite uses.
- **`africastalking` (a real provider):** set `SMS_PROVIDER=africastalking`
  plus `AT_USERNAME` and `AT_API_KEY` (from your Africa's Talking account).
  This makes a real outbound HTTPS call and will not work from a
  network-restricted environment — it's meant for your actual production
  host. In this mode `devCode` is never returned by the API; the code only
  ever reaches the real phone number.
- Adding another provider (Twilio, etc.) means adding one function to
  `backend/sms.js` and one branch in `sendSms` — nothing else changes.

**Before going live:** switch `SMS_PROVIDER` away from `console`, or every
agent's verification code will be visible to anyone who can read the API
response (fine for internal testing, not fine for production).

## 5b. Workbook scanning

`POST /api/product-lines/:lineId/scan-workbook` (multipart, field name
`workbook`) parses an uploaded spreadsheet and:
- always returns a plain preview of every sheet (headers + sample rows),
  so nothing is ever auto-converted silently;
- auto-extracts a flat rate table when it finds one with recognizable
  age/term/rate-style columns (fuzzy header matching — "Age (ANB)", "ANB",
  "Age Next Birthday" all match), returning it as a reviewable draft;
- lists specific warnings for anything it couldn't confidently map (plan
  metadata like `cagr`, `wholeLifeAfterPT`, rider flags still need a human).

This cuts out the most tedious and error-prone manual-entry step (copying
hundreds of rate rows by hand) while deliberately not attempting to guess
the parts of a workbook that aren't a flat table — exactly the same
trust-but-verify principle the validation gate already enforces. See
`backend/workbookScanner.js` for the full matching logic.

**Known dependency advisory:** the `xlsx` (SheetJS) npm package has an
open prototype-pollution/ReDoS advisory with no fix currently published to
npm (SheetJS's own recommended fix is to install from their CDN instead of
npm). This endpoint is admin-authenticated only — it is never exposed to
unauthenticated users — which contains the real-world risk to "a trusted
company admin uploads a malicious file," not an open attack surface. If
that residual risk matters for your deployment, swap `xlsx` for
`exceljs` or SheetJS's CDN-distributed build in `backend/workbookScanner.js`
(the module's two exported functions are the only integration point).

## 6. Running the test suites before every deploy

```bash
node test/regression-suite.js      # pure calculation-engine checks
node backend/test-integration.js   # full HTTP walk: login → upload →
                                    # validate → activate → compute
```

Both must pass (exit code 0) before shipping a change. `test/test-dashboard.html`
is the same regression suite bundled into one double-click-able HTML file —
useful for a non-technical teammate to confirm "yes, the numbers are still
right" without needing Node installed; rebuild it with
`node test/build-dashboard.js` after any engine or data change.

## 7. Security notes for a production deployment

- Rate limiting is already in place (300 req/15min per IP on the API
  generally, 10 per IP+email on login, 20 per IP on public agent
  registration) — see `backend/server.js`. Tune the numbers if real usage
  needs differ.
- `JWT_SECRET` must be rotated out of its dev default (the server doesn't
  block startup on this today — treat it as a manual pre-launch check).
- Input lengths are capped server-side on the fields that accept free text
  (company name, footer, disclaimer, agent name, etc.) to blunt
  pathological payloads; `express.json()` itself is capped at 2 MB.
- CORS defaults to `*` for ease of local development — lock `CORS_ORIGIN`
  down to your real domain before going live.
- Passwords are hashed with bcrypt (`bcryptjs`); never store or log a raw
  password anywhere, including in the seed script's output (it only
  prints the password you supplied via `SEED_ADMIN_PASSWORD`, once, at
  seed time — treat that terminal output as sensitive).

## 8. Status: what's built vs. still open

**Built and tested** (83 automated checks: 34 engine + 49 integration —
the latter run against both SQLite and live Postgres — plus live-browser
verification of every admin-panel and agent-app flow, including the
currency/locale display formatting and the accessibility fixes described
below):
- Real SMS/OTP agent verification (§5a) with a pluggable provider
- Workbook upload + auto-extraction of rate tables (§5b)
- Admin password changes and multi-admin management per company (sign in,
  change your own password, a superadmin or company admin can create and
  deactivate other admins for their company) — `/api/admin/me`,
  `/api/admin/me/change-password`, `/api/companies/:id/admins`
- Self-service password reset by email, plus an admin-triggered "send
  reset" for a colleague who's locked out — `/api/auth/admin/forgot-password`,
  `/api/auth/admin/reset-password`, `/api/companies/:id/admins/:id/send-reset`.
  Same pluggable-provider pattern as SMS: `EMAIL_PROVIDER=console` (the
  default) writes the reset link to the `email_outbox` table and hands it
  straight back in the API response for local dev/testing; `EMAIL_PROVIDER=smtp`
  sends a real email via any SMTP server in production. The admin panel's
  login screen has "Forgot password?" wired to this, and reset links
  (`/admin?resetEmail=...&resetToken=...`) open straight into the
  set-new-password screen, token scrubbed from the address bar once read.
- An accessibility pass on the admin console: every form field has a
  properly associated `<label for>`, the engine-type picker is a real
  keyboard-operable radio group (Tab to move, Enter/Space to select, with
  `role="radiogroup"`/`aria-checked`), and status messages are announced
  to screen readers via `aria-live`.
- A matching accessibility pass on `plan-illustrator.html` (the
  agent-facing app): every input's `<label class="flabel">` now has a
  `for` attribute (40 of 41 labels — the one left alone is a group
  heading above a card picker, not a per-field label, so `for` doesn't
  apply there). The chip/card selectors used throughout the wizard
  (`.chip`, `.mode-card`) were plain unfocusable `<div>`s with click
  handlers; a single `MutationObserver`-based enhancer (added once, near
  the top of the app's script) now retrofits every one of them,
  wherever and whenever the wizard renders a new step, with keyboard
  focus (`tabindex="0"`), a `role="button"`, Enter/Space activation, and
  an `aria-pressed` state kept in sync even when selection is applied by
  toggling a CSS class rather than a full re-render. A visible focus
  ring (`:focus-visible`) was added for both. Verified with real
  keyboard-only interaction in Chromium, not just by reading the markup.
- A color-contrast audit across both the admin console and the agent app,
  run with axe-core against every tab/screen (and, in the agent app,
  walked through the gate and the Fanaka wizard flow step by step) rather
  than inspected by eye. It found and fixed four real WCAG AA failures:
  the admin console's muted/secondary text color (`#78716a`, 4.3:1 on the
  page background — below the 4.5:1 minimum for normal text; darkened to
  `#6b655f`, 5.2:1); the agent app's "Step N of 5" label and the gate
  screen's "Before you continue" tag (both used the gold accent color as
  text, `#b8863a`, 2.9:1 — a new `--accent-text` variable, `#8a6225`
  (4.9:1), was added for text use specifically, leaving the accent color
  itself unchanged where it's used decoratively/as a background); the
  terms-of-use box being a scrollable region with no keyboard access
  (added `tabindex="0"`, `role="region"`, and a focus ring); the viewport
  meta tag disabling pinch-zoom (`maximum-scale=1.0` removed — that's a
  WCAG failure on its own, independent of contrast); and a plan-picker
  `<select>` with no accessible name (added `aria-label="Plan"` — every
  other form control already had a proper `<label for>` from the earlier
  pass). Re-run after each fix with zero violations remaining across
  every screen checked.
  **Honest limit:** axe-core (and any automated tool) catches the
  mechanically-checkable rules — contrast ratios, missing labels/names,
  keyboard traps, ARIA misuse. It does not replace a human pass with an
  actual screen reader (VoiceOver/NVDA/JAWS) checking that the *reading
  order* and *announced content* make sense, or a check with a
  colorblindness simulator for charts/status indicators that rely on
  color alone. Those remain undone; what's been verified here is real
  (every claim above was actually run, not inferred), just not complete.
- Per-company currency and locale display formatting. Every `company` row
  now has a `currency_code` (ISO 4217, default `KES`) and `locale`
  (BCP-47, default `en-KE`), settable from the admin panel's Branding tab
  or via `currencyCode`/`locale` on `POST/PATCH /api/companies`. The
  agent app fetches them (`GET /api/public/companies/:id`, new this
  round) and every money figure and field label it renders — `fmt()`'s
  output and the "(KES)" suffixes on amount fields — switches to the
  configured currency code and number-grouping locale. With no backend
  configured (standalone/offline use), it falls back to `KES`/`en-KE`
  exactly as before.
  **Scope — read before treating this as "multi-country support":** this
  is display formatting only. It does **not** make the underlying
  Fanaka/Faida/Smart Save rate tables valid for a market outside Kenya,
  and it does **not** touch the Kenya Revenue Authority tax-relief rule
  (15% of premium, capped at KES 5,000/month) that's hardcoded into the
  tax-relief calculation and its on-screen explanation — that rule, and
  the income-bracket values on the data-capture step, are Kenyan tax law
  and Kenyan rate data respectively, not currency labels, and switching
  `currency_code` to e.g. `UGX` does not make them correct for Uganda.
  Real multi-country support needs new, separately validated
  jurisdiction-specific rate tables and tax rules — a product decision,
  not something this change implies is already done.
- Outstanding password-reset-request visibility in the admin UI: the
  "Admin users" tab now has an "Outstanding password-reset requests"
  table, backed by a new `GET /api/companies/:id/password-reset-requests`
  endpoint. It reads the existing `audit_log` (a request event with no
  later completion event for the same admin counts as outstanding) rather
  than needing a new table — read-only, it doesn't cancel or complete
  anything.
- A real Postgres migration path, not just a plan for one — see §2. The
  exact same 49-check integration suite that validates SQLite has also
  been run end-to-end against a live Postgres 16 instance (schema
  creation, migrations, the version-activate transaction, placeholder/
  `RETURNING id` translation, and a full live-browser walkthrough of the
  admin panel against it), with zero differences in outcome.

**Still open:**
- Full multi-language UI text (the interface itself is English-only;
  only currency/number formatting is configurable per company, as above).
- Jurisdiction-specific rate tables and tax rules for any market besides
  Kenya (see the scope note above).
- A human screen-reader pass and a colorblindness-simulator check (see
  the "Honest limit" note above) — the automated accessibility audit is
  real but not a full substitute for either.
- Real SMS/email provider credentials are still unconfigured by default
  (`SMS_PROVIDER`/`EMAIL_PROVIDER` default to `console`, the local
  substitute) — going live needs real Africa's Talking or SMTP
  credentials set, and an actual test message confirmed to arrive, which
  can only be done against real external services, not in this
  environment.
