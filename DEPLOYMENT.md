# Deployment options

| Feature | GitHub Pages (static) | Node host (Render, VPS, etc.) |
|---|---|---|
| Illustrator, needs diagnosis, PWA install, offline | Yes | Yes |
| OTP agent verification | No (needs backend) | Yes |
| Saved illustrations, admin panel, SMS outbox | No | Yes |

## GitHub Pages
1. Upload the folder contents to the repo root (keep `plan-illustrator.html`, `index.html`, `manifest.json`, `sw.js`, `icons/` together).
2. Settings -> Pages -> deploy from the main branch, root.
3. Open `https://<user>.github.io/<repo>/` in Chrome on Android. After the first load an **Install app** button appears (or use the Chrome menu -> Install app).
4. If an older version was tried before: clear that site's data in Chrome, then reload.

## Node host
`npm install && node backend/server.js` — serves `/app`, `/admin` and `/api/*`. Set the environment variables listed in `backend/` for SMS/email.

## Tests
`npm test` runs the engine regression suite, the needs-scoring tests and the backend integration tests.

---

## Monitoring, updates and feedback (added)

**Nothing is collected unless a backend is running.** A GitHub-Pages-only deployment has no server, so there is no usage data, no OTP and no admin reports there (feedback falls back to an email draft to walterjungah9@outlook.com).

### 1. Point the app at your backend (once per deployment)
Edit `app-config.js`:
```js
window.APP_CONFIG = { api: "https://your-backend.example.com", company: 1, checkIntervalDays: 7, maxOfflineDays: 30 };
```
Redeploy. (Alternatively open the app once with `?api=...&company=...`; the device remembers it.) The backend must allow the app's origin via CORS if hosted on a different domain.

### 2. Email delivery
By default emails are only written to the `email_outbox` table (and the console). To really send them set:
`EMAIL_PROVIDER=smtp SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS EMAIL_FROM`
Other settings: `FEEDBACK_EMAIL` and `REPORT_EMAIL` (both default to walterjungah9@outlook.com), `DIGEST_EVERY_DAYS` (default 7), `DIGEST_ENABLED=false` to stop the weekly digest. On hosts that sleep, trigger the digest from a cron job instead: `POST /api/companies/<id>/usage/email-report?days=7` with an admin token (or use the "Email me this summary" button in the admin Usage tab). Always set a strong `JWT_SECRET` in production.

### 3. Releasing an update
1. `node scripts/bump-version.js 2026.11.02` (updates the app, service worker cache name and `version.json`; add `--min 2026.10.01` to force older versions off).
2. Run `npm test`, deploy the files.
3. Optionally adjust the policy in **Admin → Updates** (latest/minimum version, check interval, must-reconnect days, message).
Installed apps check on launch and then every check-interval (default 7 days), show an "update available" banner, and block use if below the minimum version or offline longer than the reconnect limit. This is enforced inside the app; it cannot stop a technically determined person tampering with their own device.

### 4. What is recorded (stated in the Terms & Conditions)
Agent name and phone; app opens, logins, terms acceptance, calculation/print/needs-diagnosis events with product, plan, term, frequency, mode; app version and whether installed; errors; feedback. **Never** client names, dates of birth or amounts. View it under **Admin → Usage** (company totals, per-agent report, CSV), **Feedback**, **Updates**. Consider your obligations under the Kenya Data Protection Act (consent, minimisation, retention, data-subject requests) and set a retention policy; this is not legal advice.

### 5. Signing in/out and agent details (2026.10.20)
- Every agent signs in with name, **agency code**, phone and **email** (all required) and accepts the Terms. The round **Account** button (initials, top right) opens their details, **Edit my details**, and **Sign out**. Sign out clears the login and any unsent items from the device, wipes in-progress client figures, and returns to the sign-in screen so someone else can use the phone.
- The verified phone number cannot be edited in the app (it is the identity confirmed by OTP). To use another number, sign out and sign in again with it.
- Agency code and email appear on printed illustrations, in Admin → Agents / Usage / Feedback, in the CSV export and in the feedback and digest emails. Existing databases are upgraded automatically (new `email` and `agency_code` columns). Terms version is now 3, so every device shows the sign-in screen once more.

