/**
 * Outbound events (webhook) so quotes, leads, applications, payments and complaints can flow into the company's
 * policy-admin system or CRM. Events are queued in outbound_events and delivered with retries and an HMAC signature.
 */
'use strict';
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const { db } = require('./db');
const cfgMod = require('./config');

async function emit(companyId, event, payload){
  try {
    const cfg = await cfgMod.getConfig(companyId);
    if(!cfg.webhook.enabled || !cfg.webhook.url) return false;
    await db.prepare('INSERT INTO outbound_events (company_id, event, payload_json) VALUES (?,?,?)').run(companyId, event, JSON.stringify(payload || {}));
    return true;
  } catch(e){ console.error('[events] emit failed:', e.message); return false; }
}
function isPrivateIp(ip){
  if(net.isIPv4(ip)){ const [a, b] = ip.split('.').map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127); }
  if(net.isIPv6(ip)){ const l = ip.toLowerCase(); return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.'); }
  return true;
}
// Refuses private / internal addresses so a mistyped or malicious setting cannot make the server call its own network.
async function assertSafeUrl(url){
  let u; try { u = new URL(url); } catch(e){ throw new Error('The webhook address is not a valid URL.'); }
  const allowPrivate = process.env.WEBHOOK_ALLOW_PRIVATE === '1';
  if(!allowPrivate){
    if(u.protocol !== 'https:') throw new Error('The webhook address must use https://');
    const addrs = net.isIP(u.hostname) ? [{ address: u.hostname }] : await dns.lookup(u.hostname, { all: true });
    if(!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new Error('The webhook address points to a private or internal network, which is not allowed.');
  }
  return u;
}
async function deliver(row, cfg){
  const secret = cfgMod.secretOf(cfg, 'webhook', 'secret');
  const body = JSON.stringify({ id: row.id, event: row.event, companyId: row.company_id, createdAt: row.created_at, data: JSON.parse(row.payload_json) });
  const sig = crypto.createHmac('sha256', secret || '').update(body).digest('hex');
  await assertSafeUrl(cfg.webhook.url);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(cfg.webhook.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-PI-Event': row.event, 'X-PI-Signature': 'sha256=' + sig, 'X-PI-Delivery': String(row.id) }, body, signal: ctl.signal, redirect: 'error' });
    if(!r.ok) throw new Error('HTTP ' + r.status);
  } finally { clearTimeout(t); }
}
const MAX_ATTEMPTS = 8;
async function deliverPending(limit){
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const rows = await db.prepare("SELECT * FROM outbound_events WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY id LIMIT ?").all(now, limit || 20);
  let sent = 0, failed = 0; const cfgs = new Map();
  for(const row of rows){
    try {
      if(!cfgs.has(row.company_id)) cfgs.set(row.company_id, await cfgMod.getConfig(row.company_id));
      const cfg = cfgs.get(row.company_id);
      if(!cfg.webhook.enabled || !cfg.webhook.url){ await db.prepare("UPDATE outbound_events SET status = 'failed', last_error = ? WHERE id = ?").run('Webhook switched off', row.id); continue; }
      await deliver(row, cfg);
      await db.prepare("UPDATE outbound_events SET status = 'delivered', delivered_at = datetime('now'), attempts = attempts + 1, last_error = NULL WHERE id = ?").run(row.id); sent++;
    } catch(e){
      const attempts = row.attempts + 1;
      const wait = Math.min(6 * 3600, 30 * Math.pow(2, attempts));   // 1 min, 2 min, 4 min ... up to 6 h
      const next = new Date(Date.now() + wait * 1000).toISOString().slice(0, 19).replace('T', ' ');
      await db.prepare('UPDATE outbound_events SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?').run(attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', attempts, next, String(e.message).slice(0, 300), row.id); failed++;
    }
  }
  return { sent, failed };
}
module.exports = { emit, deliverPending, assertSafeUrl, MAX_ATTEMPTS };
