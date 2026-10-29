/**
 * Company & agent features added on top of the core backend:
 *   - SMS settings (Africa's Talking, off until an admin switches it on) + test message
 *   - Bulk agent actions: spreadsheet (CSV) import, enable/disable/group many at once
 *   - Leads: an agent hands a qualified quote to the sales / underwriting team
 *   - Targets + leaderboard (admin) and "my standing" (agent)
 *   - Quote records: the compliance trail of what was printed / shared, under which rate version
 *   - Published rates + rates editor: admins change a rate table with versioning, an impact report and approval
 * Self-registration is untouched: importing an agent only pre-registers them; they still verify by OTP.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const UtilsEngine = require('../engines/utils-engine.js');
const { compute } = require('./engineRegistry');
const smsMod = require('./sms');

const cap = (s, n) => (typeof s === 'string' ? s.slice(0, n) : s);
const num = v => Number(v) || 0;
function cleanEmail(v){ v = typeof v === 'string' ? v.trim().toLowerCase().slice(0, 160) : ''; if(!v) return null; return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : false; }
function cleanAgency(v){ v = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 30) : ''; if(!v) return null; return /^[A-Z0-9][A-Z0-9 \-_\/]{1,29}$/.test(v) ? v : false; }
function cleanGroup(v){ v = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, 60) : ''; return v || null; }
function csvCell(v){ v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function toCsv(rows, cols){ return [cols.map(c => csvCell(c.label)).join(',')].concat(rows.map(r => cols.map(c => csvCell(r[c.key])).join(','))).join('\r\n'); }
const DATA_FILES = { fanaka: 'fanaka-data.json', faida: 'faida-data.json', smartsave: 'smartsave-data.json' };
const ENGINE_OF_DATA_KEY = { fanaka: 'fanaka', faida: 'faida', smartsave: 'smartsave' };
function embeddedData(engine){ return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', DATA_FILES[engine]), 'utf8')); }

// ---- JSON path helpers for the rates editor ----
function splitPath(p){ return String(p || '').split('.').filter(x => x !== ''); }
function getAt(obj, parts){ return parts.reduce((o, k) => (o == null ? undefined : o[k]), obj); }
function describe(v){
  if(Array.isArray(v)) return { type: 'array', length: v.length };
  if(v && typeof v === 'object') return { type: 'object', length: Object.keys(v).length };
  return { type: typeof v, value: v };
}
function preview(v){
  const d = describe(v);
  if(d.type === 'array' || d.type === 'object'){
    const sample = (d.type === 'array' ? v.slice(0, 3) : Object.values(v).slice(0, 3)).map(x => (x && typeof x === 'object') ? (Array.isArray(x) ? '[…]' : '{…}') : JSON.stringify(x)).join(', ');
    d.preview = sample.slice(0, 90);
  }
  return d;
}
function applyChanges(data, changes){
  const out = JSON.parse(JSON.stringify(data)); const diffs = [];
  for(const ch of changes){
    const parts = splitPath(ch.path);
    if(!parts.length) throw { status: 400, message: 'Each change needs a path.' };
    const parent = getAt(out, parts.slice(0, -1)), key = parts[parts.length - 1];
    if(parent == null || typeof parent !== 'object' || !(key in parent)) throw { status: 422, message: `"${ch.path}" does not exist in the current rate data, so it cannot be edited. Only existing values can be changed.` };
    const oldV = parent[key];
    if(oldV !== null && typeof oldV === 'object') throw { status: 422, message: `"${ch.path}" is a group of values, not a single value. Open it and pick the value to change.` };
    let nv = ch.value;
    if(typeof oldV === 'number'){ nv = Number(nv); if(!Number.isFinite(nv)) throw { status: 422, message: `"${ch.path}" must be a number.` }; }
    else if(typeof oldV === 'boolean'){ if(typeof nv === 'string') nv = nv === 'true'; nv = !!nv; }
    else if(typeof oldV === 'string'){ nv = String(nv).slice(0, 200); }
    else throw { status: 422, message: `"${ch.path}" cannot be edited.` };
    parent[key] = nv; diffs.push({ path: ch.path, from: oldV, to: nv });
  }
  return { data: out, diffs };
}

// Built-in scenarios used for the impact report: every candidate is tried against the CURRENT data first,
// and only the ones that work today are compared, so a rate change is judged on real, valid quotes.
function candidateScenarios(engine, data){
  const out = [];
  if(engine === 'fanaka'){
    const names = (data.plans || []).filter(p => (data.prates || []).some(r => r.plan === p.name)).map(p => p.name).slice(0, 4);
    for(const planName of names) for(const age of [25, 35, 45]) for(const term of [10, 15, 20]) out.push({ planName, age, term, freq: 'Monthly', mode: 'sa', value: 1000000, riders: {} });
  } else if(engine === 'faida'){
    const prods = ['Faida Elimu', 'Faida Maisha', 'Faida Elite'];
    for(const product of prods) for(const ageANB of [30, 40]) for(const term of [10, 15]) out.push({ product, gender: 'Male', ageANB, term, freq: 'Monthly', periodicPremium: 10000, sumAssured: product === 'Faida Elite' ? 0 : 3000000 });
  } else if(engine === 'smartsave'){
    const prods = Object.keys(data.products || {}).slice(0, 3);
    for(const product of (prods.length && isNaN(Number(prods[0])) ? prods : ['Smart Save', 'Scholar'])) for(const age of [25, 35, 45]) for(const term of [10, 15]) out.push({ product, age, term, freq: 'Monthly', mode: 'sa', value: 1000000 });
  }
  return out;
}
function headline(result){
  // A few stable numbers to compare, whatever the engine returns.
  const flat = {}; (function walk(o, p, d){
    if(d > 3 || o == null) return;
    if(typeof o === 'number' && isFinite(o)) flat[p] = o;
    else if(Array.isArray(o)){ if(o.length && typeof o[o.length - 1] === 'number') flat[p + '[last]'] = o[o.length - 1]; else if(o.length && typeof o[o.length - 1] === 'object') walk(o[o.length - 1], p + '[last]', d + 1); }
    else if(typeof o === 'object') for(const k of Object.keys(o)) walk(o[k], p ? p + '.' + k : k, d + 1);
  })(result, '', 0);
  return flat;
}
function impactReport(engine, baseData, newData){
  const rows = []; let errors = 0, tried = 0;
  for(const input of candidateScenarios(engine, baseData)){
    let a; try { a = compute(engine, baseData, input); } catch(e){ continue; }
    tried++;
    let b, err = null; try { b = compute(engine, newData, input); } catch(e){ err = (e && e.message) || String(e); errors++; }
    const ha = headline(a), hb = b ? headline(b) : {};
    const changes = [];
    for(const k of Object.keys(ha)){
      const x = ha[k], y = hb[k];
      if(y === undefined || !isFinite(y)){ changes.push({ key: k, from: x, to: null, pct: null }); continue; }
      if(Math.round(x) !== Math.round(y)) changes.push({ key: k, from: x, to: y, pct: x ? Math.round((y - x) / Math.abs(x) * 10000) / 100 : null });
    }
    rows.push({ input, error: err, changedFigures: changes.length, topChanges: changes.sort((p, q) => Math.abs(q.pct || 0) - Math.abs(p.pct || 0)).slice(0, 4) });
  }
  const changed = rows.filter(r => r.changedFigures > 0).length;
  return { scenariosCompared: rows.length, scenariosTried: tried, scenariosChanged: changed, scenariosWithErrors: errors, rows: rows.slice(0, 60) };
}

const PII_KEY = /name|phone|mobile|msisdn|email|dob|birth|id.?no|id.?number|passport|address/i;
function scrub(o, depth){
  depth = depth || 0;
  if(o == null || depth > 5) return o == null ? o : undefined;
  if(Array.isArray(o)) return o.slice(0, 60).map(x => scrub(x, depth + 1));
  if(typeof o === 'object'){ const r = {}; for(const k of Object.keys(o).slice(0, 60)){ if(PII_KEY.test(k)) continue; r[k] = scrub(o[k], depth + 1); } return r; }
  if(typeof o === 'string') return o.slice(0, 200);
  return o;
}
function limitedJson(o, max){ const s = JSON.stringify(scrub(o) || {}); return s.length > max ? JSON.stringify({ truncated: true }) : s; }

module.exports = function registerFeatures(app, deps){
  const { db, requireAdmin, requireAgent, scopeToCompany, audit, errorHandler, sendEmail } = deps;
  const sameCompany = (req, res) => { if(String(req.agent.companyId) !== String(req.params.companyId)){ res.status(403).json({ error: 'Wrong company.' }); return false; } return true; };
  const adminOnly = [requireAdmin, scopeToCompany];

  // ================= SMS settings =================
  app.get('/api/companies/:companyId/sms-settings', ...adminOnly, async (req, res) => {
    try { res.json(await smsMod.publicSettings(req.params.companyId)); } catch(e){ errorHandler(res, e); }
  });
  app.put('/api/companies/:companyId/sms-settings', ...adminOnly, async (req, res) => {
    try {
      const b = req.body || {};
      const out = await smsMod.saveSettings(req.params.companyId, { enabled: !!b.enabled, username: b.username, apiKey: b.apiKey, senderId: b.senderId, emailFallback: b.emailFallback });
      await audit(req.params.companyId, 'admin', req.admin.adminId, out.enabled ? 'sms.live_enabled' : 'sms.live_disabled', { username: out.username, senderId: out.senderId });
      res.json(out);
    } catch(e){ errorHandler(res, e); }
  });
  app.post('/api/companies/:companyId/sms-settings/test', ...adminOnly, async (req, res) => {
    try {
      const phone = UtilsEngine.normalizeKenyanPhone((req.body || {}).phone);
      if(!phone) throw { status: 400, message: 'Enter a valid Kenyan phone number to send the test to.' };
      const provider = await smsMod.providerFor(req.params.companyId);
      try { await smsMod.sendSms(req.params.companyId, phone, 'Plan Illustrator test message. SMS delivery is working.'); }
      catch(e){ throw { status: 502, message: 'The test message could not be sent: ' + e.message }; }
      res.json({ sent: true, provider, note: provider === 'console' ? 'Live SMS is switched off, so this was only written to the SMS log, not sent to a phone.' : 'Sent through Africa\'s Talking.' });
    } catch(e){ errorHandler(res, e); }
  });

  // ================= Bulk agents =================
  app.post('/api/companies/:companyId/agents/import', ...adminOnly, async (req, res) => {
    try {
      const rows = (req.body || {}).rows, dryRun = !!(req.body || {}).dryRun;
      if(!Array.isArray(rows) || !rows.length) throw { status: 400, message: 'No rows to import.' };
      if(rows.length > 2000) throw { status: 400, message: 'Import at most 2,000 agents at a time.' };
      const cid = Number(req.params.companyId); const results = []; const seen = new Set();
      let created = 0, updated = 0, invalid = 0, duplicates = 0;
      for(let i = 0; i < rows.length; i++){
        const r = rows[i] || {}; const line = i + 1;
        const name = cap(typeof r.name === 'string' ? r.name.trim() : '', 120), phone = UtilsEngine.normalizeKenyanPhone(r.phone);
        const email = cleanEmail(r.email), agency = cleanAgency(r.agencyCode), group = cleanGroup(r.group);
        let problem = null;
        if(!name) problem = 'Name is missing';
        else if(!phone) problem = 'Phone is not a valid Kenyan number';
        else if(email === false) problem = 'Email is not valid';
        else if(agency === false) problem = 'Agency code has invalid characters';
        if(problem){ invalid++; results.push({ line, status: 'invalid', error: problem, name: name || '', phone: r.phone || '' }); continue; }
        if(seen.has(phone)){ duplicates++; results.push({ line, status: 'duplicate', error: 'Same phone appears earlier in the file', name, phone }); continue; }
        seen.add(phone);
        const existing = await db.prepare('SELECT * FROM agents WHERE company_id = ? AND phone = ?').get(cid, phone);
        if(existing){
          updated++; results.push({ line, status: 'updated', name, phone });
          if(!dryRun) await db.prepare('UPDATE agents SET email = COALESCE(email, ?), agency_code = COALESCE(agency_code, ?), group_name = COALESCE(?, group_name) WHERE id = ?').run(email, agency, group, existing.id);
        } else {
          created++; results.push({ line, status: 'created', name, phone });
          if(!dryRun) await db.prepare("INSERT INTO agents (company_id, name, phone, email, agency_code, group_name, source) VALUES (?,?,?,?,?,?, 'import')").run(cid, name, phone, email, agency, group);
        }
      }
      if(!dryRun) await audit(cid, 'admin', req.admin.adminId, 'agents.imported', { created, updated, invalid, duplicates });
      res.json({ dryRun, created, updated, invalid, duplicates, results });
    } catch(e){ errorHandler(res, e); }
  });
  app.post('/api/companies/:companyId/agents/bulk', ...adminOnly, async (req, res) => {
    try {
      const b = req.body || {}; const cid = Number(req.params.companyId);
      let ids = Array.isArray(b.ids) ? b.ids.map(Number).filter(Number.isFinite) : [];
      if(b.group && !ids.length){ ids = (await db.prepare('SELECT id FROM agents WHERE company_id = ? AND group_name = ?').all(cid, String(b.group))).map(r => r.id); }
      if(!ids.length) throw { status: 400, message: 'Choose at least one agent (or a group).' };
      if(ids.length > 2000) throw { status: 400, message: 'Too many agents selected.' };
      const action = b.action;
      if(!['enable', 'disable', 'set_group'].includes(action)) throw { status: 400, message: 'Unknown action.' };
      let n = 0;
      for(const id of ids){
        let r;
        if(action === 'set_group') r = await db.prepare('UPDATE agents SET group_name = ? WHERE id = ? AND company_id = ?').run(cleanGroup(b.newGroup), id, cid);
        else r = await db.prepare('UPDATE agents SET is_active = ? WHERE id = ? AND company_id = ?').run(action === 'enable' ? 1 : 0, id, cid);
        n += (r && r.changes) || 0;
      }
      await audit(cid, 'admin', req.admin.adminId, 'agents.bulk_' + action, { count: n, group: b.group || null });
      res.json({ ok: true, action, affected: n });
    } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/agents/import-template', ...adminOnly, (req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="agents-import-template.csv"');
    res.send('﻿Name,Phone,Email,Agency code,Group\r\nJane Wanjiru,0712345678,jane@example.com,AG1234,Nairobi West\r\n');
  });

  // ================= Leads =================
  const LEAD_STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];
  app.post('/api/companies/:companyId/leads', requireAgent, async (req, res) => {
    try {
      if(!sameCompany(req, res)) return;
      const b = req.body || {};
      const clientName = cap(typeof b.clientName === 'string' ? b.clientName.trim() : '', 120);
      const phone = b.clientPhone ? UtilsEngine.normalizeKenyanPhone(b.clientPhone) : null, email = cleanEmail(b.clientEmail);
      if(!clientName) throw { status: 400, message: 'The client\'s name is required.' };
      if(b.clientPhone && !phone) throw { status: 400, message: 'The client\'s phone number is not valid.' };
      if(email === false) throw { status: 400, message: 'The client\'s email is not valid.' };
      if(!phone && !email) throw { status: 400, message: 'Give a phone number or email so the team can reach the client.' };
      if(!b.consent) throw { status: 400, message: 'Confirm that the client agreed to be contacted.' };
      const agent = await db.prepare('SELECT * FROM agents WHERE id = ? AND company_id = ? AND is_active = 1').get(req.agent.agentId, req.params.companyId);
      if(!agent) throw { status: 404, message: 'Agent not found.' };
      const cref = /^[A-Za-z0-9][A-Za-z0-9\-_]{5,39}$/.test(String(b.clientRef || '')) ? String(b.clientRef) : null;
      if(cref){ const dup = await db.prepare('SELECT id FROM leads WHERE company_id = ? AND agent_id = ? AND client_ref = ?').get(agent.company_id, agent.id, cref); if(dup) return res.json({ id: dup.id, status: 'new', emailed: 'duplicate', duplicate: true }); }
      const info = await db.prepare('INSERT INTO leads (company_id, agent_id, client_name, client_phone, client_email, product, needs_summary, note, client_ref) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(agent.company_id, agent.id, clientName, phone, email, cap(b.product, 120) || null, cap(b.needsSummary, 1200) || null, cap(b.note, 600) || null, cref);
      await audit(agent.company_id, 'agent', agent.id, 'lead.created', { leadId: info.lastInsertRowid });
      let emailed = 'not_configured';
      try {
        const cfg = await require('./config').getConfig(agent.company_id);
        const to = cfg.leadsEmail || process.env.LEADS_EMAIL || process.env.REPORT_EMAIL || '';
        if(to){
          await sendEmail(agent.company_id, to, `New lead from ${agent.name}: ${clientName}`,
            `Agent: ${agent.name} (${agent.agency_code || 'no agency code'}, ${agent.phone})\nClient: ${clientName}\nPhone: ${phone || '—'}\nEmail: ${email || '—'}\nProduct: ${b.product || '—'}\n\nNeeds summary:\n${b.needsSummary || '—'}\n\nAgent note:\n${b.note || '—'}\n\nThe client agreed to be contacted.`);
          emailed = 'sent';
        }
      } catch(e){ emailed = 'failed'; }
      await require('./events').emit(agent.company_id, 'lead.created', { leadId: info.lastInsertRowid, product: b.product || null, agentId: agent.id });
      res.status(201).json({ id: info.lastInsertRowid, status: 'new', emailed });
    } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/leads/mine', requireAgent, async (req, res) => {
    try {
      if(!sameCompany(req, res)) return;
      res.json((await db.prepare('SELECT id, client_name, product, status, created_at, updated_at FROM leads WHERE company_id = ? AND agent_id = ? ORDER BY id DESC LIMIT 100').all(req.params.companyId, req.agent.agentId))
        .map(r => ({ id: r.id, clientName: r.client_name, product: r.product, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at })));
    } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/leads', ...adminOnly, async (req, res) => {
    try {
      const st = LEAD_STATUSES.includes(req.query.status) ? req.query.status : null;
      const rows = await db.prepare(`SELECT l.*, a.name AS agent_name, a.agency_code AS agent_code, a.phone AS agent_phone FROM leads l LEFT JOIN agents a ON a.id = l.agent_id WHERE l.company_id = ? ${st ? 'AND l.status = ?' : ''} ORDER BY l.id DESC LIMIT 1000`).all(...(st ? [req.params.companyId, st] : [req.params.companyId]));
      const out = rows.map(r => ({ id: r.id, clientName: r.client_name, clientPhone: r.client_phone || '', clientEmail: r.client_email || '', product: r.product || '', needsSummary: r.needs_summary || '', note: r.note || '', status: r.status, agentName: r.agent_name || '', agencyCode: r.agent_code || '', agentPhone: r.agent_phone || '', createdAt: r.created_at, updatedAt: r.updated_at }));
      if(req.query.format === 'csv'){
        const cols = [['createdAt', 'Created'], ['status', 'Status'], ['clientName', 'Client'], ['clientPhone', 'Client phone'], ['clientEmail', 'Client email'], ['product', 'Product'], ['agentName', 'Agent'], ['agencyCode', 'Agency code'], ['needsSummary', 'Needs'], ['note', 'Agent note']].map(([key, label]) => ({ key, label }));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
        return res.send('﻿' + toCsv(out, cols));
      }
      res.json(out);
    } catch(e){ errorHandler(res, e); }
  });
  app.patch('/api/companies/:companyId/leads/:leadId', ...adminOnly, async (req, res) => {
    try {
      const status = (req.body || {}).status;
      if(!LEAD_STATUSES.includes(status)) throw { status: 400, message: 'Status must be one of: ' + LEAD_STATUSES.join(', ') };
      const r = await db.prepare("UPDATE leads SET status = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?").run(status, req.params.leadId, req.params.companyId);
      if(!r.changes) throw { status: 404, message: 'Lead not found.' };
      await audit(req.params.companyId, 'admin', req.admin.adminId, 'lead.status', { leadId: Number(req.params.leadId), status });
      res.json({ id: Number(req.params.leadId), status });
    } catch(e){ errorHandler(res, e); }
  });

  // ================= Targets, leaderboard, my standing =================
  async function getTargets(cid){
    const t = await db.prepare('SELECT * FROM targets WHERE company_id = ?').get(cid);
    return { calcs: num(t && t.calcs_per_month), prints: num(t && t.prints_per_month), leads: num(t && t.leads_per_month) };
  }
  function periodStart(period){
    const d = new Date();
    if(period === 'week'){ const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); } else d.setUTCDate(1);
    return d.toISOString().slice(0, 10) + ' 00:00:00';
  }
  async function board(cid, period){
    const since = periodStart(period);
    const agents = await db.prepare('SELECT id, name, agency_code, group_name, is_active FROM agents WHERE company_id = ? AND is_active = 1 AND verified = 1').all(cid);
    const ev = await db.prepare(`SELECT agent_id, SUM(CASE WHEN event = 'calc_completed' THEN 1 ELSE 0 END) AS calcs, SUM(CASE WHEN event = 'illustration_printed' THEN 1 ELSE 0 END) AS prints FROM usage_events WHERE company_id = ? AND created_at >= ? GROUP BY agent_id`).all(cid, since);
    const ld = await db.prepare('SELECT agent_id, COUNT(*) AS n FROM leads WHERE company_id = ? AND created_at >= ? GROUP BY agent_id').all(cid, since);
    const em = new Map(ev.map(r => [r.agent_id, r])), lm = new Map(ld.map(r => [r.agent_id, r.n]));
    const t = await getTargets(cid), mult = period === 'week' ? 0.25 : 1;
    const tg = { calcs: Math.round(t.calcs * mult), prints: Math.round(t.prints * mult), leads: Math.round(t.leads * mult) };
    const pct = (v, g) => g > 0 ? Math.min(100, Math.round(v / g * 100)) : null;
    const rows = agents.map(a => {
      const e = em.get(a.id) || {}; const calcs = num(e.calcs), prints = num(e.prints), leads = num(lm.get(a.id));
      const parts = [pct(calcs, tg.calcs), pct(prints, tg.prints), pct(leads, tg.leads)].filter(x => x !== null);
      return { agentId: a.id, name: a.name, agencyCode: a.agency_code || '', group: a.group_name || '', calcs, prints, leads, score: calcs + prints * 3 + leads * 10, targetPct: parts.length ? Math.round(parts.reduce((x, y) => x + y, 0) / parts.length) : null };
    }).sort((x, y) => y.score - x.score || x.name.localeCompare(y.name));
    rows.forEach((r, i) => { r.rank = i + 1; });
    return { period, since, targets: tg, rows };
  }
  app.get('/api/companies/:companyId/targets', ...adminOnly, async (req, res) => { try { res.json(await getTargets(req.params.companyId)); } catch(e){ errorHandler(res, e); } });
  app.put('/api/companies/:companyId/targets', ...adminOnly, async (req, res) => {
    try {
      const b = req.body || {}; const v = k => { const n = Math.round(Number(b[k])); if(!Number.isFinite(n) || n < 0 || n > 100000) throw { status: 400, message: 'Targets must be whole numbers from 0 to 100,000.' }; return n; };
      const calcs = v('calcs'), prints = v('prints'), leads = v('leads');
      const ex = await db.prepare('SELECT company_id FROM targets WHERE company_id = ?').get(req.params.companyId);
      if(ex) await db.prepare("UPDATE targets SET calcs_per_month = ?, prints_per_month = ?, leads_per_month = ?, updated_at = datetime('now') WHERE company_id = ?").run(calcs, prints, leads, req.params.companyId);
      else await db.prepare('INSERT INTO targets (company_id, calcs_per_month, prints_per_month, leads_per_month) VALUES (?,?,?,?)').run(req.params.companyId, calcs, prints, leads);
      await audit(req.params.companyId, 'admin', req.admin.adminId, 'targets.updated', { calcs, prints, leads });
      res.json({ calcs, prints, leads });
    } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/leaderboard', ...adminOnly, async (req, res) => {
    try {
      const out = await board(req.params.companyId, req.query.period === 'week' ? 'week' : 'month');
      if(req.query.format === 'csv'){
        const cols = [['rank', 'Rank'], ['name', 'Agent'], ['agencyCode', 'Agency code'], ['group', 'Group'], ['calcs', 'Calculations'], ['prints', 'Printed'], ['leads', 'Leads'], ['score', 'Score'], ['targetPct', 'Target % (avg)']].map(([key, label]) => ({ key, label }));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="leaderboard.csv"');
        return res.send('﻿' + toCsv(out.rows, cols));
      }
      res.json(out);
    } catch(e){ errorHandler(res, e); }
  });
  // Agents see their own progress and rank only — never other agents' names or numbers.
  app.get('/api/companies/:companyId/agents/me/standing', requireAgent, async (req, res) => {
    try {
      if(!sameCompany(req, res)) return;
      const out = await board(req.params.companyId, req.query.period === 'week' ? 'week' : 'month');
      const me = out.rows.find(r => r.agentId === req.agent.agentId);
      res.json({ period: out.period, targets: out.targets, of: out.rows.length, me: me ? { rank: me.rank, calcs: me.calcs, prints: me.prints, leads: me.leads, score: me.score, targetPct: me.targetPct } : null });
    } catch(e){ errorHandler(res, e); }
  });

  // ================= Quote records (compliance trail) =================
  app.post('/api/companies/:companyId/quotes', requireAgent, async (req, res) => {
    try {
      if(!sameCompany(req, res)) return;
      const records = Array.isArray((req.body || {}).records) ? req.body.records.slice(0, 50) : [];
      let saved = 0;
      for(const r of records){
        if(!r || typeof r !== 'object') continue;
        await db.prepare('INSERT INTO quote_records (company_id, agent_id, product, action, rates_version, app_version, terms_version, language, inputs_json, result_json, occurred_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .run(req.params.companyId, req.agent.agentId, cap(String(r.product || ''), 80), cap(String(r.action || ''), 20), cap(String(r.ratesVersion || 'built-in'), 40), cap(String(r.appVersion || ''), 20), cap(String(r.termsVersion || ''), 10), cap(String(r.language || 'en'), 5), limitedJson(r.inputs, 3000), limitedJson(r.result, 3000), cap(String(r.at || ''), 40));
        saved++;
      }
      res.json({ saved });
    } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/quotes', ...adminOnly, async (req, res) => {
    try {
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 3650);
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
      const rows = await db.prepare(`SELECT q.*, a.name AS agent_name, a.agency_code FROM quote_records q LEFT JOIN agents a ON a.id = q.agent_id WHERE q.company_id = ? AND q.created_at >= ? ORDER BY q.id DESC LIMIT 2000`).all(req.params.companyId, since);
      const out = rows.map(r => ({ id: r.id, when: r.created_at, agent: r.agent_name || '', agencyCode: r.agency_code || '', product: r.product, action: r.action, ratesVersion: r.rates_version, appVersion: r.app_version, termsVersion: r.terms_version, language: r.language, inputs: r.inputs_json, result: r.result_json }));
      if(req.query.format === 'csv'){
        const cols = ['when', 'agent', 'agencyCode', 'product', 'action', 'ratesVersion', 'appVersion', 'termsVersion', 'language', 'inputs', 'result'].map(key => ({ key, label: key }));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="quote-trail.csv"');
        return res.send('﻿' + toCsv(out, cols));
      }
      res.json(out);
    } catch(e){ errorHandler(res, e); }
  });

  // ================= Published rates (read by the app) =================
  async function activeVersion(cid, engine){
    return db.prepare(`SELECT v.id, v.version_number, v.data_json FROM product_data_versions v JOIN product_lines l ON l.id = v.product_line_id WHERE l.company_id = ? AND l.engine_type = ? AND l.is_active = 1 AND v.activated_at IS NOT NULL AND v.superseded_at IS NULL ORDER BY v.id DESC`).get(cid, engine);
  }
  app.get('/api/companies/:companyId/rates/manifest', requireAgent, async (req, res) => {
    try {
      if(!sameCompany(req, res)) return;
      const out = {};
      for(const e of Object.keys(DATA_FILES)){ const v = await activeVersion(req.params.companyId, e); out[e] = v ? { versionId: v.id, versionNumber: v.version_number } : null; }
      res.json(out);
    } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/companies/:companyId/rates/:engine', requireAgent, async (req, res) => {
    try {
      if(!sameCompany(req, res)) return;
      if(!DATA_FILES[req.params.engine]) throw { status: 404, message: 'Unknown product engine.' };
      const v = await activeVersion(req.params.companyId, req.params.engine);
      if(!v) throw { status: 404, message: 'No published rate table; use the built-in rates.' };
      res.json({ versionId: v.id, versionNumber: v.version_number, data: JSON.parse(v.data_json) });
    } catch(e){ errorHandler(res, e); }
  });

  // ================= Rates editor =================
  async function lineFor(req){
    const line = await db.prepare('SELECT * FROM product_lines WHERE id = ?').get(req.params.lineId);
    if(!line) throw { status: 404, message: 'Product line not found' };
    if(req.admin.role !== 'superadmin' && req.admin.companyId !== line.company_id) throw { status: 403, message: 'Not authorized for this product line' };
    return line;
  }
  async function baseData(line){
    const v = await db.prepare('SELECT * FROM product_data_versions WHERE product_line_id = ? AND activated_at IS NOT NULL AND superseded_at IS NULL ORDER BY id DESC').get(line.id);
    return v ? { data: JSON.parse(v.data_json), label: 'version ' + v.version_number, versionId: v.id } : { data: embeddedData(line.engine_type), label: 'built-in rates', versionId: null };
  }
  app.get('/api/product-lines/:lineId/data-outline', requireAdmin, async (req, res) => {
    try {
      const line = await lineFor(req); const base = await baseData(line);
      const parts = splitPath(req.query.path); const node = getAt(base.data, parts);
      if(node === undefined) throw { status: 404, message: 'That path does not exist.' };
      const d = describe(node); const children = [];
      if(d.type === 'array') node.slice(0, 200).forEach((x, i) => children.push(Object.assign({ key: String(i) }, preview(x))));
      else if(d.type === 'object') Object.keys(node).slice(0, 300).forEach(k => children.push(Object.assign({ key: k }, preview(node[k]))));
      res.json({ base: base.label, path: parts.join('.'), node: d, children, truncated: (d.length || 0) > children.length });
    } catch(e){ errorHandler(res, e); }
  });
  app.post('/api/product-lines/:lineId/versions/draft', requireAdmin, async (req, res) => {
    try {
      const line = await lineFor(req); const b = req.body || {};
      if(!Array.isArray(b.changes) || !b.changes.length) throw { status: 400, message: 'Add at least one change.' };
      if(b.changes.length > 50) throw { status: 400, message: 'At most 50 changes per draft.' };
      const summary = cap(typeof b.summary === 'string' ? b.summary.trim() : '', 400);
      if(!summary) throw { status: 400, message: 'Describe why the rates are changing (for the approval record).' };
      const base = await baseData(line); const { data, diffs } = applyChanges(base.data, b.changes);
      const mx = await db.prepare('SELECT MAX(version_number) AS v FROM product_data_versions WHERE product_line_id = ?').get(line.id);
      const vn = ((mx && mx.v) || 0) + 1;
      const info = await db.prepare('INSERT INTO product_data_versions (product_line_id, version_number, source_filename, data_json, mapping_notes, change_summary, created_by) VALUES (?,?,?,?,?,?,?)')
        .run(line.id, vn, 'edited in admin panel', JSON.stringify(data), JSON.stringify(diffs), summary, req.admin.adminId);
      await audit(line.company_id, 'admin', req.admin.adminId, 'product_version.drafted', { lineId: line.id, versionNumber: vn, changes: diffs.length });
      res.status(201).json({ id: info.lastInsertRowid, versionNumber: vn, basedOn: base.label, diffs });
    } catch(e){ errorHandler(res, e); }
  });
  app.post('/api/product-lines/:lineId/versions/:versionId/impact', requireAdmin, async (req, res) => {
    try {
      const line = await lineFor(req);
      const v = await db.prepare('SELECT * FROM product_data_versions WHERE id = ? AND product_line_id = ?').get(req.params.versionId, line.id);
      if(!v) throw { status: 404, message: 'Version not found' };
      if(!v.change_summary) throw { status: 400, message: 'The impact report is for versions drafted in the rates editor. Uploaded workbooks are validated against reference scenarios.' };
      const base = await baseData(line);
      const report = impactReport(line.engine_type, base.data, JSON.parse(v.data_json));
      report.comparedWith = base.label;
      const ok = report.scenariosCompared > 0 && report.scenariosWithErrors === 0;
      await db.prepare("UPDATE product_data_versions SET impact_json = ?, validated = ?, validated_by = ?, validated_at = datetime('now'), approved_by = NULL, approved_at = NULL WHERE id = ?").run(JSON.stringify(report), ok ? 1 : 0, req.admin.adminId, v.id);
      await audit(line.company_id, 'admin', req.admin.adminId, 'product_version.impact_run', { lineId: line.id, versionId: v.id, ok });
      res.json(Object.assign({ ok }, report));
    } catch(e){ errorHandler(res, e); }
  });
  app.post('/api/product-lines/:lineId/versions/:versionId/approve', requireAdmin, async (req, res) => {
    try {
      const line = await lineFor(req);
      const v = await db.prepare('SELECT * FROM product_data_versions WHERE id = ? AND product_line_id = ?').get(req.params.versionId, line.id);
      if(!v) throw { status: 404, message: 'Version not found' };
      if(!v.change_summary || !v.impact_json || !v.validated) throw { status: 422, message: 'Run the impact report (with no errors) before approving.' };
      const admins = await db.prepare('SELECT id FROM admin_users WHERE (company_id = ? OR role = ?) AND is_active = 1').all(line.company_id, 'superadmin');
      if(admins.length > 1 && v.created_by === req.admin.adminId) throw { status: 403, message: 'Four-eyes rule: a different administrator must approve changes you drafted.' };
      await db.prepare("UPDATE product_data_versions SET approved_by = ?, approved_at = datetime('now') WHERE id = ?").run(req.admin.adminId, v.id);
      await audit(line.company_id, 'admin', req.admin.adminId, 'product_version.approved', { lineId: line.id, versionId: v.id });
      res.json({ approved: true });
    } catch(e){ errorHandler(res, e); }
  });
  app.get('/api/product-lines/:lineId/versions/:versionId/detail', requireAdmin, async (req, res) => {
    try {
      const line = await lineFor(req);
      const v = await db.prepare('SELECT id, version_number, change_summary, mapping_notes, impact_json, validated, approved_by, approved_at, activated_at, created_at FROM product_data_versions WHERE id = ? AND product_line_id = ?').get(req.params.versionId, line.id);
      if(!v) throw { status: 404, message: 'Version not found' };
      res.json({ id: v.id, versionNumber: v.version_number, summary: v.change_summary, changes: v.change_summary && v.mapping_notes ? JSON.parse(v.mapping_notes) : [], impact: v.impact_json ? JSON.parse(v.impact_json) : null, validated: !!v.validated, approvedAt: v.approved_at, activatedAt: v.activated_at, createdAt: v.created_at });
    } catch(e){ errorHandler(res, e); }
  });

  return { impactReport, applyChanges };
};
module.exports.impactReport = impactReport;
module.exports.applyChanges = applyChanges;