### 6. Mandatory updates (2026.10.21)
When the app finds a newer release than the one it is running, it shows a full-screen **Update required** screen with a single **Install update** button; the app does not open until the update is installed (it then reopens by itself). The check runs every time the app is opened while online, again when it returns to the foreground after 6 hours, and at least once per check interval while open (plus Android's background sync when allowed). A phone that already knows about a newer release stays blocked even with no signal.
- In **Admin → Updates**, untick "Require agents to install each new version" to make updates optional (a dismissible banner only). `version.json` also accepts `"requireUpdate": false`; the administrator service's setting wins when it can be reached.
- Only publish a "latest" version you have already deployed, otherwise agents are asked to install something that does not exist yet.
- Test the whole chain before releasing: `node test/update-flow-test.js` (starts a local site, installs the app, publishes a new release, and checks the block, install and reopen).

### 7. Help & handbook (2026.10.22)
The round **?** button (top right, beside the account button) opens a searchable Help screen: a **Glossary** (insurance terms such as indemnity and insurable interest, each with a plain definition, an example and "see also" links), a **Handbook** (using the app, conduct and compliance checklists, choosing a product, contacts) and a **Products** tab generated live from the calculator's own data (entry ages, terms, minimum premiums, riders), so it can never disagree with the app. Search works across all three, understands partial words and synonyms, and highlights matches.
- **Content lives in `help-content.js`** — edit or add entries there (format described at the top of the file) and release a new version. `npm test` checks for duplicate terms and broken "see also" links.
- When an agent searches for something that is not found, the app records only the search text (nothing about clients). **Admin → Usage** lists the most common unanswered searches so you know which terms to add. Agents can also tap "Ask for this term to be added", which sends you a feedback message.
- The text is general industry guidance plus product facts from the illustration workbooks; company documents and policy terms always prevail. Replace or extend the Handbook articles with your official agent handbook wording where it differs.

### 8. Controlled access — tighter update lock (2026.10.23)
The "update required" screen alone can be bypassed by someone who edits their phone's stored data or runs a patched copy of the app. This release adds checks that live on **your server**, which a phone cannot edit:

1. **Version gate.** Every call the app makes to the backend carries its version. If it is below the minimum, or behind the latest release while "Require agents to install each new version" is ticked, the server answers `426 update_required` and the app shows the Update screen. An old copy therefore cannot sign in, send data or get a new access lease.
2. **Signed access lease ("strict mode").** After login the server issues a short-lived lease signed with a private key that only the server holds. The app verifies it with the public key in `app-config.js` and will not open without a valid, unexpired lease for that agent. Editing the stored lease, the expiry or the clock does not work; the lease also carries the update policy, so offline policy can't be edited either. When the lease expires the agent must go online once to renew it (default length = "Max days offline", 30 by default).
3. **Disable an agent.** Admin → Agents → **Disable**. The agent's app clears itself and shows "Access withdrawn" the next time it goes online; no new login codes or leases are issued. **Enable** restores access.
4. **Clock rollback** (setting the phone's date back to stretch a lease) is detected.

**One-time setup**
```
node scripts/make-signing-key.js --write     # prints the private key and writes the public key into app-config.js
```
Set the printed `APP_SIGNING_PRIVATE_KEY="…"` as an environment variable on the Node host (never commit it), then deploy `app-config.js` with the app. Optional: `LEASE_TTL_SECONDS` overrides the lease length (testing). Strict mode only switches on when a backend is configured **and** `publicKey` is set; otherwise the app behaves as before. `CORS_ORIGIN` should be your app's origin if the app and server are on different domains.

**Honest limit.** Nothing running on a phone can be made unbreakable: a skilled person could still host a patched copy that skips these checks. What they cannot do is get past the server — no valid lease, no login, no data collected, and a disabled agent stays disabled. For stronger control, keep the app behind the server's login (Node host) rather than GitHub Pages. Pure GitHub Pages deployments (no backend) cannot use this feature.

### 9. Client tools, company tools and the release gate (2026.10.24)
**For agents (in the app):** My clients with follow-up reminders (kept on the phone only), save a quote to a client, share a summary or PDF by WhatsApp/SMS, side-by-side comparison, What-if sliders, cover-gap and goal-gap charts, "Why this plan?" on every recommendation, Pitch & objections helper, English/Kiswahili summaries, saved progress ("Resume"), training mode with four sample clients, "Hand to sales team", "My progress" against targets, "Email me the code instead" at login, and an access-pass expiry warning with a 3-day grace period (`LEASE_GRACE_DAYS`).
**For the company (admin panel):** *Login & SMS* (Africa's Talking, **off by default** — enter username/API key, send a test, then tick "live"), *Agents* (spreadsheet import, groups, bulk enable/disable; self-registration is unchanged), *Leads*, *Leaderboard* (monthly targets), *Quote trail* (compliance record: product, inputs without client details, rate version, app version, terms version), and the **Rates editor** under *Product lines* (browse the current rates, change a value, give a reason, run the impact report, approve, activate; a different administrator must approve when there are two or more).
**Published rates:** agents download the active rate tables in the background and they apply the next time the app starts; the quote trail records which version was used. Built-in rates are used when nothing is published.
**SMS go-live:** nothing else to deploy. Admin → Login & SMS → fill in the details → test → tick "Send login codes as real SMS". The API key is stored encrypted (derived from `JWT_SECRET`, so set a real one first and don't change it afterwards).
**Release gate:** `node scripts/release.js <version>` runs every check (signed-illustration regression, page-vs-engine calculator parity, scoring, help, backend, install/update flow) and bumps the version only if all pass. `npm test` runs the same checks without bumping.
**Limits to know:** client records and drafts live on the phone (clearing browser data or changing phones loses them); the Kiswahili text is a draft that a native speaker should review; the cover-gap chart is a rule of thumb, not a needs analysis; Postgres was not available to test the new tables (they mirror the existing ones).

### 10. Applications, servicing, compliance and integration (2026.10.25)
**Agents (in the app):** *Start application* from any result (client details, beneficiaries with trustee for minors, health declaration, ID/KRA PIN photos, finger signature, data consent), first-premium collection (paybill instructions, or an M-Pesa prompt once switched on), *Client view* (large print, English/Kiswahili, what you pay / what you get), *Policies & renewals* (overdue, due in 14 days, lapsed, with call/SMS/WhatsApp), *Complaints*, *Needs & suitability* record, *Licence & training* (licence number, expiry, knowledge quiz), *More products* (term, group, funeral, credit life, pension from the company's own rates), a *Text size* switch, and a **"waiting to upload"** queue: applications, complaints and records made offline are kept on the phone and sent automatically (every send is safe to repeat).
**Admin console:** new tabs — *Applications* (review, open documents, decide, issue with a policy number; premium payments), *Policies* (CSV import with a dry-run check), *Complaints* (response deadline, overdue flags), *Compliance* (quote trail, application, audit, suitability, complaint and licence exports; audit-log viewer; client data export/erase; retention), *Reports* (conversion by agent/product/group/region, weekly report), *Licensing*, *More products* (draft → second administrator approves → publish), *Release control* (staged compulsory updates with a banner; rate-change calendar), *Integration* (API keys, webhook), *Settings*, and *New insurer* (superadmin onboarding wizard + readiness checklist).
**Settings to complete before go-live (Admin → Settings):** the leads/applications email and report recipients (nothing is emailed until set), what is compulsory for agents (licence, quiz, documents), the declaration and consent wording (have legal approve it), complaint response period, payment instructions, retention periods (agree with compliance).
**M-Pesa:** off by default. Enter Daraja credentials in Settings, set the public https address of this server, test in *Sandbox*, then switch to *Live*. The credentials are stored encrypted. Not tested against Safaricom from this build: do a sandbox test first.
**Integration:** a read API (`/api/v1/leads|applications|policies|complaints|quotes|payments`, header `X-Api-Key`, pageable) and a signed webhook (`X-PI-Signature: sha256=…`) for lead.created, application.submitted, application.status, policy.issued, payment.received, complaint.created. Webhook addresses on private networks are refused unless `WEBHOOK_ALLOW_PRIVATE=1`.
**Operations:** run `npm run backup` daily (SQLite `VACUUM INTO` or `pg_dump`, `--keep N`), and `node scripts/restore-check.js <file>` to prove a backup opens. With `NODE_ENV=production` the server refuses to start with the default `JWT_SECRET` or CORS `*`. Retention jobs, the weekly report (Monday morning), webhook retries and scheduled rate activations run inside the server (set `PI_NO_SCHEDULERS=1` to turn them off). Responses are now compressed.
**Static (GitHub Pages) hosting:** the agent screens that talk to the office need the Node host; the calculators still work without it.
**Honest limits:** the e-signature is a drawn signature with a time stamp and a consent record — have your legal team confirm it is acceptable for your products. SMS, e-mail and M-Pesa were tested only against stand-ins. The quiz is general good-practice content in English, not your company's product exam. Sample rates in new company products are placeholders and cannot be published until real rates are entered. A licence number entered by an agent is self-declared; check it against the IRA register (admin can overwrite it). Accessibility was checked with an automated scanner and an emulated slow phone, not with real assistive-technology users or a physical low-end device.

### 11. Daily spark (2026.10.26)
On the first open each day an agent sees a greeting card ("Good morning, Walter") with one quote from a library of 1,000+ (`daily-quotes.js`). Each agent walks through the library in their own shuffled order, so nothing repeats for 1,000+ days and colleagues see different quotes. Shown once per day per phone; "Today's spark" on the home screen re-reads it. Switch it off per company under Admin → Settings → What agents can use. To preview: open the app with `?dq=random`. To edit the library, change lines in `daily-quotes.js` (a review list is in `docs/quotes-review.tsv`). **Attribution caution:** quotes were compiled from memory of widely cited sources; entries marked "A key idea from…" are summaries of a book's ideas, not word-for-word quotes. Have someone verify attributions before using the quotes in marketing.

## 12. Install, update and screen sizes (v2026.10.28–29)

- **Install app** button on the home screen (plus a floating button where the browser offers a native prompt). Chrome/Edge/Android use the native prompt; iPhone/iPad Safari and other browsers get step-by-step instructions. Hidden once the app runs installed.
- **Check for updates / Update now** on the home screen; a "new version is ready" bar also appears when the browser finds a new release in the background.
- **Adaptive layout**: phone (default), tablet (>=768px: wider column, two-column tiles, dialogs centred, agent panels as large centred windows; the ? Help handbook is unchanged and stays full-screen) and desktop (>=1100px: wider column, hover states). Printing is unchanged.
- iOS can only install from Safari; Firefox on computers cannot install web apps (documented in the in-app instructions).

## 13. Help glossary expansion (v2026.10.31)

- Glossary grown from 129 to 845 terms across 19 categories: life, medical insurance, Kenya health financing (SHA/SHIF), general, motor, property & liability, marine/engineering/specialist, reinsurance & finance, regulation, selling, and a Kiswahili section.
- Term batches live in `help-src/` and are merged by `node scripts/merge-help.js` (idempotent; skips existing terms). Edit `help-content.js` directly for later changes.
- Definitions are general industry guidance and never refer to a particular illustration or document. Tax, levy and regulatory details change, so confirm current figures before quoting them.
- App name is now "Life Insurance Plan Illustrator" (installed apps keep the old title until reinstalled). The manifest no longer locks orientation to portrait, so tablets and PCs can rotate freely.
- Help glossary has tick-box filters (Life, Medical, Motor, Other general, Common terms); none ticked shows everything; choice is remembered on the device (v2026.10.32).
