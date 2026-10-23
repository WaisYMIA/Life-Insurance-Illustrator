/**
 * Usage analytics, feedback and app-update control.
 *
 * What this collects, and why it is limited the way it is:
 *   - WHO: the agent's name and phone (already held in `agents`) so reports
 *     can be broken down per person. Disclosed in the Terms gate.
 *   - WHAT: coarse usage events from an allow-list (app opened, calculation
 *     completed for product X, illustration printed, diagnosis completed,
 *     update checked, error). Properties are filtered to short primitives.
 *   - NOT collected: client names, dates of birth, amounts, or anything the
 *     agent types about a client. Those never leave the device.
 *
 * Everything reporting-related is computed from the server receipt time
 * (created_at), not the device clock, because phones' clocks are wrong often
 * enough to make per-day charts misleading.
 */
'use strict';

const REPORT_EMAIL_DEFAULT = 'walterjungah9@outlook.com';
const feedbackRecipient = () => process.env.FEEDBACK_EMAIL || REPORT_EMAIL_DEFAULT;
const reportRecipient = () => process.env.REPORT_EMAIL || process.env.FEEDBACK_EMAIL || REPORT_EMAIL_DEFAULT;

const ALLOWED_EVENTS = new Set([
  'app_open', 'login', 'terms_accepted',
  'calc_completed', 'illustration_printed',
  'diagnosis_started', 'diagnosis_completed',
  'feedback_sent', 'update_check', 'update_applied',
  'install_prompt_shown', 'app_installed', 'js_error', 'logout', 'profile_updated', 'help_opened', 'help_search_miss'
]);
// Property names an event may carry. Anything else (e.g. a stray clientName) is dropped on the server even if a
// client sends it — the privacy promise is enforced here, not only in the app.
const ALLOWED_PROP_KEYS = new Set(['product', 'plan', 'mode', 'term', 'freq', 'riders', 'verified', 'otp', 'topProduct', 'goal', 'result', 'from', 'to', 'msg', 'where', 'q']);
const FEEDBACK_CATEGORIES = new Set(['bug', 'idea', 'question', 'praise', 'other']);

function sinceStr(days){
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
}
function clampDays(raw, dflt, max){
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max || 365) : dflt;
}
const num = v => Number(v) || 0;

