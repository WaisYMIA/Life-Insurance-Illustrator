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

## 14. Daily inspiration categories and frequency (v2026.10.34)

- Categories: motivation (daily-quotes.js, 1,012) plus daily-library.js (Bible/KJV, Stoic, history facts, African proverbs, money & insurance wisdom). Sources are in `quote-src/`; rebuild with `node scripts/build-quote-library.js`.
- Agents choose categories (at least one) and frequency (1-3 a day: first open, from 12:00, from 17:00) under My account > Daily inspiration. Stored per agent on the device (not asked at sign-up). Default: Motivation, once a day.
- Admin can still switch the whole feature off (Settings > What agents can use > daily quote).
- Verses were typed from the King James Version and history/Stoic/proverb entries from published sources; have a reviewer proofread before wide release.

## 15. Calculator (v2026.10.35)

- `calculator.js`: floating calculator button (bottom-right, all screens except sign-in), non-modal panel, keyboard support, percent logic (200000 + 10% = 220000), memory keys, copy result / copy calculation, history (last 8, on the device), commas toggle. Install and update bars step aside while it is open.
- Covered by `test/calculator-test.js` (arithmetic) and the browser tests.

## 16. Business tools for agents (v2026.11.1)

- `agent-growth.js` (loaded after agent-apps.js; listed in sw.js APP_SHELL and the backend static allowlist): **My business** (today list, monthly goals, pipeline by stage), client birthday alerts (date of birth added to the client form), ready-made EN/Kiswahili follow-up messages (WhatsApp, SMS, copy), **Cover needed** quick calculator, glossary **Practice quiz**, **Backup & restore** (JSON, Excel-readable CSV), optional **App lock (PIN)**, 5 more objection cards and 4 more practice clients.
- Backup/restore and App lock are buttons in My account, registered through `window.AccountExtras`.
- All data stays on the agent's device (per-agent localStorage keys). Nothing new is sent to the backend, so no server changes are needed beyond serving the new file.
- The PIN is a screen lock, not encryption: it is stored as a salted PBKDF2 hash, covers the app with an overlay and makes the page behind it inert, but localStorage can still be read with device tools. Forgot PIN means sign out (which also clears the PIN).
- Help chip rows (A-Z and categories) wrap on phones instead of scrolling sideways; PC layout is unchanged.
- Tests: `node test/agent-growth-test.js` (birthdays, goals, needs arithmetic, quiz building, CSV, backup parsing and merge) plus browser tests.
- Already existing before this release and not rebuilt: compare tray, what-if, pitch/objection cards, practice clients (training mode), WhatsApp/PDF sharing, follow-ups, needs-gap chart, offline upload queue, admin leaderboard and targets.

## 17. Home button and start screen order (v2026.11.2)

- Header now has a Home button (house icon, left of "?") on every screen except the start screen. It closes any open agent window and returns to the start screen; unfinished work is kept as a draft and offered as Resume.
- Start screen order: "Go straight to the Illustrator" is first and highlighted (filled brand colour, "First tool" tag), then Client Needs Diagnosis. The app still opens at Step 1 of the illustrator.

## 18. Offline use (v2026.11.3)

Problem fixed: with no internet the app could fail to open ("Offline and not cached yet" from the site root, index.html or any address with a query string), could be locked by a pending required update, forced a fresh sign-in 24 hours after login, and hung when the connection was "up" but not answering.

- `sw.js`: installs file by file (only plan-illustrator.html, manifest.json and app-config.js are essential, so one missing file on the server no longer stops offline install); the app page opens from the stored copy for `/`, `index.html`, `plan-illustrator.html`, `/app`, with or without a query string; refreshes in the background only when online; every network wait has a time limit (3 s for app-config.js, 8 s for version.json, 15 s for other files). Update-now now restores the offline store (PRECACHE message) before reloading.
- `plan-illustrator.html`: agents stay signed in until they sign out (the old 24-hour local expiry is gone; the server still rejects an invalid token when online). A known pending update no longer blocks the app when the device is offline or the update server cannot be reached; it blocks as soon as a check succeeds. The administrator's "connect at least every N days" limit (default 30) and the access-lease limit (strict mode) still apply. No update checks are attempted while offline, and after a failed check the next automatic attempt waits 30 minutes (launch, reconnect and the Check button always try).
- Trade-off to note: an agent with no connection can keep using an older version until they next connect or until the N-day limit. Lower "maximum days without checking in" in the admin console if you want it tighter.
- Tests: `test/offline-flow-test.js` (added to the release gate) and the updated `test/update-flow-test.js`.

