#!/usr/bin/env node
'use strict';
// Runs against SQLite by default. Set DATABASE_URL to run this exact same
// suite against Postgres instead — see docs/deployment.md "Postgres
// migration" for how that's verified.
const USING_POSTGRES = !!process.env.DATABASE_URL;
if(!USING_POSTGRES){
  process.env.DB_PATH = require('path').join(__dirname, 'db', 'test-integration.sqlite');
}
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
    const tables = ['audit_log','illustrations','email_outbox','sms_outbox','agents','product_data_versions','product_lines','admin_users','companies'];
    for(const t of tables){ await db.exec(`TRUNCATE TABLE ${t} RESTART IDENTITY CASCADE`); }
  }

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const base = `http://localhost:${port}`;

  async function api(method, path, body, token){
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
    const XLSX = require('xlsx');
    const fanakaData = require('../data/fanaka-data.json');
    const rows = [['Plan Name','Age (ANB)','Policy Term','Rate per Mille','Survival Factor','Death Benefit Factor']];
    fanakaData.prates.slice(0, 10).forEach(r => rows.push([r.plan, r.anb, r.term, r.rate, r.surv, r.death]));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rates');
    const wbBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

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