function cleanProps(props){
  const out = {};
  if(!props || typeof props !== 'object' || Array.isArray(props)) return out;
  let n = 0;
  for(const [k, v] of Object.entries(props)){
    if(n >= 8) break;
    if(!ALLOWED_PROP_KEYS.has(k)) continue;
    if(typeof v === 'string') out[k] = v.slice(0, 80);
    else if(typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if(typeof v === 'boolean') out[k] = v;
    else continue;
    n++;
  }
  return out;
}

// Dotted-numeric version compare: "2026.10.18" vs "2026.10.9". Non-numeric parts count as 0.
function cmpVersion(a, b){
  const pa = String(a || '0').split('.').map(x => parseInt(x, 10) || 0);
  const pb = String(b || '0').split('.').map(x => parseInt(x, 10) || 0);
  for(let i = 0; i < Math.max(pa.length, pb.length); i++){
    const d = (pa[i] || 0) - (pb[i] || 0);
    if(d) return d > 0 ? 1 : -1;
  }
  return 0;
}

// Spreadsheet formula-injection guard: a name like "=HYPERLINK(...)" must not execute when opened in Excel.
function csvCell(v){
  let s = v === null || v === undefined ? '' : String(v);
  if(/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(rows, cols){
  return [cols.map(c => csvCell(c.label)).join(',')]
    .concat(rows.map(r => cols.map(c => csvCell(r[c.key])).join(','))).join('\r\n') + '\r\n';
}

module.exports = function registerAnalytics(app, deps){
  const { db, requireAdmin, requireAgent, scopeToCompany, rateLimit, ipKeyGenerator, audit, sendEmail, errorHandler } = deps;

  const telemetryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${(req.agent && req.agent.agentId) || ''}`
  });
  const feedbackLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${(req.agent && req.agent.agentId) || ''}`,
    message: { error: 'You have sent a lot of feedback recently. Please try again later.' }
  });

  async function activeAgent(req){
    return db.prepare('SELECT * FROM agents WHERE id = ? AND company_id = ? AND is_active = 1').get(req.agent.agentId, req.params.companyId);
  }

  // ------------------------------------------------------------------
  // App control (update policy)
  // ------------------------------------------------------------------
  async function getControl(companyId){
    const row = await db.prepare('SELECT * FROM app_control WHERE company_id = ?').get(companyId);
    return {
      latestVersion: row ? row.latest_version : null,
      minVersion: row ? row.min_version : null,
      checkIntervalDays: row ? num(row.check_interval_days) || 7 : 7,
      maxOfflineDays: row ? num(row.max_offline_days) : 30,
      requireUpdate: row ? row.require_update !== 0 && row.require_update !== false : true,
      notice: row ? row.notice : null
    };
  }

  // Public: installed apps read this (no login needed — it contains no private data).
  app.get('/api/public/companies/:companyId/app-control', async (req, res) => {
    try { res.json(await getControl(req.params.companyId)); } catch(e){ errorHandler(res, e); }
  });

  app.get('/api/companies/:companyId/app-control', requireAdmin, scopeToCompany, async (req, res) => {
    try { res.json(await getControl(req.params.companyId)); } catch(e){ errorHandler(res, e); }
  });

  app.put('/api/companies/:companyId/app-control', requireAdmin, scopeToCompany, async (req, res) => {
    try {
      const b = req.body || {};
      const ver = v => (v === null || v === undefined || v === '') ? null : (/^\d+(\.\d+){0,3}$/.test(String(v)) ? String(v) : false);
      const latest = ver(b.latestVersion), min = ver(b.minVersion);
      if(latest === false || min === false) throw { status: 400, message: 'Versions must look like 2026.10.18 or 1.4.0.' };
      const interval = clampDays(b.checkIntervalDays, 7, 90);
      let maxOffline = parseInt(b.maxOfflineDays, 10);
      if(!Number.isFinite(maxOffline) || maxOffline < 0) maxOffline = 30;
      maxOffline = Math.min(maxOffline, 365);
      const requireUpdate = b.requireUpdate === false || b.requireUpdate === 0 || b.requireUpdate === 'false' ? 0 : 1;
      const notice = typeof b.notice === 'string' && b.notice.trim() ? b.notice.trim().slice(0, 300) : null;
      const exists = await db.prepare('SELECT company_id FROM app_control WHERE company_id = ?').get(req.params.companyId);
      if(exists){
        await db.prepare("UPDATE app_control SET latest_version=?, min_version=?, check_interval_days=?, max_offline_days=?, require_update=?, notice=?, updated_at=datetime('now') WHERE company_id=?")
          .run(latest, min, interval, maxOffline, requireUpdate, notice, req.params.companyId);
      } else {
        await db.prepare('INSERT INTO app_control (company_id, latest_version, min_version, check_interval_days, max_offline_days, require_update, notice) VALUES (?,?,?,?,?,?,?)')
          .run(req.params.companyId, latest, min, interval, maxOffline, requireUpdate, notice);
      }
      await audit(Number(req.params.companyId), 'admin', req.admin.adminId, 'app_control.updated', { latest, min, interval, maxOffline, requireUpdate });
      res.json(await getControl(req.params.companyId));
    } catch(e){ errorHandler(res, e); }
  });

  // ------------------------------------------------------------------
  // Telemetry ingest (agent token required)
  // ------------------------------------------------------------------
  app.post('/api/companies/:companyId/telemetry', requireAgent, telemetryLimiter, async (req, res) => {
    try {
      const agent = await activeAgent(req);
      if(!agent) return res.status(403).json({ error: 'Agent not active' });
      const events = Array.isArray(req.body && req.body.events) ? req.body.events.slice(0, 50) : [];
      let accepted = 0;
      for(const ev of events){
        if(!ev || !ALLOWED_EVENTS.has(ev.event)) continue;
        const at = typeof ev.at === 'string' && !isNaN(Date.parse(ev.at)) ? new Date(ev.at).toISOString() : new Date().toISOString();
        const version = typeof ev.appVersion === 'string' ? ev.appVersion.slice(0, 20) : null;
        const mode = ['standalone', 'browser', 'minimal-ui', 'fullscreen'].includes(ev.displayMode) ? ev.displayMode : null;
        const session = typeof ev.sessionId === 'string' ? ev.sessionId.slice(0, 40) : null;
        const props = cleanProps(ev.props);
        await db.prepare('INSERT INTO usage_events (company_id, agent_id, session_id, event, props_json, app_version, display_mode, occurred_at) VALUES (?,?,?,?,?,?,?,?)')
          .run(agent.company_id, agent.id, session, ev.event, Object.keys(props).length ? JSON.stringify(props) : null, version, mode, at);
        accepted++;
      }
      res.json({ accepted });
    } catch(e){ errorHandler(res, e); }
  });

  // ------------------------------------------------------------------
  // Feedback (agent token required) — stored, then emailed
  // ------------------------------------------------------------------
  async function emailFeedback(companyId, fb, agent, company){
    const lines = [
      `New feedback from the Plan Illustrator${company ? ' (' + company.name + ')' : ''}`,
      '',
      `From:      ${agent.name} (${agent.phone})${agent.email ? ' <' + agent.email + '>' : ''}${agent.agency_code ? ' — agency code ' + agent.agency_code : ''}`,
      `Category:  ${fb.category}`,
      `Rating:    ${fb.rating ? fb.rating + ' / 5' : 'not given'}`,
      `App ver.:  ${fb.app_version || 'unknown'}`,
      `Received:  ${new Date().toISOString()}`,
      '',
      'Message:',
      fb.message
    ];
    return sendEmail(companyId, feedbackRecipient(), `[Plan Illustrator] ${fb.category} feedback from ${agent.name}`, lines.join('\n'));
  }

  app.post('/api/companies/:companyId/feedback', requireAgent, feedbackLimiter, async (req, res) => {
    try {
      const agent = await activeAgent(req);
      if(!agent) return res.status(403).json({ error: 'Agent not active' });
      const b = req.body || {};
      const message = typeof b.message === 'string' ? b.message.trim().slice(0, 2000) : '';
      if(message.length < 3) throw { status: 400, message: 'Please write a short message.' };
      const category = FEEDBACK_CATEGORIES.has(b.category) ? b.category : 'other';
      let rating = parseInt(b.rating, 10);
      rating = rating >= 1 && rating <= 5 ? rating : null;
      const appVersion = typeof b.appVersion === 'string' ? b.appVersion.slice(0, 20) : null;
      const info = await db.prepare('INSERT INTO feedback (company_id, agent_id, category, rating, message, app_version) VALUES (?,?,?,?,?,?)')
        .run(agent.company_id, agent.id, category, rating, message, appVersion);
      const fb = { category, rating, message, app_version: appVersion };
      const company = await db.prepare('SELECT name FROM companies WHERE id = ?').get(agent.company_id);
      let status = 'sent';
      try { await emailFeedback(agent.company_id, fb, agent, company); }
      catch(e){ status = 'failed'; console.error('Feedback email failed:', e.message); }
      await db.prepare('UPDATE feedback SET emailed_status = ? WHERE id = ?').run(status, info.lastInsertRowid);
      res.status(201).json({ received: true, id: info.lastInsertRowid, emailed: status === 'sent' });
    } catch(e){ errorHandler(res, e); }
  });

  app.get('/api/companies/:companyId/feedback', requireAdmin, scopeToCompany, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
      res.json(await db.prepare(
        `SELECT f.id, f.category, f.rating, f.message, f.app_version, f.emailed_status, f.created_at, a.name AS agent_name, a.phone AS agent_phone, a.email AS agent_email, a.agency_code AS agent_agency_code
         FROM feedback f LEFT JOIN agents a ON a.id = f.agent_id WHERE f.company_id = ? ORDER BY f.id DESC LIMIT ?`).all(req.params.companyId, limit));
    } catch(e){ errorHandler(res, e); }
  });

  // ------------------------------------------------------------------
  // Reports
  // ------------------------------------------------------------------
  function productOf(row){
    try { const p = row.props_json ? JSON.parse(row.props_json) : {}; return p.product || 'unknown'; } catch(e){ return 'unknown'; }
  }

  // Latest known app version and display mode per agent. Each comes from that agent's most recent event that
  // reported it, so one event type omitting a field can't blank the other.
  async function latestClientInfo(companyId){
    const vers = await db.prepare(
      `SELECT e.agent_id, e.app_version FROM usage_events e
       JOIN (SELECT agent_id, MAX(id) AS mid FROM usage_events WHERE company_id = ? AND app_version IS NOT NULL GROUP BY agent_id) m ON m.mid = e.id`).all(companyId);
    const modes = await db.prepare(
      `SELECT e.agent_id, e.display_mode FROM usage_events e
       JOIN (SELECT agent_id, MAX(id) AS mid FROM usage_events WHERE company_id = ? AND display_mode IS NOT NULL GROUP BY agent_id) m ON m.mid = e.id`).all(companyId);
    const out = new Map();
    for(const v of vers) out.set(v.agent_id, { app_version: v.app_version, display_mode: null });
    for(const m of modes){ const o = out.get(m.agent_id) || { app_version: null, display_mode: null }; o.display_mode = m.display_mode; out.set(m.agent_id, o); }
    return out;
  }

  async function buildSummary(companyId, days){
    const since = sinceStr(days);
    const control = await getControl(companyId);
    const totalAgents = num((await db.prepare('SELECT COUNT(*) AS n FROM agents WHERE company_id = ?').get(companyId)).n);
    const newAgents = num((await db.prepare('SELECT COUNT(*) AS n FROM agents WHERE company_id = ? AND created_at >= ?').get(companyId, since)).n);
    const activeAgents = num((await db.prepare('SELECT COUNT(DISTINCT agent_id) AS n FROM usage_events WHERE company_id = ? AND created_at >= ?').get(companyId, since)).n);
    const byEvent = {};
    for(const r of await db.prepare('SELECT event, COUNT(*) AS n FROM usage_events WHERE company_id = ? AND created_at >= ? GROUP BY event').all(companyId, since)) byEvent[r.event] = num(r.n);
    const daily = (await db.prepare(
      `SELECT substr(created_at,1,10) AS day, COUNT(DISTINCT agent_id) AS active_agents,
              SUM(CASE WHEN event = 'calc_completed' THEN 1 ELSE 0 END) AS calculations
       FROM usage_events WHERE company_id = ? AND created_at >= ? GROUP BY substr(created_at,1,10) ORDER BY day`).all(companyId, since))
      .map(r => ({ day: r.day, activeAgents: num(r.active_agents), calculations: num(r.calculations) }));
    const calcRows = await db.prepare("SELECT props_json FROM usage_events WHERE company_id = ? AND created_at >= ? AND event = 'calc_completed' LIMIT 100000").all(companyId, since);
    const products = {};
    for(const r of calcRows){ const p = productOf(r); products[p] = (products[p] || 0) + 1; }
    const diagRows = await db.prepare("SELECT props_json FROM usage_events WHERE company_id = ? AND created_at >= ? AND event = 'diagnosis_completed' LIMIT 100000").all(companyId, since);
    const diagTop = {};
    for(const r of diagRows){ try { const p = JSON.parse(r.props_json || '{}'); const k = p.topProduct || 'unknown'; diagTop[k] = (diagTop[k] || 0) + 1; } catch(e){} }

    const clientInfo = await latestClientInfo(companyId);
    const versions = {}; let outdated = 0, installed = 0, withVersion = 0;
    for(const r of clientInfo.values()){
      if(r.app_version){
        withVersion++;
        versions[r.app_version] = (versions[r.app_version] || 0) + 1;
        if(control.latestVersion && cmpVersion(r.app_version, control.latestVersion) < 0) outdated++;
      }
      if(r.display_mode === 'standalone') installed++;
    }
    const inactive = num((await db.prepare(
      `SELECT COUNT(*) AS n FROM agents a WHERE a.company_id = ? AND a.is_active = 1
       AND NOT EXISTS (SELECT 1 FROM usage_events e WHERE e.agent_id = a.id AND e.created_at >= ?)`).get(companyId, since)).n);
    const errRows = await db.prepare("SELECT props_json FROM usage_events WHERE company_id = ? AND created_at >= ? AND event = 'js_error' ORDER BY id DESC LIMIT 500").all(companyId, since);
    const errs = {};
    for(const r of errRows){ try { const m = (JSON.parse(r.props_json || '{}').msg) || 'unknown'; errs[m] = (errs[m] || 0) + 1; } catch(e){} }
    const topErrors = Object.entries(errs).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([message, count]) => ({ message, count }));
    const helpRows = await db.prepare("SELECT props_json FROM usage_events WHERE company_id = ? AND created_at >= ? AND event = 'help_search_miss' ORDER BY id DESC LIMIT 1000").all(companyId, since);
    const misses = {};
    for(const r of helpRows){ try { const q = String((JSON.parse(r.props_json || '{}').q) || '').toLowerCase().trim(); if(q) misses[q] = (misses[q] || 0) + 1; } catch(e){} }
    const helpMisses = Object.entries(misses).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([query, count]) => ({ query, count }));
    const fbRow = await db.prepare('SELECT COUNT(*) AS n, AVG(rating) AS avg FROM feedback WHERE company_id = ? AND created_at >= ?').get(companyId, since);

    return {
      periodDays: days, since,
      agents: { total: totalAgents, active: activeAgents, new: newAgents, inactive },
      totals: {
        appOpens: byEvent.app_open || 0, calculations: byEvent.calc_completed || 0,
        illustrationsPrinted: byEvent.illustration_printed || 0, diagnosesCompleted: byEvent.diagnosis_completed || 0,
        errors: byEvent.js_error || 0
      },
      byEvent, products, diagnosisTopProduct: diagTop, daily,
      versions, latestVersion: control.latestVersion, minVersion: control.minVersion,
      agentsOnOutdatedVersion: outdated, agentsInstalledAsApp: installed, agentsWithKnownVersion: withVersion,
      topErrors, helpMisses, helpOpens: byEvent.help_opened || 0,
      feedback: { count: num(fbRow.n), averageRating: fbRow.avg === null || fbRow.avg === undefined ? null : Math.round(Number(fbRow.avg) * 10) / 10 }
    };
  }

  async function buildAgentList(companyId, days){
    const since = sinceStr(days);
    const agents = await db.prepare('SELECT id, name, phone, email, agency_code, verified, accepted_terms_at, created_at, is_active FROM agents WHERE company_id = ? ORDER BY name').all(companyId);
    const stats = await db.prepare(
      `SELECT agent_id, COUNT(*) AS events, MAX(created_at) AS last_active, MIN(created_at) AS first_active,
              COUNT(DISTINCT substr(created_at,1,10)) AS active_days,
              SUM(CASE WHEN event = 'calc_completed' THEN 1 ELSE 0 END) AS calculations,
              SUM(CASE WHEN event = 'illustration_printed' THEN 1 ELSE 0 END) AS prints,
              SUM(CASE WHEN event = 'diagnosis_completed' THEN 1 ELSE 0 END) AS diagnoses
       FROM usage_events WHERE company_id = ? AND created_at >= ? GROUP BY agent_id`).all(companyId, since);
    const byId = new Map(stats.map(s => [s.agent_id, s]));
    const lastAny = await db.prepare('SELECT agent_id, MAX(created_at) AS last_seen FROM usage_events WHERE company_id = ? GROUP BY agent_id').all(companyId);
    const lastMap = new Map(lastAny.map(s => [s.agent_id, s.last_seen]));
    const verMap = await latestClientInfo(companyId);
    return agents.map(a => {
      const s = byId.get(a.id) || {}; const v = verMap.get(a.id) || {};
      return {
        id: a.id, name: a.name, phone: a.phone, email: a.email || '', agencyCode: a.agency_code || '', verified: !!a.verified, active: !!a.is_active,
        registered: a.created_at, acceptedTerms: a.accepted_terms_at,
        lastSeen: lastMap.get(a.id) || null,
        eventsInPeriod: num(s.events), activeDays: num(s.active_days), calculations: num(s.calculations),
        printed: num(s.prints), diagnoses: num(s.diagnoses),
        appVersion: v.app_version || null, installedAsApp: v.display_mode === 'standalone'
      };
    });
  }

  app.get('/api/companies/:companyId/usage/summary', requireAdmin, scopeToCompany, async (req, res) => {
    try { res.json(await buildSummary(req.params.companyId, clampDays(req.query.days, 30))); } catch(e){ errorHandler(res, e); }
  });

  app.get('/api/companies/:companyId/usage/agents', requireAdmin, scopeToCompany, async (req, res) => {
    try {
      const rows = await buildAgentList(req.params.companyId, clampDays(req.query.days, 30));
      if(req.query.format === 'csv'){
        const cols = [
          { key: 'agencyCode', label: 'Agency code' }, { key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'verified', label: 'Verified' },
          { key: 'registered', label: 'Registered' }, { key: 'lastSeen', label: 'Last seen' }, { key: 'activeDays', label: 'Active days (period)' },
          { key: 'calculations', label: 'Calculations (period)' }, { key: 'printed', label: 'Illustrations printed (period)' },
          { key: 'diagnoses', label: 'Diagnoses (period)' }, { key: 'appVersion', label: 'App version' }, { key: 'installedAsApp', label: 'Installed as app' }
        ];
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="agents-usage.csv"');
        return res.send('﻿' + toCsv(rows, cols));
      }
      res.json(rows);
    } catch(e){ errorHandler(res, e); }
  });

  app.get('/api/companies/:companyId/agents/:agentId/usage', requireAdmin, scopeToCompany, async (req, res) => {
    try {
      const companyId = req.params.companyId;
      const days = clampDays(req.query.days, 90);
      const agent = await db.prepare('SELECT id, name, phone, email, agency_code, verified, accepted_terms_at, created_at, is_active FROM agents WHERE id = ? AND company_id = ?').get(req.params.agentId, companyId);
      if(!agent) throw { status: 404, message: 'Agent not found' };
      const since = sinceStr(days);
      const byEvent = {};
      for(const r of await db.prepare('SELECT event, COUNT(*) AS n FROM usage_events WHERE agent_id = ? AND created_at >= ? GROUP BY event').all(agent.id, since)) byEvent[r.event] = num(r.n);
      const daily = (await db.prepare(
        `SELECT substr(created_at,1,10) AS day, COUNT(*) AS events, SUM(CASE WHEN event = 'calc_completed' THEN 1 ELSE 0 END) AS calculations
         FROM usage_events WHERE agent_id = ? AND created_at >= ? GROUP BY substr(created_at,1,10) ORDER BY day`).all(agent.id, since))
        .map(r => ({ day: r.day, events: num(r.events), calculations: num(r.calculations) }));
      const calcRows = await db.prepare("SELECT props_json FROM usage_events WHERE agent_id = ? AND created_at >= ? AND event = 'calc_completed' LIMIT 50000").all(agent.id, since);
      const products = {};
      for(const r of calcRows){ const p = productOf(r); products[p] = (products[p] || 0) + 1; }
      const span = await db.prepare('SELECT MIN(created_at) AS first_seen, MAX(created_at) AS last_seen, COUNT(DISTINCT session_id) AS sessions FROM usage_events WHERE agent_id = ?').get(agent.id);
      const verRows = await db.prepare('SELECT app_version, display_mode, MAX(created_at) AS last_used FROM usage_events WHERE agent_id = ? AND app_version IS NOT NULL GROUP BY app_version, display_mode ORDER BY last_used DESC').all(agent.id);
      const recent = (await db.prepare('SELECT event, props_json, app_version, display_mode, created_at FROM usage_events WHERE agent_id = ? ORDER BY id DESC LIMIT 50').all(agent.id))
        .map(r => ({ event: r.event, props: r.props_json ? JSON.parse(r.props_json) : null, appVersion: r.app_version, displayMode: r.display_mode, at: r.created_at }));
      const feedback = await db.prepare('SELECT category, rating, message, created_at FROM feedback WHERE agent_id = ? ORDER BY id DESC LIMIT 20').all(agent.id);
      res.json({
        agent: { id: agent.id, name: agent.name, phone: agent.phone, email: agent.email || '', agencyCode: agent.agency_code || '', verified: !!agent.verified, active: !!agent.is_active, registered: agent.created_at, acceptedTerms: agent.accepted_terms_at },
        periodDays: days, firstSeen: span.first_seen, lastSeen: span.last_seen, sessionsAllTime: num(span.sessions),
        totals: { calculations: byEvent.calc_completed || 0, printed: byEvent.illustration_printed || 0, diagnoses: byEvent.diagnosis_completed || 0, appOpens: byEvent.app_open || 0, errors: byEvent.js_error || 0 },
        byEvent, products, daily, versions: verRows, recent, feedback
      });
    } catch(e){ errorHandler(res, e); }
  });

  // ------------------------------------------------------------------
  // Emailed digest (weekly by default) — also triggerable on demand
  // ------------------------------------------------------------------
  function digestText(company, s, agents, days){
    const pad = (t, n) => String(t).padEnd(n).slice(0, n);
    const lines = [];
    lines.push(`Plan Illustrator usage summary — ${company.name}`);
    lines.push(`Period: last ${days} days (since ${s.since} UTC)`);
    lines.push('');
    lines.push(`Agents: ${s.agents.total} registered, ${s.agents.active} active, ${s.agents.new} new, ${s.agents.inactive} inactive`);
    lines.push(`Activity: ${s.totals.appOpens} app opens, ${s.totals.calculations} calculations, ${s.totals.illustrationsPrinted} illustrations printed, ${s.totals.diagnosesCompleted} needs diagnoses`);
    const prod = Object.entries(s.products).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(', ');
    lines.push(`Calculations by product: ${prod || 'none'}`);
    lines.push(`App versions in use: ${Object.entries(s.versions).map(([k, v]) => `${k} (${v})`).join(', ') || 'unknown'}${s.latestVersion ? `  | latest released: ${s.latestVersion}` : ''}${s.agentsOnOutdatedVersion ? `  | ${s.agentsOnOutdatedVersion} agent(s) behind` : ''}`);
    lines.push(`Installed as an app: ${s.agentsInstalledAsApp} of ${s.agentsWithKnownVersion}`);
    lines.push(`Errors: ${s.totals.errors}${s.topErrors.length ? ' — top: ' + s.topErrors.map(e => `"${e.message}" x${e.count}`).join('; ') : ''}`);
    lines.push(`Feedback received: ${s.feedback.count}${s.feedback.averageRating ? ` (average rating ${s.feedback.averageRating}/5)` : ''}`);
    lines.push('');
    lines.push('Per agent (this period):');
    lines.push(pad('Name', 24) + pad('Phone', 13) + pad('Calcs', 7) + pad('Prints', 8) + pad('Diag.', 7) + 'Last seen (UTC)');
    for(const a of agents.slice().sort((x, y) => y.calculations - x.calculations)){
      lines.push(pad(a.name + (a.agencyCode ? ' [' + a.agencyCode + ']' : ''), 24) + pad(a.phone, 13) + pad(a.calculations, 7) + pad(a.printed, 8) + pad(a.diagnoses, 7) + (a.lastSeen || 'never'));
    }
    return lines.join('\n');
  }

  async function sendDigest(companyId, days){
    const company = await db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
    if(!company) throw { status: 404, message: 'Company not found' };
    const s = await buildSummary(companyId, days);
    const agents = await buildAgentList(companyId, days);
    const to = reportRecipient();
    await sendEmail(company.id, to, `[Plan Illustrator] ${days}-day usage summary — ${company.name}`, digestText(company, s, agents, days));
    await audit(company.id, 'system', null, 'usage.digest_sent', { days, to });
    return { sent: true, to };
  }

  app.post('/api/companies/:companyId/usage/email-report', requireAdmin, scopeToCompany, async (req, res) => {
    try { res.json(await sendDigest(Number(req.params.companyId), clampDays(req.query.days, 7))); } catch(e){ errorHandler(res, e); }
  });

  // Runs hourly; sends a company's digest if none has gone out within DIGEST_EVERY_DAYS (default 7).
  // "Last sent" lives in audit_log, so a restart neither skips nor duplicates a digest. NOTE: a host that
  // sleeps when idle (free tiers) will only run this while awake — call POST .../usage/email-report from a
  // cron job there instead.
  async function runDigestCheck(){
    const every = clampDays(process.env.DIGEST_EVERY_DAYS, 7, 90);
    if(process.env.DIGEST_ENABLED === 'false') return;
    const companies = await db.prepare('SELECT id FROM companies WHERE is_active = 1').all();
    for(const c of companies){
      const last = await db.prepare("SELECT MAX(created_at) AS t FROM audit_log WHERE company_id = ? AND action = 'usage.digest_sent'").get(c.id);
      if(last && last.t && last.t >= sinceStr(every)) continue;
      try { await sendDigest(c.id, every); } catch(e){ console.error('Usage digest failed:', e.message); }
    }
  }
  function startDigestScheduler(){
    const t = setInterval(() => { runDigestCheck().catch(e => console.error(e)); }, 60 * 60 * 1000);
    if(t.unref) t.unref();
    setTimeout(() => { runDigestCheck().catch(e => console.error(e)); }, 60 * 1000).unref?.();
  }

  return { startDigestScheduler, runDigestCheck, sendDigest, buildSummary };
};
module.exports.cmpVersion = cmpVersion;
module.exports.cleanProps = cleanProps;
module.exports.ALLOWED_EVENTS = ALLOWED_EVENTS;
