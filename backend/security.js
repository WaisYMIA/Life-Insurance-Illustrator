/**
 * Controlled access for installed apps.
 *
 *  1. Version gate  – every agent-facing API call carries the app's version (X-App-Version). Below the company's
 *     minimum version, or behind the latest release while updates are mandatory, the server answers 426
 *     "update_required". An old or modified copy of the app therefore cannot sign in, report usage or refresh its
 *     access, whatever it does on the phone.
 *  2. Signed leases – the server hands each signed-in app a short-lived, digitally signed "access lease" (agent,
 *     company, minimum/latest version, expiry). The app verifies the signature with the public key built into
 *     app-config.js and will not open without a valid, unexpired lease, so editing local storage or the clock
 *     does not unlock it. Only the holder of the private key can issue one.
 *  3. Remote disable – an administrator can disable an agent; the next lease renewal or sign-in is refused and the
 *     app clears itself.
 *
 * Signing: ECDSA P-256 / SHA-256 (IEEE-P1363 signature, readable by the browser's WebCrypto). The private key comes
 * from APP_SIGNING_PRIVATE_KEY (PEM). Create one with:  node scripts/make-signing-key.js
 * Without a key the lease endpoint still enforces the version gate and disabled agents, but issues no lease.
 */
'use strict';
const crypto = require('crypto');

function loadPrivateKey(){
  const raw = process.env.APP_SIGNING_PRIVATE_KEY;
  if(!raw) return null;
  try { return crypto.createPrivateKey(raw.replace(/\\n/g, '\n')); }
  catch(e){ console.error('APP_SIGNING_PRIVATE_KEY is set but could not be read:', e.message); return null; }
}
const privateKey = loadPrivateKey();
const publicJwk = privateKey ? crypto.createPublicKey(privateKey).export({ format: 'jwk' }) : null;

