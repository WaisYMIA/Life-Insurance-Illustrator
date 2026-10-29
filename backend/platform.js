/**
 * Platform features for agents and the company:
 *   settings · licensing & quiz · applications (client details, beneficiaries, documents, e-signature) ·
 *   M-Pesa / manual premium collection · policies & renewals · complaints · suitability records ·
 *   company-defined products · data retention, client data export / erasure.
 * Everything is company-scoped. Agents use requireAgent; the admin panel uses requireAdmin + scopeToCompany.
 */
'use strict';
const crypto = require('crypto');
const UtilsEngine = require('../engines/utils-engine.js');
const custom = require('../custom-products.js');
const cfgMod = require('./config');
const events = require('./events');
const quizBank = require('./quizbank');
const { JWT_SECRET } = require('./auth');
const { parseCsv, toCsv, utcNow, addDays, addMonths, todayStr } = require('./util');

const cap = (s, n) => (typeof s === 'string' ? s.slice(0, n) : s);
const bad = (m, status) => ({ status: status || 400, message: m });
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s + 'T00:00:00Z'));
function cleanEmail(v){ v = typeof v === 'string' ? v.trim().toLowerCase().slice(0, 160) : ''; if(!v) return null; return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : false; }
const FREQ_N = { monthly: 12, quarterly: 4, semiannual: 2, annual: 1 };
const APP_STATUSES = ['draft', 'submitted', 'under_review', 'info_needed', 'approved', 'issued', 'declined'];
const POLICY_STATUSES = ['active', 'lapsed', 'matured', 'surrendered', 'cancelled', 'paid_up'];
const COMPLAINT_STATUSES = ['open', 'acknowledged', 'investigating', 'resolved', 'escalated', 'closed'];
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9\-_]{5,39}$/;
const age = dob => { const d = new Date(dob + 'T00:00:00Z'), n = new Date(); let a = n.getUTCFullYear() - d.getUTCFullYear(); const m = n.getUTCMonth() - d.getUTCMonth(); if(m < 0 || (m === 0 && n.getUTCDate() < d.getUTCDate())) a--; return a; };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
const jparse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch(e){ return d; } };

