# Architecture

## What this system is

A multi-tenant ("white-label") insurance plan illustrator. Any number of
companies can each run their own branded version of the illustrator app,
with their own product lines, their own rate data, and their own agents —
all served by one backend and one database.

```
                         ┌─────────────────────────┐
                         │   Admin console           │
                         │   /admin-panel.html       │
                         │   (company staff)         │
                         └──────────┬────────────────┘
                                    │ JWT-authenticated REST calls
                                    ▼
┌───────────────────┐    ┌─────────────────────────┐    ┌──────────────┐
│  Agent app         │    │   Express API            │    │   SQLite /   │
│  plan-illustrator  │───▶│   backend/server.js       │───▶│   Postgres   │
│  .html (public)    │    │                           │    │  (db/index.js)│
└───────────────────┘    └──────────┬────────────────┘    └──────────────┘
                                    │
                                    ▼
                         ┌─────────────────────────┐
                         │   Pure calculation        │
                         │   engines (/engines)      │
                         │   fanaka / faida /        │
                         │   smartsave — no DOM,      │
                         │   no DB, no I/O            │
                         └─────────────────────────┘
```

## The tenant boundary: `companies`

Every piece of data that can differ between insurers hangs off a `company`
row: its name, slug (used in public URLs), logo, three brand colors, the
footer/disclaimer text printed on every illustration, and a display
currency code/locale (`currency_code`, `locale` — ISO 4217 / BCP-47,
default `KES`/`en-KE`; formatting only, see deployment.md §8 for what this
does and doesn't cover). `product_lines`
belong to a company; `agents`, `illustrations`, and `admin_users` (except
superadmins) are all scoped to one company too. The `scopeToCompany`
middleware in `backend/auth.js` is what enforces this on every admin
request — a company admin can never read or write another company's data,
only a superadmin can act across companies.

## The three calculation engines

`fanaka-engine.js`, `faida-engine.js`, and `smartsave-engine.js` in
`/engines` are the exact calculation logic extracted from the original
Excel-derived illustrator, each wrapped so it runs identically in Node
(`require(...)`) and in a browser (`window.FanakaEngine`, etc.). They are
pure functions: given a data blob (rate tables, plan definitions) and an
input (age, term, premium...), they return a result. They know nothing
about HTTP, the database, or which company is asking.

`engineRegistry.js` is the one place that adapts those three different
native call shapes into a single `compute(engineType, data, input)`
interface, which is all `server.js` ever calls. Adding a fourth engine
type means writing a fourth pure engine module and one `computeX` function
in the registry — nothing else in the backend needs to know it exists.

## Why rate data is versioned, not just "the current file"

`product_data_versions` stores every rate-data upload for a product line,
numbered sequentially. A version starts as `validated = 0` and cannot be
activated until an admin runs it through `/validate` with at least one
reference scenario — a real input/output pair taken from an actual printed
illustration PDF — and the engine reproduces it within tolerance. Only
then can `/activate` flip it live; activating one version automatically
marks the previously-active one as superseded. This is deliberate: it is
the one gate standing between "someone uploaded a spreadsheet with a typo"
and "an agent hands a client a wrong figure." Nothing bypasses it, including
the UI — the activate button in the admin panel is simply hidden until a
version is marked validated, and the API independently rejects the request
either way (422 `This version has not passed validation yet`).

## Request flow for computing an illustration

1. The agent app calls `GET /api/public/companies/by-slug/:slug` to pick up
   the company's branding (colors, logo, disclaimer).
2. It calls `GET /api/public/companies/:companyId/product-lines` to list
   what that company currently offers.
3. It calls `POST /api/companies/:companyId/product-lines/:lineId/compute`
   with the client's inputs. The server loads that line's **currently
   active** data version, runs it through the matching engine, records the
   full input/output pair in `illustrations` for audit, and returns the
   result.

No agent-facing call can touch an unvalidated or inactive version — the
`compute` route only ever looks up the row where
`activated_at IS NOT NULL AND superseded_at IS NULL`.

## Where the database layer is isolated

`backend/db/index.js` is the only file that talks to SQLite or Postgres
directly — it picks one at startup based on whether `DATABASE_URL` is set
and exports the same `db.prepare(sql).run/get/all(...)` shape either way.
Every other file (`server.js`, `sms.js`, `email.js`, `seed.js`, both test
suites) calls only that shape, and always with `await` — on SQLite that's
a no-op (its calls are synchronous; awaiting a plain value resolves
immediately), on Postgres those are real async queries. This is why
adding the Postgres driver touched ~65 call sites in a one-line way
(adding `await`) rather than needing per-site rewrites: placeholder
translation (`?` → `$1,$2,...`), `RETURNING id` for `lastInsertRowid`, and
a SQL-level `datetime()` function matching SQLite's `datetime('now')` /
`datetime('now','+N minutes')` calls are all handled once, centrally, in
the adapter — see `backend/db/index.js` and `backend/db/schema.postgres.sql`.
The one place that needed more than `await` is the version-activate
transaction, which uses a `db.transaction(fn)` helper (SQLite:
`BEGIN`/`COMMIT`/`ROLLBACK`; Postgres: one dedicated pooled connection via
`AsyncLocalStorage` for the whole callback, since a bare `BEGIN` against a
connection *pool* wouldn't be atomic). See `deployment.md` §2 for how to
switch a deployment to Postgres and what's been verified about it.

## Local-dev substitutes (per the project's standing rule)

Everything that will eventually run against shared infrastructure has a
local, file-based substitute today:

| Eventually | Local substitute today |
|---|---|
| Hosted Postgres | SQLite file via `node:sqlite` (the default); set `DATABASE_URL` to switch the same codebase to a real Postgres instance instead — this isn't hypothetical, see deployment.md §2 |
| Real SMS gateway (Africa's Talking, etc.) | The real OTP flow is fully built (`request-otp`/`verify-otp`); `backend/sms.js`'s `console` provider (the default) writes codes to `sms_outbox` and returns them directly instead of texting a phone — switch `SMS_PROVIDER` to go live |
| Real email/SMTP server | The password-reset flow is fully built (`forgot-password`/`reset-password`); `backend/email.js`'s `console` provider (the default) writes the reset link to `email_outbox` and returns it directly instead of emailing it — switch `EMAIL_PROVIDER=smtp` to go live |
| CDN-hosted company logos | `logo_url` is just a URL field — works with any public image URL already |
| A real reverse-proxy/TLS layer | `node backend/server.js` directly on a port |

Nothing here blocks moving to the real thing later — each row above is a
one-file or one-service swap, not a redesign.