const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function sign(payloadObj){
  if(!privateKey) return null;
  const p = JSON.stringify(payloadObj);
  const s = crypto.sign('sha256', Buffer.from(p), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return { p, s: b64u(s) };
}
function verify(lease){
  if(!publicJwk || !lease || typeof lease.p !== 'string' || typeof lease.s !== 'string') return false;
  try {
    return crypto.verify('sha256', Buffer.from(lease.p), { key: crypto.createPublicKey({ key: publicJwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(lease.s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
  } catch(e){ return false; }
}

function cmpVersion(a, b){
  const pa = String(a || '0').split('.').map(x => parseInt(x, 10) || 0), pb = String(b || '0').split('.').map(x => parseInt(x, 10) || 0);
  for(let i = 0; i < Math.max(pa.length, pb.length); i++){ const d = (pa[i] || 0) - (pb[i] || 0); if(d) return d > 0 ? 1 : -1; }
  return 0;
}

// Release plans: a version can be made compulsory for one group first, on a date, with a banner a few days ahead.
async function planEffects(db, companyId, agentId){
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const plans = await db.prepare("SELECT * FROM release_plans WHERE company_id = ? AND status = 'scheduled'").all(companyId);
  let group = null; if(agentId){ const a = await db.prepare('SELECT group_name FROM agents WHERE id = ?').get(agentId); group = a && a.group_name || null; }
  const mine = plans.filter(p => !p.target_group || (group && p.target_group === group));
  let min = null; mine.filter(p => p.enforce_at && p.enforce_at <= now).forEach(p => { if(!min || cmpVersion(p.version, min) > 0) min = p.version; });
  const next = mine.filter(p => p.announce_at && p.announce_at <= now && p.enforce_at > now).sort((a, b) => a.enforce_at < b.enforce_at ? -1 : 1)[0];
  return { min, banner: next ? { version: next.version, enforceAt: next.enforce_at.replace(' ', 'T') + 'Z', text: next.banner } : null };
}
async function getPolicy(db, companyId, agentId){
  const row = await db.prepare('SELECT * FROM app_control WHERE company_id = ?').get(companyId);
  const fx = await planEffects(db, companyId, agentId);
  const baseMin = row ? row.min_version : null;
  return {
    banner: fx.banner,
    latest: row ? row.latest_version : null,
    min: fx.min && (!baseMin || cmpVersion(fx.min, baseMin) > 0) ? fx.min : baseMin,
    require: row ? (row.require_update !== 0 && row.require_update !== false) : true,
    maxOfflineDays: row ? Number(row.max_offline_days) : 30
  };
}
// null = compliant, otherwise the reason.
function violation(policy, version){
  if(policy.min && cmpVersion(version, policy.min) < 0) return 'below_minimum';
  if(policy.require && policy.latest && cmpVersion(version, policy.latest) < 0) return 'behind_latest';
  return null;
}

const GATED = /^\/api\/companies\/(\d+)\/(agents\/(request-otp|verify-otp|me|lease|me\/standing|me\/licence)|telemetry|feedback|leads|quotes|rates\/[a-z]+|applications|applications\/[A-Za-z0-9_-]+\/(docs|submit|pay)|complaints|suitability|quiz\/attempts)$/;

function install(app, db){
  // Version gate – registered before the routes it protects.
  app.use(async (req, res, next) => {
    try {
      if(req.method === 'OPTIONS' || req.method === 'GET') return next();
      const m = GATED.exec(req.path);
      if(!m) return next();
      let aid = null; const h = String(req.headers.authorization || ''); if(h.startsWith('Bearer ')){ const pl = require('./auth').verifyToken(h.slice(7)); if(pl && pl.type === 'agent') aid = pl.agentId; }
      const policy = await getPolicy(db, m[1], aid);
      const version = String(req.headers['x-app-version'] || '').trim();
      const why = violation(policy, version || '0');
      if(why) return res.status(426).json({ error: 'update_required', reason: why, latest: policy.latest, min: policy.min, message: 'A newer version of the app must be installed before you can continue.' });
      next();
    } catch(e){ next(e); }
  });

  // Public key (informational; the app pins the key from app-config.js rather than trusting this at run time).
  app.get('/api/public/signing-key', (req, res) => res.json({ enabled: !!publicJwk, alg: 'ES256', key: publicJwk }));
}

function register(app, { db, requireAgent, requireAdmin, scopeToCompany, audit, errorHandler }){
  // Agent renews its access lease.
  app.post('/api/companies/:companyId/agents/lease', requireAgent, async (req, res) => {
    try {
      const agent = await db.prepare('SELECT id, company_id, is_active FROM agents WHERE id = ? AND company_id = ?').get(req.agent.agentId, req.params.companyId);
      if(!agent || !agent.is_active) return res.status(403).json({ error: 'account_disabled', message: 'Your access has been withdrawn. Please contact your administrator.' });
      const policy = await getPolicy(db, req.params.companyId, agent.id);
      const graceDays = process.env.LEASE_GRACE_DAYS === undefined ? 3 : Math.max(0, parseFloat(process.env.LEASE_GRACE_DAYS) || 0), graceMs = graceDays * 86400000;
      const override = parseInt(process.env.LEASE_TTL_SECONDS, 10);
      const ttlMs = Number.isFinite(override) && override > 0 ? override * 1000 : (policy.maxOfflineDays > 0 ? policy.maxOfflineDays : 30) * 86400000;
      const now = Date.now();
      const lease = sign({ v: 1, cid: Number(req.params.companyId), aid: agent.id, latest: policy.latest, min: policy.min, req: !!policy.require, iat: new Date(now).toISOString(), exp: new Date(now + ttlMs).toISOString(), gx: new Date(now + ttlMs + graceMs).toISOString() });
      res.json({ lease, policy: { latest: policy.latest, min: policy.min, requireUpdate: policy.require, banner: policy.banner } });
    } catch(e){ errorHandler(res, e); }
  });

  // Administrator disables / re-enables an agent (e.g. someone who has left).
  app.patch('/api/companies/:companyId/agents/:agentId', requireAdmin, scopeToCompany, async (req, res) => {
    try {
      const { isActive } = req.body || {};
      if(typeof isActive !== 'boolean') return res.status(400).json({ error: 'isActive (true/false) is required.' });
      const agent = await db.prepare('SELECT id, name, phone FROM agents WHERE id = ? AND company_id = ?').get(req.params.agentId, req.params.companyId);
      if(!agent) return res.status(404).json({ error: 'Agent not found.' });
      await db.prepare('UPDATE agents SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, agent.id);
      await audit(Number(req.params.companyId), 'admin', req.admin.adminId, isActive ? 'agent.enabled' : 'agent.disabled', { agentId: agent.id });
      res.json({ id: agent.id, name: agent.name, phone: agent.phone, isActive });
    } catch(e){ errorHandler(res, e); }
  });
}

module.exports = { install, register, sign, verify, getPolicy, violation, cmpVersion, publicJwk: () => publicJwk };
