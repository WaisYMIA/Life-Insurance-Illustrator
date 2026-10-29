#!/usr/bin/env node
'use strict';
// Runs against SQLite by default. Set DATABASE_URL to run this exact same
// suite against Postgres instead — see docs/deployment.md "Postgres
// migration" for how that's verified.
const USING_POSTGRES = !!process.env.DATABASE_URL;
if(!USING_POSTGRES){
  process.env.DB_PATH = require('path').join(__dirname, 'db', 'test-integration.sqlite');
}
const crypto = require('crypto');
const TEST_KEYS = crypto.generateKeyPairSync('ec', { namedCurve:'prime256v1' });
process.env.APP_SIGNING_PRIVATE_KEY = TEST_KEYS.privateKey.export({type:'pkcs8',format:'pem'});
process.env.LEASE_TTL_SECONDS = '3600';
const fs = require('fs');
if(!USING_POSTGRES && fs.existsSync(process.env.DB_PATH)) fs.unlinkSync(process.env.DB_PATH);

const bcrypt = require('bcryptjs');
const { db, initSchema } = require('./db');

const app = require('./server');
const http = require('http');

let pass = 0, fail = 0;
function check(label, cond, detail){
  if(cond){ pass++; console.log(`  \x1b[32mPASS\x1b[0m  ${label}`); }
  else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? ' — ' + JSON.stringify(detail) : ''}`); }
}

async function main(){
  await initSchema();
  if(USING_POSTGRES){
    // No DB file to delete for a clean slate — truncate instead. CASCADE handles the FK
    // dependency order so this doesn't need to match schema.postgres.sql's table order.
    const tables = ['usage_events','feedback','app_control','audit_log','illustrations','email_outbox','sms_outbox','agents','product_data_versions','product_lines','admin_users','companies'];
    for(const t of tables){ await db.exec(`TRUNCATE TABLE ${t} RESTART IDENTITY CASCADE`); }
  }

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const base = `http://localhost:${port}`;

  async function api(method, path, body, token){
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-App-Version': (api.version === undefined ? '2026.10.24' : api.version), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch(e){}
    return { status: res.status, body: json };
  }

  const email = 'test-superadmin@example.com';
  const password = 'test-password-123';
  const hash = bcrypt.hashSync(password, 10);
  await db.prepare("INSERT INTO admin_users (company_id, email, password_hash, role) VALUES (NULL, ?, ?, 'superadmin')").run(email, hash);

  const login = await api('POST', '/api/auth/admin/login', { email, password });
  check('Superadmin login succeeds', login.status === 200 && !!login.body.token);
  const token = login.body.token;

  const company = await api('POST', '/api/companies', { name: 'Integration Test Insurer', slug: 'integration-test-insurer', colorPrimary: '#123456' }, token);
  check('Company created', company.status === 201 && !!company.body.id, company.body);
  const companyId = company.body.id;

  const line = await api('POST', `/api/companies/${companyId}/product-lines`, { engineType: 'fanaka', displayName: 'Wealth Builder' }, token);
  check('Product line created', line.status === 201 && !!line.body.id, line.body);
  const lineId = line.body.id;

  const fanakaData = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'data', 'fanaka-data.json'), 'utf8'));
  const upload = await api('POST', `/api/product-lines/${lineId}/versions`, { dataJson: fanakaData, sourceFilename: 'fanaka-source.xlsm', mappingNotes: 'Integration test upload' }, token);
  check('Version uploaded', upload.status === 201 && upload.body.version_number === 1, upload.body);
  const versionId = upload.body.id;

  const validate = await api('POST', `/api/product-lines/${lineId}/versions/${versionId}/validate`, {
    scenarios: [{
      input: { planName: 'Fanaka Plan Layer 1', age: 35, term: 5, freq: 'Monthly', mode: 'premium', value: 20000, riders: {}, isSingle: false, bonusRate: 0.045 },
      expected: { sumAssured: 991746, 'maturity.total': 1338857 },
    }],
  }, token);
  check('Validation against real reference scenario passes', validate.status === 200 && validate.body.validated === true, validate.body);

  const activate = await api('POST', `/api/product-lines/${lineId}/versions/${versionId}/activate`, {}, token);
  check('Version activated', activate.status === 200 && activate.body.activated === true, activate.body);

  const agent = await api('POST', `/api/companies/${companyId}/agents`, { name: 'Test Agent', phone: '0712345678', acceptedTerms: true });
  check('Agent registered', agent.status === 201 && !!agent.body.id, agent.body);
  const agentId = agent.body.id;

  const illustration = await api('POST', `/api/companies/${companyId}/product-lines/${lineId}/compute`, {
    agentId, clientName: 'Integration Test Client',
    input: { planName: 'Fanaka Plan Layer 1', age: 35, term: 5, freq: 'Monthly', mode: 'premium', value: 20000, riders: {}, isSingle: false, bonusRate: 0.045 },
  });
  check('Illustration computed via API', illustration.status === 200, illustration.body);
  check('Computed Sum Assured matches validated figure exactly', Math.round(illustration.body.sumAssured) === 991746, illustration.body.sumAssured);
  check('Computed maturity matches validated figure exactly', Math.round(illustration.body.maturity.total) === 1338857, illustration.body.maturity.total);

  const recorded = await db.prepare('SELECT * FROM illustrations WHERE company_id = ? AND agent_id = ?').get(companyId, agentId);
  check('Illustration recorded in database for audit trail', !!recorded);

  const badAgent = await api('POST', `/api/companies/${companyId}/agents`, { name: 'Bad Number', phone: '12345', acceptedTerms: true });
  check('Invalid phone number rejected at registration', badAgent.status === 400);

  const line2 = await api('POST', `/api/companies/${companyId}/product-lines`, { engineType: 'faida', displayName: 'Growth Plan' }, token);
  const upload2 = await api('POST', `/api/product-lines/${line2.body.id}/versions`, { dataJson: { fake: true } }, token);
  const activateUnvalidated = await api('POST', `/api/product-lines/${line2.body.id}/versions/${upload2.body.id}/activate`, {}, token);
  check('Cannot activate a version that has not passed validation', activateUnvalidated.status === 422);

  // ---- Workbook structure scanner ----
  {
    const writeXlsx = require('write-excel-file/node');
    const fanakaData = require('../data/fanaka-data.json');
    const rows = [['Plan Name','Age (ANB)','Policy Term','Rate per Mille','Survival Factor','Death Benefit Factor']];
    fanakaData.prates.slice(0, 10).forEach(r => rows.push([r.plan, r.anb, r.term, r.rate, r.surv, r.death]));
    const wbBuffer = await (writeXlsx.default || writeXlsx)(rows.map(r => r.map(v => ({ value: v })))).toBuffer();

    const form = new FormData();
    form.append('workbook', new Blob([wbBuffer]), 'test-workbook.xlsx');
    const scanRes = await fetch(`${base}/api/product-lines/${lineId}/scan-workbook`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form
    });
    const scanBody = await scanRes.json();
    check('Workbook scan succeeds and extracts the rate table', scanRes.status === 200 && scanBody.extracted && scanBody.extracted.rows.length === 10, scanBody);
    check('Scanned first row matches the source data exactly', scanBody.extracted && JSON.stringify(scanBody.extracted.rows[0]) === JSON.stringify(fanakaData.prates[0]), scanBody.extracted && scanBody.extracted.rows[0]);

    const noFileRes = await fetch(`${base}/api/product-lines/${lineId}/scan-workbook`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: new FormData() });
    check('Scanning without a file is rejected', noFileRes.status === 400);
  }

  // ---- Real OTP verification flow (console/dev SMS provider) ----
  const otpPhone = '0798765432';
  const req1 = await api('POST', `/api/companies/${companyId}/agents/request-otp`, { name: 'OTP Agent', phone: otpPhone });
  check('OTP request succeeds and returns a dev code (console provider)', req1.status === 200 && /^\d{6}$/.test(req1.body.devCode || ''), req1.body);
  const realCode = req1.body.devCode;

  const outbox = await api('GET', `/api/companies/${companyId}/sms-outbox`, null, token);
  check('OTP send is recorded in the SMS outbox for monitoring', outbox.status === 200 && outbox.body.length >= 1 && outbox.body[0].message.includes(realCode), outbox.body);

  const wrongVerify = await api('POST', `/api/companies/${companyId}/agents/verify-otp`, { phone: otpPhone, code: '000000', acceptedTerms: true });
  check('Wrong OTP code is rejected', wrongVerify.status === 401, wrongVerify.body);

  const noTermsVerify = await api('POST', `/api/companies/${companyId}/agents/verify-otp`, { phone: otpPhone, code: realCode, acceptedTerms: false });
  check('Verify without accepting terms is rejected even with the right code', noTermsVerify.status === 400, noTermsVerify.body);

  const rightVerify = await api('POST', `/api/companies/${companyId}/agents/verify-otp`, { phone: otpPhone, code: realCode, acceptedTerms: true });
  check('Correct OTP code verifies the agent and returns a session token', rightVerify.status === 200 && rightVerify.body.verified === true && !!rightVerify.body.token, rightVerify.body);
  check('Agent is marked verified in the database after OTP success', rightVerify.body.agent.verified === 1, rightVerify.body.agent);

  const reuseVerify = await api('POST', `/api/companies/${companyId}/agents/verify-otp`, { phone: otpPhone, code: realCode, acceptedTerms: true });
  check('A consumed OTP code cannot be reused', reuseVerify.status === 400, reuseVerify.body);

  // Lock-out after 5 wrong attempts on a fresh code
  const req2 = await api('POST', `/api/companies/${companyId}/agents/request-otp`, { name: 'Lockout Agent', phone: '0711222333' });
  for(let i = 0; i < 5; i++){
    await api('POST', `/api/companies/${companyId}/agents/verify-otp`, { phone: '0711222333', code: '999999', acceptedTerms: true });
  }
  const lockedOut = await api('POST', `/api/companies/${companyId}/agents/verify-otp`, { phone: '0711222333', code: req2.body.devCode, acceptedTerms: true });
  check('Too many wrong attempts locks out even the correct code until a new one is requested', lockedOut.status === 429, lockedOut.body);

  // ---- Admin account management ----
  const me = await api('GET', '/api/admin/me', null, token);
  check('Admin can fetch their own profile', me.status === 200 && me.body.email === email, me.body);

  const wrongPwChange = await api('POST', '/api/admin/me/change-password', { currentPassword: 'wrong', newPassword: 'newpass123' }, token);
  check('Changing password with the wrong current password is rejected', wrongPwChange.status === 401, wrongPwChange.body);

  const tooShortPwChange = await api('POST', '/api/admin/me/change-password', { currentPassword: password, newPassword: 'short' }, token);
  check('New password under 8 characters is rejected', tooShortPwChange.status === 400, tooShortPwChange.body);

  const pwChange = await api('POST', '/api/admin/me/change-password', { currentPassword: password, newPassword: 'newpass123' }, token);
  check('Password change succeeds with the correct current password', pwChange.status === 200, pwChange.body);

  const loginOldPw = await api('POST', '/api/auth/admin/login', { email, password });
  check('Old password no longer works after a password change', loginOldPw.status === 401, loginOldPw.body);
  const loginNewPw = await api('POST', '/api/auth/admin/login', { email, password: 'newpass123' });
  check('New password works after a password change', loginNewPw.status === 200, loginNewPw.body);

  const newAdmin = await api('POST', `/api/companies/${companyId}/admins`, { email: 'second-admin@example.com', password: 'secondpass123' }, token);
  check('Superadmin can create a company admin for a specific company', newAdmin.status === 201 && newAdmin.body.role === 'company_admin', newAdmin.body);

  const dupAdmin = await api('POST', `/api/companies/${companyId}/admins`, { email: 'second-admin@example.com', password: 'anotherpass123' }, token);
  check('Creating an admin with a duplicate email is rejected', dupAdmin.status === 409, dupAdmin.body);

  const adminsList = await api('GET', `/api/companies/${companyId}/admins`, null, token);
  check('Company admins list includes the new admin', adminsList.status === 200 && adminsList.body.some(a => a.email === 'second-admin@example.com'), adminsList.body);

  const newAdminLogin = await api('POST', '/api/auth/admin/login', { email: 'second-admin@example.com', password: 'secondpass123' });
  check('Newly created company admin can log in', newAdminLogin.status === 200 && newAdminLogin.body.role === 'company_admin', newAdminLogin.body);

  const selfDeactivate = await api('PATCH', `/api/companies/${companyId}/admins/${newAdmin.body.id}`, { isActive: false }, newAdminLogin.body.token);
  check("An admin cannot deactivate their own account", selfDeactivate.status === 400, selfDeactivate.body);

  const deactivate = await api('PATCH', `/api/companies/${companyId}/admins/${newAdmin.body.id}`, { isActive: false }, token);
  check('A different (superadmin) account can deactivate it', deactivate.status === 200 && deactivate.body.is_active === 0, deactivate.body);
  const loginAfterDeactivate = await api('POST', '/api/auth/admin/login', { email: 'second-admin@example.com', password: 'secondpass123' });
  check('Deactivated admin can no longer log in', loginAfterDeactivate.status === 401, loginAfterDeactivate.body);

  // ---- Forgot-password / reset-password flow (console/dev email provider) ----
  const forgot1 = await api('POST', '/api/auth/admin/forgot-password', { email });
  check('Forgot-password returns a dev reset token (console provider)', forgot1.status === 200 && typeof forgot1.body.devResetToken === 'string' && forgot1.body.devResetToken.length > 20, forgot1.body);
  const realResetToken = forgot1.body.devResetToken;

  const forgotUnknown = await api('POST', '/api/auth/admin/forgot-password', { email: 'nobody-such@example.com' });
  check('Forgot-password for an unknown email still returns 200 (no account enumeration)', forgotUnknown.status === 200 && !forgotUnknown.body.devResetToken, forgotUnknown.body);

  const badTokenReset = await api('POST', '/api/auth/admin/reset-password', { email, token: 'not-the-right-token', newPassword: 'irrelevant123' });
  check('Reset with a wrong token is rejected', badTokenReset.status === 400, badTokenReset.body);

  const shortPwReset = await api('POST', '/api/auth/admin/reset-password', { email, token: realResetToken, newPassword: 'short' });
  check('Reset with a too-short new password is rejected', shortPwReset.status === 400, shortPwReset.body);

  const goodReset = await api('POST', '/api/auth/admin/reset-password', { email, token: realResetToken, newPassword: 'resetpass123' });
  check('Reset with the correct token succeeds', goodReset.status === 200 && goodReset.body.ok === true, goodReset.body);

  const loginAfterReset = await api('POST', '/api/auth/admin/login', { email, password: 'resetpass123' });
  check('New password from reset works for login', loginAfterReset.status === 200, loginAfterReset.body);
  const superadminToken2 = loginAfterReset.body.token;

  const reuseResetToken = await api('POST', '/api/auth/admin/reset-password', { email, token: realResetToken, newPassword: 'anotherpass123' });
  check('A consumed reset token cannot be reused', reuseResetToken.status === 400, reuseResetToken.body);

  // Admin-triggered reset for a colleague (the "force a reset" flow)
  const thirdAdmin = await api('POST', `/api/companies/${companyId}/admins`, { email: 'third-admin@example.com', password: 'thirdpass123' }, superadminToken2);
  const sendResetForColleague = await api('POST', `/api/companies/${companyId}/admins/${thirdAdmin.body.id}/send-reset`, {}, superadminToken2);
  check('An admin can trigger a reset email for a colleague', sendResetForColleague.status === 200 && typeof sendResetForColleague.body.devResetToken === 'string', sendResetForColleague.body);

  const colleagueReset = await api('POST', '/api/auth/admin/reset-password', { email: 'third-admin@example.com', token: sendResetForColleague.body.devResetToken, newPassword: 'colleaguenew123' });
  check('Colleague can complete the reset with the token they were sent', colleagueReset.status === 200, colleagueReset.body);
  const colleagueLogin = await api('POST', '/api/auth/admin/login', { email: 'third-admin@example.com', password: 'colleaguenew123' });
  check('Colleague can log in with the reset password', colleagueLogin.status === 200, colleagueLogin.body);

  // ---- Outstanding password-reset-requests visibility (admin UI) ----
  const outstandingAfterComplete = await api('GET', `/api/companies/${companyId}/password-reset-requests`, null, superadminToken2);
  check('A completed reset no longer shows as outstanding', outstandingAfterComplete.status === 200 && !outstandingAfterComplete.body.some(r => r.email === 'third-admin@example.com'), outstandingAfterComplete.body);

  const fourthAdmin = await api('POST', `/api/companies/${companyId}/admins`, { email: 'fourth-admin@example.com', password: 'fourthpass123' }, superadminToken2);
  await api('POST', `/api/companies/${companyId}/admins/${fourthAdmin.body.id}/send-reset`, {}, superadminToken2);
  const outstandingNow = await api('GET', `/api/companies/${companyId}/password-reset-requests`, null, superadminToken2);
  check('An uncompleted reset request shows up as outstanding', outstandingNow.status === 200 && outstandingNow.body.some(r => r.email === 'fourth-admin@example.com'), outstandingNow.body);


  // ---- App control, telemetry, feedback, reports ----
  console.log('\nApp control / usage reporting / feedback');
  const ctl0 = await api('GET', `/api/public/companies/${companyId}/app-control`);
  check('App control has safe defaults (7-day check)', ctl0.status === 200 && ctl0.body.checkIntervalDays === 7 && ctl0.body.minVersion === null, ctl0.body);
  const badCtl = await api('PUT', `/api/companies/${companyId}/app-control`, { latestVersion: 'abc' }, token);
  check('App control rejects a malformed version', badCtl.status === 400, badCtl.body);
  const noAuthCtl = await api('PUT', `/api/companies/${companyId}/app-control`, { latestVersion: '2026.10.18' });
  check('App control cannot be changed without admin login', noAuthCtl.status === 401);
  const setCtl = await api('PUT', `/api/companies/${companyId}/app-control`, { latestVersion: '2026.10.18', minVersion: '2026.10.01', checkIntervalDays: 3, maxOfflineDays: 14, notice: 'Please update' }, token);
  check('Admin can set the update policy', setCtl.status === 200 && setCtl.body.minVersion === '2026.10.01' && setCtl.body.checkIntervalDays === 3, setCtl.body);
  const ctl1 = await api('GET', `/api/public/companies/${companyId}/app-control`);
  check('Installed apps read the policy publicly', ctl1.body.latestVersion === '2026.10.18' && ctl1.body.maxOfflineDays === 14 && ctl1.body.notice === 'Please update', ctl1.body);
  check('Installing a new release is required by default', ctl0.body.requireUpdate === true && ctl1.body.requireUpdate === true, [ctl0.body, ctl1.body]);
  const optCtl = await api('PUT', `/api/companies/${companyId}/app-control`, { latestVersion: '2026.10.18', minVersion: '2026.10.01', checkIntervalDays: 3, maxOfflineDays: 14, notice: 'Please update', requireUpdate: false }, token);
  check('Admin can switch the mandatory-install rule off and the public policy reflects it', optCtl.status === 200 && optCtl.body.requireUpdate === false, optCtl.body);
  await api('PUT', `/api/companies/${companyId}/app-control`, { latestVersion: '2026.10.18', minVersion: '2026.10.01', checkIntervalDays: 3, maxOfflineDays: 14, notice: 'Please update', requireUpdate: true }, token);

  const agentToken = rightVerify.body.token;
  const unauthTel = await api('POST', `/api/companies/${companyId}/telemetry`, { events: [{ event: 'app_open' }] });
  check('Telemetry is rejected without an agent token', unauthTel.status === 401);
  const adminTel = await api('POST', `/api/companies/${companyId}/telemetry`, { events: [{ event: 'app_open' }] }, token);
  check('An admin token cannot post telemetry as an agent', adminTel.status === 401);
  const tel = await api('POST', `/api/companies/${companyId}/telemetry`, { events: [
    { event: 'app_open', appVersion: '2026.09.01', displayMode: 'standalone', sessionId: 's1', at: new Date().toISOString() },
    { event: 'calc_completed', appVersion: '2026.09.01', displayMode: 'standalone', sessionId: 's1', props: { product: 'fanaka', term: 10, freq: 'Monthly', clientName: 'Jane Doe', dob: '1990-01-01' } },
    { event: 'calc_completed', appVersion: '2026.09.01', sessionId: 's1', props: { product: 'smartsave' } },
    { event: 'diagnosis_completed', appVersion: '2026.09.01', sessionId: 's1', props: { topProduct: 'Smart Scholar', goal: 'education' } },
    { event: 'js_error', props: { msg: 'boom', where: 'x' } },
    { event: 'drop_all_tables', props: {} },
    { event: 'illustration_printed', props: { product: 'fanaka' } }
  ] }, agentToken);
  check('Telemetry accepts allow-listed events and drops unknown ones', tel.status === 200 && tel.body.accepted === 6, tel.body);
  const stored = await db.prepare("SELECT props_json FROM usage_events WHERE company_id = ? AND event = 'calc_completed' AND props_json LIKE '%fanaka%'").get(companyId);
  check('Client personal details are stripped server-side (privacy)', stored && !/Jane|dob|clientName|1990/.test(stored.props_json) && /fanaka/.test(stored.props_json), stored);

  const otherCo = await api('POST', '/api/companies', { name: 'Other Insurer', slug: 'other-insurer', colorPrimary: '#654321' }, token);
  const crossTel = await api('POST', `/api/companies/${otherCo.body.id}/telemetry`, { events: [{ event: 'app_open' }] }, agentToken);
  check("An agent's token is not valid for another company", crossTel.status === 403, crossTel.body);

  const legacyOdd = await api('POST', `/api/companies/${companyId}/agents`, { name: '=HYPERLINK("http://x")', phone: '0733000111', acceptedTerms: true });
  const sum = await api('GET', `/api/companies/${companyId}/usage/summary?days=30`, null, token);
  check('Usage summary counts calculations, prints and diagnoses', sum.status === 200 && sum.body.totals.calculations === 2 && sum.body.totals.illustrationsPrinted === 1 && sum.body.totals.diagnosesCompleted === 1, sum.body.totals);
  check('Usage summary breaks calculations down by product', sum.body.products.fanaka === 1 && sum.body.products.smartsave === 1, sum.body.products);
  check('Usage summary tracks installed-as-app and versions', sum.body.agentsInstalledAsApp === 1 && sum.body.versions['2026.09.01'] === 1, { v: sum.body.versions, i: sum.body.agentsInstalledAsApp });
  check('Usage summary flags agents behind the latest release', sum.body.agentsOnOutdatedVersion === 1, sum.body.agentsOnOutdatedVersion);
  check('Usage summary reports active vs inactive agents', sum.body.agents.active === 1 && sum.body.agents.inactive >= 1, sum.body.agents);
  check('Usage summary surfaces top errors', sum.body.topErrors.length === 1 && sum.body.topErrors[0].message === 'boom', sum.body.topErrors);
  const noAuthSum = await api('GET', `/api/companies/${companyId}/usage/summary`);
  check('Usage summary requires admin login', noAuthSum.status === 401);

  const agentList = await api('GET', `/api/companies/${companyId}/usage/agents?days=30`, null, token);
  const row = Array.isArray(agentList.body) && agentList.body.find(a => a.phone === otpPhone);
  check('Agent usage list includes names, phones and counts', !!row && row.name === 'OTP Agent' && row.calculations === 2 && row.printed === 1 && row.installedAsApp === true, row);
  const csvRes = await fetch(`${base}/api/companies/${companyId}/usage/agents?days=30&format=csv`, { headers: { Authorization: `Bearer ${token}` } });
  const csvText = await csvRes.text();
  check('Agent report downloads as CSV with name and phone columns', csvRes.status === 200 && /text\/csv/.test(csvRes.headers.get('content-type')) && /Name,Phone/.test(csvText) && csvText.includes(otpPhone), csvText.slice(0, 120));
  check('CSV neutralises spreadsheet formula injection in names', csvText.includes("'=HYPERLINK") && !/^=HYPERLINK/m.test(csvText.replace(/^﻿/, '')), csvText);

  const agentReport = await api('GET', `/api/companies/${companyId}/agents/${rightVerify.body.agent.id}/usage?days=30`, null, token);
  check('Individual agent report has profile, totals, products and recent activity', agentReport.status === 200 && agentReport.body.agent.phone === otpPhone && agentReport.body.totals.calculations === 2 && agentReport.body.products.fanaka === 1 && agentReport.body.recent.length >= 6, agentReport.body.totals);
  const otherAgentReport = await api('GET', `/api/companies/${otherCo.body.id}/agents/${rightVerify.body.agent.id}/usage`, null, token);
  check("An agent's report cannot be read through a different company", otherAgentReport.status === 404, otherAgentReport.body);

  const shortFb = await api('POST', `/api/companies/${companyId}/feedback`, { category: 'bug', message: 'x' }, agentToken);
  check('Feedback needs a real message', shortFb.status === 400);
  const noAuthFb = await api('POST', `/api/companies/${companyId}/feedback`, { category: 'bug', message: 'No token here' });
  check('Feedback needs a logged-in agent', noAuthFb.status === 401);
  const fb = await api('POST', `/api/companies/${companyId}/feedback`, { category: 'idea', rating: 4, message: 'Please add a Kiswahili print option.', appVersion: '2026.09.01' }, agentToken);
  check('Feedback is stored and emailed', fb.status === 201 && fb.body.emailed === true, fb.body);
  const mail = await db.prepare("SELECT * FROM email_outbox WHERE subject LIKE '%feedback from OTP Agent%' ORDER BY id DESC").get();
  check('Feedback email goes to walterjungah9@outlook.com and logs agent + message', !!mail && mail.to_email === 'walterjungah9@outlook.com' && mail.body.includes(otpPhone) && mail.body.includes('Kiswahili') && mail.body.includes('4 / 5'), mail);
  const fbList = await api('GET', `/api/companies/${companyId}/feedback`, null, token);
  check('Admin can list feedback with who sent it', fbList.status === 200 && fbList.body.some(f => f.agent_phone === otpPhone && f.emailed_status === 'sent'), fbList.body);

  const digest = await api('POST', `/api/companies/${companyId}/usage/email-report?days=7`, {}, token);
  check('Admin can email the usage summary on demand', digest.status === 200 && digest.body.to === 'walterjungah9@outlook.com', digest.body);
  const digestMail = await db.prepare("SELECT * FROM email_outbox WHERE subject LIKE '%usage summary%' ORDER BY id DESC").get();
  check('Usage digest lists each agent with phone and counts', !!digestMail && digestMail.body.includes('OTP Agent') && digestMail.body.includes(otpPhone) && /Calculations by product: .*fanaka/.test(digestMail.body), digestMail && digestMail.body.slice(0, 400));

  // ---- Agent profile: agency code + email at sign-in, editable afterwards ----
  const pPhone = '0755111222';
  const badEmail = await api('POST', `/api/companies/${companyId}/agents/request-otp`, { name: 'Prof Agent', phone: pPhone, email: 'not-an-email', agencyCode: 'AG 100' });
  check('Sign-in rejects a malformed email', badEmail.status === 400, badEmail.body);
  const badCode = await api('POST', `/api/companies/${companyId}/agents/request-otp`, { name: 'Prof Agent', phone: pPhone, email: 'prof@example.com', agencyCode: '<script>' });
  check('Sign-in rejects an agency code with unsafe characters', badCode.status === 400, badCode.body);
  const pReq = await api('POST', `/api/companies/${companyId}/agents/request-otp`, { name: 'Prof Agent', phone: pPhone, email: ' Prof@Example.com ', agencyCode: 'ag 100' });
  check('Sign-in with agency code and email is accepted', pReq.status === 200, pReq.body);
  const pVer = await api('POST', `/api/companies/${companyId}/agents/verify-otp`, { phone: pPhone, code: pReq.body.devCode, acceptedTerms: true });
  check('Verified session returns the profile and no secrets', pVer.status === 200 && pVer.body.agent.agencyCode === 'AG 100' && pVer.body.agent.email === 'prof@example.com' && !('otp_code_hash' in pVer.body.agent) && !('password_hash' in pVer.body.agent), pVer.body.agent);
  const pTok = pVer.body.token;
  const putNoAuth = await api('PUT', `/api/companies/${companyId}/agents/me`, { name: 'X', agencyCode: 'AG1', email: 'x@example.com' });
  check('Profile update needs an agent token', putNoAuth.status === 401, putNoAuth.body);
  const putOk = await api('PUT', `/api/companies/${companyId}/agents/me`, { name: 'Prof Agent Renamed', agencyCode: 'ke-777', email: 'new@example.com' }, pTok);
  check('Agent can correct their own name, agency code and email', putOk.status === 200 && putOk.body.name === 'Prof Agent Renamed' && putOk.body.agencyCode === 'KE-777' && putOk.body.phone === pPhone, putOk.body);
  const putBad = await api('PUT', `/api/companies/${companyId}/agents/me`, { name: 'Prof', agencyCode: 'KE-777', email: 'nope' }, pTok);
  check('Profile update validates the email', putBad.status === 400, putBad.body);
  const putPhone = await api('PUT', `/api/companies/${companyId}/agents/me`, { name: 'Prof', agencyCode: 'KE-777', email: 'new@example.com', phone: '0700000000' }, pTok);
  const stillPhone = await db.prepare('SELECT phone FROM agents WHERE company_id = ? AND name = ?').get(companyId, 'Prof');
  check('The verified phone number cannot be changed through the profile', putPhone.status === 200 && putPhone.body.phone === pPhone && stillPhone && stillPhone.phone === pPhone, putPhone.body);
  const adminAgents = await api('GET', `/api/companies/${companyId}/agents`, null, token);
  check('Admin agents list shows agency code and email', adminAgents.body.some(a => a.phone === pPhone && a.agency_code === 'KE-777' && a.email === 'new@example.com'), adminAgents.body);
  const csv2 = await fetch(`${base}/api/companies/${companyId}/usage/agents?days=30&format=csv`, { headers: { Authorization: `Bearer ${token}` } });
  const csvText2 = await csv2.text();
  check('Usage CSV includes agency code and email columns', /Agency code/.test(csvText2) && /KE-777/.test(csvText2) && /new@example\.com/.test(csvText2), csvText2.slice(0, 200));
  const logoutEv = await api('POST', `/api/companies/${companyId}/telemetry`, { events: [{ event: 'logout' }, { event: 'profile_updated' }] }, pTok);
  check('Sign-out and profile-update events are accepted by telemetry', logoutEv.status === 200 && logoutEv.body.accepted === 2, logoutEv.body);

  // ---- Help module analytics: which searches found nothing ----
  const helpEv = await api('POST', `/api/companies/${companyId}/telemetry`, { events: [{ event: 'help_opened' }, { event: 'help_search_miss', props: { q: 'Bancassurance' } }, { event: 'help_search_miss', props: { q: 'bancassurance', client: 'Jane Doe' } }] }, pTok);
  check('Help events are accepted', helpEv.status === 200 && helpEv.body.accepted === 3, helpEv.body);
  const helpSum = await api('GET', `/api/companies/${companyId}/usage/summary?days=30`, null, token);
  check('Summary lists unanswered help searches (case-folded) and help opens', helpSum.body.helpMisses && helpSum.body.helpMisses[0] && helpSum.body.helpMisses[0].query === 'bancassurance' && helpSum.body.helpMisses[0].count === 2 && helpSum.body.helpOpens === 1, helpSum.body.helpMisses);
  const helpStored = await db.prepare("SELECT props_json FROM usage_events WHERE event = 'help_search_miss' ORDER BY id DESC").get();
  check('Only the search text is stored — unexpected fields are dropped', helpStored && !/Jane/.test(helpStored.props_json), helpStored);

  // The database file and backend source must never be downloadable over HTTP.
  for(const leak of ['/backend/server.js', '/backend/db/schema.sql', '/package.json', '/data/faida-data.json', '/.env']){
    const r = await fetch(base + leak);
    check(`Server does not expose ${leak}`, r.status === 404, r.status);
  }
  const pub = await fetch(base + '/manifest.json');
  check('Server still serves the public app files', pub.status === 200);
  {
    const swSrc = fs.readFileSync(require('path').join(__dirname, '..', 'sw.js'), 'utf8');
    const shell = (/APP_SHELL = \[([\s\S]*?)\];/.exec(swSrc)[1].match(/'([^']+)'/g) || []).map(x => x.slice(1, -1));
    const missing = [];
    for(const f of shell){ const r = await fetch(base + '/' + f); if(r.status !== 200) missing.push(f + ' ' + r.status); }
    check('Every file the offline cache needs is actually served (otherwise the app cannot install)', shell.length > 10 && missing.length === 0, missing);
  }

  // ---------- Controlled access: version gate, signed lease, remote disable ----------
  {
    api.version = '2026.09.01';
    const old1 = await api('POST', `/api/companies/${companyId}/telemetry`, { events: [{ event: 'app_open' }] }, agentToken);
    check('Server refuses (426) an app older than the minimum version', old1.status === 426 && old1.body.error === 'update_required' && old1.body.reason === 'below_minimum', old1.body);
    api.version = '2026.10.10';
    const old2 = await api('POST', `/api/companies/${companyId}/telemetry`, { events: [{ event: 'app_open' }] }, agentToken);
    check('Server refuses an app behind the latest release when updates are required', old2.status === 426 && old2.body.reason === 'behind_latest', old2.body);
    api.version = undefined;
    const keyRes = await api('GET', '/api/public/signing-key');
    check('Public signing key is published', keyRes.status === 200 && keyRes.body && keyRes.body.key && keyRes.body.key.kty === 'EC', keyRes.body);
    const lease = await api('POST', `/api/companies/${companyId}/agents/lease`, {}, agentToken);
    const L = lease.body && lease.body.lease;
    const sigOk = L && crypto.verify('sha256', Buffer.from(L.p), { key: TEST_KEYS.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(L.s, 'base64url'));
    check('Agent gets an access lease with a valid ECDSA signature', lease.status === 200 && sigOk === true, lease.body);
    const pl = L && JSON.parse(L.p);
    check('Lease binds company, agent and expiry', pl && pl.cid === Number(companyId) && pl.aid === rightVerify.body.agent.id && Date.parse(pl.exp) > Date.now() && Date.parse(pl.exp) - Date.parse(pl.iat) === 3600*1000, pl);
    const forged = L && crypto.verify('sha256', Buffer.from(L.p.replace('"v":1','"v":2')), { key: TEST_KEYS.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(L.s, 'base64url'));
    check('A tampered lease fails verification', forged === false);
    const noTokLease = await api('POST', `/api/companies/${companyId}/agents/lease`, {});
    check('Lease needs an agent token', noTokLease.status === 401);
    const adminLease = await api('POST', `/api/companies/${companyId}/agents/lease`, {}, token);
    check('An admin token cannot obtain an agent lease', adminLease.status === 401 || adminLease.status === 403, adminLease.status);
    const aid = rightVerify.body.agent.id;
    const noAuthPatch = await api('PATCH', `/api/companies/${companyId}/agents/${aid}`, { isActive:false });
    check('Disabling an agent needs admin rights', noAuthPatch.status === 401);
    const badPatch = await api('PATCH', `/api/companies/${companyId}/agents/${aid}`, { isActive:'no' }, token);
    check('Disable request is validated', badPatch.status === 400, badPatch.body);
    const dis = await api('PATCH', `/api/companies/${companyId}/agents/${aid}`, { isActive:false }, token);
    check('Admin can disable an agent', dis.status === 200 && dis.body.isActive === false, dis.body);
    const lease2 = await api('POST', `/api/companies/${companyId}/agents/lease`, {}, agentToken);
    check('A disabled agent gets no lease (account_disabled)', lease2.status === 403 && lease2.body.error === 'account_disabled', lease2.body);
    const listDis = await api('GET', `/api/companies/${companyId}/agents`, null, token);
    const rowDis = listDis.body.find(a => a.id === aid);
    check('Agents list shows disabled state', rowDis && Number(rowDis.is_active) === 0, rowDis);
    const reqDis = await api('POST', `/api/companies/${companyId}/agents/request-otp`, { name: 'OTP Agent', phone: otpPhone });
    check('A disabled agent cannot request a new login code', reqDis.status === 403 && reqDis.body.code === 'account_disabled', reqDis.body);
    const en = await api('PATCH', `/api/companies/${companyId}/agents/${aid}`, { isActive:true }, token);
    const lease3 = await api('POST', `/api/companies/${companyId}/agents/lease`, {}, agentToken);
    check('Re-enabling restores access', en.status === 200 && lease3.status === 200, lease3.body);
    const pre = await fetch(base + `/api/companies/${companyId}/telemetry`, { method:'OPTIONS' });
    const hdr = (pre.headers.get('access-control-allow-headers') || '') + '|' + (pre.headers.get('access-control-allow-methods') || '');
    check('CORS allows X-App-Version and PATCH/PUT', /X-App-Version/i.test(hdr) && /PATCH/.test(hdr) && /PUT/.test(hdr), hdr);
  }



  // ---------- v2026.10.24 features ----------
  {
    // SMS settings: off by default, key never returned, switch needs credentials
    const sms0 = await api('GET', `/api/companies/${companyId}/sms-settings`, null, token);
    check('Live SMS is OFF by default and uses the local substitute', sms0.status === 200 && sms0.body.enabled === false && sms0.body.activeProvider === 'console' && sms0.body.apiKeySaved === false, sms0.body);
    const smsNoKey = await api('PUT', `/api/companies/${companyId}/sms-settings`, { enabled: true }, token);
    check('Cannot switch live SMS on without credentials', smsNoKey.status === 422, smsNoKey.body);
    const smsNoAuth = await api('GET', `/api/companies/${companyId}/sms-settings`);
    check('SMS settings need an admin', smsNoAuth.status === 401);
    const smsSave = await api('PUT', `/api/companies/${companyId}/sms-settings`, { enabled: false, username: 'sandbox', apiKey: 'SECRET-KEY-123', senderId: 'ILLUSTR' }, token);
    check('Credentials save without being echoed back', smsSave.status === 200 && smsSave.body.apiKeySaved === true && JSON.stringify(smsSave.body).indexOf('SECRET-KEY-123') < 0 && smsSave.body.activeProvider === 'console', smsSave.body);
    const rawRow = await db.prepare('SELECT api_key_enc FROM sms_settings WHERE company_id = ?').get(companyId);
    check('API key is stored encrypted, not in plain text', rawRow && rawRow.api_key_enc && rawRow.api_key_enc.indexOf('SECRET-KEY-123') < 0);
    const smsOn = await api('PUT', `/api/companies/${companyId}/sms-settings`, { enabled: true }, token);
    check('Admin can switch live SMS on once credentials exist', smsOn.status === 200 && smsOn.body.enabled === true && smsOn.body.activeProvider === 'africastalking', smsOn.body);
    await api('PUT', `/api/companies/${companyId}/sms-settings`, { enabled: false }, token);
    const smsTest = await api('POST', `/api/companies/${companyId}/sms-settings/test`, { phone: '0711222333' }, token);
    check('Test SMS goes to the log while live SMS is off', smsTest.status === 200 && smsTest.body.provider === 'console', smsTest.body);
    // OTP by email fallback
    const emailOtp = await api('POST', `/api/companies/${companyId}/agents/request-otp`, { name: 'Mail Agent', phone: '0733444555', email: 'mail.agent@example.com', channel: 'email' });
    check('Login code can be sent by email instead', emailOtp.status === 200 && emailOtp.body.channel === 'email' && /^\d{6}$/.test(emailOtp.body.devCode || ''), emailOtp.body);
    const emailNo = await api('POST', `/api/companies/${companyId}/agents/request-otp`, { name: 'No Mail', phone: '0733444556', channel: 'email' });
    check('Email code needs an email address', emailNo.status === 400, emailNo.body);

    // Bulk import
    const dry = await api('POST', `/api/companies/${companyId}/agents/import`, { dryRun: true, rows: [
      { name: 'Imp One', phone: '0701000001', email: 'one@example.com', agencyCode: 'ag 1', group: 'Nairobi' },
      { name: 'Imp Two', phone: '+254701000002', group: 'Nairobi' },
      { name: '', phone: '0701000003' }, { name: 'Bad Phone', phone: '123' }, { name: 'Dup', phone: '0701000001' } ] }, token);
    check('Import dry run reports created / invalid / duplicate rows', dry.status === 200 && dry.body.created === 2 && dry.body.invalid === 2 && dry.body.duplicates === 1, dry.body);
    const noneYet = await api('GET', `/api/companies/${companyId}/agents`, null, token);
    check('Dry run saves nothing', !noneYet.body.some(a => a.phone === '0701000001' || a.phone === '254701000001'), noneYet.body.length);
    const imp = await api('POST', `/api/companies/${companyId}/agents/import`, { rows: [
      { name: 'Imp One', phone: '0701000001', email: 'one@example.com', agencyCode: 'ag 1', group: 'Nairobi' },
      { name: 'Imp Two', phone: '0701000002', group: 'Nairobi' }, { name: 'Imp Three', phone: '0701000004', group: 'Mombasa' } ] }, token);
    check('Import creates the agents', imp.status === 200 && imp.body.created === 3, imp.body);
    const impList = await api('GET', `/api/companies/${companyId}/agents`, null, token);
    const impRow = impList.body.find(a => a.name === 'Imp One');
    check('Imported agents are unverified, grouped and marked as imported', impRow && impRow.verified === 0 && impRow.group_name === 'Nairobi' && impRow.source === 'import' && impRow.agency_code === 'AG 1', impRow);
    const impAgain = await api('POST', `/api/companies/${companyId}/agents/import`, { rows: [{ name: 'Imp One', phone: '0701000001' }] }, token);
    check('Re-importing the same phone updates instead of duplicating', impAgain.body.updated === 1 && impAgain.body.created === 0, impAgain.body);
    const impNoAuth = await api('POST', `/api/companies/${companyId}/agents/import`, { rows: [{ name: 'x', phone: '0701000009' }] });
    check('Import needs admin rights', impNoAuth.status === 401);
    // self-registration still works for an imported agent
    const selfReq = await api('POST', `/api/companies/${companyId}/agents/request-otp`, { name: 'Imp Two', phone: '0701000002' });
    const selfVer = await api('POST', `/api/companies/${companyId}/agents/verify-otp`, { phone: '0701000002', code: selfReq.body.devCode, acceptedTerms: true });
    check('Imported agents can still sign in by themselves (self-registration kept)', selfReq.status === 200 && selfVer.status === 200 && selfVer.body.verified === true, selfVer.body);
    const newSelf = await api('POST', `/api/companies/${companyId}/agents/request-otp`, { name: 'Walk In', phone: '0701000077' });
    check('A brand-new agent can still self-register', newSelf.status === 200 && !!newSelf.body.devCode, newSelf.body);
    const bulkOff = await api('POST', `/api/companies/${companyId}/agents/bulk`, { action: 'disable', group: 'Nairobi' }, token);
    check('Bulk-disable a whole group', bulkOff.status === 200 && bulkOff.body.affected === 2, bulkOff.body);
    const offReq = await api('POST', `/api/companies/${companyId}/agents/request-otp`, { name: 'Imp One', phone: '0701000001' });
    check('Disabled group members cannot sign in', offReq.status === 403 && offReq.body.code === 'account_disabled', offReq.body);
    const bulkOn = await api('POST', `/api/companies/${companyId}/agents/bulk`, { action: 'enable', group: 'Nairobi' }, token);
    check('Bulk-enable the group again', bulkOn.status === 200 && bulkOn.body.affected === 2, bulkOn.body);
    const bulkGrp = await api('POST', `/api/companies/${companyId}/agents/bulk`, { action: 'set_group', ids: [impRow.id], newGroup: 'Kisumu' }, token);
    check('Bulk change of group', bulkGrp.status === 200 && bulkGrp.body.affected === 1, bulkGrp.body);
    const bulkBad = await api('POST', `/api/companies/${companyId}/agents/bulk`, { action: 'delete', ids: [1] }, token);
    check('Unknown bulk action is refused', bulkBad.status === 400);

    // Leads
    const leadNoConsent = await api('POST', `/api/companies/${companyId}/leads`, { clientName: 'Client A', clientPhone: '0722111222' }, agentToken);
    check('A lead needs the client\'s consent', leadNoConsent.status === 400, leadNoConsent.body);
    const leadNoContact = await api('POST', `/api/companies/${companyId}/leads`, { clientName: 'Client A', consent: true }, agentToken);
    check('A lead needs a phone or email', leadNoContact.status === 400);
    const lead = await api('POST', `/api/companies/${companyId}/leads`, { clientName: 'Client A', clientPhone: '0722111222', product: 'Fanaka', needsSummary: 'Education, 2 children', note: 'Call after 5pm', consent: true }, agentToken);
    check('Agent hands a quote to the sales team', lead.status === 201 && lead.body.status === 'new', lead.body);
    const leadAnon = await api('POST', `/api/companies/${companyId}/leads`, { clientName: 'Client A', clientPhone: '0722111222', consent: true });
    check('Leads need an agent token', leadAnon.status === 401);
    const myLeads = await api('GET', `/api/companies/${companyId}/leads/mine`, null, agentToken);
    check('Agent can follow the status of their leads', myLeads.status === 200 && myLeads.body.length === 1 && myLeads.body[0].status === 'new', myLeads.body);
    const adminLeads = await api('GET', `/api/companies/${companyId}/leads`, null, token);
    check('Admin sees the lead with the agent', adminLeads.status === 200 && adminLeads.body[0].clientName === 'Client A' && adminLeads.body[0].agentName === 'OTP Agent', adminLeads.body);
    const leadSt = await api('PATCH', `/api/companies/${companyId}/leads/${adminLeads.body[0].id}`, { status: 'contacted' }, token);
    const leadBad = await api('PATCH', `/api/companies/${companyId}/leads/${adminLeads.body[0].id}`, { status: 'nonsense' }, token);
    check('Admin updates lead status; bad status refused', leadSt.status === 200 && leadBad.status === 400);

    // Targets + leaderboard
    const tgt = await api('PUT', `/api/companies/${companyId}/targets`, { calcs: 20, prints: 5, leads: 2 }, token);
    const tgtBad = await api('PUT', `/api/companies/${companyId}/targets`, { calcs: -1, prints: 5, leads: 2 }, token);
    check('Admin sets monthly targets (validated)', tgt.status === 200 && tgt.body.calcs === 20 && tgtBad.status === 400);
    const lb = await api('GET', `/api/companies/${companyId}/leaderboard?period=month`, null, token);
    const lbMe = lb.body && lb.body.rows && lb.body.rows.find(r => r.agentId === rightVerify.body.agent.id);
    check('Leaderboard ranks agents against targets', lb.status === 200 && lbMe && lbMe.leads === 1 && lbMe.calcs >= 1 && lbMe.targetPct !== null && lbMe.rank === 1, lb.body);
    const standing = await api('GET', `/api/companies/${companyId}/agents/me/standing`, null, agentToken);
    check('Agent sees only their own standing', standing.status === 200 && standing.body.me && standing.body.me.rank === 1 && JSON.stringify(standing.body).indexOf('Imp ') < 0, standing.body);

    // Quote trail
    const q = await api('POST', `/api/companies/${companyId}/quotes`, { records: [{ product: 'Fanaka', action: 'print', ratesVersion: 'built-in', appVersion: '2026.10.24', termsVersion: '3', language: 'sw', at: new Date().toISOString(), inputs: { age: 35, term: 20, clientName: 'SHOULD NOT SAVE', phone: '0722', premium: 5000 }, result: { sa: 1000000 } }] }, agentToken);
    check('Printed/shared quotes are recorded', q.status === 200 && q.body.saved === 1, q.body);
    const qs = await api('GET', `/api/companies/${companyId}/quotes?days=7`, null, token);
    check('Quote trail keeps rate and app versions but strips client details', qs.status === 200 && qs.body.length === 1 && qs.body[0].ratesVersion === 'built-in' && qs.body[0].inputs.indexOf('SHOULD NOT SAVE') < 0 && qs.body[0].inputs.indexOf('0722') < 0 && /"age":35/.test(qs.body[0].inputs), qs.body[0]);

    // Rates editor: outline, draft, impact, four-eyes approval, publish to app
    const line = await api('POST', `/api/companies/${companyId}/product-lines`, { engineType: 'smartsave', displayName: 'Rates test' }, token);
    const outline = await api('GET', `/api/product-lines/${line.body.id}/data-outline?path=`, null, token);
    check('Editor can browse the current rate data', outline.status === 200 && outline.body.children.some(c => c.key === 'taxReliefCap'), outline.body.children && outline.body.children.map(c => c.key));
    const taxNode = outline.body.children.find(c => c.key === 'taxReliefCap');
    const draftNoWhy = await api('POST', `/api/product-lines/${line.body.id}/versions/draft`, { changes: [{ path: 'taxReliefCap', value: 5 }] }, token);
    check('A change needs a reason', draftNoWhy.status === 400);
    const draftBad = await api('POST', `/api/product-lines/${line.body.id}/versions/draft`, { summary: 'x', changes: [{ path: 'doesNot.exist', value: 5 }] }, token);
    check('Only existing values can be edited', draftBad.status === 422, draftBad.body);
    const draftObj = await api('POST', `/api/product-lines/${line.body.id}/versions/draft`, { summary: 'x', changes: [{ path: 'products', value: 5 }] }, token);
    check('A whole group of values cannot be overwritten', draftObj.status === 422, draftObj.body);
    const newCap = Number(taxNode.value) + 1000;
    const draft = await api('POST', `/api/product-lines/${line.body.id}/versions/draft`, { summary: 'Test: raise tax relief cap', changes: [{ path: 'taxReliefCap', value: newCap }] }, token);
    check('Draft version is created from the current data', draft.status === 201 && draft.body.diffs[0].from === taxNode.value && draft.body.diffs[0].to === newCap, draft.body);
    const actEarly = await api('POST', `/api/product-lines/${line.body.id}/versions/${draft.body.id}/activate`, {}, token);
    check('A draft cannot go live before the impact report and approval', actEarly.status === 422, actEarly.body);
    const impact = await api('POST', `/api/product-lines/${line.body.id}/versions/${draft.body.id}/impact`, {}, token);
    check('Impact report compares real quotes before and after', impact.status === 200 && impact.body.ok === true && impact.body.scenariosCompared > 3 && impact.body.scenariosWithErrors === 0, { ok: impact.body.ok, n: impact.body.scenariosCompared });
    const approve = await api('POST', `/api/product-lines/${line.body.id}/versions/${draft.body.id}/approve`, {}, token);
    check('Approval works (single administrator may approve own change)', approve.status === 200 || approve.status === 403, approve.body);
    if(approve.status === 403){
      // another admin approves (four-eyes rule)
      await db.prepare('INSERT INTO admin_users (company_id, email, password_hash, role) VALUES (?,?,?,?)').run(companyId, 'second@example.com', bcrypt.hashSync('pw12345678', 10), 'company_admin');
      const lg = await api('POST', '/api/auth/admin/login', { email: 'second@example.com', password: 'pw12345678' });
      const ap2 = await api('POST', `/api/product-lines/${line.body.id}/versions/${draft.body.id}/approve`, {}, lg.body.token);
      check('A different administrator can approve (four-eyes rule)', ap2.status === 200, ap2.body);
    }
    const act = await api('POST', `/api/product-lines/${line.body.id}/versions/${draft.body.id}/activate`, {}, token);
    check('Approved version can be activated', act.status === 200 && act.body.activated === true, act.body);
    const mani = await api('GET', `/api/companies/${companyId}/rates/manifest`, null, agentToken);
    check('The app can see which rate version is published', mani.status === 200 && mani.body.smartsave && mani.body.smartsave.versionNumber === draft.body.versionNumber, mani.body);
    const pub = await api('GET', `/api/companies/${companyId}/rates/smartsave`, null, agentToken);
    check('The app can download the published rate table', pub.status === 200 && pub.body.data.taxReliefCap === newCap, pub.body && pub.body.versionNumber);
    const pubAnon = await api('GET', `/api/companies/${companyId}/rates/smartsave`);
    check('Published rates need an agent token', pubAnon.status === 401);
    const det = await api('GET', `/api/product-lines/${line.body.id}/versions/${draft.body.id}/detail`, null, token);
    check('Version detail shows the reason, changes and impact', det.status === 200 && det.body.summary && det.body.changes.length === 1 && det.body.impact);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`TOTAL: ${pass} passed, ${fail} failed`);

  console.log('='.repeat(50));

  server.close();
  if(!USING_POSTGRES){
    if(fs.existsSync(process.env.DB_PATH)) fs.unlinkSync(process.env.DB_PATH);
    const walFile = process.env.DB_PATH + '-wal', shmFile = process.env.DB_PATH + '-shm';
    if(fs.existsSync(walFile)) fs.unlinkSync(walFile);
    if(fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
  }
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