## 19. Help > Products layout (v2026.11.4)

- Smart Save, Smart Scholar, Faida Elimu, Faida Maisha and Faida Elite each have their own entry (searchable by name) with a label/detail table: entry age, term, minimum premium by frequency, riders, tax relief and what is specific to that product. Figures are read from the calculator data, so they cannot disagree with the app. The Fanaka-family table is unchanged.
- On phones the wide Fanaka table scrolls sideways again instead of squeezing its words (the squeeze came from the v2026.11.1 phone rule, now removed); the new per-product tables are narrow enough to fit without scrolling. The A-Z and category chip rows still wrap.
- Fixed: the old combined Smart text printed "Minimum sum assured: KES NaN" because the Smart products have no configured minimum; it is now left out unless one is set.

## 20. Timed practice quiz (v2026.11.5)
The Practice quiz has an optional per-question countdown (`#qzTime`: off / standard / relaxed, remembered in `illustrator_quiz_pace_v1`). Seconds come from `AgentGrowth.secondsFor(q, pace)`: reading time for the definition and options, plus extra for technical categories and numbers, rounded to 5s, clamped 15–60. Timeout counts as a miss and reveals the answer; timer pauses while the page is hidden. The company licence quiz from the backend is not timed.

## 21. Market comparison (v2026.11.6)
`market-data.js` is generated by `node scripts/build-market.js` from `data/market-src/<insurer>.json` (desk research, each product carries a source domain and an official/secondary flag; contact lines and links are stripped). `market-compare.js` renders the Market tab (home card + My account). Refresh by editing the JSON, rebuilding, and running `node test/market-test.js`. Kenindia and Pioneer have no captured products (sites not readable); APA, Liberty and Prudential rest largely on secondary sources and are flagged in the app.

## 22. Objection playbook (v2026.11.8)
`objection-library.js` holds the content (methods, 42 objections across life/medical/general, 12 Kenyan alternatives, product edges from official Jubilee brochures, Kenya proof points with sources) and the UI; it opens from the Pitch panel and My account. `test/objection-test.js` lints content (complete fields, no contacts, no over-promising wording, every fact sourced). Methods are attributed only to material actually read (Tracy via AMA and The Sales Experts, Hopkins via Selling Power, Gitomer via gitomer.com). Kenya figures are quoted with their source and date; refresh them before client use. English only for now: Kiswahili needs a native reviewer.

## 23. Sales Academy quizzes (v2026.11.9)
`quiz-bank.js` holds 336 written questions (Jubilee products from the official brochures, principles, life/medical/general terms, Kenya facts with sources, objections, sales skills, ethics), 17 calculation generators with fresh numbers and worked answers, and competitor questions generated from `market-data.js` (official-page entries only). Four levels (1 Beginner to 4 Expert) pick the nearest-difficulty questions. The picker offers four lines and nine topics with 'only these' or 'everything except these'; five learning paths preset level and topics; per-topic accuracy feeds 'My weak spots'. `test/quiz-bank-test.js` re-computes every generated answer independently.
Optional online updates: put extra questions in `quiz-bank-extra.json` (format in the file's note) on the server; apps fetch it when online (6 s limit, no-store), validate it, and keep the last copy for offline use. Edit the file and re-upload: no app release needed. The app itself does not browse the open web; research is done when the bank is written and refreshed through this file.
If Jubilee changes a product's terms, update the matching questions in `quiz-bank.js` (search the plan name) and the generators, then run `node test/quiz-bank-test.js`.

Selection rule (v2026.11.10): in 'Only' mode, ticked topics decide the content and sector-wide questions (skills, objections, ethics) are kept whatever line is ticked; with no topics, ticked lines decide. If a line plus topic combination is too narrow, the quiz widens to the ticked topics and tells the agent. `test/quiz-bank-test.js` checks every line x topic x level combination returns a full quiz.

## 24. What-if limits (v2026.11.11)
`whatif-limits.js` (pure helpers, unit-tested by `test/whatif-test.js`) plus `whatIfSpec()` in `agent-tools.js` keep every What-if bar inside product rules: premium from the frequency minimum (Faida/Smart data; Fanaka-type plans derived from the engine at the plan's minimum sum assured across all allowed terms) up to KES 500,000, with range chips and a typed-value box; terms from each plan's min/max/step and maturity-age cap (Smart Save 70, Smart Scholar 68, Fanaka layer 1 = 5–10 yrs, layer 2 = 11–20 yrs from brochures); Faida Maisha alone gets a whole life cover bar, KES 1M–200M. To change a rule, edit the product data or the caps at the top of `whatif-limits.js`.
