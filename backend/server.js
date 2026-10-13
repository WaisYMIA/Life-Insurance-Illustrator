/**
 * Plan Illustrator backend — Express API server.
 * Local dev: `node backend/server.js` — uses the local SQLite file.
 * Production: see docs/deployment.md ("PRODUCTION:" markers below).
 *
 * Every database call in this file is awaited. That's true whether the
 * active driver is SQLite (where db.prepare().run/get/all() resolve
 * immediately — awaiting a plain value is a no-op in JS) or Postgres
 * (where those same methods are real async network calls) — see
 * backend/db/index.js for why one call-site shape works for both.
 */
'use strict';
require('dotenv').config({ quiet: true });
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const { db, initSchema } = require('./db');
const { signToken, requireAdmin, requireSuperadmin, scopeToCompany } = require('./auth');
const multer = require('multer');
const { compute } = require('./engineRegistry');
const crypto = require('crypto');
const { sendSms, currentProvider } = require('./sms');
const { sendEmail, currentProvider: currentEmailProvider } = require('./email');
const { scanWorkbook } = require('./workbookScanner');
const UtilsEngine = require('../engines/utils-engine.js');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const app = express();
// PRODUCTION: if deployed behind a reverse proxy (nginx, a load balancer, Render/Railway/etc.),
// this must stay enabled so express-rate-limit and req.ip see the real client IP from
// X-Forwarded-For rather than the proxy's own address.
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

// Security headers. Kept hand-written (no helmet dependency) to avoid adding a package whose
// defaults would need auditing; this covers the headers that matter for a JSON API.
app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('Referrer-Policy', 'no-referrer');
  next();
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  if(req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Generous default limit on every API route, so no single client can hammer the server.
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));
// Tighter limit on login specifically, to slow down password-guessing — keyed on IP + email
// so one slow attacker can't lock out every admin by spamming a shared IP's budget onto one account.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${(req.body && req.body.email) || ''}`,
  message: { error: 'Too many login attempts. Please wait and try again.' }
});
// Tighter limit on agent self-registration (public, unauthenticated endpoint) to blunt
// scripted account-creation spam.
const agentRegisterLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
// OTP requests cost real money against a real SMS gateway, so this is the tightest limiter
// in the system — keyed on phone number (not just IP) so one phone can't be bombed from
// rotating IPs, and one IP can't cheaply bomb many phones either.
const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${(req.body && req.body.phone) || ''}`,
  message: { error: 'Too many verification codes requested. Please wait before trying again.' }
});
const otpVerifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${(req.body && req.body.email) || ''}`,
  message: { error: 'Too many password reset requests. Please wait before trying again.' }
});
const resetPasswordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

function cap(str, max){ return typeof str === 'string' ? str.slice(0, max) : str; }

async function audit(companyId, actorType, actorId, action, details){
  await db.prepare('INSERT INTO audit_log (company_id, actor_type, actor_id, action, details_json) VALUES (?,?,?,?,?)')
    .run(companyId, actorType, actorId, action, details ? JSON.stringify(details) : null);
}
function errorHandler(res, e){
  if(e && e.status){ return res.status(e.status).json({ error: e.message }); }
  console.error(e);
  return res.status(500).json({ error: 'Internal server error' });
}

app.post('/api/auth/admin/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if(!email || !password) return res.status(400).json({ error: 'email and password required' });
  if(typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || password.length > 256){
    return res.status(400).json({ error: 'Invalid credentials' });
  }
  const admin = await db.prepare('SELECT * FROM admin_users WHERE email = ? AND is_active = 1').get(email);
  if(!admin || !bcrypt.compareSync(password, admin.password_hash)){
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  await db.prepare("UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?").run(admin.id);
  const token = signToken({ type: 'admin', adminId: admin.id, role: admin.role, companyId: admin.company_id });
  res.json({ token, role: admin.role, companyId: admin.company_id });
});

