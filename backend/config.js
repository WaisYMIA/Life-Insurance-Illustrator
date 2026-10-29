/**
 * Per-company settings that are not rates: where leads go, data-retention periods, who may sell (licence + quiz),
 * which documents an application needs, payment mode, webhook. Stored as one JSON document per company
 * (company_config). Secrets (M-Pesa keys, webhook secret) are stored encrypted and never returned to a client.
 */
'use strict';
const { db } = require('./db');
const { encrypt, decrypt } = require('./sms');

const DOC_KINDS = ['national_id_front', 'national_id_back', 'kra_pin', 'passport_photo', 'beneficiary_form', 'birth_certificate', 'payslip', 'other'];
const DOC_LABELS = { national_id_front: 'National ID (front)', national_id_back: 'National ID (back)', kra_pin: 'KRA PIN certificate', passport_photo: 'Passport photo', beneficiary_form: 'Beneficiary / nominee form', birth_certificate: 'Birth certificate (minor beneficiary)', payslip: 'Payslip or income proof', other: 'Other document' };

const DEFAULTS = {
  leadsEmail: '',            // where new leads / applications / complaints are emailed
  reportEmails: '',          // weekly management report recipients (comma separated)
  weeklyReport: false,
  retention: { enabled: true, usageDays: 400, outboxDays: 30, quoteDays: 2555, auditDays: 2555, leadDays: 1095, draftDays: 30 },
  licensing: { required: false, quizRequired: false, passMark: 80, quizValidDays: 365, warnDays: 30, blockExpired: true },
  docsRequired: ['national_id_front', 'national_id_back', 'kra_pin'],
  declarationText: 'I declare that the answers I have given are true and complete, and that I have not withheld any fact that could affect the insurer\'s decision to accept this application or the terms offered (utmost good faith). I understand that giving false information or leaving out a material fact may lead to a claim being declined or the policy being cancelled.',
  consentText: 'I agree that the company and my adviser may collect and use my personal data to assess and administer this application, in line with the Data Protection Act, 2019 and the company\'s privacy notice. I understand I may ask to see, correct or delete my data.',
  complaintSlaDays: 14,
  payments: { mode: 'manual', mpesaEnabled: false, env: 'sandbox', shortcode: '', transactionType: 'CustomerPayBillOnline', callbackBase: '', manualInstructions: '' },
  webhook: { enabled: false, url: '' },
  features: { applications: true, clientMode: true, policies: true, complaints: true, suitability: true, customProducts: true, dailyQuote: true }
};
const SECRET_FIELDS = { payments: ['consumerKey', 'consumerSecret', 'passkey'], webhook: ['secret'] };

function clone(o){ return JSON.parse(JSON.stringify(o)); }
function merge(base, over){
  if(Array.isArray(base) || base === null || typeof base !== 'object') return over === undefined ? base : over;
  const out = {}; const o = over && typeof over === 'object' ? over : {};
  for(const k of Object.keys(base)) out[k] = merge(base[k], o[k]);
  for(const k of Object.keys(o)) if(!(k in base) && /Enc$/.test(k)) out[k] = o[k];   // encrypted secrets
  return out;
}
async function getConfig(companyId){
  const row = await db.prepare('SELECT config_json FROM company_config WHERE company_id = ?').get(companyId);
  let stored = {}; try { stored = row ? JSON.parse(row.config_json) : {}; } catch(e){ stored = {}; }
  return merge(DEFAULTS, stored);
}
async function saveConfig(companyId, cfg){
  const json = JSON.stringify(cfg);
  const ex = await db.prepare('SELECT company_id FROM company_config WHERE company_id = ?').get(companyId);
  if(ex) await db.prepare("UPDATE company_config SET config_json = ?, updated_at = datetime('now') WHERE company_id = ?").run(json, companyId);
  else await db.prepare('INSERT INTO company_config (company_id, config_json) VALUES (?,?)').run(companyId, json);
}
function publicConfig(cfg){
  const out = clone(cfg);
  for(const [sect, fields] of Object.entries(SECRET_FIELDS)){
    for(const f of fields){ out[sect]['has' + f[0].toUpperCase() + f.slice(1)] = !!out[sect][f + 'Enc']; delete out[sect][f + 'Enc']; }
  }
  return out;
}
function secretOf(cfg, sect, field){ const blob = cfg[sect] && cfg[sect][field + 'Enc']; return blob ? decrypt(blob) : null; }

const bad = m => ({ status: 400, message: m });
function emailList(v, label){
  const list = String(v || '').split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
  if(list.length > 10) throw bad(label + ': at most 10 addresses.');
  for(const e of list) if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 160) throw bad(label + ': "' + e + '" is not a valid email address.');
  return list.join(', ');
}
function int(v, lo, hi, label){ const n = Math.round(Number(v)); if(!Number.isFinite(n) || n < lo || n > hi) throw bad(label + ' must be a whole number from ' + lo + ' to ' + hi + '.'); return n; }
function str(v, max){ return typeof v === 'string' ? v.trim().slice(0, max) : ''; }

