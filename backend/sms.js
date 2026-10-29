/**
 * SMS provider abstraction.
 *
 * Per the project's standing development rule, anything that needs a live
 * external service in production gets a local, inspectable substitute for
 * development — so OTP codes can be built and tested end-to-end without a
 * paid SMS gateway or network access.
 *
 * SMS_PROVIDER env var selects the implementation:
 *   - 'console' (default) — the dev/test substitute. Writes the message to
 *     the sms_outbox table (so the admin panel / standalone dashboard can
 *     show "what would have been sent") and to stdout. This is the ONLY
 *     mode where the OTP code is ever handed back in an API response
 *     (devCode), specifically so tests and local development can read it
 *     without a real phone.
 *   - 'africastalking' — a real provider, for production use in Kenya.
 *     Needs AT_USERNAME and AT_API_KEY set. This makes a real outbound
 *     HTTPS call and will not work in a network-restricted dev sandbox —
 *     that's expected; it's meant to run where real egress is available.
 *
 * Adding another real provider (Twilio, etc.) means adding one more
 * function here and one more branch in sendSms — nothing else changes.
 */
'use strict';
const crypto = require('crypto');
const { db } = require('./db');

// Company-level Africa's Talking credentials live in sms_settings. The API key is encrypted at rest (AES-256-GCM,
// key derived from JWT_SECRET) and is never returned by any API — only whether one is saved.
function kdfKey(){ return crypto.createHash('sha256').update('sms-settings|' + (process.env.JWT_SECRET || 'dev-only-insecure-secret-do-not-use-in-production')).digest(); }
function encrypt(text){ const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', kdfKey(), iv); const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]); return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.'); }
function decrypt(blob){ try{ const [iv, tag, enc] = String(blob).split('.').map(x => Buffer.from(x, 'base64')); const d = crypto.createDecipheriv('aes-256-gcm', kdfKey(), iv); d.setAuthTag(tag); return Buffer.concat([d.update(enc), d.final()]).toString('utf8'); }catch(e){ return null; } }

async function getSettings(companyId){
  const r = await db.prepare('SELECT * FROM sms_settings WHERE company_id = ?').get(companyId);
  return r || { company_id: companyId, enabled: 0, provider: 'africastalking', username: null, api_key_enc: null, sender_id: null, email_fallback: 1 };
}
async function saveSettings(companyId, { enabled, username, apiKey, senderId, emailFallback }){
  const cur = await getSettings(companyId);
  const keyEnc = (typeof apiKey === 'string' && apiKey.trim()) ? encrypt(apiKey.trim()) : cur.api_key_enc;
  const uname = typeof username === 'string' ? username.trim().slice(0, 80) : cur.username;
  const sender = typeof senderId === 'string' ? senderId.trim().slice(0, 11) : cur.sender_id;
  const on = enabled ? 1 : 0;
  if(on && (!uname || !keyEnc)) throw { status: 422, message: "Enter the Africa's Talking username and API key before switching live SMS on." };
  const fb = emailFallback === undefined ? cur.email_fallback : (emailFallback ? 1 : 0);
  const exists = await db.prepare('SELECT company_id FROM sms_settings WHERE company_id = ?').get(companyId);
  if(exists) await db.prepare("UPDATE sms_settings SET enabled = ?, username = ?, api_key_enc = ?, sender_id = ?, email_fallback = ?, updated_at = datetime('now') WHERE company_id = ?").run(on, uname || null, keyEnc || null, sender || null, fb, companyId);
  else await db.prepare('INSERT INTO sms_settings (company_id, enabled, username, api_key_enc, sender_id, email_fallback) VALUES (?,?,?,?,?,?)').run(companyId, on, uname || null, keyEnc || null, sender || null, fb);
  return publicSettings(companyId);
}
async function publicSettings(companyId){
  const r = await getSettings(companyId);
  return { enabled: !!r.enabled, provider: 'africastalking', username: r.username || '', senderId: r.sender_id || '', apiKeySaved: !!r.api_key_enc, emailFallback: !!r.email_fallback, activeProvider: await providerFor(companyId) };
}
// Which provider actually carries this company's messages: the env-level override first (existing deployments),
// then the company's own switch, else the safe local 'console' substitute.
async function providerFor(companyId){
  if(process.env.SMS_PROVIDER === 'africastalking') return 'africastalking';
  const r = await getSettings(companyId);
  return (r.enabled && r.username && r.api_key_enc) ? 'africastalking' : 'console';
}

async function logOutbox(companyId, phone, message, provider, status, error){
  try{
    await db.prepare('INSERT INTO sms_outbox (company_id, phone, message, provider, status, error) VALUES (?,?,?,?,?,?)')
      .run(companyId || null, phone, message, provider, status, error || null);
  } catch(e){ /* outbox logging must never break the send path */ }
}

async function sendConsole(companyId, phone, message){
  console.log(`[SMS:console] to ${phone}: ${message}`);
  await logOutbox(companyId, phone, message, 'console', 'sent', null);
  return { provider: 'console', delivered: true };
}

async function sendAfricasTalking(companyId, phone, message){
  let username = process.env.AT_USERNAME, apiKey = process.env.AT_API_KEY, senderId = process.env.AT_SENDER_ID || null;
  if(!(username && apiKey) && companyId){
    const st = await getSettings(companyId);
    if(st.enabled && st.username && st.api_key_enc){ username = st.username; apiKey = decrypt(st.api_key_enc); senderId = st.sender_id || senderId; }
  }
  if(!username || !apiKey){
    const err = 'AT_USERNAME / AT_API_KEY not configured';
    await logOutbox(companyId, phone, message, 'africastalking', 'failed', err);
    throw new Error(`SMS provider "africastalking" is not configured: ${err}`);
  }
  const base = process.env.AT_API_BASE || 'https://api.africastalking.com';
  const res = await fetch(`${base}/version1/messaging`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'apiKey': apiKey
    },
    body: new URLSearchParams(Object.assign({ username, to: phone, message }, senderId ? { from: senderId } : {})).toString()
  });
  const body = await res.json().catch(() => ({}));
  if(!res.ok){
    const err = `Africa's Talking responded ${res.status}: ${JSON.stringify(body)}`;
    await logOutbox(companyId, phone, message, 'africastalking', 'failed', err);
    throw new Error(err);
  }
  await logOutbox(companyId, phone, message, 'africastalking', 'sent', null);
  return { provider: 'africastalking', delivered: true, raw: body };
}

async function sendSms(companyId, phone, message){
  const provider = await providerFor(companyId);
  if(provider === 'africastalking') return sendAfricasTalking(companyId, phone, message);
  return sendConsole(companyId, phone, message);
}

function currentProvider(){
  return process.env.SMS_PROVIDER || 'console';
}

module.exports = { sendSms, currentProvider, providerFor, getSettings, saveSettings, publicSettings, encrypt, decrypt };