function hashResetToken(token){
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Always responds 200 whether or not the email exists, so this endpoint can't be used to
// enumerate admin accounts. The reset email/token is only ever skipped (or exposed in the
// response) in 'console' mode, the local dev substitute — see backend/email.js.
async function issuePasswordReset(admin, reqBody){
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(rawToken);
  await db.prepare("UPDATE admin_users SET reset_token_hash = ?, reset_token_expires_at = datetime('now','+30 minutes') WHERE id = ?")
    .run(tokenHash, admin.id);
  const resetBaseUrl = process.env.ADMIN_RESET_URL || '/admin';
  const resetLink = `${resetBaseUrl}?resetEmail=${encodeURIComponent(admin.email)}&resetToken=${rawToken}`;
  const subject = 'Reset your Plan Illustrator admin password';
  const body = `A password reset was requested for ${admin.email}.\n\nUse this link within 30 minutes to set a new password:\n${resetLink}\n\nIf you didn't request this, you can ignore this email.`;
  let sendResult;
  try {
    sendResult = await sendEmail(admin.company_id, admin.email, subject, body);
  } catch(e){
    return { sent: false, error: e.message };
  }
  const result = { sent: true, provider: sendResult.provider };
  if(currentEmailProvider() === 'console') result.devResetToken = rawToken;
  return result;
}

app.post('/api/auth/admin/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body || {};
  if(!email || typeof email !== 'string') return res.status(400).json({ error: 'Email is required.' });
  const admin = await db.prepare('SELECT * FROM admin_users WHERE email = ? AND is_active = 1').get(email.trim().toLowerCase());
  if(!admin){
    // Same response whether the account exists or not — don't leak which emails are registered.
    return res.json({ sent: true });
  }
  const result = await issuePasswordReset(admin, req.body);
  await audit(admin.company_id, 'admin', admin.id, 'admin.password_reset_requested', {});
  res.json(result);
});

