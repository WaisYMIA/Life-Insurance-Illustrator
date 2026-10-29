/**
 * Company-level management features:
 *   reports (conversion by agent / product / group / region, weekly email) · regulator & audit exports ·
 *   integration (API keys + read API, webhook queue) · release control (staged rollout, advance banner) ·
 *   scheduled rate effective dates · onboarding a new insurer · background jobs.
 */
'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cfgMod = require('./config');
const events = require('./events');
const security = require('./security');
const { toCsv, utcNow, sqlDate, todayStr, addDays } = require('./util');

const cap = (s, n) => (typeof s === 'string' ? s.slice(0, n) : s);
const bad = (m, status) => ({ status: status || 400, message: m });
const FREQ_N = { monthly: 12, quarterly: 4, semiannual: 2, annual: 1 };
const jparse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch(e){ return d; } };
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s + 'T00:00:00Z'));

module.exports = function registerEnterprise(app, deps){
  const { db, requireAdmin, requireSuperadmin, scopeToCompany, audit, errorHandler, sendEmail, platform, rateLimit } = deps;
  const adminOnly = [requireAdmin, scopeToCompany];
  const C = req => req.params.companyId;
  const csv = (res, name, body) => { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`); res.send(body); };
  const col = pairs => pairs.map(([key, label]) => ({ key, label }));

  // ================= Reports =================
  function range(q){
    let to = isDate(q.to) ? q.to : todayStr(); let from = isDate(q.from) ? q.from : addDays(to, -30);
    if(from > to) from = to; if((new Date(to) - new Date(from)) / 86400000 > 731) from = addDays(to, -731);
    return { from, to, fromTs: from + ' 00:00:00', toTs: addDays(to, 1) + ' 00:00:00' };
  }
  const pct = (a, b) => b > 0 ? Math.round(a / b * 1000) / 10 : null;
  async function conversion(cid, r, by){
    const agents = await db.prepare('SELECT id, name, agency_code, group_name, region FROM agents WHERE company_id = ?').all(cid); const am = new Map(agents.map(a => [a.id, a]));
    const leads = await db.prepare('SELECT agent_id, product, status FROM leads WHERE company_id = ? AND created_at >= ? AND created_at < ?').all(cid, r.fromTs, r.toTs);
    const apps = await db.prepare("SELECT agent_id, product, status, premium_amount, plan_json FROM applications WHERE company_id = ? AND status <> 'draft' AND COALESCE(submitted_at, created_at) >= ? AND COALESCE(submitted_at, created_at) < ?").all(cid, r.fromTs, r.toTs);
    const quotes = await db.prepare('SELECT agent_id, product FROM quote_records WHERE company_id = ? AND created_at >= ? AND created_at < ?').all(cid, r.fromTs, r.toTs);
    const keyOf = (agentId, product) => {
      const a = am.get(agentId) || {};
      if(by === 'product') return product || '(not stated)';
      if(by === 'group') return a.group_name || '(no group)';
      if(by === 'region') return a.region || '(no region)';
      return agentId ? String(agentId) : '(unknown)';
    };
    const rows = new Map(); const row = k => { if(!rows.has(k)){ const a = by === 'agent' ? am.get(Number(k)) : null; rows.set(k, { key: k, label: by === 'agent' ? (a ? a.name + (a.agency_code ? ' (' + a.agency_code + ')' : '') : 'Unknown agent') : k, quotes: 0, leads: 0, leadsWon: 0, applications: 0, issued: 0, annualPremium: 0 }); } return rows.get(k); };
    quotes.forEach(q => { row(keyOf(q.agent_id, q.product)).quotes++; });
    leads.forEach(l => { const x = row(keyOf(l.agent_id, l.product)); x.leads++; if(l.status === 'won') x.leadsWon++; });
    apps.forEach(a => { const x = row(keyOf(a.agent_id, a.product)); x.applications++; if(a.status === 'issued'){ x.issued++; x.annualPremium += (Number(a.premium_amount) || 0) * (FREQ_N[jparse(a.plan_json, {}).frequency] || 12); } });
    const out = Array.from(rows.values()).map(x => Object.assign(x, { annualPremium: Math.round(x.annualPremium), quoteToLeadPct: pct(x.leads, x.quotes), leadToApplicationPct: pct(x.applications, x.leads), applicationToIssuedPct: pct(x.issued, x.applications), quoteToIssuedPct: pct(x.issued, x.quotes) })).sort((a, b) => b.issued - a.issued || b.applications - a.applications || b.leads - a.leads || b.quotes - a.quotes);
    const tot = out.reduce((t, x) => { ['quotes', 'leads', 'leadsWon', 'applications', 'issued', 'annualPremium'].forEach(k => { t[k] += x[k]; }); return t; }, { quotes: 0, leads: 0, leadsWon: 0, applications: 0, issued: 0, annualPremium: 0 });
    return { by, from: r.from, to: r.to, totals: Object.assign(tot, { quoteToLeadPct: pct(tot.leads, tot.quotes), leadToApplicationPct: pct(tot.applications, tot.leads), applicationToIssuedPct: pct(tot.issued, tot.applications) }), rows: out };
  }
  app.get('/api/companies/:companyId/reports/conversion', ...adminOnly, async (req, res) => {
    try {
      const by = ['agent', 'product', 'group', 'region'].includes(req.query.by) ? req.query.by : 'agent'; const rep = await conversion(C(req), range(req.query), by);
      if(req.query.format === 'csv') return csv(res, 'conversion-by-' + by, toCsv(rep.rows, col([['label', by[0].toUpperCase() + by.slice(1)], ['quotes', 'Quotes shared / printed'], ['leads', 'Leads'], ['leadsWon', 'Leads won'], ['applications', 'Applications'], ['issued', 'Policies issued'], ['annualPremium', 'Annualised premium (KES)'], ['quoteToLeadPct', 'Quote to lead %'], ['leadToApplicationPct', 'Lead to application %'], ['applicationToIssuedPct', 'Application to issued %'], ['quoteToIssuedPct', 'Quote to issued %']])));
      res.json(rep);
    } catch(e){ errorHandler(res, e); }
  });
  async function summary(cid, r){
    const cfg = await cfgMod.getConfig(cid); const conv = await conversion(cid, r, 'agent');
    const agents = await db.prepare('SELECT id, name, agency_code, licence_no, licence_expiry, is_active, verified FROM agents WHERE company_id = ?').all(cid); const live = agents.filter(a => a.is_active && a.verified);
    const act = await db.prepare('SELECT DISTINCT agent_id FROM usage_events WHERE company_id = ? AND created_at >= ? AND created_at < ?').all(cid, r.fromTs, r.toTs); const actSet = new Set(act.map(x => x.agent_id));
    const inactive = live.filter(a => !actSet.has(a.id)).map(a => a.name + (a.agency_code ? ' (' + a.agency_code + ')' : ''));
    const lic = { expired: 0, expiring: 0, missing: 0 }; live.forEach(a => { const s = platform.licenceState(a, cfg); if(lic[s] !== undefined) lic[s]++; });
    const cmpOpen = await db.prepare("SELECT status, due_at FROM complaints WHERE company_id = ? AND status NOT IN ('resolved','closed')").all(cid); const now = utcNow();
    const pol = (await db.prepare("SELECT status, next_due_date FROM policies WHERE company_id = ? AND status = 'active'").all(cid)).map(p => platform.policyState(p));
    const pend = await db.prepare("SELECT COUNT(*) AS n FROM applications WHERE company_id = ? AND status IN ('submitted','under_review')").get(cid);
    const unpaid = await db.prepare("SELECT COUNT(*) AS n FROM applications WHERE company_id = ? AND status IN ('approved','issued') AND payment_status <> 'paid'").get(cid);
    return { from: r.from, to: r.to, funnel: conv.totals, topAgents: conv.rows.slice(0, 5).map(x => ({ label: x.label, quotes: x.quotes, leads: x.leads, applications: x.applications, issued: x.issued })), agents: { active: live.length, activeInPeriod: live.length - inactive.length, inactive: inactive.slice(0, 25), inactiveCount: inactive.length }, licensing: Object.assign(lic, { required: cfg.licensing.required }), complaints: { open: cmpOpen.length, overdue: cmpOpen.filter(c => c.due_at && c.due_at < now).length }, renewals: { overdue: pol.filter(s => s === 'overdue').length, dueSoon: pol.filter(s => s === 'due_soon').length }, applications: { awaitingReview: Number(pend.n), unpaid: Number(unpaid.n) } };
  }
  app.get('/api/companies/:companyId/reports/summary', ...adminOnly, async (req, res) => { try { res.json(await summary(C(req), range(req.query))); } catch(e){ errorHandler(res, e); } });
  function reportText(co, s){
    const f = s.funnel, n = x => (x == null ? '-' : String(x)); const money = x => 'KES ' + Number(x || 0).toLocaleString('en-KE');
    const L = [`${co} — weekly management report`, `Period: ${s.from} to ${s.to}`, '',
      'SALES FUNNEL', `  Illustrations printed / shared: ${f.quotes}`, `  Leads handed over: ${f.leads}   (quote to lead ${n(f.quoteToLeadPct)}%)`, `  Applications sent: ${f.applications}   (lead to application ${n(f.leadToApplicationPct)}%)`, `  Policies issued: ${f.issued}   (application to issued ${n(f.applicationToIssuedPct)}%)`, `  Annualised premium issued: ${money(f.annualPremium)}`, '',
      'TOP AGENTS (by policies issued, then applications)'].concat(s.topAgents.length ? s.topAgents.map((a, i) => `  ${i + 1}. ${a.label}: ${a.quotes} quotes, ${a.leads} leads, ${a.applications} applications, ${a.issued} issued`) : ['  No activity in this period.']);
    L.push('', 'AGENT ACTIVITY', `  ${s.agents.activeInPeriod} of ${s.agents.active} verified agents used the app in this period.`);
    if(s.agents.inactiveCount) L.push(`  Not seen: ${s.agents.inactive.slice(0, 10).join(', ')}${s.agents.inactiveCount > 10 ? ' and ' + (s.agents.inactiveCount - 10) + ' more' : ''}`);
    if(s.licensing.required) L.push('', 'LICENCES', `  Expired: ${s.licensing.expired}   Expiring soon: ${s.licensing.expiring}   Missing: ${s.licensing.missing}`);
    L.push('', 'FOLLOW-UP NEEDED', `  Applications awaiting review: ${s.applications.awaitingReview}`, `  Approved/issued with premium not yet paid: ${s.applications.unpaid}`, `  Open complaints: ${s.complaints.open} (${s.complaints.overdue} past the response date)`, `  Policies with premium overdue: ${s.renewals.overdue}; due in the next 14 days: ${s.renewals.dueSoon}`, '', 'Sent automatically by Plan Illustrator. Change the recipients under Settings.');
    return L.join('\n');
  }
  function isoWeekKey(d){ const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return t.getUTCFullYear() + '-W' + String(Math.ceil(((t - y0) / 86400000 + 1) / 7)).padStart(2, '0'); }
  async function sendWeekly(cid, force){
    const cfg = await cfgMod.getConfig(cid); if(!cfg.reportEmails) return { sent: false, reason: 'No recipients are set.' };
    const now = new Date(); const lastWeekEnd = addDays(todayStr(), -((now.getUTCDay() + 6) % 7) - 1); const period = isoWeekKey(new Date(lastWeekEnd + 'T00:00:00Z'));
    if(!force && await db.prepare("SELECT id FROM report_log WHERE company_id = ? AND kind = 'weekly' AND period_key = ?").get(cid, period)) return { sent: false, reason: 'Already sent for ' + period };
    const r = range({ from: addDays(lastWeekEnd, -6), to: lastWeekEnd }); const co = await db.prepare('SELECT name FROM companies WHERE id = ?').get(cid);
    const s = await summary(cid, r); const body = reportText((co && co.name) || 'Company', s);
    for(const to of cfg.reportEmails.split(',').map(x => x.trim()).filter(Boolean)) await sendEmail(cid, to, `Weekly report ${r.from} to ${r.to}`, body);
    await db.prepare('INSERT INTO report_log (company_id, kind, period_key, recipients) VALUES (?,?,?,?)').run(cid, 'weekly', force ? period + '-manual-' + Date.now() : period, cfg.reportEmails);
    return { sent: true, period, recipients: cfg.reportEmails };
  }
  app.post('/api/companies/:companyId/reports/weekly/send', ...adminOnly, async (req, res) => {
    try { const out = await sendWeekly(C(req), true); if(!out.sent) throw bad(out.reason); await audit(C(req), 'admin', req.admin.adminId, 'report.weekly_sent', { recipients: out.recipients }); res.json(out); } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/reports/weekly/log', ...adminOnly, async (req, res) => { try { res.json(await db.prepare("SELECT period_key, recipients, created_at FROM report_log WHERE company_id = ? AND kind = 'weekly' ORDER BY id DESC LIMIT 30").all(C(req))); } catch(e){ errorHandler(res, e); } });

  // ================= Regulator & audit exports =================
  app.get('/api/companies/:companyId/audit-log', ...adminOnly, async (req, res) => {
    try {
      const lim = Math.min(parseInt(req.query.limit, 10) || 100, 500); const before = parseInt(req.query.before, 10) || null; const act = cap(String(req.query.action || ''), 60);
      const rows = await db.prepare(`SELECT id, actor_type, actor_id, action, details_json, created_at FROM audit_log WHERE company_id = ? ${before ? 'AND id < ?' : ''} ${act ? 'AND action LIKE ?' : ''} ORDER BY id DESC LIMIT ?`).all(...[C(req)].concat(before ? [before] : [], act ? [act + '%'] : [], [lim]));
      res.json({ rows: rows.map(r => ({ id: r.id, actorType: r.actor_type, actorId: r.actor_id, action: r.action, details: jparse(r.details_json, {}), at: r.created_at })), next: rows.length === lim ? rows[rows.length - 1].id : null });
    } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/compliance/export', ...adminOnly, async (req, res) => {
    try {
      const r = range(req.query); const kind = req.query.kind; const cid = C(req);
      await audit(cid, 'admin', req.admin.adminId, 'compliance.export', { kind, from: r.from, to: r.to });
      if(kind === 'quotes'){
        const rows = await db.prepare('SELECT q.*, a.name AS agent_name, a.agency_code FROM quote_records q LEFT JOIN agents a ON a.id = q.agent_id WHERE q.company_id = ? AND q.created_at >= ? AND q.created_at < ? ORDER BY q.id').all(cid, r.fromTs, r.toTs);
        return csv(res, 'quote-trail', toCsv(rows.map(q => ({ at: q.occurred_at || q.created_at, agent: q.agent_name || '', code: q.agency_code || '', product: q.product || '', action: q.action || '', rates: q.rates_version || '', app: q.app_version || '', terms: q.terms_version || '', lang: q.language || '', inputs: q.inputs_json || '', result: q.result_json || '' })), col([['at', 'When'], ['agent', 'Agent'], ['code', 'Agency code'], ['product', 'Product'], ['action', 'Action'], ['rates', 'Rate version'], ['app', 'App version'], ['terms', 'Terms version'], ['lang', 'Language'], ['inputs', 'Inputs'], ['result', 'Result']])));
      }
      if(kind === 'audit'){
        const rows = await db.prepare('SELECT * FROM audit_log WHERE company_id = ? AND created_at >= ? AND created_at < ? ORDER BY id').all(cid, r.fromTs, r.toTs);
        return csv(res, 'audit-log', toCsv(rows.map(a => ({ at: a.created_at, actor: a.actor_type + (a.actor_id ? ' #' + a.actor_id : ''), action: a.action, details: a.details_json || '' })), col([['at', 'When'], ['actor', 'Actor'], ['action', 'Action'], ['details', 'Details']])));
      }
      if(kind === 'applications'){
        const rows = await db.prepare("SELECT a.id, a.ref, a.status, a.product, a.submitted_at, a.signed_at, a.consent_at, a.policy_no, a.payment_status, ag.name AS agent_name, ag.agency_code FROM applications a LEFT JOIN agents ag ON ag.id = a.agent_id WHERE a.company_id = ? AND a.status <> 'draft' AND COALESCE(a.submitted_at, a.created_at) >= ? AND COALESCE(a.submitted_at, a.created_at) < ? ORDER BY a.id").all(cid, r.fromTs, r.toTs);
        const out = []; for(const a of rows){ const d = (await db.prepare('SELECT kind FROM application_docs WHERE application_id = ?').all(a.id)).map(x => x.kind).join('; '); out.push({ ref: a.ref, status: a.status, product: a.product || '', submitted: a.submitted_at || '', signed: a.signed_at || '', consent: a.consent_at || '', docs: d, policyNo: a.policy_no || '', payment: a.payment_status, agent: a.agent_name || '', code: a.agency_code || '' }); }
        return csv(res, 'application-records', toCsv(out, col([['ref', 'Reference'], ['status', 'Status'], ['product', 'Product'], ['submitted', 'Submitted'], ['signed', 'Client signed'], ['consent', 'Data consent recorded'], ['docs', 'Documents held'], ['policyNo', 'Policy no'], ['payment', 'Payment'], ['agent', 'Agent'], ['code', 'Agency code']])));
      }
      throw bad('Choose quotes, audit or applications.');
    } catch(e){ errorHandler(res, e); }
  });

  // ================= Integration: API keys + read API + webhook =================
  const keyHash = k => crypto.createHash('sha256').update(k).digest('hex');
  app.get('/api/companies/:companyId/api-keys', ...adminOnly, async (req, res) => { try { res.json((await db.prepare('SELECT id, name, key_prefix, revoked, last_used_at, created_at FROM api_keys WHERE company_id = ? ORDER BY id DESC').all(C(req))).map(k => ({ id: k.id, name: k.name, prefix: k.key_prefix, revoked: !!k.revoked, lastUsedAt: k.last_used_at || '', createdAt: k.created_at }))); } catch(e){ errorHandler(res, e); } });
  app.post('/api/companies/:companyId/api-keys', ...adminOnly, async (req, res) => {
    try {
      const name = cap(String((req.body || {}).name || '').trim(), 60); if(name.length < 3) throw bad('Name the key after the system that will use it (for example "CRM").');
      const prefix = crypto.randomBytes(4).toString('hex'), secret = crypto.randomBytes(24).toString('hex'), key = `pik_${prefix}_${secret}`;
      const info = await db.prepare("INSERT INTO api_keys (company_id, name, key_prefix, key_hash, scope) VALUES (?,?,?,?,'read')").run(C(req), name, prefix, keyHash(key));
      await audit(C(req), 'admin', req.admin.adminId, 'api_key.created', { name }); res.status(201).json({ id: info.lastInsertRowid, name, key, note: 'Copy this key now. It cannot be shown again.' });
    } catch(e){ errorHandler(res, e); }
  });
  app.delete('/api/companies/:companyId/api-keys/:id', ...adminOnly, async (req, res) => {
    try { const r = await db.prepare('UPDATE api_keys SET revoked = 1 WHERE id = ? AND company_id = ?').run(req.params.id, C(req)); if(!r.changes) throw bad('Key not found.', 404); await audit(C(req), 'admin', req.admin.adminId, 'api_key.revoked', { id: Number(req.params.id) }); res.json({ ok: true }); } catch(e){ errorHandler(res, e); }
  });
  async function apiKeyAuth(req, res, next){
    try {
      const raw = String(req.headers['x-api-key'] || '').trim(); const m = /^pik_([0-9a-f]{8})_([0-9a-f]{48})$/.exec(raw); if(!m) return res.status(401).json({ error: 'A valid X-Api-Key header is required.' });
      const k = await db.prepare('SELECT * FROM api_keys WHERE key_prefix = ? AND revoked = 0').get(m[1]); const h = keyHash(raw);
      if(!k || k.key_hash.length !== h.length || !crypto.timingSafeEqual(Buffer.from(k.key_hash), Buffer.from(h))) return res.status(401).json({ error: 'A valid X-Api-Key header is required.' });
      req.apiCompanyId = k.company_id; if(!k.last_used_at || Date.now() - new Date(k.last_used_at.replace(' ', 'T') + 'Z').getTime() > 60000) await db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(k.id);
      next();
    } catch(e){ errorHandler(res, e); }
  }
  const page = async (req, res, table, cols, map, extraWhere) => {
    const cid = req.apiCompanyId, after = parseInt(req.query.after_id, 10) || 0, lim = Math.min(parseInt(req.query.limit, 10) || 100, 500); const since = sqlDate(req.query.since);
    const rows = await db.prepare(`SELECT ${cols} FROM ${table} WHERE company_id = ? AND id > ? ${since ? 'AND created_at >= ?' : ''} ${extraWhere || ''} ORDER BY id LIMIT ?`).all(...[cid, after].concat(since ? [since] : [], [lim]));
    res.json({ data: rows.map(map), nextAfterId: rows.length === lim ? rows[rows.length - 1].id : null });
  };
  app.get('/api/v1/leads', apiKeyAuth, async (req, res) => { try { await page(req, res, 'leads', 'id, agent_id, client_name, client_phone, client_email, product, needs_summary, note, status, created_at', r => ({ id: r.id, agentId: r.agent_id, clientName: r.client_name, clientPhone: r.client_phone, clientEmail: r.client_email, product: r.product, needs: r.needs_summary, note: r.note, status: r.status, createdAt: r.created_at })); } catch(e){ errorHandler(res, e); } });
  app.get('/api/v1/applications', apiKeyAuth, async (req, res) => { try { await page(req, res, 'applications', 'id, ref, agent_id, status, product, plan_json, client_json, beneficiaries_json, declaration_json, premium_amount, payment_status, policy_no, submitted_at, created_at', r => ({ id: r.id, ref: r.ref, agentId: r.agent_id, status: r.status, product: r.product, plan: jparse(r.plan_json, {}), client: jparse(r.client_json, {}), beneficiaries: jparse(r.beneficiaries_json, []), declaration: jparse(r.declaration_json, {}), premium: r.premium_amount, paymentStatus: r.payment_status, policyNo: r.policy_no, submittedAt: r.submitted_at, createdAt: r.created_at }), "AND status <> 'draft'"); } catch(e){ errorHandler(res, e); } });
  app.get('/api/v1/policies', apiKeyAuth, async (req, res) => { try { await page(req, res, 'policies', '*', r => platform.polOut(r)); } catch(e){ errorHandler(res, e); } });
  app.get('/api/v1/complaints', apiKeyAuth, async (req, res) => { try { await page(req, res, 'complaints', 'id, ref, agent_id, client_name, client_phone, policy_no, category, description, status, resolution, due_at, created_at', r => ({ id: r.id, ref: r.ref, agentId: r.agent_id, clientName: r.client_name, clientPhone: r.client_phone, policyNo: r.policy_no, category: r.category, description: r.description, status: r.status, resolution: r.resolution, respondBy: r.due_at, createdAt: r.created_at })); } catch(e){ errorHandler(res, e); } });
  app.get('/api/v1/quotes', apiKeyAuth, async (req, res) => { try { await page(req, res, 'quote_records', 'id, agent_id, product, action, rates_version, app_version, inputs_json, result_json, occurred_at, created_at', r => ({ id: r.id, agentId: r.agent_id, product: r.product, action: r.action, ratesVersion: r.rates_version, appVersion: r.app_version, inputs: jparse(r.inputs_json, {}), result: jparse(r.result_json, {}), at: r.occurred_at || r.created_at })); } catch(e){ errorHandler(res, e); } });
  app.get('/api/v1/payments', apiKeyAuth, async (req, res) => { try { await page(req, res, 'payments', 'id, application_id, policy_id, amount, provider, status, receipt, created_at', r => ({ id: r.id, applicationId: r.application_id, policyId: r.policy_id, amount: r.amount, provider: r.provider, status: r.status, receipt: r.receipt, createdAt: r.created_at })); } catch(e){ errorHandler(res, e); } });

  app.get('/api/companies/:companyId/webhook/events', ...adminOnly, async (req, res) => {
    try { res.json((await db.prepare('SELECT id, event, status, attempts, next_attempt_at, last_error, created_at, delivered_at FROM outbound_events WHERE company_id = ? ORDER BY id DESC LIMIT 100').all(C(req))).map(r => ({ id: r.id, event: r.event, status: r.status, attempts: r.attempts, nextAttemptAt: r.next_attempt_at || '', lastError: r.last_error || '', createdAt: r.created_at, deliveredAt: r.delivered_at || '' }))); } catch(e){ errorHandler(res, e); }
  });
  app.post('/api/companies/:companyId/webhook/events/:id/retry', ...adminOnly, async (req, res) => {
    try { const r = await db.prepare("UPDATE outbound_events SET status = 'pending', attempts = 0, next_attempt_at = NULL, last_error = NULL WHERE id = ? AND company_id = ?").run(req.params.id, C(req)); if(!r.changes) throw bad('Event not found.', 404); res.json({ ok: true, delivery: await events.deliverPending(20) }); } catch(e){ errorHandler(res, e); }
  });
  app.post('/api/companies/:companyId/webhook/test', ...adminOnly, async (req, res) => {
    try {
      const cfg = await cfgMod.getConfig(C(req)); if(!cfg.webhook.enabled) throw bad('Switch the webhook on and save the address first.');
      await events.emit(C(req), 'ping', { message: 'Test event from Plan Illustrator', at: new Date().toISOString() });
      const out = await events.deliverPending(20); res.json(out);
    } catch(e){ errorHandler(res, e); }
  });
  app.post('/api/companies/:companyId/webhook/secret', ...adminOnly, async (req, res) => {
    try {
      const secret = crypto.randomBytes(32).toString('hex'); const cfg = await cfgMod.getConfig(C(req)); await cfgMod.saveConfig(C(req), cfgMod.applyPatch(cfg, { webhook: { secret } }));
      await audit(C(req), 'admin', req.admin.adminId, 'webhook.secret_regenerated', {}); res.json({ secret, note: 'Copy this secret now. It signs every delivery (X-PI-Signature = HMAC-SHA256 of the body). It cannot be shown again.' });
    } catch(e){ errorHandler(res, e); }
  });

  // ================= Release control =================
  const VER_RE = /^\d+(\.\d+){1,3}$/;
  async function adoption(cid, plan){
    const agents = await db.prepare(`SELECT id FROM agents WHERE company_id = ? AND is_active = 1 AND verified = 1 ${plan.target_group ? 'AND group_name = ?' : ''}`).all(...[cid].concat(plan.target_group ? [plan.target_group] : []));
    let on = 0, below = 0, unknown = 0;
    for(const a of agents.slice(0, 3000)){ const e = await db.prepare('SELECT app_version FROM usage_events WHERE agent_id = ? AND app_version IS NOT NULL ORDER BY id DESC').get(a.id); if(!e) unknown++; else if(security.cmpVersion(e.app_version, plan.version) >= 0) on++; else below++; }
    return { targeted: agents.length, onOrAbove: on, below, unknown };
  }
  const planOut = (p, ad) => ({ id: p.id, version: p.version, targetGroup: p.target_group || '', announceAt: p.announce_at ? p.announce_at.replace(' ', 'T') + 'Z' : '', enforceAt: p.enforce_at ? p.enforce_at.replace(' ', 'T') + 'Z' : '', banner: p.banner || '', status: p.status, createdAt: p.created_at, adoption: ad || null, phase: p.status === 'cancelled' ? 'cancelled' : p.enforce_at && p.enforce_at <= utcNow() ? 'enforced' : p.announce_at && p.announce_at <= utcNow() ? 'announced' : 'scheduled' });
  app.get('/api/companies/:companyId/release-plans', ...adminOnly, async (req, res) => {
    try {
      const rows = await db.prepare('SELECT * FROM release_plans WHERE company_id = ? ORDER BY id DESC LIMIT 50').all(C(req)); const out = [];
      for(const p of rows) out.push(planOut(p, p.status === 'cancelled' ? null : await adoption(C(req), p)));
      const groups = (await db.prepare("SELECT DISTINCT group_name FROM agents WHERE company_id = ? AND group_name IS NOT NULL AND group_name <> ''").all(C(req))).map(g => g.group_name).sort();
      res.json({ plans: out, groups });
    } catch(e){ errorHandler(res, e); }
  });
  app.post('/api/companies/:companyId/release-plans', ...adminOnly, async (req, res) => {
    try {
      const b = req.body || {}; const version = String(b.version || '').trim(); if(!VER_RE.test(version)) throw bad('Enter the version, for example 2026.11.01.');
      const ann = sqlDate(b.announceAt), enf = sqlDate(b.enforceAt); if(!enf) throw bad('Choose the date and time the update becomes compulsory.'); if(ann && ann > enf) throw bad('The banner should start before the update becomes compulsory.');
      const group = cap(String(b.targetGroup || '').trim(), 60) || null;
      if(group && !(await db.prepare('SELECT id FROM agents WHERE company_id = ? AND group_name = ?').get(C(req), group))) throw bad('No agents are in the group "' + group + '".');
      const banner = cap(String(b.banner || '').trim(), 300) || `Version ${version} becomes compulsory on ${enf.slice(0, 10)}. Please update before then, ideally while you have a good connection.`;
      const info = await db.prepare("INSERT INTO release_plans (company_id, version, target_group, announce_at, enforce_at, banner, status, created_by) VALUES (?,?,?,?,?,?,'scheduled',?)").run(C(req), version, group, ann, enf, banner, req.admin.adminId);
      await audit(C(req), 'admin', req.admin.adminId, 'release.planned', { version, group, enforceAt: enf }); res.status(201).json({ id: info.lastInsertRowid });
    } catch(e){ errorHandler(res, e); }
  });
  app.post('/api/companies/:companyId/release-plans/:id/cancel', ...adminOnly, async (req, res) => {
    try { const r = await db.prepare("UPDATE release_plans SET status = 'cancelled' WHERE id = ? AND company_id = ? AND status = 'scheduled'").run(req.params.id, C(req)); if(!r.changes) throw bad('Plan not found.', 404); await audit(C(req), 'admin', req.admin.adminId, 'release.cancelled', { id: Number(req.params.id) }); res.json({ ok: true }); } catch(e){ errorHandler(res, e); }
  });

  // ================= Scheduled rate effective dates =================
  async function activateNow(version, adminId){
    const line = await db.prepare('SELECT * FROM product_lines WHERE id = ?').get(version.product_line_id);
    await db.transaction(async () => {
      await db.prepare("UPDATE product_data_versions SET superseded_at = datetime('now') WHERE product_line_id = ? AND activated_at IS NOT NULL AND superseded_at IS NULL").run(line.id);
      await db.prepare("UPDATE product_data_versions SET activated_by = ?, activated_at = datetime('now'), scheduled_for = NULL WHERE id = ?").run(adminId || version.scheduled_by || null, version.id);
      await db.prepare('UPDATE product_lines SET is_active = 1 WHERE id = ?').run(line.id);
    });
    await audit(line.company_id, adminId ? 'admin' : 'system', adminId || null, 'product_version.activated', { lineId: line.id, versionId: version.id, scheduled: !adminId });
    return line;
  }
  let lastApply = 0;
  async function applyScheduledActivations(force){
    if(!force && Date.now() - lastApply < 15000) return 0; lastApply = Date.now();
    const due = await db.prepare('SELECT * FROM product_data_versions WHERE scheduled_for IS NOT NULL AND activated_at IS NULL AND scheduled_for <= ? ORDER BY scheduled_for, id').all(utcNow()); let n = 0;
    for(const v of due){ try { await activateNow(v, null); n++; } catch(e){ console.error('[schedule] activation failed:', e.message); } }
    return n;
  }
  async function versionFor(req){
    const v = await db.prepare('SELECT v.*, l.company_id FROM product_data_versions v JOIN product_lines l ON l.id = v.product_line_id WHERE v.id = ? AND v.product_line_id = ?').get(req.params.versionId, req.params.lineId);
    if(!v) throw bad('Version not found.', 404); if(req.admin.role !== 'superadmin' && req.admin.companyId !== v.company_id) throw bad('Not authorized for this product line', 403); return v;
  }
  app.post('/api/product-lines/:lineId/versions/:versionId/schedule', requireAdmin, async (req, res) => {
    try {
      const v = await versionFor(req); const when = sqlDate((req.body || {}).effectiveFrom);
      if(!when || when <= utcNow()) throw bad('Choose a date and time in the future. To use the rates now, activate them instead.');
      if(!v.validated) throw bad('This version has not passed validation yet.', 422); if(v.activated_at) throw bad('This version is already active.', 409);
      if(v.change_summary && !v.approved_at) throw bad('This rate change has not been approved yet.', 422);
      await db.prepare('UPDATE product_data_versions SET scheduled_for = ?, scheduled_by = ? WHERE id = ?').run(when, req.admin.adminId, v.id);
      await audit(v.company_id, 'admin', req.admin.adminId, 'product_version.scheduled', { versionId: v.id, effectiveFrom: when }); res.json({ scheduled: true, effectiveFrom: when });
    } catch(e){ errorHandler(res, e); }
  });
  app.delete('/api/product-lines/:lineId/versions/:versionId/schedule', requireAdmin, async (req, res) => {
    try { const v = await versionFor(req); await db.prepare('UPDATE product_data_versions SET scheduled_for = NULL WHERE id = ? AND activated_at IS NULL').run(v.id); await audit(v.company_id, 'admin', req.admin.adminId, 'product_version.unscheduled', { versionId: v.id }); res.json({ ok: true }); } catch(e){ errorHandler(res, e); }
  });
  // Calendar of upcoming and recent rate changes across the company's product lines.
  app.get('/api/companies/:companyId/rate-calendar', ...adminOnly, async (req, res) => {
    try {
      const rows = await db.prepare('SELECT v.id, v.version_number, v.scheduled_for, v.activated_at, v.change_summary, l.display_name, l.engine_type FROM product_data_versions v JOIN product_lines l ON l.id = v.product_line_id WHERE l.company_id = ? AND (v.scheduled_for IS NOT NULL OR v.activated_at IS NOT NULL) ORDER BY COALESCE(v.scheduled_for, v.activated_at) DESC LIMIT 60').all(C(req));
      res.json(rows.map(r => ({ versionId: r.id, line: r.display_name, engine: r.engine_type, versionNumber: r.version_number, summary: r.change_summary || '', scheduledFor: r.scheduled_for && !r.activated_at ? r.scheduled_for.replace(' ', 'T') + 'Z' : '', activatedAt: r.activated_at ? r.activated_at.replace(' ', 'T') + 'Z' : '' })));
    } catch(e){ errorHandler(res, e); }
  });

  // ================= Onboarding a new insurer =================
  const hexColor = /^#[0-9a-fA-F]{6}$/;
  app.post('/api/companies/onboard', requireSuperadmin, async (req, res) => {
    try {
      const b = req.body || {}; const name = cap(String(b.name || '').trim(), 200); if(name.length < 3) throw bad('Enter the company name.');
      const slug = String(b.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60); if(slug.length < 3) throw bad('The web name needs at least 3 letters or numbers.');
      for(const k of ['colorPrimary', 'colorSecondary', 'colorAccent']) if(b[k] && !hexColor.test(b[k])) throw bad(k + ' must be a colour like #7c2434.');
      const email = String(b.adminEmail || '').trim().toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw bad('Enter the first administrator\'s email address.');
      if(await db.prepare('SELECT id FROM admin_users WHERE email = ?').get(email)) throw bad('That administrator email is already in use.', 409);
      if(await db.prepare('SELECT id FROM companies WHERE slug = ?').get(slug)) throw bad('That web name is already used.', 409);
      const products = (Array.isArray(b.products) ? b.products : ['fanaka', 'faida', 'smartsave']).filter(p => ['fanaka', 'faida', 'smartsave'].includes(p));
      const temp = crypto.randomBytes(9).toString('base64url'); let companyId;
      await db.transaction(async () => {
        const info = await db.prepare('INSERT INTO companies (name, slug, logo_url, color_primary, color_secondary, color_accent, contact_footer, disclaimer_text, currency_code, locale, app_name, support_phone, support_email, website) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(name, slug, cap(String(b.logoUrl || ''), 500) || null, b.colorPrimary || '#7c2434', b.colorSecondary || '#4c1520', b.colorAccent || '#b8863a', cap(String(b.contactFooter || ''), 500) || null, cap(String(b.disclaimerText || ''), 4000) || null, 'KES', 'en-KE', cap(String(b.appName || ''), 60) || null, cap(String(b.supportPhone || ''), 30) || null, cap(String(b.supportEmail || ''), 160) || null, cap(String(b.website || ''), 200) || null);
        companyId = info.lastInsertRowid;
        await db.prepare("INSERT INTO admin_users (company_id, email, password_hash, role) VALUES (?,?,?,'company_admin')").run(companyId, email, bcrypt.hashSync(temp, 10));
        await db.prepare('INSERT INTO app_control (company_id, latest_version, min_version, require_update) VALUES (?,?,?,0)').run(companyId, null, null);
        await cfgMod.saveConfig(companyId, cfgMod.applyPatch(cfgMod.DEFAULTS, { leadsEmail: b.leadsEmail || '' }));
        const names = { fanaka: 'Fanaka', faida: 'Faida', smartsave: 'Smart Save' };
        for(const p of products) await db.prepare('INSERT INTO product_lines (company_id, engine_type, display_name, is_active) VALUES (?,?,?,0)').run(companyId, p, names[p]);
      });
      await audit(companyId, 'admin', req.admin.adminId, 'company.onboarded', { name, slug });
      const base = String(b.publicUrl || '').replace(/\/+$/, '');
      res.status(201).json({ companyId, slug, admin: { email, temporaryPassword: temp, note: 'Share this once. The administrator should change it on first sign-in.' }, installLink: base ? `${base}/app?api=${encodeURIComponent(base)}&company=${companyId}` : null });
    } catch(e){ if(String(e.message).includes('UNIQUE') || e.code === '23505') return res.status(409).json({ error: 'That name or email is already in use.' }); errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/onboarding', ...adminOnly, async (req, res) => {
    try {
      const cid = C(req); const co = await db.prepare('SELECT * FROM companies WHERE id = ?').get(cid); if(!co) throw bad('Company not found.', 404); const cfg = await cfgMod.getConfig(cid);
      const n = async (sql, ...p) => Number((await db.prepare(sql).get(...p)).n);
      const sms = await db.prepare('SELECT enabled FROM sms_settings WHERE company_id = ?').get(cid); const smsOn = !!(sms && sms.enabled) || (process.env.SMS_PROVIDER && process.env.SMS_PROVIDER !== 'console');
      const steps = [
        { key: 'branding', label: 'Brand the app', done: !!(co.logo_url && co.contact_footer && co.disclaimer_text), hint: 'Branding tab: logo, printed-illustration footer and terms text.' },
        { key: 'admin', label: 'Create the company administrators (two, so changes can be approved by a second person)', done: (await n("SELECT COUNT(*) AS n FROM admin_users WHERE company_id = ? AND is_active = 1", cid)) >= 2, hint: 'Admin users tab.' },
        { key: 'rates', label: 'Load and activate the company\'s approved rates', done: (await n('SELECT COUNT(*) AS n FROM product_lines WHERE company_id = ? AND is_active = 1', cid)) > 0, hint: 'Product lines tab: upload, validate, activate. Until then the app uses the built-in demo rates.' },
        { key: 'signing', label: 'Set the access-lease signing key on the server', done: !!security.publicJwk(), hint: 'Run scripts/make-signing-key.js, then set APP_SIGNING_PRIVATE_KEY.' },
        { key: 'sms', label: 'Switch on SMS login codes (or rely on email codes)', done: !!smsOn, hint: 'Login & SMS tab.' },
        { key: 'leads', label: 'Say where leads, applications and complaints are emailed', done: !!cfg.leadsEmail, hint: 'Settings tab: leads email.' },
        { key: 'agents', label: 'Add the first agents', done: (await n('SELECT COUNT(*) AS n FROM agents WHERE company_id = ? AND verified = 1', cid)) > 0, hint: 'Agents tab: import a spreadsheet, or let agents register themselves.' },
        { key: 'licensing', label: 'Decide whether licence and quiz checks apply', done: cfg.licensing.required, hint: 'Settings tab: licensing. Optional.' },
        { key: 'payments', label: 'Decide how premiums are collected', done: !!(cfg.payments.manualInstructions || cfg.payments.mpesaEnabled), hint: 'Settings tab: payment instructions or M-Pesa.' },
        { key: 'first', label: 'First illustration printed or shared by an agent', done: (await n('SELECT COUNT(*) AS n FROM quote_records WHERE company_id = ?', cid)) > 0, hint: 'Appears automatically once an agent uses the app.' }
      ];
      res.json({ steps, percent: Math.round(steps.filter(s => s.done).length / steps.length * 100) });
    } catch(e){ errorHandler(res, e); }
  });

  // ================= Background jobs =================
  const timers = [];
  function startSchedulers(){
    if(process.env.PI_NO_SCHEDULERS === '1') return;
    const every = (ms, fn) => { const t = setInterval(() => fn().catch(e => console.error('[job]', e.message)), ms); t.unref(); timers.push(t); };
    every(30000, () => events.deliverPending(20));
    every(60000, () => applyScheduledActivations(true));
    every(3600000, async () => { const d = new Date(); if(d.getUTCDay() !== 1 || d.getUTCHours() < 4) return; for(const c of await db.prepare('SELECT id FROM companies WHERE is_active = 1').all()){ const cfg = await cfgMod.getConfig(c.id); if(cfg.weeklyReport) await sendWeekly(c.id, false).catch(e => console.error('[weekly]', e.message)); } });
    every(24 * 3600000, () => platform.runRetentionAll());
    setTimeout(() => platform.runRetentionAll().catch(() => {}), 60000).unref();
  }
  return { applyScheduledActivations, startSchedulers, sendWeekly, summary, conversion, activateNow };
};
