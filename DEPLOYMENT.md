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