// ---- M-Pesa (Safaricom Daraja) — built, switched off until an admin saves credentials and enables it. ----
let fetchImpl = (...a) => fetch(...a);
function callbackToken(companyId){ return crypto.createHmac('sha256', JWT_SECRET).update('mpesa|' + companyId).digest('hex').slice(0, 32); }
async function mpesaStk(cfg, companyId, p){
  const host = cfg.payments.env === 'live' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
  const key = cfgMod.secretOf(cfg, 'payments', 'consumerKey'), secret = cfgMod.secretOf(cfg, 'payments', 'consumerSecret'), pass = cfgMod.secretOf(cfg, 'payments', 'passkey');
  if(!key || !secret || !pass) throw new Error('M-Pesa credentials are incomplete.');
  const tr = await fetchImpl(host + '/oauth/v1/generate?grant_type=client_credentials', { headers: { Authorization: 'Basic ' + Buffer.from(key + ':' + secret).toString('base64') } });
  if(!tr.ok) throw new Error('M-Pesa sign-in failed (' + tr.status + ')');
  const token = (await tr.json()).access_token; if(!token) throw new Error('M-Pesa sign-in returned no token');
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const body = { BusinessShortCode: cfg.payments.shortcode, Password: Buffer.from(cfg.payments.shortcode + pass + ts).toString('base64'), Timestamp: ts, TransactionType: cfg.payments.transactionType, Amount: Math.round(p.amount), PartyA: p.phone.replace(/^0/, '254'), PartyB: cfg.payments.shortcode, PhoneNumber: p.phone.replace(/^0/, '254'), CallBackURL: cfg.payments.callbackBase + '/api/mpesa/callback/' + companyId + '/' + callbackToken(companyId), AccountReference: String(p.accountRef).slice(0, 12), TransactionDesc: String(p.desc || 'Premium').slice(0, 13) };
  const r = await fetchImpl(host + '/mpesa/stkpush/v1/processrequest', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if(!r.ok || String(j.ResponseCode) !== '0') throw new Error(j.errorMessage || j.ResponseDescription || ('M-Pesa request failed (' + r.status + ')'));
  return { checkoutId: j.CheckoutRequestID, merchantId: j.MerchantRequestID };
}

module.exports = function registerPlatform(app, deps){
  const { db, requireAdmin, requireAgent, scopeToCompany, audit, errorHandler, sendEmail } = deps;
  const sameCompany = (req, res) => { if(String(req.agent.companyId) !== String(req.params.companyId)){ res.status(403).json({ error: 'Wrong company.' }); return false; } return true; };
  const adminOnly = [requireAdmin, scopeToCompany];
  const C = req => req.params.companyId;
  const jsonCsv = (res, name, csv) => { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`); res.send(csv); };

  async function me(req){
    const a = await db.prepare('SELECT * FROM agents WHERE id = ? AND company_id = ?').get(req.agent.agentId, req.params.companyId);
    if(!a || !a.is_active) throw bad('Your access has been withdrawn. Please contact your administrator.', 403);
    return a;
  }
  async function notify(cid, subject, body){
    try { const cfg = await cfgMod.getConfig(cid); const to = cfg.leadsEmail || process.env.LEADS_EMAIL || ''; if(!to) return 'not_configured'; await sendEmail(cid, to, subject, body); return 'sent'; }
    catch(e){ return 'failed'; }
  }
  async function twoAdmins(cid){ return (await db.prepare('SELECT id FROM admin_users WHERE (company_id = ? OR role = ?) AND is_active = 1').all(cid, 'superadmin')).length > 1; }

  // ================= Settings =================
  app.get('/api/companies/:companyId/config', ...adminOnly, async (req, res) => {
    try { res.json({ config: cfgMod.publicConfig(await cfgMod.getConfig(C(req))), docKinds: cfgMod.DOC_LABELS }); } catch(e){ errorHandler(res, e); }
  });
  app.put('/api/companies/:companyId/config', ...adminOnly, async (req, res) => {
    try {
      const cur = await cfgMod.getConfig(C(req)); const next = cfgMod.applyPatch(cur, req.body);
      await cfgMod.saveConfig(C(req), next);
      await audit(C(req), 'admin', req.admin.adminId, 'config.updated', { keys: Object.keys(req.body || {}) });
      res.json({ config: cfgMod.publicConfig(next) });
    } catch(e){ errorHandler(res, e); }
  });

  // ================= Licensing & quiz =================
  function licenceState(a, cfg){
    if(!a.licence_no) return 'missing';
    if(!a.licence_expiry) return 'valid';
    const d = daysBetween(todayStr(), a.licence_expiry);
    return d < 0 ? 'expired' : d <= cfg.licensing.warnDays ? 'expiring' : 'valid';
  }
  async function quizStatus(agentId, cfg){
    const last = await db.prepare('SELECT * FROM quiz_attempts WHERE agent_id = ? AND passed = 1 ORDER BY id DESC').get(agentId);
    if(!last) return { passed: false, validUntil: null };
    const until = new Date(new Date(last.created_at.replace(' ', 'T') + 'Z').getTime() + cfg.licensing.quizValidDays * 86400000).toISOString().slice(0, 10);
    return { passed: until >= todayStr(), validUntil: until, score: last.score, total: last.total };
  }
  async function sellStatus(a, cfg){
    const reasons = []; const ls = licenceState(a, cfg), qs = await quizStatus(a.id, cfg);
    if(cfg.licensing.required){
      if(ls === 'missing') reasons.push('Add your IRA licence number and expiry date.');
      if(ls === 'expired' && cfg.licensing.blockExpired) reasons.push('Your licence has expired. Renew it and update the date.');
      if(cfg.licensing.quizRequired && !qs.passed) reasons.push('Pass the agent knowledge quiz.');
    }
    return { canSell: reasons.length === 0, reasons, licence: { no: a.licence_no || '', expiry: a.licence_expiry || '', state: ls }, quiz: qs, region: a.region || '' };
  }
  app.get('/api/companies/:companyId/agents/me/status', requireAgent, async (req, res) => {
    try {
      if(!sameCompany(req, res)) return; const a = await me(req); const cfg = await cfgMod.getConfig(C(req));
      const st = await sellStatus(a, cfg); const co = await db.prepare('SELECT app_name, support_phone, support_email, website FROM companies WHERE id = ?').get(C(req));
      const pol = await db.prepare("SELECT COUNT(*) AS n FROM policies WHERE company_id = ? AND agent_id = ? AND status = 'active' AND next_due_date IS NOT NULL AND next_due_date <= ?").get(C(req), a.id, addDays(todayStr(), 14));
      const cmp = await db.prepare("SELECT COUNT(*) AS n FROM applications WHERE company_id = ? AND agent_id = ? AND status = 'info_needed'").get(C(req), a.id);
      res.json(Object.assign(st, {
        features: cfg.features, docsRequired: cfg.docsRequired, docLabels: cfgMod.DOC_LABELS, declarationText: cfg.declarationText, consentText: cfg.consentText,
        payments: { mode: cfg.payments.mpesaEnabled && cfg.payments.mode === 'mpesa' ? 'mpesa' : 'manual', instructions: cfg.payments.manualInstructions, shortcode: cfg.payments.shortcode },
        company: co || {}, renewalsDue: pol ? Number(pol.n) : 0, applicationsNeedInfo: cmp ? Number(cmp.n) : 0
      }));
    } catch(e){ errorHandler(res, e); }
  });
  app.put('/api/companies/:companyId/agents/me/licence', requireAgent, async (req, res) => {
    try {
      if(!sameCompany(req, res)) return; const a = await me(req); const b = req.body || {};
      const no = cap(typeof b.licenceNo === 'string' ? b.licenceNo.trim().toUpperCase() : '', 40), exp = b.licenceExpiry || '';
      if(!/^[A-Z0-9][A-Z0-9 \-\/]{2,39}$/.test(no)) throw bad('Enter your licence number (letters, numbers, dashes).');
      if(!isDate(exp)) throw bad('Enter the licence expiry date.');
      await db.prepare('UPDATE agents SET licence_no = ?, licence_expiry = ? WHERE id = ?').run(no, exp, a.id);
      await audit(C(req), 'agent', a.id, 'agent.licence_updated', { expiry: exp });
      res.json(await sellStatus(Object.assign({}, a, { licence_no: no, licence_expiry: exp }), await cfgMod.getConfig(C(req))));
    } catch(e){ errorHandler(res, e); }
  });
  app.patch('/api/companies/:companyId/agents/:agentId/licence', ...adminOnly, async (req, res) => {
    try {
      const b = req.body || {}; const a = await db.prepare('SELECT id FROM agents WHERE id = ? AND company_id = ?').get(req.params.agentId, C(req));
      if(!a) throw bad('Agent not found.', 404);
      const no = cap(typeof b.licenceNo === 'string' ? b.licenceNo.trim().toUpperCase() : '', 40) || null, exp = b.licenceExpiry || null, region = cap(typeof b.region === 'string' ? b.region.trim() : '', 60) || null;
      if(exp && !isDate(exp)) throw bad('The expiry date must look like 2027-06-30.');
      await db.prepare('UPDATE agents SET licence_no = ?, licence_expiry = ?, region = ? WHERE id = ?').run(no, exp, region, a.id);
      await audit(C(req), 'admin', req.admin.adminId, 'agent.licence_set', { agentId: a.id });
      res.json({ ok: true });
    } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/licensing', ...adminOnly, async (req, res) => {
    try {
      const cfg = await cfgMod.getConfig(C(req));
      const agents = await db.prepare('SELECT id, name, phone, agency_code, group_name, region, licence_no, licence_expiry, is_active FROM agents WHERE company_id = ? AND verified = 1 ORDER BY name').all(C(req));
      const rows = [];
      for(const a of agents){ const st = await sellStatus(a, cfg); rows.push({ agentId: a.id, name: a.name, phone: a.phone, agencyCode: a.agency_code || '', group: a.group_name || '', region: a.region || '', licenceNo: a.licence_no || '', licenceExpiry: a.licence_expiry || '', licenceState: st.licence.state, quizPassed: st.quiz.passed, quizValidUntil: st.quiz.validUntil || '', canSell: st.canSell, active: !!a.is_active }); }
      if(req.query.format === 'csv') return jsonCsv(res, 'agent-licensing', toCsv(rows, [['name', 'Agent'], ['phone', 'Phone'], ['agencyCode', 'Agency code'], ['group', 'Group'], ['region', 'Region'], ['licenceNo', 'Licence no'], ['licenceExpiry', 'Licence expiry'], ['licenceState', 'Licence status'], ['quizPassed', 'Quiz passed'], ['quizValidUntil', 'Quiz valid until'], ['canSell', 'May sell']].map(([key, label]) => ({ key, label }))));
      res.json({ settings: cfg.licensing, rows });
    } catch(e){ errorHandler(res, e); }
  });
  function quizToken(ids, aid){ const p = JSON.stringify({ ids, aid, t: Date.now() }); const mac = crypto.createHmac('sha256', JWT_SECRET).update('quiz|' + p).digest('hex'); return Buffer.from(p).toString('base64url') + '.' + mac; }
  function readQuizToken(tok, aid){
    const [p64, mac] = String(tok || '').split('.'); if(!p64 || !mac) return null;
    const p = Buffer.from(p64, 'base64url').toString(); const exp = crypto.createHmac('sha256', JWT_SECRET).update('quiz|' + p).digest('hex');
    if(mac.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(exp))) return null;
    const o = JSON.parse(p); if(o.aid !== aid || Date.now() - o.t > 3600000) return null; return o;
  }
  app.get('/api/companies/:companyId/quiz', requireAgent, async (req, res) => {
    try {
      if(!sameCompany(req, res)) return; const a = await me(req);
      const pick = quizBank.slice().sort(() => Math.random() - 0.5).slice(0, 10);
      res.json({ token: quizToken(pick.map(q => q.id), a.id), questions: pick.map(q => ({ id: q.id, q: q.q, o: q.o })) });
    } catch(e){ errorHandler(res, e); }
  });
  app.post('/api/companies/:companyId/quiz/attempts', requireAgent, async (req, res) => {
    try {
      if(!sameCompany(req, res)) return; const a = await me(req); const cfg = await cfgMod.getConfig(C(req));
      const tok = readQuizToken((req.body || {}).token, a.id); if(!tok) throw bad('This quiz has expired. Start it again.');
      const answers = (req.body || {}).answers || {}; let score = 0; const review = [];
      for(const id of tok.ids){ const q = quizBank.find(x => x.id === id); const given = Number(answers[id]); const ok = given === q.a; if(ok) score++; review.push({ id, correct: ok, answer: q.a, explanation: q.e }); }
      const total = tok.ids.length, pct = Math.round(score / total * 100), passed = pct >= cfg.licensing.passMark;
      await db.prepare('INSERT INTO quiz_attempts (company_id, agent_id, score, total, passed, quiz_version) VALUES (?,?,?,?,?,?)').run(C(req), a.id, score, total, passed ? 1 : 0, 'v1');
      await audit(C(req), 'agent', a.id, 'quiz.attempt', { score, total, passed });
      res.json({ score, total, percent: pct, passMark: cfg.licensing.passMark, passed, review });
    } catch(e){ errorHandler(res, e); }
  });

  // ================= Applications =================
  function validateClient(c, cfg){
    const e = []; c = c || {};
    const name = String(c.fullName || '').trim(); if(name.length < 3 || name.split(/\s+/).length < 2) e.push('Enter the client\'s full name (at least two names).');
    if(!isDate(c.dob) || age(c.dob) < 18 || age(c.dob) > 90) e.push('The client must be an adult: check the date of birth.');
    const idType = ['national_id', 'passport', 'alien_id'].includes(c.idType) ? c.idType : 'national_id'; const idNo = String(c.idNumber || '').trim();
    if(idType === 'national_id' ? !/^\d{7,9}$/.test(idNo) : !/^[A-Za-z0-9]{6,14}$/.test(idNo)) e.push('The ID / passport number does not look right.');
    const needPin = cfg.docsRequired.includes('kra_pin'); const pin = String(c.kraPin || '').trim().toUpperCase();
    if((needPin || pin) && !/^[AP]\d{9}[A-Z]$/.test(pin)) e.push('The KRA PIN should look like A123456789B.');
    if(!UtilsEngine.normalizeKenyanPhone(c.phone)) e.push('The client\'s phone number is not valid.');
    if(c.email && cleanEmail(c.email) === false) e.push('The client\'s email is not valid.');
    if(String(c.address || '').trim().length < 2) e.push('Enter the client\'s town or county.');
    if(String(c.occupation || '').trim().length < 2) e.push('Enter the client\'s occupation.');
    return e;
  }
  function cleanClient(c){ c = c || {}; return { fullName: cap(String(c.fullName || '').trim(), 120), dob: c.dob || '', gender: ['male', 'female', 'other'].includes(c.gender) ? c.gender : '', idType: ['national_id', 'passport', 'alien_id'].includes(c.idType) ? c.idType : 'national_id', idNumber: cap(String(c.idNumber || '').trim(), 20), kraPin: cap(String(c.kraPin || '').trim().toUpperCase(), 12), phone: UtilsEngine.normalizeKenyanPhone(c.phone) || cap(String(c.phone || ''), 20), email: cleanEmail(c.email) || '', address: cap(String(c.address || '').trim(), 160), occupation: cap(String(c.occupation || '').trim(), 100), employer: cap(String(c.employer || '').trim(), 120), maritalStatus: cap(String(c.maritalStatus || ''), 20) }; }
  function validateBeneficiaries(list){
    const e = []; if(!Array.isArray(list) || !list.length) return ['Add at least one beneficiary.'];
    if(list.length > 6) e.push('At most 6 beneficiaries.');
    let sum = 0;
    list.forEach((b, i) => {
      const n = i + 1; if(String(b.name || '').trim().length < 3) e.push('Beneficiary ' + n + ': enter the full name.');
      if(String(b.relationship || '').trim().length < 2) e.push('Beneficiary ' + n + ': enter the relationship.');
      const sh = Number(b.share); if(!isFinite(sh) || sh <= 0 || sh > 100) e.push('Beneficiary ' + n + ': the share must be above 0 and at most 100.'); else sum += sh;
      if(b.dob && !isDate(b.dob)) e.push('Beneficiary ' + n + ': the date of birth is not valid.');
      if(b.dob && isDate(b.dob) && age(b.dob) < 18 && String(b.trusteeName || '').trim().length < 3) e.push('Beneficiary ' + n + ' is under 18: name a trustee or guardian.');
      if(b.phone && !UtilsEngine.normalizeKenyanPhone(b.phone)) e.push('Beneficiary ' + n + ': the phone number is not valid.');
    });
    if(Math.abs(sum - 100) > 0.01) e.push('The beneficiary shares add up to ' + Math.round(sum * 100) / 100 + '%. They must add up to 100%.');
    return e;
  }
  const cleanBens = list => (Array.isArray(list) ? list : []).slice(0, 6).map(b => ({ name: cap(String(b.name || '').trim(), 120), relationship: cap(String(b.relationship || '').trim(), 40), dob: isDate(b.dob) ? b.dob : '', phone: b.phone ? (UtilsEngine.normalizeKenyanPhone(b.phone) || cap(String(b.phone), 20)) : '', share: Math.round(Number(b.share) * 100) / 100 || 0, trusteeName: cap(String(b.trusteeName || '').trim(), 120), trusteePhone: b.trusteePhone ? (UtilsEngine.normalizeKenyanPhone(b.trusteePhone) || '') : '' }));
  function validatePlan(p){
    const e = []; p = p || {};
    if(!String(p.product || '').trim()) e.push('Choose the product the client is applying for.');
    if(!(Number(p.premium) > 0)) e.push('Enter the premium.');
    if(!FREQ_N[p.frequency]) e.push('Choose how often the client will pay.');
    return e;
  }
  const cleanPlan = p => { p = p || {}; return { product: cap(String(p.product || '').trim(), 120), source: ['illustration', 'custom', 'manual'].includes(p.source) ? p.source : 'manual', pkey: cap(String(p.pkey || ''), 60), ratesVersion: cap(String(p.ratesVersion || ''), 60), premium: Math.round(Number(p.premium) * 100) / 100 || 0, frequency: FREQ_N[p.frequency] ? p.frequency : 'monthly', sumAssured: Number(p.sumAssured) > 0 ? Math.round(Number(p.sumAssured)) : null, term: Number(p.term) > 0 ? Math.round(Number(p.term)) : null, headline: cap(String(p.headline || ''), 200), summary: Array.isArray(p.summary) ? p.summary.slice(0, 14).map(x => ({ l: cap(String(x.l || ''), 80), v: cap(String(x.v || ''), 80) })) : [] }; };
  function validateDeclaration(d){
    const e = []; d = d || {};
    if(typeof d.smoker !== 'boolean') e.push('Answer whether the client smokes.');
    if(typeof d.conditions !== 'boolean') e.push('Answer the health question.');
    else if(d.conditions && String(d.conditionsDetail || '').trim().length < 3) e.push('Give details of the health condition.');
    if(typeof d.otherCover !== 'boolean') e.push('Say whether the client has other life cover.');
    if(d.accepted !== true) e.push('The client must accept the declaration.');
    return e;
  }
  const cleanDecl = d => { d = d || {}; return { smoker: !!d.smoker, conditions: !!d.conditions, conditionsDetail: cap(String(d.conditionsDetail || ''), 600), otherCover: !!d.otherCover, otherCoverDetail: cap(String(d.otherCoverDetail || ''), 300), accepted: d.accepted === true }; };
  function sigOk(sig){
    if(typeof sig !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length > 160000) return false;
    const buf = Buffer.from(sig.split(',')[1], 'base64'); return buf.length > 300 && buf[0] === 0x89 && buf[1] === 0x50;
  }
  const appRef = (req) => { const r = String(req.params.ref || ''); if(!REF_RE.test(r)) throw bad('Invalid application reference.'); return r; };
  async function ownApp(req, ref){
    const a = await db.prepare('SELECT * FROM applications WHERE company_id = ? AND ref = ?').get(C(req), ref);
    if(!a || a.agent_id !== req.agent.agentId) throw bad('Application not found.', 404);
    return a;
  }
  const appOut = (a, extra) => Object.assign({ id: a.id, ref: a.ref, status: a.status, product: a.product, clientName: (jparse(a.client_json, {}).fullName) || '', premium: a.premium_amount, paymentStatus: a.payment_status, policyNo: a.policy_no, adminNote: a.admin_note, submittedAt: a.submitted_at, updatedAt: a.updated_at, createdAt: a.created_at }, extra || {});

  app.post('/api/companies/:companyId/applications', requireAgent, async (req, res) => {
    try {
      if(!sameCompany(req, res)) return; const agent = await me(req); const cfg = await cfgMod.getConfig(C(req)); const b = req.body || {};
      if(!cfg.features.applications) throw bad('Applications are not switched on for this company.', 403);
      const ref = String(b.ref || ''); if(!REF_RE.test(ref)) throw bad('Invalid application reference.');
      const st = await sellStatus(agent, cfg); if(!st.canSell) throw bad(st.reasons[0], 403);
      const plan = cleanPlan(b.plan), cj = JSON.stringify(cleanClient(b.client)), bj = JSON.stringify(cleanBens(b.beneficiaries)), dj = JSON.stringify(cleanDecl(b.declaration));
      const ex = await db.prepare('SELECT * FROM applications WHERE company_id = ? AND ref = ?').get(C(req), ref);
      if(ex){
        if(ex.agent_id !== agent.id) throw bad('That reference is already in use.', 409);
        if(!['draft', 'info_needed'].includes(ex.status)) throw bad('This application has already been sent and can no longer be changed.', 409);
        await db.prepare("UPDATE applications SET client_key = ?, product = ?, plan_json = ?, client_json = ?, beneficiaries_json = ?, declaration_json = ?, premium_amount = ?, updated_at = datetime('now') WHERE id = ?").run(cap(String(b.clientKey || ''), 60) || null, plan.product, JSON.stringify(plan), cj, bj, dj, plan.premium, ex.id);
        return res.json({ id: ex.id, ref, status: ex.status });
      }
      const info = await db.prepare("INSERT INTO applications (company_id, agent_id, ref, client_key, status, product, plan_json, client_json, beneficiaries_json, declaration_json, premium_amount) VALUES (?,?,?,?,'draft',?,?,?,?,?,?)").run(C(req), agent.id, ref, cap(String(b.clientKey || ''), 60) || null, plan.product, JSON.stringify(plan), cj, bj, dj, plan.premium);
      res.status(201).json({ id: info.lastInsertRowid, ref, status: 'draft' });
    } catch(e){ errorHandler(res, e); }
  });
  const MAX_DOC = 1200000;
  app.post('/api/companies/:companyId/applications/:ref/docs', requireAgent, async (req, res) => {
    try {
      if(!sameCompany(req, res)) return; await me(req); const a = await ownApp(req, appRef(req)); const b = req.body || {};
      if(!['draft', 'info_needed'].includes(a.status)) throw bad('This application can no longer take documents.', 409);
      if(!cfgMod.DOC_KINDS.includes(b.kind)) throw bad('Unknown document type.');
      if(typeof b.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(b.data)) throw bad('The document data is not valid.');
      const buf = Buffer.from(b.data, 'base64'); if(buf.length < 200) throw bad('The file looks empty.'); if(buf.length > MAX_DOC) throw bad('The file is too large. Take a smaller photo.');
      const mime = buf[0] === 0xFF && buf[1] === 0xD8 ? 'image/jpeg' : buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png' : buf.slice(0, 4).toString() === '%PDF' ? 'application/pdf' : null;
      if(!mime) throw bad('Only photos (JPG/PNG) and PDF files are accepted.');
      if(b.kind !== 'other') await db.prepare('DELETE FROM application_docs WHERE application_id = ? AND kind = ?').run(a.id, b.kind);
      const n = await db.prepare('SELECT COUNT(*) AS n FROM application_docs WHERE application_id = ?').get(a.id); if(Number(n.n) >= 10) throw bad('At most 10 documents per application.');
      const info = await db.prepare('INSERT INTO application_docs (company_id, application_id, kind, filename, mime, size, data) VALUES (?,?,?,?,?,?,?)').run(C(req), a.id, b.kind, cap(String(b.filename || ''), 120) || null, mime, buf.length, b.data);
      res.status(201).json({ id: info.lastInsertRowid, kind: b.kind, size: buf.length });
    } catch(e){ errorHandler(res, e); }
  });
  app.post('/api/companies/:companyId/applications/:ref/submit', requireAgent, async (req, res) => {
    try {
      if(!sameCompany(req, res)) return; const agent = await me(req); const a = await ownApp(req, appRef(req)); const cfg = await cfgMod.getConfig(C(req)); const b = req.body || {};
      if(!['draft', 'info_needed'].includes(a.status)) throw bad('This application has already been sent.', 409);
      const st = await sellStatus(agent, cfg); if(!st.canSell) throw bad(st.reasons[0], 403);
      const client = jparse(a.client_json, {}), bens = jparse(a.beneficiaries_json, []), decl = jparse(a.declaration_json, {}), plan = jparse(a.plan_json, {});
      const problems = [].concat(validatePlan(plan), validateClient(client, cfg), validateBeneficiaries(bens), validateDeclaration(decl));
      const docs = await db.prepare('SELECT kind FROM application_docs WHERE application_id = ?').all(a.id); const have = new Set(docs.map(d => d.kind));
      cfg.docsRequired.forEach(k => { if(!have.has(k)) problems.push('Missing document: ' + cfgMod.DOC_LABELS[k] + '.'); });
      if(b.consent !== true) problems.push('The client must agree to the data-protection consent.');
      if(!sigOk(b.signature)) problems.push('The client\'s signature is missing.');
      if(problems.length) return res.status(422).json({ error: 'The application is not complete.', problems });
      await db.prepare("UPDATE applications SET status = 'submitted', signature = ?, signed_at = datetime('now'), consent_at = datetime('now'), submitted_at = datetime('now'), admin_note = NULL, updated_at = datetime('now') WHERE id = ?").run(b.signature, a.id);
      await audit(C(req), 'agent', agent.id, 'application.submitted', { ref: a.ref, product: a.product });
      const emailed = await notify(C(req), 'New application ' + a.ref + ' from ' + agent.name, `Agent: ${agent.name} (${agent.agency_code || 'no code'}, ${agent.phone})\nClient: ${client.fullName}\nProduct: ${plan.product}\nPremium: KES ${plan.premium} ${plan.frequency}\nDocuments: ${docs.length}\n\nOpen the admin panel (Applications) to review it.`);
      await events.emit(C(req), 'application.submitted', { ref: a.ref, product: plan.product, premium: plan.premium, frequency: plan.frequency, agentId: agent.id, agencyCode: agent.agency_code || null, clientName: client.fullName });
      res.json({ ref: a.ref, status: 'submitted', emailed });
    } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/applications/mine', requireAgent, async (req, res) => {
    try { if(!sameCompany(req, res)) return; const rows = await db.prepare('SELECT * FROM applications WHERE company_id = ? AND agent_id = ? ORDER BY id DESC LIMIT 100').all(C(req), req.agent.agentId); res.json(rows.map(r => appOut(r))); } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/applications/:ref/mine', requireAgent, async (req, res) => {
    try { if(!sameCompany(req, res)) return; const a = await ownApp(req, appRef(req)); const docs = await db.prepare('SELECT kind FROM application_docs WHERE application_id = ?').all(a.id); res.json(appOut(a, { docs: docs.map(d => d.kind) })); } catch(e){ errorHandler(res, e); }
  });

  // ----- payments -----
  async function paymentFor(a){ return db.prepare('SELECT * FROM payments WHERE application_id = ? ORDER BY id DESC').get(a.id); }
  const payOut = p => p ? { id: p.id, provider: p.provider, status: p.status, amount: p.amount, receipt: p.receipt || '', createdAt: p.created_at } : null;
  app.post('/api/companies/:companyId/applications/:ref/pay', requireAgent, async (req, res) => {
    try {
      if(!sameCompany(req, res)) return; const agent = await me(req); const a = await ownApp(req, appRef(req)); const cfg = await cfgMod.getConfig(C(req)); const b = req.body || {};
      if(a.status === 'draft') throw bad('Send the application first, then collect the premium.', 409);
      if(a.status === 'declined') throw bad('This application was declined.', 409);
      const amount = b.amount != null && b.amount !== '' ? Number(b.amount) : Number(a.premium_amount); if(!(amount >= 1 && amount <= 5000000)) throw bad('Enter an amount between 1 and 5,000,000.');
      const phone = UtilsEngine.normalizeKenyanPhone(b.phone || (jparse(a.client_json, {}).phone)); if(!phone) throw bad('Enter the M-Pesa phone number.');
      const live = cfg.payments.mpesaEnabled && cfg.payments.mode === 'mpesa';
      const recent = await db.prepare("SELECT * FROM payments WHERE application_id = ? AND status = 'pending' AND provider = 'mpesa' ORDER BY id DESC").get(a.id);
      if(live && recent && Date.now() - new Date(recent.created_at.replace(' ', 'T') + 'Z').getTime() < 120000) return res.json({ mode: 'mpesa', payment: payOut(recent), message: 'A payment request was just sent to the client\'s phone. Ask them to enter their M-Pesa PIN.' });
      if(!live){
        const info = await db.prepare("INSERT INTO payments (company_id, application_id, agent_id, phone, amount, provider, status, note) VALUES (?,?,?,?,?,'manual','awaiting',?)").run(C(req), a.id, agent.id, phone, amount, 'Paid by the client through the company channel; confirmed by the office.');
        await audit(C(req), 'agent', agent.id, 'payment.manual_requested', { ref: a.ref, amount });
        const p = await db.prepare('SELECT * FROM payments WHERE id = ?').get(info.lastInsertRowid);
        return res.json({ mode: 'manual', payment: payOut(p), instructions: cfg.payments.manualInstructions || 'Pay through the company\'s official paybill or till and quote the application reference.', shortcode: cfg.payments.shortcode || '', accountRef: a.ref });
      }
      let r; try { r = await mpesaStk(cfg, C(req), { phone, amount, accountRef: a.ref.slice(-12), desc: 'Premium' }); } catch(err){ console.error('[mpesa] stk failed:', err.message); throw bad('Could not send the payment request. Check the number and try again, or use the paybill.', 502); }
      const info = await db.prepare("INSERT INTO payments (company_id, application_id, agent_id, phone, amount, provider, status, checkout_id) VALUES (?,?,?,?,?,'mpesa','pending',?)").run(C(req), a.id, agent.id, phone, amount, r.checkoutId);
      await audit(C(req), 'agent', agent.id, 'payment.stk_sent', { ref: a.ref, amount });
      res.json({ mode: 'mpesa', payment: payOut(await db.prepare('SELECT * FROM payments WHERE id = ?').get(info.lastInsertRowid)), message: 'A payment request was sent to the client\'s phone. Ask them to enter their M-Pesa PIN.' });
    } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/applications/:ref/payment', requireAgent, async (req, res) => {
    try { if(!sameCompany(req, res)) return; const a = await ownApp(req, appRef(req)); res.json({ paymentStatus: a.payment_status, payment: payOut(await paymentFor(a)) }); } catch(e){ errorHandler(res, e); }
  });
  async function markPaid(p, receipt, how){
    await db.prepare("UPDATE payments SET status = 'paid', receipt = ?, updated_at = datetime('now') WHERE id = ?").run(receipt || null, p.id);
    if(p.application_id){ await db.prepare("UPDATE applications SET payment_status = 'paid', updated_at = datetime('now') WHERE id = ?").run(p.application_id); }
    if(p.policy_id){ const pol = await db.prepare('SELECT * FROM policies WHERE id = ?').get(p.policy_id); if(pol && pol.next_due_date){ const n = FREQ_N[pol.frequency] || 12; await db.prepare("UPDATE policies SET next_due_date = ?, status = CASE WHEN status = 'lapsed' THEN 'active' ELSE status END, updated_at = datetime('now') WHERE id = ?").run(addMonths(pol.next_due_date, Math.round(12 / n)), pol.id); } }
    await events.emit(p.company_id, 'payment.received', { paymentId: p.id, applicationId: p.application_id, amount: p.amount, receipt: receipt || null, how });
  }
  // Public callback from Safaricom. The address contains a secret token only the company's own configuration knows.
  app.post('/api/mpesa/callback/:companyId/:token', async (req, res) => {
    try {
      const expect = callbackToken(req.params.companyId), got = String(req.params.token || '');
      if(got.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expect))) return res.status(403).json({ ResultCode: 1, ResultDesc: 'Rejected' });
      const cb = ((req.body || {}).Body || {}).stkCallback || {}; const p = await db.prepare("SELECT * FROM payments WHERE company_id = ? AND checkout_id = ? AND provider = 'mpesa'").get(req.params.companyId, String(cb.CheckoutRequestID || ''));
      if(p && p.status === 'pending'){
        if(Number(cb.ResultCode) === 0){
          const items = (cb.CallbackMetadata && cb.CallbackMetadata.Item) || []; const get = n => (items.find(i => i.Name === n) || {}).Value;
          const paid = Number(get('Amount')); const receipt = String(get('MpesaReceiptNumber') || '').slice(0, 30);
          if(isFinite(paid) && Math.round(paid) < Math.round(p.amount)){ await db.prepare("UPDATE payments SET status = 'partial', receipt = ?, note = ?, updated_at = datetime('now') WHERE id = ?").run(receipt, 'Client paid KES ' + paid + ' of KES ' + p.amount, p.id); }
          else await markPaid(p, receipt, 'mpesa');
        } else await db.prepare("UPDATE payments SET status = 'failed', note = ?, updated_at = datetime('now') WHERE id = ?").run(cap(String(cb.ResultDesc || 'Not completed'), 200), p.id);
      }
      res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    } catch(e){ console.error('[mpesa] callback error:', e.message); res.json({ ResultCode: 0, ResultDesc: 'Accepted' }); }
  });
  app.get('/api/companies/:companyId/payments', ...adminOnly, async (req, res) => {
    try {
      const rows = await db.prepare('SELECT p.*, a.ref AS app_ref, ag.name AS agent_name FROM payments p LEFT JOIN applications a ON a.id = p.application_id LEFT JOIN agents ag ON ag.id = p.agent_id WHERE p.company_id = ? ORDER BY p.id DESC LIMIT 500').all(C(req));
      const out = rows.map(p => ({ id: p.id, ref: p.app_ref || '', agentName: p.agent_name || '', phone: p.phone || '', amount: p.amount, provider: p.provider, status: p.status, receipt: p.receipt || '', note: p.note || '', createdAt: p.created_at }));
      if(req.query.format === 'csv') return jsonCsv(res, 'payments', toCsv(out, [['createdAt', 'Date'], ['ref', 'Application'], ['agentName', 'Agent'], ['phone', 'Phone'], ['amount', 'Amount'], ['provider', 'Provider'], ['status', 'Status'], ['receipt', 'Receipt']].map(([key, label]) => ({ key, label }))));
      res.json(out);
    } catch(e){ errorHandler(res, e); }
  });
  app.patch('/api/companies/:companyId/payments/:id', ...adminOnly, async (req, res) => {
    try {
      const p = await db.prepare('SELECT * FROM payments WHERE id = ? AND company_id = ?').get(req.params.id, C(req)); if(!p) throw bad('Payment not found.', 404);
      const st = (req.body || {}).status; if(!['paid', 'failed'].includes(st)) throw bad('Status must be paid or failed.');
      if(p.status === 'paid') throw bad('This payment is already marked as paid.', 409);
      if(st === 'paid'){ const receipt = cap(String((req.body || {}).receipt || '').trim(), 30); if(!receipt) throw bad('Enter the receipt or reference number.'); await markPaid(p, receipt, 'manual'); }
      else await db.prepare("UPDATE payments SET status = 'failed', updated_at = datetime('now') WHERE id = ?").run(p.id);
      await audit(C(req), 'admin', req.admin.adminId, 'payment.' + st, { paymentId: p.id });
      res.json({ ok: true });
    } catch(e){ errorHandler(res, e); }
  });

  // ----- admin: applications -----
  app.get('/api/companies/:companyId/applications', ...adminOnly, async (req, res) => {
    try {
      const st = APP_STATUSES.includes(req.query.status) ? req.query.status : null;
      const rows = await db.prepare(`SELECT a.*, ag.name AS agent_name, ag.agency_code AS agent_code FROM applications a LEFT JOIN agents ag ON ag.id = a.agent_id WHERE a.company_id = ? AND a.status <> 'draft' ${st ? 'AND a.status = ?' : ''} ORDER BY a.id DESC LIMIT 1000`).all(...(st ? [C(req), st] : [C(req)]));
      const out = rows.map(r => { const c = jparse(r.client_json, {}); return { id: r.id, ref: r.ref, status: r.status, product: r.product || '', clientName: c.fullName || '', clientPhone: c.phone || '', premium: r.premium_amount, frequency: jparse(r.plan_json, {}).frequency || '', paymentStatus: r.payment_status, policyNo: r.policy_no || '', agentName: r.agent_name || '', agencyCode: r.agent_code || '', submittedAt: r.submitted_at || '', updatedAt: r.updated_at }; });
      if(req.query.format === 'csv') return jsonCsv(res, 'applications', toCsv(out, [['submittedAt', 'Submitted'], ['ref', 'Reference'], ['status', 'Status'], ['clientName', 'Client'], ['clientPhone', 'Phone'], ['product', 'Product'], ['premium', 'Premium'], ['frequency', 'Frequency'], ['paymentStatus', 'Payment'], ['policyNo', 'Policy no'], ['agentName', 'Agent'], ['agencyCode', 'Agency code']].map(([key, label]) => ({ key, label }))));
      res.json(out);
    } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/applications/:id/detail', ...adminOnly, async (req, res) => {
    try {
      const a = await db.prepare('SELECT a.*, ag.name AS agent_name, ag.agency_code AS agent_code, ag.phone AS agent_phone FROM applications a LEFT JOIN agents ag ON ag.id = a.agent_id WHERE a.id = ? AND a.company_id = ?').get(req.params.id, C(req));
      if(!a) throw bad('Application not found.', 404);
      const docs = await db.prepare('SELECT id, kind, filename, mime, size, created_at FROM application_docs WHERE application_id = ?').all(a.id);
      const pays = await db.prepare('SELECT * FROM payments WHERE application_id = ? ORDER BY id DESC').all(a.id);
      await audit(C(req), 'admin', req.admin.adminId, 'application.viewed', { applicationId: a.id });
      res.json({ id: a.id, ref: a.ref, status: a.status, product: a.product, plan: jparse(a.plan_json, {}), client: jparse(a.client_json, {}), beneficiaries: jparse(a.beneficiaries_json, []), declaration: jparse(a.declaration_json, {}), hasSignature: !!a.signature, signature: a.signature || null, signedAt: a.signed_at, consentAt: a.consent_at, premium: a.premium_amount, paymentStatus: a.payment_status, policyNo: a.policy_no, adminNote: a.admin_note, submittedAt: a.submitted_at, agent: { name: a.agent_name, code: a.agent_code, phone: a.agent_phone }, docs, payments: pays.map(payOut) });
    } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/applications/:id/docs/:docId', ...adminOnly, async (req, res) => {
    try {
      const d = await db.prepare('SELECT d.* FROM application_docs d JOIN applications a ON a.id = d.application_id WHERE d.id = ? AND a.id = ? AND a.company_id = ?').get(req.params.docId, req.params.id, C(req)); if(!d) throw bad('Document not found.', 404);
      await audit(C(req), 'admin', req.admin.adminId, 'application.document_viewed', { applicationId: Number(req.params.id), docId: d.id });
      res.json({ id: d.id, kind: d.kind, mime: d.mime, data: d.data });
    } catch(e){ errorHandler(res, e); }
  });
  app.patch('/api/companies/:companyId/applications/:id', ...adminOnly, async (req, res) => {
    try {
      const a = await db.prepare('SELECT * FROM applications WHERE id = ? AND company_id = ?').get(req.params.id, C(req)); if(!a) throw bad('Application not found.', 404);
      const b = req.body || {}; const st = b.status; if(!['under_review', 'info_needed', 'approved', 'issued', 'declined'].includes(st)) throw bad('Choose a valid status.');
      if(a.status === 'draft') throw bad('The agent has not sent this application yet.', 409);
      if(a.status === 'issued') throw bad('This application has already been issued as a policy.', 409);
      const note = cap(String(b.adminNote || '').trim(), 600);
      if(['info_needed', 'declined'].includes(st) && !note) throw bad('Write a short note for the agent explaining why.');
      let policyNo = null;
      if(st === 'issued'){
        policyNo = cap(String(b.policyNo || '').trim().toUpperCase(), 40); if(!/^[A-Z0-9][A-Z0-9\-\/]{2,39}$/.test(policyNo)) throw bad('Enter the policy number.');
        if(await db.prepare('SELECT id FROM policies WHERE company_id = ? AND policy_no = ?').get(C(req), policyNo)) throw bad('That policy number already exists.', 409);
      }
      await db.transaction(async () => {
        await db.prepare("UPDATE applications SET status = ?, admin_note = ?, policy_no = COALESCE(?, policy_no), updated_at = datetime('now') WHERE id = ?").run(st, note || null, policyNo, a.id);
        if(st === 'issued'){
          const c = jparse(a.client_json, {}), plan = jparse(a.plan_json, {}); const start = todayStr(); const n = FREQ_N[plan.frequency] || 12;
          await db.prepare('INSERT INTO policies (company_id, agent_id, application_id, policy_no, client_name, client_phone, client_email, product, sum_assured, premium, frequency, start_date, next_due_date, maturity_date, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            .run(C(req), a.agent_id, a.id, policyNo, c.fullName, c.phone || null, c.email || null, a.product, plan.sumAssured || null, a.premium_amount, plan.frequency || 'monthly', start, addMonths(start, Math.round(12 / n)), plan.term ? addMonths(start, plan.term * 12) : null, 'active');
        }
      });
      await audit(C(req), 'admin', req.admin.adminId, 'application.' + st, { applicationId: a.id, ref: a.ref });
      await events.emit(C(req), st === 'issued' ? 'policy.issued' : 'application.status', { ref: a.ref, status: st, policyNo });
      res.json({ id: a.id, status: st, policyNo });
    } catch(e){ errorHandler(res, e); }
  });

  // ================= Policies & renewals =================
  function policyState(p){
    if(p.status !== 'active') return p.status;
    if(!p.next_due_date) return 'active';
    const d = daysBetween(todayStr(), p.next_due_date);
    return d < 0 ? 'overdue' : d <= 14 ? 'due_soon' : 'active';
  }
  const polOut = p => ({ id: p.id, policyNo: p.policy_no, clientName: p.client_name, clientPhone: p.client_phone || '', clientEmail: p.client_email || '', product: p.product || '', sumAssured: p.sum_assured, premium: p.premium, frequency: p.frequency, startDate: p.start_date || '', nextDueDate: p.next_due_date || '', maturityDate: p.maturity_date || '', status: p.status, state: policyState(p), daysToDue: p.next_due_date ? daysBetween(todayStr(), p.next_due_date) : null });
  app.get('/api/companies/:companyId/policies/mine', requireAgent, async (req, res) => {
    try {
      if(!sameCompany(req, res)) return;
      const rows = (await db.prepare('SELECT * FROM policies WHERE company_id = ? AND agent_id = ? ORDER BY next_due_date IS NULL, next_due_date, id DESC LIMIT 1000').all(C(req), req.agent.agentId)).map(polOut);
      const sum = { total: rows.length, overdue: rows.filter(r => r.state === 'overdue').length, dueSoon: rows.filter(r => r.state === 'due_soon').length, lapsed: rows.filter(r => r.state === 'lapsed').length };
      res.json({ summary: sum, policies: rows });
    } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/policies', ...adminOnly, async (req, res) => {
    try {
      const rows = await db.prepare('SELECT p.*, a.name AS agent_name, a.agency_code AS agent_code FROM policies p LEFT JOIN agents a ON a.id = p.agent_id WHERE p.company_id = ? ORDER BY p.id DESC LIMIT 3000').all(C(req));
      let out = rows.map(p => Object.assign(polOut(p), { agentName: p.agent_name || '', agencyCode: p.agent_code || '' }));
      if(req.query.state) out = out.filter(r => r.state === req.query.state);
      if(req.query.format === 'csv') return jsonCsv(res, 'policies', toCsv(out, [['policyNo', 'Policy no'], ['clientName', 'Client'], ['clientPhone', 'Phone'], ['product', 'Product'], ['sumAssured', 'Sum assured'], ['premium', 'Premium'], ['frequency', 'Frequency'], ['nextDueDate', 'Next due'], ['state', 'Status'], ['agentName', 'Agent'], ['agencyCode', 'Agency code']].map(([key, label]) => ({ key, label }))));
      res.json(out);
    } catch(e){ errorHandler(res, e); }
  });
  const HDR = { policy_no: ['policy_no', 'policy no', 'policy number', 'policyno'], client_name: ['client_name', 'client', 'client name', 'name', 'policyholder'], client_phone: ['client_phone', 'phone', 'client phone', 'mobile'], client_email: ['client_email', 'email'], product: ['product', 'plan'], sum_assured: ['sum_assured', 'sum assured'], premium: ['premium', 'instalment', 'installment'], frequency: ['frequency', 'mode'], start_date: ['start_date', 'start date', 'inception'], next_due_date: ['next_due_date', 'next due', 'next due date', 'due date'], maturity_date: ['maturity_date', 'maturity date', 'maturity'], status: ['status'], agent_code: ['agent_code', 'agency_code', 'agent code', 'agency code'], agent_phone: ['agent_phone', 'agent phone'] };
  function mapHeaders(row){ const idx = {}; row.forEach((h, i) => { const n = String(h).trim().toLowerCase(); for(const [k, al] of Object.entries(HDR)) if(al.includes(n)) idx[k] = i; }); return idx; }
  const FREQ_WORDS = { monthly: 'monthly', month: 'monthly', m: 'monthly', quarterly: 'quarterly', q: 'quarterly', 'half-yearly': 'semiannual', semiannual: 'semiannual', 'semi-annual': 'semiannual', annual: 'annual', yearly: 'annual', annually: 'annual', y: 'annual' };
  app.post('/api/companies/:companyId/policies/import', ...adminOnly, async (req, res) => {
    try {
      const rows = parseCsv((req.body || {}).csv); if(rows.length < 2) throw bad('The file has no data rows.'); if(rows.length > 5001) throw bad('At most 5,000 policies per import.');
      const idx = mapHeaders(rows[0]); if(idx.policy_no === undefined || idx.client_name === undefined) throw bad('The file needs at least "policy_no" and "client_name" columns.');
      const dry = (req.body || {}).dryRun !== false; let created = 0, updated = 0; const errors = [];
      const agents = await db.prepare('SELECT id, phone, agency_code FROM agents WHERE company_id = ?').all(C(req));
      const byCode = new Map(agents.filter(a => a.agency_code).map(a => [a.agency_code.toUpperCase(), a.id])), byPhone = new Map(agents.map(a => [a.phone, a.id]));
      for(let r = 1; r < rows.length; r++){
        const g = k => (idx[k] === undefined ? '' : String(rows[r][idx[k]] || '').trim());
        const no = g('policy_no').toUpperCase(), name = g('client_name'); const fail = m => errors.push({ row: r + 1, message: m });
        if(!/^[A-Z0-9][A-Z0-9\-\/]{2,39}$/.test(no)) { fail('Policy number "' + no + '" is not valid.'); continue; } if(!name){ fail('Client name is missing.'); continue; }
        const freq = FREQ_WORDS[g('frequency').toLowerCase()] || (g('frequency') ? null : 'monthly'); if(!freq){ fail('Unknown frequency "' + g('frequency') + '".'); continue; }
        const status = (g('status') || 'active').toLowerCase(); if(!POLICY_STATUSES.includes(status)){ fail('Unknown status "' + status + '".'); continue; }
        const dates = {}; let dateBad = false; for(const k of ['start_date', 'next_due_date', 'maturity_date']){ const v = g(k); if(v && !isDate(v)){ fail(k + ' must look like 2026-12-31.'); dateBad = true; } dates[k] = v || null; } if(dateBad) continue;
        const phone = g('client_phone') ? UtilsEngine.normalizeKenyanPhone(g('client_phone')) : null; if(g('client_phone') && !phone){ fail('Client phone is not valid.'); continue; }
        let agentId = null; if(g('agent_code')){ agentId = byCode.get(g('agent_code').toUpperCase()) || null; if(!agentId){ fail('No agent has the code "' + g('agent_code') + '".'); continue; } } else if(g('agent_phone')){ const ap = UtilsEngine.normalizeKenyanPhone(g('agent_phone')); agentId = ap ? byPhone.get(ap) || null : null; if(!agentId){ fail('No agent has that phone number.'); continue; } }
        const prem = g('premium') ? Number(g('premium').replace(/,/g, '')) : null, sa = g('sum_assured') ? Number(g('sum_assured').replace(/,/g, '')) : null; if((prem !== null && !isFinite(prem)) || (sa !== null && !isFinite(sa))){ fail('Premium or sum assured is not a number.'); continue; }
        const ex = await db.prepare('SELECT id FROM policies WHERE company_id = ? AND policy_no = ?').get(C(req), no);
        if(ex) updated++; else created++;
        if(!dry){
          if(ex) await db.prepare("UPDATE policies SET client_name = ?, client_phone = ?, client_email = ?, product = ?, sum_assured = ?, premium = ?, frequency = ?, start_date = ?, next_due_date = ?, maturity_date = ?, status = ?, agent_id = COALESCE(?, agent_id), updated_at = datetime('now') WHERE id = ?").run(cap(name, 120), phone, g('client_email') || null, g('product') || null, sa, prem, freq, dates.start_date, dates.next_due_date, dates.maturity_date, status, agentId, ex.id);
          else await db.prepare('INSERT INTO policies (company_id, agent_id, policy_no, client_name, client_phone, client_email, product, sum_assured, premium, frequency, start_date, next_due_date, maturity_date, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(C(req), agentId, no, cap(name, 120), phone, g('client_email') || null, g('product') || null, sa, prem, freq, dates.start_date, dates.next_due_date, dates.maturity_date, status);
        }
      }
      if(!dry) await audit(C(req), 'admin', req.admin.adminId, 'policies.imported', { created, updated, errors: errors.length });
      res.json({ dryRun: dry, created, updated, errors: errors.slice(0, 100), errorCount: errors.length });
    } catch(e){ errorHandler(res, e); }
  });
  app.patch('/api/companies/:companyId/policies/:id', ...adminOnly, async (req, res) => {
    try {
      const p = await db.prepare('SELECT * FROM policies WHERE id = ? AND company_id = ?').get(req.params.id, C(req)); if(!p) throw bad('Policy not found.', 404);
      const b = req.body || {}; const st = b.status || p.status; if(!POLICY_STATUSES.includes(st)) throw bad('Unknown status.');
      const due = b.nextDueDate === undefined ? p.next_due_date : (b.nextDueDate || null); if(due && !isDate(due)) throw bad('The due date must look like 2026-12-31.');
      await db.prepare("UPDATE policies SET status = ?, next_due_date = ?, updated_at = datetime('now') WHERE id = ?").run(st, due, p.id);
      await audit(C(req), 'admin', req.admin.adminId, 'policy.updated', { policyId: p.id, status: st });
      res.json({ ok: true });
    } catch(e){ errorHandler(res, e); }
  });

  // ================= Complaints =================
  const cref = () => 'CMP-' + todayStr().replace(/-/g, '') + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
  app.post('/api/companies/:companyId/complaints', requireAgent, async (req, res) => {
    try {
      if(!sameCompany(req, res)) return; const agent = await me(req); const cfg = await cfgMod.getConfig(C(req)); const b = req.body || {};
      if(!cfg.features.complaints) throw bad('Complaints are not switched on for this company.', 403);
      const ref = REF_RE.test(String(b.clientRef || '')) ? String(b.clientRef) : cref();
      const ex = await db.prepare('SELECT id, ref, status FROM complaints WHERE company_id = ? AND ref = ?').get(C(req), ref); if(ex) return res.json({ ref: ex.ref, status: ex.status, duplicate: true });
      const name = cap(String(b.clientName || '').trim(), 120), desc = cap(String(b.description || '').trim(), 2000);
      if(name.length < 2) throw bad('Enter the client\'s name.'); if(desc.length < 10) throw bad('Describe the complaint (at least a sentence).');
      const phone = b.clientPhone ? UtilsEngine.normalizeKenyanPhone(b.clientPhone) : null; if(b.clientPhone && !phone) throw bad('The client\'s phone number is not valid.');
      const cat = ['claim', 'premium_or_billing', 'service', 'agent_conduct', 'policy_admin', 'other'].includes(b.category) ? b.category : 'other';
      const due = new Date(Date.now() + cfg.complaintSlaDays * 86400000).toISOString().slice(0, 19).replace('T', ' ');
      await db.prepare('INSERT INTO complaints (company_id, agent_id, ref, client_name, client_phone, policy_no, category, description, due_at) VALUES (?,?,?,?,?,?,?,?,?)').run(C(req), agent.id, ref, name, phone, cap(String(b.policyNo || '').trim().toUpperCase(), 40) || null, cat, desc, due);
      await audit(C(req), 'agent', agent.id, 'complaint.logged', { ref, category: cat });
      const emailed = await notify(C(req), 'Complaint ' + ref + ' logged by ' + agent.name, `Client: ${name}\nPhone: ${phone || '-'}\nPolicy: ${b.policyNo || '-'}\nCategory: ${cat}\nRespond by: ${due.slice(0, 10)}\n\n${desc}`);
      await events.emit(C(req), 'complaint.created', { ref, category: cat, policyNo: b.policyNo || null, dueAt: due, agentId: agent.id });
      res.status(201).json({ ref, status: 'open', respondBy: due.slice(0, 10), emailed });
    } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/complaints/mine', requireAgent, async (req, res) => {
    try { if(!sameCompany(req, res)) return; res.json((await db.prepare('SELECT ref, client_name, category, status, due_at, resolution, created_at FROM complaints WHERE company_id = ? AND agent_id = ? ORDER BY id DESC LIMIT 100').all(C(req), req.agent.agentId)).map(r => ({ ref: r.ref, clientName: r.client_name, category: r.category, status: r.status, respondBy: (r.due_at || '').slice(0, 10), resolution: r.resolution || '', createdAt: r.created_at }))); } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/complaints', ...adminOnly, async (req, res) => {
    try {
      const rows = await db.prepare('SELECT c.*, a.name AS agent_name FROM complaints c LEFT JOIN agents a ON a.id = c.agent_id WHERE c.company_id = ? ORDER BY c.id DESC LIMIT 1000').all(C(req)); const now = utcNow();
      let out = rows.map(r => ({ id: r.id, ref: r.ref, clientName: r.client_name, clientPhone: r.client_phone || '', policyNo: r.policy_no || '', category: r.category, description: r.description, status: r.status, resolution: r.resolution || '', respondBy: (r.due_at || '').slice(0, 10), overdue: !['resolved', 'closed'].includes(r.status) && !!r.due_at && r.due_at < now, agentName: r.agent_name || '', createdAt: r.created_at, acknowledgedAt: r.acknowledged_at || '', resolvedAt: r.resolved_at || '' }));
      if(COMPLAINT_STATUSES.includes(req.query.status)) out = out.filter(r => r.status === req.query.status);
      if(req.query.format === 'csv') return jsonCsv(res, 'complaints', toCsv(out, [['createdAt', 'Logged'], ['ref', 'Reference'], ['clientName', 'Client'], ['policyNo', 'Policy'], ['category', 'Category'], ['status', 'Status'], ['respondBy', 'Respond by'], ['overdue', 'Overdue'], ['acknowledgedAt', 'Acknowledged'], ['resolvedAt', 'Resolved'], ['agentName', 'Agent'], ['description', 'Description'], ['resolution', 'Resolution']].map(([key, label]) => ({ key, label }))));
      res.json(out);
    } catch(e){ errorHandler(res, e); }
  });
  app.patch('/api/companies/:companyId/complaints/:id', ...adminOnly, async (req, res) => {
    try {
      const c = await db.prepare('SELECT * FROM complaints WHERE id = ? AND company_id = ?').get(req.params.id, C(req)); if(!c) throw bad('Complaint not found.', 404);
      const b = req.body || {}; if(!COMPLAINT_STATUSES.includes(b.status)) throw bad('Unknown status.'); const res_ = cap(String(b.resolution || '').trim(), 1500);
      if(['resolved', 'closed'].includes(b.status) && !res_ && !c.resolution) throw bad('Record how the complaint was resolved.');
      await db.prepare("UPDATE complaints SET status = ?, resolution = COALESCE(?, resolution), acknowledged_at = CASE WHEN acknowledged_at IS NULL AND ? <> 'open' THEN datetime('now') ELSE acknowledged_at END, resolved_at = CASE WHEN ? IN ('resolved','closed') AND resolved_at IS NULL THEN datetime('now') ELSE resolved_at END, updated_at = datetime('now') WHERE id = ?").run(b.status, res_ || null, b.status, b.status, c.id);
      await audit(C(req), 'admin', req.admin.adminId, 'complaint.' + b.status, { ref: c.ref });
      await events.emit(C(req), 'complaint.updated', { ref: c.ref, status: b.status });
      res.json({ ok: true });
    } catch(e){ errorHandler(res, e); }
  });

  // ================= Suitability (needs-analysis) records =================
  app.post('/api/companies/:companyId/suitability', requireAgent, async (req, res) => {
    try {
      if(!sameCompany(req, res)) return; const agent = await me(req); const cfg = await cfgMod.getConfig(C(req)); const b = req.body || {};
      if(!cfg.features.suitability) throw bad('Suitability records are not switched on for this company.', 403);
      const ref = REF_RE.test(String(b.clientRef || '')) ? String(b.clientRef) : null;
      if(ref){ const ex = await db.prepare('SELECT id FROM suitability_records WHERE company_id = ? AND agent_id = ? AND client_ref = ?').get(C(req), agent.id, ref); if(ex) return res.json({ id: ex.id, duplicate: true }); }
      const name = cap(String(b.clientName || '').trim(), 120); if(name.length < 2) throw bad('Enter the client\'s name.');
      const rec = cap(String(b.recommended || '').trim(), 120), chosen = cap(String(b.chosen || '').trim(), 120), why = cap(String(b.rationale || '').trim(), 1500);
      if(!chosen) throw bad('Say which product the client chose.'); if(why.length < 10) throw bad('Record why this product suits the client.');
      if(rec && rec !== chosen && String(b.deviationReason || '').trim().length < 5) throw bad('The client chose a different product from the one recommended. Record why.');
      if(!Array.isArray(b.disclosures) || b.disclosures.length < 1) throw bad('Confirm what was explained to the client.');
      if(!sigOk(b.signature)) throw bad('The client\'s signature is missing.');
      const phone = b.clientPhone ? UtilsEngine.normalizeKenyanPhone(b.clientPhone) : null;
      const needs = JSON.stringify(b.needs && typeof b.needs === 'object' ? b.needs : {}).slice(0, 4000);
      const info = await db.prepare('INSERT INTO suitability_records (company_id, agent_id, client_name, client_phone, needs_json, recommended, chosen, rationale, deviation_reason, disclosures_json, signature, occurred_at, client_ref) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(C(req), agent.id, name, phone, needs, rec || null, chosen, why, cap(String(b.deviationReason || '').trim(), 600) || null, JSON.stringify(b.disclosures.slice(0, 20).map(x => cap(String(x), 200))), b.signature, b.occurredAt ? new Date(b.occurredAt).toISOString() : new Date().toISOString(), ref);
      await audit(C(req), 'agent', agent.id, 'suitability.recorded', { id: info.lastInsertRowid, chosen });
      res.status(201).json({ id: info.lastInsertRowid });
    } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/suitability', ...adminOnly, async (req, res) => {
    try {
      const rows = await db.prepare('SELECT s.id, s.client_name, s.client_phone, s.recommended, s.chosen, s.rationale, s.deviation_reason, s.disclosures_json, s.occurred_at, s.created_at, a.name AS agent_name, a.agency_code FROM suitability_records s LEFT JOIN agents a ON a.id = s.agent_id WHERE s.company_id = ? ORDER BY s.id DESC LIMIT 2000').all(C(req));
      const out = rows.map(r => ({ id: r.id, createdAt: r.created_at, clientName: r.client_name, clientPhone: r.client_phone || '', recommended: r.recommended || '', chosen: r.chosen, deviated: !!r.recommended && r.recommended !== r.chosen, deviationReason: r.deviation_reason || '', rationale: r.rationale, disclosures: jparse(r.disclosures_json, []).join('; '), agentName: r.agent_name || '', agencyCode: r.agency_code || '' }));
      if(req.query.format === 'csv') return jsonCsv(res, 'suitability-records', toCsv(out, [['createdAt', 'Recorded'], ['clientName', 'Client'], ['clientPhone', 'Phone'], ['recommended', 'Recommended'], ['chosen', 'Chosen'], ['deviated', 'Differs'], ['deviationReason', 'Why it differs'], ['rationale', 'Why it suits'], ['disclosures', 'Explained'], ['agentName', 'Agent'], ['agencyCode', 'Agency code']].map(([key, label]) => ({ key, label }))));
      res.json(out);
    } catch(e){ errorHandler(res, e); }
  });

  // ================= Company-defined products =================
  const PKEY_RE = /^[a-z][a-z0-9_]{2,30}$/;
  const cpOut = (r, full) => {
    const def = jparse(r.definition_json, {}), pend = r.pending_json ? jparse(r.pending_json, null) : null;
    const o = { id: r.id, pkey: r.pkey, name: r.name, kind: r.kind, kindLabel: (custom.KINDS[r.kind] || {}).label || r.kind, status: r.status, version: r.version, changeNote: r.change_note || '', approvedAt: r.approved_at || '', hasPending: !!pend, sample: !!(pend || def).sample, updatedAt: r.updated_at, blockers: custom.publishBlockers(pend || def), errors: custom.validateDefinition(r.kind, pend || def) };
    if(full){ o.definition = def; o.pending = pend; }
    return o;
  };
  app.get('/api/companies/:companyId/custom-products', ...adminOnly, async (req, res) => {
    try { res.json({ kinds: Object.fromEntries(Object.entries(custom.KINDS).map(([k, v]) => [k, Object.assign({}, v, { template: custom.template(k) })])), products: (await db.prepare('SELECT * FROM custom_products WHERE company_id = ? ORDER BY id').all(C(req))).map(r => cpOut(r, true)) }); } catch(e){ errorHandler(res, e); }
  });
  app.post('/api/companies/:companyId/custom-products', ...adminOnly, async (req, res) => {
    try {
      const b = req.body || {}; if(!custom.KINDS[b.kind]) throw bad('Choose a product type.'); const pkey = String(b.pkey || '').trim().toLowerCase(); if(!PKEY_RE.test(pkey)) throw bad('The product code should be lowercase letters, numbers or underscores (3-31 characters).');
      const name = cap(String(b.name || '').trim(), 100); if(name.length < 3) throw bad('Give the product a name.');
      const def = b.definition && typeof b.definition === 'object' ? b.definition : custom.template(b.kind); const errs = custom.validateDefinition(b.kind, def); if(errs.length) throw bad(errs[0]);
      if(await db.prepare('SELECT id FROM custom_products WHERE company_id = ? AND pkey = ?').get(C(req), pkey)) throw bad('That product code is already used.', 409);
      const info = await db.prepare("INSERT INTO custom_products (company_id, pkey, name, kind, definition_json, status, version, change_note, created_by) VALUES (?,?,?,?,?,'draft',1,?,?)").run(C(req), pkey, name, b.kind, JSON.stringify(def), 'Created', req.admin.adminId);
      await audit(C(req), 'admin', req.admin.adminId, 'custom_product.created', { pkey, kind: b.kind });
      res.status(201).json(cpOut(await db.prepare('SELECT * FROM custom_products WHERE id = ?').get(info.lastInsertRowid), true));
    } catch(e){ errorHandler(res, e); }
  });
  async function cpFor(req){ const r = await db.prepare('SELECT * FROM custom_products WHERE id = ? AND company_id = ?').get(req.params.id, C(req)); if(!r) throw bad('Product not found.', 404); return r; }
  app.put('/api/companies/:companyId/custom-products/:id', ...adminOnly, async (req, res) => {
    try {
      const r = await cpFor(req); const b = req.body || {}; const note = cap(String(b.changeNote || '').trim(), 300); if(!note) throw bad('Say what changed and why (it is kept in the approval record).');
      if(r.status === 'retired') throw bad('A retired product cannot be edited.', 409);
      const name = b.name ? cap(String(b.name).trim(), 100) : r.name; const def = b.definition && typeof b.definition === 'object' ? b.definition : null;
      if(def){ const errs = custom.validateDefinition(r.kind, def); if(errs.length) throw bad(errs[0]); }
      if(r.status === 'published' && def) await db.prepare("UPDATE custom_products SET name = ?, pending_json = ?, change_note = ?, created_by = ?, approved_by = NULL, approved_at = NULL, updated_at = datetime('now') WHERE id = ?").run(name, JSON.stringify(def), note, req.admin.adminId, r.id);
      else await db.prepare("UPDATE custom_products SET name = ?, definition_json = ?, change_note = ?, created_by = ?, approved_by = NULL, approved_at = NULL, updated_at = datetime('now') WHERE id = ?").run(name, def ? JSON.stringify(def) : r.definition_json, note, req.admin.adminId, r.id);
      await audit(C(req), 'admin', req.admin.adminId, 'custom_product.edited', { pkey: r.pkey });
      res.json(cpOut(await cpFor(req), true));
    } catch(e){ errorHandler(res, e); }
  });
  app.post('/api/companies/:companyId/custom-products/:id/preview', ...adminOnly, async (req, res) => {
    try { const r = await cpFor(req); const def = (req.body || {}).definition && typeof req.body.definition === 'object' ? req.body.definition : (r.pending_json ? jparse(r.pending_json, null) : null) || jparse(r.definition_json, {}); res.json(custom.calc(r.kind, def, (req.body || {}).input || {})); } catch(e){ errorHandler(res, e); }
  });
  app.post('/api/companies/:companyId/custom-products/:id/approve', ...adminOnly, async (req, res) => {
    try {
      const r = await cpFor(req); const def = r.pending_json ? jparse(r.pending_json, {}) : jparse(r.definition_json, {});
      const errs = custom.validateDefinition(r.kind, def); if(errs.length) throw bad(errs[0], 422); const blk = custom.publishBlockers(def); if(blk.length) throw bad(blk[0], 422);
      if(await twoAdmins(C(req)) && r.created_by === req.admin.adminId) throw bad('Four-eyes rule: a different administrator must approve changes you made.', 403);
      await db.prepare("UPDATE custom_products SET approved_by = ?, approved_at = datetime('now') WHERE id = ?").run(req.admin.adminId, r.id);
      await audit(C(req), 'admin', req.admin.adminId, 'custom_product.approved', { pkey: r.pkey }); res.json({ approved: true });
    } catch(e){ errorHandler(res, e); }
  });
  app.post('/api/companies/:companyId/custom-products/:id/publish', ...adminOnly, async (req, res) => {
    try {
      const r = await cpFor(req); if(!r.approved_at) throw bad('Have the product approved by a second administrator first.', 422);
      const def = r.pending_json ? r.pending_json : r.definition_json;
      await db.prepare("UPDATE custom_products SET definition_json = ?, pending_json = NULL, status = 'published', version = version + ?, updated_at = datetime('now') WHERE id = ?").run(def, r.pending_json ? 1 : 0, r.id);
      await audit(C(req), 'admin', req.admin.adminId, 'custom_product.published', { pkey: r.pkey });
      res.json(cpOut(await cpFor(req), true));
    } catch(e){ errorHandler(res, e); }
  });
  app.post('/api/companies/:companyId/custom-products/:id/retire', ...adminOnly, async (req, res) => {
    try { const r = await cpFor(req); await db.prepare("UPDATE custom_products SET status = 'retired', updated_at = datetime('now') WHERE id = ?").run(r.id); await audit(C(req), 'admin', req.admin.adminId, 'custom_product.retired', { pkey: r.pkey }); res.json({ ok: true }); } catch(e){ errorHandler(res, e); }
  });
  app.delete('/api/companies/:companyId/custom-products/:id', ...adminOnly, async (req, res) => {
    try { const r = await cpFor(req); if(r.status !== 'draft') throw bad('Only a draft can be deleted. Retire a published product instead.', 409); await db.prepare('DELETE FROM custom_products WHERE id = ?').run(r.id); await audit(C(req), 'admin', req.admin.adminId, 'custom_product.deleted', { pkey: r.pkey }); res.json({ ok: true }); } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/products/custom', requireAgent, async (req, res) => {
    try {
      if(!sameCompany(req, res)) return; const cfg = await cfgMod.getConfig(C(req)); if(!cfg.features.customProducts) return res.json({ products: [] });
      const rows = await db.prepare("SELECT * FROM custom_products WHERE company_id = ? AND status = 'published' ORDER BY name").all(C(req));
      res.json({ products: rows.map(r => ({ pkey: r.pkey, name: r.name, kind: r.kind, version: r.version, updatedAt: r.updated_at, definition: jparse(r.definition_json, {}) })) });
    } catch(e){ errorHandler(res, e); }
  });

  // ================= Data retention, client data export and erasure =================
  const cut = days => new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  async function runRetention(companyId, dryRun){
    const cfg = await cfgMod.getConfig(companyId); const r = cfg.retention; const out = { companyId: Number(companyId), dryRun: !!dryRun, enabled: r.enabled, removed: {} };
    if(!r.enabled) return out;
    const jobs = [['usage_events', 'created_at', r.usageDays], ['sms_outbox', 'created_at', r.outboxDays], ['email_outbox', 'created_at', r.outboxDays], ['quote_records', 'created_at', r.quoteDays], ['audit_log', 'created_at', r.auditDays], ['leads', 'created_at', r.leadDays], ['outbound_events', 'created_at', 30]];
    for(const [table, col, days] of jobs){
      const cutoff = cut(days); const extra = table === 'outbound_events' ? " AND status IN ('delivered','failed')" : '';
      const n = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE company_id = ? AND ${col} < ?${extra}`).get(companyId, cutoff); out.removed[table] = Number(n.n);
      if(!dryRun && out.removed[table]) await db.prepare(`DELETE FROM ${table} WHERE company_id = ? AND ${col} < ?${extra}`).run(companyId, cutoff);
    }
    const dc = cut(r.draftDays); const drafts = await db.prepare("SELECT id FROM applications WHERE company_id = ? AND status = 'draft' AND updated_at < ?").all(companyId, dc); out.removed.draft_applications = drafts.length;
    if(!dryRun) for(const d of drafts){ await db.prepare('DELETE FROM application_docs WHERE application_id = ?').run(d.id); await db.prepare('DELETE FROM applications WHERE id = ?').run(d.id); }
    if(!dryRun) await audit(companyId, 'system', null, 'retention.run', out.removed);
    return out;
  }
  async function runRetentionAll(){
    const res = []; const cos = await db.prepare('SELECT id FROM companies').all();
    for(const c of cos){ try { res.push(await runRetention(c.id, false)); } catch(e){ console.error('[retention]', e.message); } }
    const oc = cut(30); try { await db.prepare('DELETE FROM sms_outbox WHERE company_id IS NULL AND created_at < ?').run(oc); await db.prepare('DELETE FROM email_outbox WHERE company_id IS NULL AND created_at < ?').run(oc); } catch(e){}
    return res;
  }
  app.post('/api/companies/:companyId/retention/run', ...adminOnly, async (req, res) => {
    try { const dry = (req.body || {}).dryRun !== false; const out = await runRetention(C(req), dry); if(!dry) await audit(C(req), 'admin', req.admin.adminId, 'retention.run_manual', out.removed); res.json(out); } catch(e){ errorHandler(res, e); }
  });
  function subjectKey(b){
    const phone = b.phone ? UtilsEngine.normalizeKenyanPhone(b.phone) : null; const email = b.email ? cleanEmail(b.email) : null;
    if(b.phone && !phone) throw bad('That phone number is not valid.'); if(b.email && email === false) throw bad('That email address is not valid.');
    if(!phone && !email) throw bad('Give the client\'s phone number or email address.'); return { phone, email: email || null };
  }
  async function findSubject(cid, k){
    // Built in JavaScript (not "? IS NOT NULL") so the same SQL works on SQLite and Postgres.
    const likeP = k.phone ? '%"phone":"' + k.phone + '"%' : null, likeE = k.email ? '%"email":"' + k.email + '"%' : null;
    const where = (pairs) => { const parts = [], vals = []; for(const [cond, v] of pairs){ if(v !== null && v !== undefined){ parts.push(cond); vals.push(v); } } return { sql: parts.length ? '(' + parts.join(' OR ') + ')' : '(1 = 0)', vals }; };
    const run = async (table, pairs) => { const w = where(pairs); return db.prepare(`SELECT * FROM ${table} WHERE company_id = ? AND ${w.sql}`).all(cid, ...w.vals); };
    return {
      leads: await run('leads', [['client_phone = ?', k.phone], ['client_email = ?', k.email]]),
      applications: await run('applications', [['client_json LIKE ?', likeP], ['client_json LIKE ?', likeE]]),
      policies: await run('policies', [['client_phone = ?', k.phone], ['client_email = ?', k.email]]),
      complaints: await run('complaints', [['client_phone = ?', k.phone]]),
      suitability: await run('suitability_records', [['client_phone = ?', k.phone]]),
      payments: await run('payments', [['phone = ?', k.phone]])
    };
  }
  app.post('/api/companies/:companyId/data-subject/export', ...adminOnly, async (req, res) => {
    try {
      const k = subjectKey(req.body || {}); const f = await findSubject(C(req), k);
      const docs = []; for(const a of f.applications){ for(const d of await db.prepare('SELECT id, kind, filename, mime, size, created_at FROM application_docs WHERE application_id = ?').all(a.id)) docs.push({ applicationRef: a.ref, kind: d.kind, filename: d.filename, size: d.size }); }
      await audit(C(req), 'admin', req.admin.adminId, 'data_subject.export', { counts: Object.fromEntries(Object.entries(f).map(([x, v]) => [x, v.length])) });
      res.json({ generatedAt: new Date().toISOString(), subject: k,
        leads: f.leads.map(r => ({ created: r.created_at, name: r.client_name, phone: r.client_phone, email: r.client_email, product: r.product, status: r.status })),
        applications: f.applications.map(r => ({ ref: r.ref, status: r.status, product: r.product, client: jparse(r.client_json, {}), beneficiaries: jparse(r.beneficiaries_json, []), declaration: jparse(r.declaration_json, {}), submitted: r.submitted_at })), documents: docs,
        policies: f.policies.map(polOut), complaints: f.complaints.map(r => ({ ref: r.ref, category: r.category, description: r.description, status: r.status })),
        suitability: f.suitability.map(r => ({ recorded: r.created_at, chosen: r.chosen, recommended: r.recommended, rationale: r.rationale })), payments: f.payments.map(r => ({ amount: r.amount, status: r.status, receipt: r.receipt, date: r.created_at })) });
    } catch(e){ errorHandler(res, e); }
  });
  app.post('/api/companies/:companyId/data-subject/erase', ...adminOnly, async (req, res) => {
    try {
      const b = req.body || {}; const k = subjectKey(b); if(b.confirm !== 'ERASE') throw bad('Type ERASE to confirm.'); const reason = cap(String(b.reason || '').trim(), 300); if(reason.length < 5) throw bad('Record the reason (for example "client request, ref 123").');
      const f = await findSubject(C(req), k); const removed = { leads: 0, applications: 0, documents: 0, suitability: 0 }, retained = [];
      await db.transaction(async () => {
        for(const l of f.leads){ await db.prepare('DELETE FROM leads WHERE id = ?').run(l.id); removed.leads++; }
        for(const a of f.applications){
          if(a.status === 'issued'){ retained.push({ kind: 'application', ref: a.ref, reason: 'Issued as a policy: the company must keep the application and KYC documents for legal and regulatory reasons.' }); continue; }
          const n = await db.prepare('SELECT COUNT(*) AS n FROM application_docs WHERE application_id = ?').get(a.id); removed.documents += Number(n.n);
          await db.prepare('DELETE FROM application_docs WHERE application_id = ?').run(a.id); await db.prepare('UPDATE payments SET application_id = NULL, phone = NULL WHERE application_id = ?').run(a.id); await db.prepare('DELETE FROM applications WHERE id = ?').run(a.id); removed.applications++;
        }
        for(const s of f.suitability){ await db.prepare('DELETE FROM suitability_records WHERE id = ?').run(s.id); removed.suitability++; }
        for(const p of f.payments){ if(p.status === 'paid') retained.push({ kind: 'payment', ref: p.receipt || String(p.id), reason: 'Financial record kept for accounting. The phone number was removed.' }); await db.prepare('UPDATE payments SET phone = NULL WHERE id = ?').run(p.id); }
      });
      f.policies.forEach(p => retained.push({ kind: 'policy', ref: p.policy_no, reason: 'An active or past policy: kept for the policy contract and regulatory retention.' }));
      f.complaints.forEach(c => retained.push({ kind: 'complaint', ref: c.ref, reason: 'Complaint records are kept for the regulator.' }));
      await audit(C(req), 'admin', req.admin.adminId, 'data_subject.erase', { removed, retained: retained.length, reason });
      res.json({ removed, retained });
    } catch(e){ errorHandler(res, e); }
  });
  app.post('/api/companies/:companyId/agents/:agentId/anonymise', ...adminOnly, async (req, res) => {
    try {
      const a = await db.prepare('SELECT id FROM agents WHERE id = ? AND company_id = ?').get(req.params.agentId, C(req)); if(!a) throw bad('Agent not found.', 404);
      if((req.body || {}).confirm !== 'ERASE') throw bad('Type ERASE to confirm.');
      await db.prepare("UPDATE agents SET name = ?, phone = ?, email = NULL, agency_code = NULL, licence_no = NULL, licence_expiry = NULL, password_hash = NULL, otp_code_hash = NULL, otp_expires_at = NULL, is_active = 0, verified = 0 WHERE id = ?").run('Former agent ' + a.id, 'erased-' + a.id, a.id);
      await audit(C(req), 'admin', req.admin.adminId, 'agent.anonymised', { agentId: a.id });
      res.json({ ok: true });
    } catch(e){ errorHandler(res, e); }
  });

  return { runRetention, runRetentionAll, sellStatus, licenceState, policyState, polOut, jparse };
};
module.exports.mpesaStk = mpesaStk;
module.exports.callbackToken = callbackToken;
module.exports.setFetch = f => { fetchImpl = f; };