// Validates a partial update and returns the new full config. Unknown keys are ignored.
function applyPatch(cur, patch){
  const next = clone(cur); const p = patch || {};
  if('leadsEmail' in p) next.leadsEmail = emailList(p.leadsEmail, 'Leads email');
  if('reportEmails' in p) next.reportEmails = emailList(p.reportEmails, 'Report emails');
  if('weeklyReport' in p) next.weeklyReport = !!p.weeklyReport;
  if(p.retention){
    const r = p.retention, o = next.retention;
    if('enabled' in r) o.enabled = !!r.enabled;
    if('usageDays' in r) o.usageDays = int(r.usageDays, 30, 3650, 'Usage-log retention');
    if('outboxDays' in r) o.outboxDays = int(r.outboxDays, 1, 365, 'Message-log retention');
    if('quoteDays' in r) o.quoteDays = int(r.quoteDays, 90, 3650, 'Quote-trail retention');
    if('auditDays' in r) o.auditDays = int(r.auditDays, 90, 3650, 'Audit-log retention');
    if('leadDays' in r) o.leadDays = int(r.leadDays, 30, 3650, 'Lead retention');
    if('draftDays' in r) o.draftDays = int(r.draftDays, 7, 365, 'Draft application retention');
  }
  if(p.licensing){
    const l = p.licensing, o = next.licensing;
    for(const k of ['required', 'quizRequired', 'blockExpired']) if(k in l) o[k] = !!l[k];
    if('passMark' in l) o.passMark = int(l.passMark, 50, 100, 'Pass mark');
    if('quizValidDays' in l) o.quizValidDays = int(l.quizValidDays, 30, 1095, 'Quiz validity');
    if('warnDays' in l) o.warnDays = int(l.warnDays, 1, 180, 'Licence warning period');
  }
  if(Array.isArray(p.docsRequired)){
    const l = p.docsRequired.filter(k => DOC_KINDS.includes(k) && k !== 'other');
    next.docsRequired = Array.from(new Set(l));
  }
  if('declarationText' in p) next.declarationText = str(p.declarationText, 2500) || cur.declarationText;
  if('consentText' in p) next.consentText = str(p.consentText, 1500) || cur.consentText;
  if('complaintSlaDays' in p) next.complaintSlaDays = int(p.complaintSlaDays, 1, 90, 'Complaint response period');
  if(p.payments){
    const y = p.payments, o = next.payments;
    if('mode' in y){ if(!['manual', 'mpesa'].includes(y.mode)) throw bad('Payment mode must be manual or mpesa.'); o.mode = y.mode; }
    if('mpesaEnabled' in y) o.mpesaEnabled = !!y.mpesaEnabled;
    if('env' in y){ if(!['sandbox', 'live'].includes(y.env)) throw bad('M-Pesa environment must be sandbox or live.'); o.env = y.env; }
    if('shortcode' in y){ const s = str(y.shortcode, 12); if(s && !/^\d{5,8}$/.test(s)) throw bad('The paybill / till number must be 5 to 8 digits.'); o.shortcode = s; }
    if('transactionType' in y){ if(!['CustomerPayBillOnline', 'CustomerBuyGoodsOnline'].includes(y.transactionType)) throw bad('Unknown M-Pesa transaction type.'); o.transactionType = y.transactionType; }
    if('callbackBase' in y){ const u = str(y.callbackBase, 200).replace(/\/+$/, ''); if(u && !/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(u)) throw bad('The callback address must start with https://'); o.callbackBase = u; }
    if('manualInstructions' in y) o.manualInstructions = str(y.manualInstructions, 600);
    for(const f of SECRET_FIELDS.payments) if(typeof y[f] === 'string' && y[f].trim()) o[f + 'Enc'] = encrypt(y[f].trim().slice(0, 300));
    if(o.mpesaEnabled){
      if(!o.shortcode || !o.callbackBase || !o.consumerKeyEnc || !o.consumerSecretEnc || !o.passkeyEnc) throw bad('To switch M-Pesa on, save the paybill/till number, the public callback address, and the consumer key, consumer secret and passkey first.');
    }
  }
  if(p.webhook){
    const w = p.webhook, o = next.webhook;
    if('url' in w){ const u = str(w.url, 300); if(u && !/^https?:\/\/[^\s/]+/.test(u)) throw bad('The webhook address must start with https://'); o.url = u; }
    if('enabled' in w) o.enabled = !!w.enabled;
    if(typeof w.secret === 'string' && w.secret.trim()) o.secretEnc = encrypt(w.secret.trim().slice(0, 200));
    if(o.enabled && (!o.url || !o.secretEnc)) throw bad('To switch the webhook on, save the address and a signing secret first.');
  }
  if(p.features){ for(const k of Object.keys(next.features)) if(k in p.features) next.features[k] = !!p.features[k]; }
  return next;
}
module.exports = { DEFAULTS, DOC_KINDS, DOC_LABELS, getConfig, saveConfig, publicConfig, applyPatch, secretOf, emailList };