app.post('/api/auth/admin/reset-password', resetPasswordLimiter, async (req, res) => {
  const { email, token, newPassword } = req.body || {};
  if(!email || !token || !newPassword) return res.status(400).json({ error: 'email, token, and newPassword are required.' });
  if(typeof newPassword !== 'string' || newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  const admin = await db.prepare('SELECT * FROM admin_users WHERE email = ? AND is_active = 1').get(String(email).trim().toLowerCase());
  if(!admin || !admin.reset_token_hash) return res.status(400).json({ error: 'Invalid or expired reset link. Request a new one.' });
  const expired = !admin.reset_token_expires_at || new Date(admin.reset_token_expires_at.replace(' ', 'T') + 'Z').getTime() < Date.now();
  if(expired) return res.status(400).json({ error: 'This reset link has expired. Request a new one.' });
  if(hashResetToken(token) !== admin.reset_token_hash){
    return res.status(400).json({ error: 'Invalid or expired reset link. Request a new one.' });
  }
  const newHash = bcrypt.hashSync(newPassword, 10);
  await db.prepare("UPDATE admin_users SET password_hash = ?, reset_token_hash = NULL, reset_token_expires_at = NULL WHERE id = ?").run(newHash, admin.id);
  await audit(admin.company_id, 'admin', admin.id, 'admin.password_reset_completed', {});
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAdmin, async (req, res) => {
  const admin = await db.prepare('SELECT id, company_id, email, role, created_at, last_login_at FROM admin_users WHERE id = ?').get(req.admin.adminId);
  if(!admin) return res.status(404).json({ error: 'Not found' });
  res.json(admin);
});

app.post('/api/admin/me/change-password', requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if(!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  if(typeof newPassword !== 'string' || newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  const admin = await db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.adminId);
  if(!admin || !bcrypt.compareSync(currentPassword, admin.password_hash)){
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  const newHash = bcrypt.hashSync(newPassword, 10);
  await db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(newHash, admin.id);
  await audit(admin.company_id, 'admin', admin.id, 'admin.password_changed', {});
  res.json({ ok: true });
});

// Company admins list/create — a superadmin can create admins for any company (or another
// superadmin); a company admin can only create more admins for their own company.
app.get('/api/companies/:companyId/admins', requireAdmin, scopeToCompany, async (req, res) => {
  res.json(await db.prepare('SELECT id, email, role, is_active, created_at, last_login_at FROM admin_users WHERE company_id = ? ORDER BY id').all(req.params.companyId));
});
app.post('/api/companies/:companyId/admins', requireAdmin, scopeToCompany, async (req, res) => {
  let { email, password } = req.body || {};
  if(!email || !password) return res.status(400).json({ error: 'email and password are required' });
  email = cap(String(email).trim().toLowerCase(), 254);
  if(typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const company = await db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.companyId);
  if(!company) return res.status(404).json({ error: 'Company not found' });
  const passwordHash = bcrypt.hashSync(password, 10);
  try {
    const info = await db.prepare("INSERT INTO admin_users (company_id, email, password_hash, role) VALUES (?,?,?,'company_admin')")
      .run(company.id, email, passwordHash);
    await audit(company.id, 'admin', req.admin.adminId, 'admin.created', { email });
    res.status(201).json(await db.prepare('SELECT id, email, role, is_active, created_at FROM admin_users WHERE id = ?').get(info.lastInsertRowid));
  } catch(e){
    if(String(e.message).includes('UNIQUE') || e.code === '23505') return res.status(409).json({ error: 'That email is already in use.' });
    errorHandler(res, e);
  }
});
app.patch('/api/companies/:companyId/admins/:adminId', requireAdmin, scopeToCompany, async (req, res) => {
  const target = await db.prepare('SELECT * FROM admin_users WHERE id = ? AND company_id = ?').get(req.params.adminId, req.params.companyId);
  if(!target) return res.status(404).json({ error: 'Not found' });
  const { isActive } = req.body || {};
  if(isActive === undefined) return res.status(400).json({ error: 'Nothing to update' });
  if(target.id === req.admin.adminId && !isActive) return res.status(400).json({ error: "You can't deactivate your own account." });
  await db.prepare('UPDATE admin_users SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, target.id);
  await audit(req.params.companyId, 'admin', req.admin.adminId, 'admin.updated', { targetAdminId: target.id, isActive });
  res.json(await db.prepare('SELECT id, email, role, is_active, created_at FROM admin_users WHERE id = ?').get(target.id));
});

// Lets one admin trigger a password-reset email for a colleague (the "force a reset" flow —
// there's still no way to rotate someone else's password directly, which is deliberate: it
// goes through the same emailed-link flow as a self-service forgot-password, so there's one
// reset path, not two).
app.post('/api/companies/:companyId/admins/:adminId/send-reset', requireAdmin, scopeToCompany, forgotPasswordLimiter, async (req, res) => {
  const target = await db.prepare('SELECT * FROM admin_users WHERE id = ? AND company_id = ?').get(req.params.adminId, req.params.companyId);
  if(!target) return res.status(404).json({ error: 'Not found' });
  const result = await issuePasswordReset(target);
  // actor_id here is deliberately the admin the reset is FOR (not whoever clicked the button),
  // consistent with the self-service 'admin.password_reset_requested' event — that's what lets
  // the outstanding-requests view below match a request to its eventual completion by actor_id.
  // Who triggered it lives in the details instead.
  await audit(req.params.companyId, 'admin', target.id, 'admin.password_reset_sent_by_colleague', { triggeredByAdminId: req.admin.adminId });
  res.json(result);
});

// Outstanding (not-yet-completed) password-reset requests for a company, drawn from the
// audit trail: every 'admin.password_reset_requested' / '...sent_by_colleague' event that
// has no later 'admin.password_reset_completed' event for the same target admin. Read-only —
// nothing here can cancel or complete a reset, it's purely visibility into who's mid-flow.
app.get('/api/companies/:companyId/password-reset-requests', requireAdmin, scopeToCompany, async (req, res) => {
  const requested = await db.prepare(`
    SELECT a.id, a.actor_id AS admin_id, a.action, a.created_at, u.email
    FROM audit_log a
    LEFT JOIN admin_users u ON u.id = a.actor_id
    WHERE a.company_id = ? AND a.action IN ('admin.password_reset_requested', 'admin.password_reset_sent_by_colleague')
    ORDER BY a.id DESC
  `).all(req.params.companyId);
  const completed = await db.prepare(`
    SELECT actor_id AS admin_id, MAX(created_at) AS completed_at
    FROM audit_log
    WHERE company_id = ? AND action = 'admin.password_reset_completed'
    GROUP BY actor_id
  `).all(req.params.companyId);
  const completedMap = new Map(completed.map(c => [c.admin_id, c.completed_at]));
  const outstanding = requested.filter(r => {
    const completedAt = completedMap.get(r.admin_id);
    return !completedAt || completedAt < r.created_at;
  });
  res.json(outstanding);
});

app.get('/api/companies', requireSuperadmin, async (req, res) => {
  res.json(await db.prepare('SELECT * FROM companies ORDER BY id').all());
});
app.post('/api/companies', requireSuperadmin, async (req, res) => {
  let { name, slug, logoUrl, colorPrimary, colorSecondary, colorAccent, contactFooter, disclaimerText, currencyCode, locale } = req.body || {};
  if(!name || !slug) return res.status(400).json({ error: 'name and slug are required' });
  if(!/^[a-z0-9-]{2,64}$/.test(String(slug))) return res.status(400).json({ error: 'slug must be lowercase letters, numbers and hyphens only' });
  const hexColor = /^#[0-9a-fA-F]{6}$/;
  if(colorPrimary && !hexColor.test(colorPrimary)) return res.status(400).json({ error: 'colorPrimary must be a hex color like #7c2434' });
  if(colorSecondary && !hexColor.test(colorSecondary)) return res.status(400).json({ error: 'colorSecondary must be a hex color' });
  if(colorAccent && !hexColor.test(colorAccent)) return res.status(400).json({ error: 'colorAccent must be a hex color' });
  if(currencyCode && !/^[A-Z]{3}$/.test(String(currencyCode))) return res.status(400).json({ error: 'currencyCode must be a 3-letter ISO 4217 code like KES' });
  if(locale && !/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(String(locale))) return res.status(400).json({ error: 'locale must be a valid BCP-47 tag like en-KE' });
  name = cap(name, 200); logoUrl = cap(logoUrl, 500); contactFooter = cap(contactFooter, 500); disclaimerText = cap(disclaimerText, 4000);
  try {
    const info = await db.prepare(`
      INSERT INTO companies (name, slug, logo_url, color_primary, color_secondary, color_accent, contact_footer, disclaimer_text, currency_code, locale)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(name, slug, logoUrl || null, colorPrimary || '#7c2434', colorSecondary || '#4c1520', colorAccent || '#b8863a', contactFooter || null, disclaimerText || null, currencyCode || 'KES', locale || 'en-KE');
    await audit(info.lastInsertRowid, 'admin', req.admin.adminId, 'company.created', { name, slug });
    res.status(201).json(await db.prepare('SELECT * FROM companies WHERE id = ?').get(info.lastInsertRowid));
  } catch(e){
    if(String(e.message).includes('UNIQUE') || e.code === '23505') return res.status(409).json({ error: 'slug already in use' });
    errorHandler(res, e);
  }
});
app.get('/api/companies/:companyId', requireAdmin, scopeToCompany, async (req, res) => {
  const company = await db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.companyId);
  if(!company) return res.status(404).json({ error: 'Not found' });
  res.json(company);
});
app.patch('/api/companies/:companyId', requireAdmin, scopeToCompany, async (req, res) => {
  const body = req.body || {};
  const keyMap = { name:'name', logoUrl:'logo_url', colorPrimary:'color_primary', colorSecondary:'color_secondary', colorAccent:'color_accent', contactFooter:'contact_footer', disclaimerText:'disclaimer_text', isActive:'is_active', currencyCode:'currency_code', locale:'locale' };
  const hexColor = /^#[0-9a-fA-F]{6}$/;
  if(body.colorPrimary && !hexColor.test(body.colorPrimary)) return res.status(400).json({ error: 'colorPrimary must be a hex color' });
  if(body.colorSecondary && !hexColor.test(body.colorSecondary)) return res.status(400).json({ error: 'colorSecondary must be a hex color' });
  if(body.colorAccent && !hexColor.test(body.colorAccent)) return res.status(400).json({ error: 'colorAccent must be a hex color' });
  if(body.currencyCode && !/^[A-Z]{3}$/.test(String(body.currencyCode))) return res.status(400).json({ error: 'currencyCode must be a 3-letter ISO 4217 code like KES' });
  if(body.locale && !/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(String(body.locale))) return res.status(400).json({ error: 'locale must be a valid BCP-47 tag like en-KE' });
  const updates = []; const values = [];
  for(const [camelKey, snakeKey] of Object.entries(keyMap)){
    if(body[camelKey] !== undefined){ updates.push(`${snakeKey} = ?`); values.push(body[camelKey]); }
  }
  if(updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  values.push(req.params.companyId);
  await db.prepare(`UPDATE companies SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  await audit(req.params.companyId, 'admin', req.admin.adminId, 'company.updated', body);
  res.json(await db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.companyId));
});
app.get('/api/public/companies/by-slug/:slug', async (req, res) => {
  const company = await db.prepare('SELECT id, name, slug, logo_url, color_primary, color_secondary, color_accent, contact_footer, disclaimer_text, currency_code, locale FROM companies WHERE slug = ? AND is_active = 1').get(req.params.slug);
  if(!company) return res.status(404).json({ error: 'Not found' });
  res.json(company);
});
app.get('/api/public/companies/:companyId', async (req, res) => {
  const company = await db.prepare('SELECT id, name, slug, logo_url, color_primary, color_secondary, color_accent, contact_footer, disclaimer_text, currency_code, locale FROM companies WHERE id = ? AND is_active = 1').get(req.params.companyId);
  if(!company) return res.status(404).json({ error: 'Not found' });
  res.json(company);
});

app.get('/api/companies/:companyId/product-lines', requireAdmin, scopeToCompany, async (req, res) => {
  res.json(await db.prepare('SELECT * FROM product_lines WHERE company_id = ? ORDER BY id').all(req.params.companyId));
});
app.post('/api/companies/:companyId/product-lines', requireAdmin, scopeToCompany, async (req, res) => {
  let { engineType, displayName } = req.body || {};
  if(!['fanaka','faida','smartsave'].includes(engineType)) return res.status(400).json({ error: 'engineType must be fanaka, faida, or smartsave' });
  if(!displayName) return res.status(400).json({ error: 'displayName is required' });
  displayName = cap(displayName, 150);
  const info = await db.prepare('INSERT INTO product_lines (company_id, engine_type, display_name) VALUES (?,?,?)')
    .run(req.params.companyId, engineType, displayName);
  await audit(req.params.companyId, 'admin', req.admin.adminId, 'product_line.created', { engineType, displayName });
  res.status(201).json(await db.prepare('SELECT * FROM product_lines WHERE id = ?').get(info.lastInsertRowid));
});
app.get('/api/public/companies/:companyId/product-lines', async (req, res) => {
  const lines = await db.prepare('SELECT id, engine_type, display_name FROM product_lines WHERE company_id = ? AND is_active = 1').all(req.params.companyId);
  res.json(lines);
});

// Stage 3 "structure scanner": parses an uploaded .xlsx/.xlsm workbook, auto-extracts a flat
// rate table where it can confidently identify one, and returns an honest preview of every
// sheet plus specific warnings about what still needs a human's judgment. See
// backend/workbookScanner.js for exactly what it will and won't guess at. Never writes
// anything to the database itself — the admin reviews/edits the result, then uploads it
// through the normal /versions endpoint, which still requires /validate before /activate.
app.post('/api/product-lines/:lineId/scan-workbook', requireAdmin, upload.single('workbook'), async (req, res) => {
  const line = await db.prepare('SELECT * FROM product_lines WHERE id = ?').get(req.params.lineId);
  if(!line) return res.status(404).json({ error: 'Product line not found' });
  if(req.admin.role !== 'superadmin' && req.admin.companyId !== line.company_id){
    return res.status(403).json({ error: 'Not authorized for this product line' });
  }
  if(!req.file) return res.status(400).json({ error: 'No workbook file uploaded (expected multipart field "workbook").' });
  try {
    const result = scanWorkbook(req.file.buffer);
    await audit(line.company_id, 'admin', req.admin.adminId, 'product_version.workbook_scanned', { lineId: line.id, filename: req.file.originalname, extractedRows: result.extracted ? result.extracted.rows.length : 0 });
    res.json(Object.assign({ sourceFilename: req.file.originalname }, result));
  } catch(e){
    res.status(400).json({ error: 'Could not read that file as a spreadsheet: ' + (e.message || String(e)) });
  }
});

app.post('/api/product-lines/:lineId/versions', requireAdmin, async (req, res) => {
  const line = await db.prepare('SELECT * FROM product_lines WHERE id = ?').get(req.params.lineId);
  if(!line) return res.status(404).json({ error: 'Product line not found' });
  if(req.admin.role !== 'superadmin' && req.admin.companyId !== line.company_id){
    return res.status(403).json({ error: 'Not authorized for this product line' });
  }
  const { dataJson, sourceFilename, mappingNotes } = req.body || {};
  if(!dataJson) return res.status(400).json({ error: 'dataJson is required' });
  const dataJsonStr = typeof dataJson === 'string' ? dataJson : JSON.stringify(dataJson);
  try { JSON.parse(dataJsonStr); } catch(e){ return res.status(400).json({ error: 'dataJson must be valid JSON' }); }
  const maxVersionRow = await db.prepare('SELECT MAX(version_number) as v FROM product_data_versions WHERE product_line_id = ?').get(line.id);
  const maxVersion = (maxVersionRow && maxVersionRow.v) || 0;
  const info = await db.prepare(`
    INSERT INTO product_data_versions (product_line_id, version_number, source_filename, data_json, mapping_notes, created_by)
    VALUES (?,?,?,?,?,?)
  `).run(line.id, maxVersion + 1, sourceFilename || null, dataJsonStr, mappingNotes || null, req.admin.adminId);
  await audit(line.company_id, 'admin', req.admin.adminId, 'product_version.uploaded', { lineId: line.id, versionNumber: maxVersion + 1 });
  res.status(201).json(await db.prepare('SELECT id, product_line_id, version_number, source_filename, validated, activated_at, created_at FROM product_data_versions WHERE id = ?').get(info.lastInsertRowid));
});
app.get('/api/product-lines/:lineId/versions', requireAdmin, async (req, res) => {
  res.json(await db.prepare('SELECT id, version_number, source_filename, validated, validated_at, activated_at, superseded_at, created_at FROM product_data_versions WHERE product_line_id = ? ORDER BY version_number DESC').all(req.params.lineId));
});
app.post('/api/product-lines/:lineId/versions/:versionId/validate', requireAdmin, async (req, res) => {
  const version = await db.prepare('SELECT * FROM product_data_versions WHERE id = ? AND product_line_id = ?').get(req.params.versionId, req.params.lineId);
  if(!version) return res.status(404).json({ error: 'Version not found' });
  const line = await db.prepare('SELECT * FROM product_lines WHERE id = ?').get(version.product_line_id);
  const { scenarios } = req.body || {};
  if(!Array.isArray(scenarios) || scenarios.length === 0){
    return res.status(400).json({ error: 'At least one reference scenario is required to validate a version.' });
  }
  const data = JSON.parse(version.data_json);
  const results = scenarios.map((scenario, i) => {
    try {
      const actual = compute(line.engine_type, data, scenario.input);
      const tolerance = scenario.tolerance || 0;
      const mismatches = [];
      function flatGet(obj, keyPath){ return keyPath.split('.').reduce((o,k) => (o == null ? undefined : o[k]), obj); }
      for(const [key, expectedVal] of Object.entries(scenario.expected || {})){
        const actualVal = flatGet(actual, key);
        const diff = Math.abs(Math.round(Number(actualVal)) - Math.round(Number(expectedVal)));
        if(!(diff <= tolerance)) mismatches.push({ key, expected: expectedVal, actual: actualVal });
      }
      return { index: i, pass: mismatches.length === 0, mismatches, actual };
    } catch(e){
      return { index: i, pass: false, error: e.message || String(e) };
    }
  });
  const allPass = results.every(r => r.pass);
  await db.prepare("UPDATE product_data_versions SET validated = ?, validated_by = ?, validated_at = datetime('now'), validation_result_json = ? WHERE id = ?")
    .run(allPass ? 1 : 0, req.admin.adminId, JSON.stringify(results), version.id);
  await audit(line.company_id, 'admin', req.admin.adminId, 'product_version.validated', { lineId: line.id, versionId: version.id, allPass });
  res.json({ validated: allPass, results });
});
app.post('/api/product-lines/:lineId/versions/:versionId/activate', requireAdmin, async (req, res) => {
  const version = await db.prepare('SELECT * FROM product_data_versions WHERE id = ? AND product_line_id = ?').get(req.params.versionId, req.params.lineId);
  if(!version) return res.status(404).json({ error: 'Version not found' });
  if(!version.validated){
    return res.status(422).json({ error: 'This version has not passed validation yet. Run /validate with reference scenarios first.' });
  }
  const line = await db.prepare('SELECT * FROM product_lines WHERE id = ?').get(version.product_line_id);
  if(req.admin.role !== 'superadmin' && req.admin.companyId !== line.company_id){
    return res.status(403).json({ error: 'Not authorized for this product line' });
  }
  // One atomic transaction: supersede whatever was active, activate this version, flip the
  // line live. db.transaction() is implemented per-driver in backend/db/index.js — on SQLite
  // it's a plain BEGIN/COMMIT/ROLLBACK (node:sqlite has no .transaction() helper); on Postgres
  // it checks out a single dedicated connection for the whole callback so the three updates
  // really are atomic against a connection pool, not just sequential.
  await db.transaction(async () => {
    await db.prepare("UPDATE product_data_versions SET superseded_at = datetime('now') WHERE product_line_id = ? AND activated_at IS NOT NULL AND superseded_at IS NULL").run(line.id);
    await db.prepare("UPDATE product_data_versions SET activated_by = ?, activated_at = datetime('now') WHERE id = ?").run(req.admin.adminId, version.id);
    await db.prepare('UPDATE product_lines SET is_active = 1 WHERE id = ?').run(line.id);
  });
  await audit(line.company_id, 'admin', req.admin.adminId, 'product_version.activated', { lineId: line.id, versionId: version.id });
  res.json({ activated: true, lineId: line.id, versionId: version.id });
});

// LEGACY: registers an agent record with no phone verification at all — kept only so an
// already-deployed standalone app that calls this directly doesn't break. New integrations
// should use request-otp + verify-otp below, which is the real, verified flow.
app.post('/api/companies/:companyId/agents', agentRegisterLimiter, async (req, res) => {
  let { name, phone, acceptedTerms } = req.body || {};
  name = cap(name, 120);
  const normalizedPhone = UtilsEngine.normalizeKenyanPhone(phone);
  if(!name || !normalizedPhone) return res.status(400).json({ error: 'A valid name and Kenyan phone number are required.' });
  if(!acceptedTerms) return res.status(400).json({ error: 'Terms of use must be accepted.' });
  const company = await db.prepare('SELECT * FROM companies WHERE id = ? AND is_active = 1').get(req.params.companyId);
  if(!company) return res.status(404).json({ error: 'Company not found' });
  const existing = await db.prepare('SELECT * FROM agents WHERE company_id = ? AND phone = ?').get(company.id, normalizedPhone);
  if(existing) return res.json(existing);
  const info = await db.prepare("INSERT INTO agents (company_id, name, phone, accepted_terms_at) VALUES (?,?,?,datetime('now'))").run(company.id, name, normalizedPhone);
  await audit(company.id, 'agent', info.lastInsertRowid, 'agent.registered', { name, phone: normalizedPhone });
  res.status(201).json(await db.prepare('SELECT * FROM agents WHERE id = ?').get(info.lastInsertRowid));
});

function generateOtpCode(){
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits, never leading-zero-ambiguous
}

app.post('/api/companies/:companyId/agents/request-otp', otpRequestLimiter, async (req, res) => {
  try {
    let { name, phone } = req.body || {};
    name = cap(name, 120);
    const normalizedPhone = UtilsEngine.normalizeKenyanPhone(phone);
    if(!name || !normalizedPhone) return res.status(400).json({ error: 'A valid name and Kenyan phone number are required.' });
    const company = await db.prepare('SELECT * FROM companies WHERE id = ? AND is_active = 1').get(req.params.companyId);
    if(!company) return res.status(404).json({ error: 'Company not found' });

    let agent = await db.prepare('SELECT * FROM agents WHERE company_id = ? AND phone = ?').get(company.id, normalizedPhone);
    const code = generateOtpCode();
    const codeHash = bcrypt.hashSync(code, 10);

    if(agent){
      await db.prepare("UPDATE agents SET name = ?, otp_code_hash = ?, otp_expires_at = datetime('now', '+10 minutes'), otp_attempts = 0, otp_last_sent_at = datetime('now') WHERE id = ?")
        .run(name, codeHash, agent.id);
    } else {
      const info = await db.prepare("INSERT INTO agents (company_id, name, phone, otp_code_hash, otp_expires_at, otp_last_sent_at) VALUES (?,?,?,?,datetime('now','+10 minutes'),datetime('now'))")
        .run(company.id, name, normalizedPhone, codeHash);
      agent = await db.prepare('SELECT * FROM agents WHERE id = ?').get(info.lastInsertRowid);
    }

    const message = `Your Plan Illustrator verification code is ${code}. It expires in 10 minutes. Do not share this code.`;
    let sendResult;
    try {
      sendResult = await sendSms(company.id, normalizedPhone, message);
    } catch(smsErr){
      return res.status(502).json({ error: 'Could not send the verification code. Please try again shortly.', detail: smsErr.message });
    }
    await audit(company.id, 'agent', agent.id, 'agent.otp_requested', { phone: normalizedPhone, provider: sendResult.provider });

    const response = { sent: true, provider: sendResult.provider, expiresInSeconds: 600 };
    // The code is only ever handed back here in 'console' mode — the local, network-free dev
    // substitute. In any real provider mode it is sent exclusively to the phone.
    if(currentProvider() === 'console') response.devCode = code;
    res.json(response);
  } catch(e){ errorHandler(res, e); }
});

app.post('/api/companies/:companyId/agents/verify-otp', otpVerifyLimiter, async (req, res) => {
  const { phone, code, acceptedTerms } = req.body || {};
  const normalizedPhone = UtilsEngine.normalizeKenyanPhone(phone);
  if(!normalizedPhone || !code) return res.status(400).json({ error: 'Phone and code are required.' });
  if(!acceptedTerms) return res.status(400).json({ error: 'Terms of use must be accepted.' });
  const company = await db.prepare('SELECT * FROM companies WHERE id = ? AND is_active = 1').get(req.params.companyId);
  if(!company) return res.status(404).json({ error: 'Company not found' });
  const agent = await db.prepare('SELECT * FROM agents WHERE company_id = ? AND phone = ?').get(company.id, normalizedPhone);
  if(!agent || !agent.otp_code_hash) return res.status(400).json({ error: 'No pending verification code for this number. Request a new one.' });
  if(agent.otp_attempts >= 5){
    return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' });
  }
  const expired = !agent.otp_expires_at || new Date(agent.otp_expires_at.replace(' ', 'T') + 'Z').getTime() < Date.now();
  if(expired){
    return res.status(400).json({ error: 'This code has expired. Request a new one.' });
  }
  if(!bcrypt.compareSync(String(code), agent.otp_code_hash)){
    await db.prepare('UPDATE agents SET otp_attempts = otp_attempts + 1 WHERE id = ?').run(agent.id);
    await audit(company.id, 'agent', agent.id, 'agent.otp_failed', {});
    return res.status(401).json({ error: 'Incorrect code.' });
  }
  await db.prepare("UPDATE agents SET verified = 1, accepted_terms_at = datetime('now'), otp_code_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = ?")
    .run(agent.id);
  await audit(company.id, 'agent', agent.id, 'agent.verified', { phone: normalizedPhone });
  const updated = await db.prepare('SELECT * FROM agents WHERE id = ?').get(agent.id);
  const token = signToken({ type: 'agent', agentId: agent.id, companyId: company.id, phone: normalizedPhone });
  res.json({ verified: true, token, agent: updated });
});

app.get('/api/companies/:companyId/sms-outbox', requireAdmin, scopeToCompany, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  res.json(await db.prepare('SELECT id, phone, message, provider, status, error, created_at FROM sms_outbox WHERE company_id = ? ORDER BY id DESC LIMIT ?').all(req.params.companyId, limit));
});

app.get('/api/companies/:companyId/agents', requireAdmin, scopeToCompany, async (req, res) => {
  res.json(await db.prepare('SELECT id, name, phone, verified, accepted_terms_at, created_at FROM agents WHERE company_id = ? ORDER BY id DESC').all(req.params.companyId));
});

app.get('/api/companies/:companyId/illustrations', requireAdmin, scopeToCompany, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  res.json(await db.prepare('SELECT id, agent_id, product_line_id, client_name, created_at FROM illustrations WHERE company_id = ? ORDER BY id DESC LIMIT ?').all(req.params.companyId, limit));
});

app.post('/api/companies/:companyId/product-lines/:lineId/compute', async (req, res) => {
  try {
    const line = await db.prepare('SELECT * FROM product_lines WHERE id = ? AND company_id = ? AND is_active = 1').get(req.params.lineId, req.params.companyId);
    if(!line) throw { status: 404, message: 'Active product line not found' };
    const version = await db.prepare('SELECT * FROM product_data_versions WHERE product_line_id = ? AND activated_at IS NOT NULL AND superseded_at IS NULL').get(line.id);
    if(!version) throw { status: 422, message: 'No active data version for this product line' };
    const data = JSON.parse(version.data_json);
    const result = compute(line.engine_type, data, req.body.input || {});
    const { agentId } = req.body;
    const clientName = cap(req.body.clientName, 200);
    await db.prepare(`
      INSERT INTO illustrations (company_id, agent_id, product_line_id, product_data_version_id, client_name, input_json, result_json)
      VALUES (?,?,?,?,?,?,?)
    `).run(req.params.companyId, agentId || null, line.id, version.id, clientName || null, JSON.stringify(req.body.input || {}), JSON.stringify(result));
    res.json(result);
  } catch(e){ errorHandler(res, e); }
});

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Serve the admin console and the standalone agent app from the same server, so a single
// deployment covers both. Static files are served last so no /api/* route is ever shadowed.
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'admin-panel.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, '..', 'plan-illustrator.html')));
app.use(express.static(path.join(__dirname, '..'), { index: false, dotfiles: 'ignore' }));

const PORT = process.env.PORT || 3001;
async function start(){
  // Safe to call on every boot against either driver: every statement in the schema files is
  // CREATE TABLE/INDEX IF NOT EXISTS, and the migrate step only adds a column if it's missing.
  await initSchema();
  app.listen(PORT, () => console.log(`Plan Illustrator API listening on :${PORT}`));
}
if(require.main === module){
  start().catch(e => { console.error('Failed to start:', e); process.exit(1); });
}
module.exports = app;
