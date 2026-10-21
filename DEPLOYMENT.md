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
