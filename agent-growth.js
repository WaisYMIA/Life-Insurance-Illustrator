/* ============================================================
   AGENT GROWTH TOOLS (v2026.11.1) — loaded after agent-tools.js and agent-apps.js.
   My business (today list, goals, pipeline) · birthday alerts · ready-made follow-up messages ·
   glossary practice quiz · cover-needed calculator · backup & restore · optional PIN lock ·
   extra pitch cards and practice clients.
   Everything here is added around existing screens; it never changes the calculators or the signed illustrations.
   The pure helpers at the top are also exported for the automated tests (node test/agent-growth-test.js).
   ============================================================ */
(function(root){
'use strict';

/* ======================= pure helpers (no browser needed) ======================= */
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const DAY = 864e5;

/** Days until the next birthday (0 = today) and the age the client turns. dob = 'YYYY-MM-DD'. */
function nextBirthday(dob, now){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || '')); if(!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3]; const t = midnight(now || new Date());
  if(mo < 0 || mo > 11 || d < 1 || d > 31 || y < 1900) return null;
  let next = new Date(t.getFullYear(), mo, d); if(next < t) next = new Date(t.getFullYear() + 1, mo, d);
  return { days: Math.round((next - t) / DAY), turning: next.getFullYear() - y, date: ymd(next) };
}
function birthdayList(clients, withinDays, now){
  return (clients || []).map(c => ({ c, b: nextBirthday(c.dob, now) })).filter(x => x.b && x.b.days <= withinDays && x.b.turning > 0 && x.b.turning < 120).sort((a, b) => a.b.days - b.b.days);
}
const daysInMonth = d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const monthKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1);
const sameMonth = (ts, now) => { if(!ts) return false; const d = new Date(ts); return monthKey(d) === monthKey(now || new Date()); };

/** Actuals for the month, compared with the agent's own goals. */
function goalProgress(goals, clients, now){
  now = now || new Date(); const g = goals || {};
  const cl = clients || [];
  const actual = {
    clients: cl.filter(c => sameMonth(c.createdAt, now)).length,
    quotes: cl.reduce((n, c) => n + (c.quotes || []).filter(q => sameMonth(q.at, now)).length, 0),
    won: cl.filter(c => c.status === 'won' && sameMonth(c.wonAt, now)).length
  };
  const frac = now.getDate() / daysInMonth(now), left = daysInMonth(now) - now.getDate();
  const out = {};
  ['clients', 'quotes', 'won'].forEach(k => {
    const goal = Math.max(0, Math.floor(+g[k] || 0)), a = actual[k];
    if(!goal){ out[k] = { goal: 0, actual: a, state: 'none', pct: 0, left }; return; }
    const expected = goal * frac;
    out[k] = { goal, actual: a, pct: Math.min(100, Math.round(a / goal * 100)), left, need: Math.max(0, goal - a), state: a >= goal ? 'done' : a + 0.5 >= expected ? 'ontrack' : 'behind' };
  });
  return out;
}

/** Cover-needed estimate. All amounts are KES. Simple, transparent, no inflation or investment return. */
function computeNeeds(i){
  const n = v => Math.max(0, Math.round(+v || 0));
  const monthly = n(i.monthlyIncome), years = Math.min(40, n(i.years)), debts = n(i.debts), kids = Math.min(12, n(i.kids)), edu = n(i.eduPerChild), funeral = n(i.funeral), months = Math.min(24, n(i.emergencyMonths)), existing = n(i.existingCover), savings = n(i.savings);
  const parts = [
    { id: 'income', amount: monthly * 12 * years }, { id: 'debts', amount: debts }, { id: 'education', amount: kids * edu },
    { id: 'final', amount: funeral }, { id: 'emergency', amount: monthly * months }
  ];
  const total = parts.reduce((s, p) => s + p.amount, 0);
  const offset = existing + savings, gap = Math.max(0, total - offset);
  parts.forEach(p => { p.pct = total ? Math.round(p.amount / total * 100) : 0; });
  return { parts, total, existing, savings, offset, gap, ruleOfThumb: monthly * 12 * 10, covered: total > 0 && gap === 0 };
}

/** Hide the answer inside a definition ("Premium" -> "_____"). */
function maskTerm(def, term){
  const base = String(term).replace(/\s*\([^)]*\)/g, '').trim(); let out = String(def);
  if(base.length >= 3){ const re = new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:e?s)?', 'gi'); out = out.replace(re, '_____'); }
  return out;
}
const LINE_OF = { 'Types of life cover': 'life', 'Riders & extra covers': 'life', 'Savings & investment': 'life', 'Benefits & values': 'life', 'Policy life-cycle': 'life', 'Medical insurance': 'medical', 'Health financing (Kenya)': 'medical', 'Motor insurance': 'motor', 'General insurance': 'general', 'Property & liability': 'general', 'Marine, engineering & specialist': 'general', 'Reinsurance & finance': 'general' };
function quizPool(glossary, line){
  return (glossary || []).filter(e => e && e.t && e.d && e.c !== 'Kiswahili terms' && e.d.length >= 40 && e.d.length <= 320 && (line === 'all' || (LINE_OF[e.c] || 'common') === line || (LINE_OF[e.c] || 'common') === 'common'));
}
function shuffle(a, rnd){ a = a.slice(); for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
/** Build n multiple-choice questions: a masked definition and four term choices. */
function buildQuiz(glossary, line, n, rnd){
  rnd = rnd || Math.random; const pool = quizPool(glossary, line); if(pool.length < 8) return [];
  const picks = shuffle(pool, rnd).slice(0, n); const qs = [];
  picks.forEach(e => {
    const same = pool.filter(x => x !== e && x.c === e.c && x.t.toLowerCase() !== e.t.toLowerCase());
    const rest = pool.filter(x => x !== e && x.c !== e.c && x.t.toLowerCase() !== e.t.toLowerCase());
    const dis = shuffle(same, rnd).slice(0, 2).concat(shuffle(rest, rnd)).filter((x, i, a) => a.findIndex(y => y.t === x.t) === i).slice(0, 3);
    if(dis.length < 3) return;
    const opts = shuffle([e].concat(dis), rnd).map(x => x.t);
    qs.push({ term: e.t, cat: e.c, def: maskTerm(e.d, e.t), full: e.d, ex: e.x || '', opts, answer: opts.indexOf(e.t) });
  });
  return qs;
}

/** Seconds allowed for one question, from its nature: time to read the definition, scan the four choices and think.
 *  Technical topics and questions with figures get extra thinking time. Rounded to 5 s, between 15 and 60 s. pace: 1 = standard, 1.5 = relaxed. */
const TECHNICAL = ['Regulation & compliance', 'Reinsurance & finance', 'Marine, engineering & specialist', 'Underwriting & claims', 'Health financing (Kenya)'];
const wordCount = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;
function secondsFor(q, pace){
  const read = wordCount(q.def) / 3;                                    // about 180 words a minute: comfortable for a second-language reader
  const opts = (q.opts || []).reduce((n, o) => n + 0.8 + wordCount(o) * 0.35, 0);   // scanning the choices
  const think = 5 + (TECHNICAL.indexOf(q.cat) >= 0 ? 4 : 0) + (/\d/.test(q.def || '') ? 3 : 0) + (q.topic === 'calc' ? 12 : 0);
  const raw = (read + opts + think) * (pace || 1);
  return Math.max(15, Math.min(60, Math.round(raw / 5) * 5));
}
const CSV_COLS = ['name', 'phone', 'email', 'dob', 'status', 'followUp', 'followNote', 'notes'];
function csvCell(v){ let s = v == null ? '' : String(v).replace(/\r?\n/g, ' '); if(/^[=+\-@\t]/.test(s)) s = "'" + s; return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function clientsToCsv(clients){
  const head = CSV_COLS.concat(['savedQuotes', 'createdOn']).join(',');
  const rows = (clients || []).map(c => CSV_COLS.map(k => csvCell(c[k])).concat([String((c.quotes || []).length), c.createdAt ? ymd(new Date(c.createdAt)) : '']).join(','));
  return '﻿' + [head].concat(rows).join('\r\n');
}

const STATUS_IDS = ['new', 'contacted', 'quoted', 'won', 'lost'];
const str = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
function cleanClient(c){
  if(!c || typeof c !== 'object' || typeof c.name !== 'string' || !c.name.trim()) return null;
  const date = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
  const out = { id: str(c.id, 40) || null, name: str(c.name, 120).trim(), phone: str(c.phone, 20), email: str(c.email, 160), notes: str(c.notes, 800), dob: date(c.dob), followUp: date(c.followUp), followNote: str(c.followNote, 160), status: STATUS_IDS.indexOf(c.status) >= 0 ? c.status : 'new', createdAt: +c.createdAt || Date.now(), updatedAt: +c.updatedAt || 0 };
  if(+c.wonAt) out.wonAt = +c.wonAt; if(+c.leadSentAt) out.leadSentAt = +c.leadSentAt; if(+c.lastContactAt) out.lastContactAt = +c.lastContactAt;
  out.quotes = (Array.isArray(c.quotes) ? c.quotes : []).filter(q => q && typeof q === 'object').slice(0, 30).map(q => { const x = JSON.parse(JSON.stringify(q)); x.id = str(x.id, 40) || Math.random().toString(36).slice(2, 10); x.at = +x.at || Date.now(); return x; });
  return out;
}
/** Read a backup file's text. Returns { ok, error, clients, goals }. */
function parseBackup(text){
  let j; try{ j = JSON.parse(text); }catch(e){ return { ok: false, error: 'This is not a backup file (it could not be read).' }; }
  if(!j || j.format !== 'plan-illustrator-backup' || !Array.isArray(j.clients)) return { ok: false, error: 'This file is not a Plan Illustrator backup.' };
  if(j.clients.length > 3000) return { ok: false, error: 'The backup has too many clients to restore safely.' };
  const clients = j.clients.map(cleanClient).filter(Boolean);
  const g = j.goals && typeof j.goals === 'object' ? j.goals : null;
  const goals = g ? { clients: Math.max(0, Math.min(9999, Math.floor(+g.clients || 0))), quotes: Math.max(0, Math.min(9999, Math.floor(+g.quotes || 0))), won: Math.max(0, Math.min(9999, Math.floor(+g.won || 0))) } : null;
  return { ok: true, clients, goals, skipped: j.clients.length - clients.length, exportedAt: j.exportedAt || null };
}
/** Merge: same id → the more recently changed record wins; unknown ids are added. Nothing is deleted. */
function mergeClients(local, incoming){
  const out = (local || []).slice(); let added = 0, updated = 0, kept = 0; const byId = new Map(out.map((c, i) => [c.id, i]));
  (incoming || []).forEach(c => {
    if(!c.id) c.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if(!byId.has(c.id)){ out.push(c); byId.set(c.id, out.length - 1); added++; return; }
    const i = byId.get(c.id), cur = out[i]; const tNew = c.updatedAt || c.createdAt || 0, tCur = cur.updatedAt || cur.createdAt || 0;
    if(tNew > tCur){ out[i] = c; updated++; } else kept++;
  });
  return { clients: out, added, updated, kept };
}
const PURE = { secondsFor, nextBirthday, birthdayList, goalProgress, computeNeeds, maskTerm, quizPool, buildQuiz, clientsToCsv, csvCell, parseBackup, mergeClients, cleanClient, shuffle };
if(typeof module !== 'undefined' && module.exports) module.exports = PURE;
if(!root || !root.AgentTools || root.__agentGrowth) return; root.__agentGrowth = true;

/* ======================= browser part ======================= */
const T = root.AgentTools;
const { showPanel, backPanel, closePanel, L, esc, toast, $, $$, get, put, K, uid, today, loggedIn, clients, saveClients, waNumber, STATUSES, statusLabel, dueState } = T;
const kes = n => 'KES ' + Math.round(n || 0).toLocaleString('en-KE');
const digits = v => { const n = parseInt(String(v == null ? '' : v).replace(/[^\d]/g, ''), 10); return isFinite(n) ? n : 0; };
const agentName = () => (typeof AGENT !== 'undefined' && AGENT && AGENT.name) || '';
const first = name => String(name || '').trim().split(/\s+/)[0] || '';

const CSS = `
.ag-sec{margin:16px 0 6px;font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted,#6b5b5b);}
.ag-fs{border:1px solid var(--line,#e6dcdc);border-radius:12px;margin:10px 0;padding:6px 12px 8px;} .ag-fs legend{font-weight:700;font-size:13px;padding:0 6px;} #atPanel .ag-chk{display:flex;gap:10px;align-items:center;min-height:40px;font-size:14.5px;color:var(--ink,#241818);font-weight:500;cursor:pointer;} #atPanel .ag-chk input{width:22px;height:22px;padding:0;margin:0;flex:none;accent-color:var(--brand);}
.ag-opt{display:block;width:100%;text-align:left;border:1.5px solid var(--line,#e6dcdc);background:#fff;color:inherit;border-radius:12px;padding:12px 14px;margin:8px 0;font:600 15px system-ui,sans-serif;cursor:pointer;min-height:46px;}
.ag-opt:disabled{cursor:default;opacity:1;} .ag-opt.ok{background:#e3f2e8;border-color:#1f6b3a;color:#14532d;} .ag-opt.bad{background:#fde8e6;border-color:#b3261e;color:#7a1710;}
.ag-def{font-size:16px;line-height:1.5;margin:6px 0 10px;}
.ag-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}
.ag-meta{font-size:12.5px;color:var(--muted,#6b5b5b);}
.ag-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.ag-fine{font-size:12.5px;color:var(--muted,#6b5b5b);line-height:1.45;margin:10px 0;}
.ag-big{font-size:26px;font-weight:800;color:var(--brand-dark,#5a1020);margin:2px 0;}
.ag-det{border:1px solid var(--line,#e6dcdc);border-radius:12px;background:#fff;margin:8px 0;padding:0 12px;}
.ag-det>summary{cursor:pointer;font-weight:700;font-size:14.5px;padding:11px 0;color:var(--brand-dark,#5a1020);}
.ag-det[open]>summary{border-bottom:1px solid var(--line,#e6dcdc);margin-bottom:6px;}
.ag-rowx{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;}
.ag-sel{width:auto!important;min-width:0;margin:0!important;padding:6px 8px!important;font-size:13px!important;}
#agLock{position:fixed;inset:0;z-index:20000;background:var(--brand-dark,#4a0d1a);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;font-family:system-ui,sans-serif;text-align:center;}
#agLock h2{margin:0 0 4px;font-size:22px;font-family:var(--font-display,inherit);} #agLock p{margin:4px 0 14px;font-size:14px;opacity:.9;}
#agLock .dots{display:flex;gap:12px;justify-content:center;margin:6px 0 16px;min-height:18px;} #agLock .dots i{width:14px;height:14px;border-radius:50%;border:2px solid #fff;display:block;} #agLock .dots i.on{background:#fff;}
#agLock .pad{display:grid;grid-template-columns:repeat(3,72px);gap:12px;justify-content:center;} #agLock .pad button{height:60px;border-radius:50%;border:0;background:rgba(255,255,255,.16);color:#fff;font:600 24px system-ui,sans-serif;cursor:pointer;}
#agLock .pad button:active{background:rgba(255,255,255,.34);} #agLock .err{min-height:20px;font-weight:700;color:#ffd7d3;margin-top:10px;font-size:14px;}
#agLock .forgot{margin-top:14px;background:transparent;border:0;color:#fff;text-decoration:underline;font:14px system-ui,sans-serif;cursor:pointer;min-height:40px;}
@media print{#agLock{display:none!important;}}
`;
function injectCss(){ if($('#agCss')) return; const s = document.createElement('style'); s.id = 'agCss'; s.textContent = CSS; document.head.appendChild(s); }
const nowTs = () => Date.now();
const lastQuote = c => (c.quotes || [])[0] || null;
const quoteLine = q => q ? (q.title || q.product || '') + (q.hero && q.hero.value ? ': ' + q.hero.value : '') : '';

/* ---------- follow-up messages ---------- */
function templates(c){
  const f = first(c.name) || L('there', 'hapo'), me = agentName(), q = lastQuote(c);
  const sign = me ? '\n' + me : '';
  let summary = ''; try{ if(q) summary = '\n\n' + T.summaryText(q, c); }catch(e){}
  return [
    { id: 'followup', l: L('Follow up after meeting', 'Kufuatilia baada ya mkutano'), t: L(`Hello ${f}, thank you for your time. I wanted to check whether you have any questions about what we discussed. When is a good time for a short call?${sign}`, `Habari ${f}, asante kwa muda wako. Nilitaka kujua kama una swali lolote kuhusu tuliyozungumza. Ni wakati gani mzuri kwa simu fupi?${sign}`) },
    { id: 'summary', l: L('Send the plan summary', 'Tuma muhtasari wa mpango'), t: L(`Hello ${f}, as promised, here is a short summary of the plan we discussed. Illustrated figures are estimates, not guarantees. Please read it with your family and tell me what you think.${summary}${sign}`, `Habari ${f}, kama nilivyoahidi, huu ni muhtasari mfupi wa mpango tuliozungumza. Takwimu zilizoonyeshwa ni makadirio, si hakikisho. Tafadhali usome na familia yako kisha uniambie maoni yako.${summary}${sign}`) },
    { id: 'callback', l: L('Call-back reminder', 'Kikumbusho cha kupiga simu'), t: L(`Hello ${f}, a gentle reminder that we agreed to speak today${c.followNote ? ' about ' + c.followNote : ''}. Is now a good time, or would you prefer another time?${sign}`, `Habari ${f}, kikumbusho kuwa tulikubaliana kuzungumza leo${c.followNote ? ' kuhusu ' + c.followNote : ''}. Je, sasa ni wakati mzuri, au ungependa wakati mwingine?${sign}`) },
    { id: 'thanks', l: L('Thank you / welcome', 'Asante / karibu'), t: L(`Hello ${f}, thank you for trusting me with your family's protection. I will keep you updated at each step and I am always available if you have a question.${sign}`, `Habari ${f}, asante kwa kuniamini na ulinzi wa familia yako. Nitakujulisha kila hatua na nipo wakati wowote ukiwa na swali.${sign}`) },
    { id: 'premium', l: L('Premium reminder', 'Kikumbusho cha ada'), t: L(`Hello ${f}, a friendly reminder that your premium is due. Paying on time keeps your cover active. Please tell me if you need any help.${sign}`, `Habari ${f}, kikumbusho kuwa ada yako inastahili kulipwa. Kulipa kwa wakati huweka bima yako hai. Tafadhali niambie ukihitaji msaada.${sign}`) },
    { id: 'birthday', l: L('Birthday greeting', 'Salamu za siku ya kuzaliwa'), t: L(`Happy birthday ${f}! Wishing you good health, happiness and success in the year ahead.${sign}`, `Heri ya siku ya kuzaliwa ${f}! Nakutakia afya njema, furaha na mafanikio katika mwaka ujao.${sign}`) },
    { id: 'review', l: L('Yearly review invitation', 'Mwaliko wa mapitio ya mwaka'), t: L(`Hello ${f}, life changes, and your cover should keep up. May I check whether your income, family or debts have changed since we last spoke? It takes about ten minutes.${sign}`, `Habari ${f}, maisha hubadilika, na bima yako inapaswa kwenda sambamba. Naomba nikague kama kipato, familia au madeni yako yamebadilika tangu tuzungumze mara ya mwisho. Inachukua takriban dakika kumi.${sign}`) }
  ];
}
function openMessage(c, kind){
  showPanel(L('Message', 'Ujumbe') + ': ' + first(c.name), body => {
    let sel = kind || 'followup';
    const draw = () => {
      const list = templates(c), cur = list.find(x => x.id === sel) || list[0];
      body.innerHTML = `<div class="at-row" style="margin:0 0 8px;" id="mgChips">${list.map(x => `<button class="at-btn sm ${x.id === cur.id ? 'pri' : ''}" data-t="${x.id}">${esc(x.l)}</button>`).join('')}</div>
        <label for="mgText">${esc(L('Message (you can edit it)', 'Ujumbe (unaweza kuubadilisha)'))}</label><textarea id="mgText" rows="9" maxlength="1800">${esc(cur.t)}</textarea>
        <div class="at-row"><button class="at-btn pri" id="mgWa">WhatsApp</button><button class="at-btn" id="mgSms">SMS</button><button class="at-btn" id="mgCopy">${esc(L('Copy', 'Nakili'))}</button><button class="at-btn sm" id="mgLang">${esc(L('Kiswahili', 'English'))}</button></div>
        <p class="ag-fine">${esc(c.phone ? L('Sending to ', 'Inatuma kwa ') + c.phone : L('No phone number saved for this client, so WhatsApp will let you choose the contact.', 'Hakuna namba ya simu iliyohifadhiwa, kwa hivyo WhatsApp itakuruhusu kuchagua mwasiliani.'))}</p>`;
      $$('[data-t]', body).forEach(b => b.addEventListener('click', () => { sel = b.dataset.t; draw(); }));
      const text = () => $('#mgText', body).value;
      const touch = () => { const a = clients(), i = a.findIndex(x => x.id === c.id); if(i >= 0){ a[i].lastContactAt = nowTs(); if(a[i].status === 'new') a[i].status = 'contacted'; a[i].updatedAt = nowTs(); saveClients(a); } };
      $('#mgWa', body).addEventListener('click', () => { const n = waNumber(c.phone); window.open('https://wa.me/' + (n || '') + '?text=' + encodeURIComponent(text()), '_blank'); touch(); });
      $('#mgSms', body).addEventListener('click', () => { const n = String(c.phone || '').replace(/[^\d+]/g, ''); location.href = 'sms:' + n + '?body=' + encodeURIComponent(text()); touch(); });
      $('#mgCopy', body).addEventListener('click', async () => { try{ await navigator.clipboard.writeText(text()); toast(L('Copied.', 'Imenakiliwa.')); }catch(e){ $('#mgText', body).select(); } });
      $('#mgLang', body).addEventListener('click', () => { T.setLang(T.lang() === 'sw' ? 'en' : 'sw'); draw(); });
    };
    draw();
  });
}

/* ---------- my business: today, goals, pipeline ---------- */
const GOALS_KEY = 'illustrator_goals_v1', BACKUP_KEY = 'illustrator_lastbackup_v1';
const getGoals = () => get(K(GOALS_KEY), {});
function birthdayAlerts(){ return birthdayList(clients(), 3, new Date()); }
function dueClients(){ return clients().filter(c => { const s = dueState(c); return s === 'overdue' || s === 'today'; }); }
function backupAgeDays(){ const t = get(K(BACKUP_KEY), 0); return t ? Math.floor((nowTs() - t) / DAY) : null; }
const bdayText = b => b.days === 0 ? L('today', 'leo') : b.days === 1 ? L('tomorrow', 'kesho') : L('in ' + b.days + ' days', 'baada ya siku ' + b.days);

function openBusiness(){
  showPanel(L('My business', 'Biashara yangu'), body => drawBusiness(body));
}
function drawBusiness(body){
  const all = clients(), now = new Date();
  const due = dueClients().sort((a, b) => (a.followUp < b.followUp ? -1 : 1)), bd = birthdayList(all, 14, now);
  let html = `<h3 class="ag-sec" style="margin-top:4px;">${esc(L('Today', 'Leo'))}</h3>`;
  const items = [];
  due.forEach(c => { const ds = dueState(c); items.push(`<div class="at-item" data-open="${esc(c.id)}"><div class="t">${esc(c.name)} <span class="at-chip ${ds === 'overdue' ? 'red' : 'amber'}">${esc(ds === 'overdue' ? L('Follow-up overdue', 'Ufuatiliaji umechelewa') : L('Follow up today', 'Fuatilia leo'))}</span></div><div class="s">${esc(c.followNote || '')}${c.followNote ? ' · ' : ''}${esc(c.followUp)}</div><div class="at-row"><button class="at-btn sm pri" data-msg="${esc(c.id)}" data-kind="callback">${esc(L('Message', 'Ujumbe'))}</button></div></div>`); });
  bd.forEach(x => { items.push(`<div class="at-item" data-open="${esc(x.c.id)}"><div class="t">${esc(x.c.name)} <span class="at-chip green">${esc(L('Birthday ', 'Siku ya kuzaliwa ') + bdayText(x.b))}</span></div><div class="s">${esc(L('Turns ' + x.b.turning + '. Premiums are based on age next birthday, so refresh any saved quote.', 'Anatimiza miaka ' + x.b.turning + '. Ada hutegemea umri wa siku ya kuzaliwa ijayo, kwa hivyo sasisha nukuu iliyohifadhiwa.'))}</div><div class="at-row"><button class="at-btn sm pri" data-msg="${esc(x.c.id)}" data-kind="birthday">${esc(L('Send greeting', 'Tuma salamu'))}</button></div></div>`); });
  const bk = backupAgeDays();
  if(all.length >= 3 && (bk === null || bk > 30)) items.push(`<div class="at-banner warn"><span>${esc(bk === null ? L('You have not backed up your clients yet.', 'Bado hujahifadhi nakala ya wateja wako.') : L('Last backup was ' + bk + ' days ago.', 'Nakala ya mwisho ilikuwa siku ' + bk + ' zilizopita.'))}</span><button class="at-btn sm" id="bzBackup">${esc(L('Back up', 'Hifadhi nakala'))}</button></div>`);
  html += items.length ? items.join('') : `<p class="ag-fine">${esc(L('Nothing urgent today. Add follow-up dates and birthdays to your clients and they will show here.', 'Hakuna cha dharura leo. Weka tarehe za kufuatilia na siku za kuzaliwa kwa wateja wako zitaonekana hapa.'))}</p>`;

  const g = getGoals(), gp = goalProgress(g, all, now), hasGoals = ['clients', 'quotes', 'won'].some(k => gp[k].goal > 0);
  const labels = { clients: [L('New clients', 'Wateja wapya'), 10], quotes: [L('Quotes saved', 'Nukuu zilizohifadhiwa'), 15], won: [L('Policies won', 'Sera zilizopatikana'), 3] };
  html += `<h3 class="ag-sec">${esc(L('My goals this month', 'Malengo yangu mwezi huu'))}</h3><div class="at-card">`;
  ['clients', 'quotes', 'won'].forEach(k => {
    const r = gp[k]; const chip = r.state === 'done' ? `<span class="at-chip green">${esc(L('Goal reached', 'Lengo limefikiwa'))}</span>` : r.state === 'ontrack' ? `<span class="at-chip green">${esc(L('On track', 'Unaenda vizuri'))}</span>` : r.state === 'behind' ? `<span class="at-chip amber">${esc(L('Behind', 'Nyuma'))}</span>` : '';
    html += `<div style="margin:8px 0;font-size:14px;">${esc(labels[k][0])}: <b>${r.actual}</b>${r.goal ? ' / ' + r.goal : ''} ${chip}${r.goal ? `<div class="at-bar ${r.state === 'done' ? 'ok' : ''}"><i style="width:${r.pct}%"></i></div>${r.state !== 'done' ? `<div class="ag-meta">${esc(L(r.need + ' more in ' + r.left + ' days', 'Bado ' + r.need + ' kwa siku ' + r.left))}</div>` : ''}` : ''}</div>`;
  });
  html += `<details class="ag-det" ${hasGoals ? '' : 'open'} style="margin-top:10px;"><summary>${esc(hasGoals ? L('Change my goals', 'Badilisha malengo yangu') : L('Set my goals', 'Weka malengo yangu'))}</summary>
    ${['clients', 'quotes', 'won'].map(k => `<label for="gl_${k}">${esc(labels[k][0])}</label><input id="gl_${k}" type="text" inputmode="numeric" maxlength="4" value="${g[k] || ''}" placeholder="${esc(L('e.g. ', 'mfano: ') + labels[k][1])}">`).join('')}
    <div class="at-row"><button class="at-btn pri" id="glSave">${esc(L('Save goals', 'Hifadhi malengo'))}</button></div></details></div>`;

  html += `<h3 class="ag-sec">${esc(L('My pipeline', 'Mchakato wangu wa mauzo'))}</h3>`;
  const won = all.filter(c => c.status === 'won').length, lost = all.filter(c => c.status === 'lost').length, active = all.length - won - lost;
  html += `<div class="at-card"><div class="at-row" style="margin:0;"><span class="at-chip">${esc(L('Active', 'Hai'))}: ${active}</span><span class="at-chip green">${esc(L('Won', 'Waliopatikana'))}: ${won}</span><span class="at-chip red">${esc(L('Lost', 'Waliopotea'))}: ${lost}</span>${won + lost ? `<span class="at-chip">${esc(L('Won of decided', 'Waliopatikana kati ya waliokamilika'))}: ${Math.round(won / (won + lost) * 100)}%</span>` : ''}</div></div>`;
  STATUSES.forEach(s => {
    const list = all.filter(c => c.status === s[0]).sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    html += `<details class="ag-det" ${(s[0] === 'won' || s[0] === 'lost' || !list.length) ? '' : 'open'}><summary>${esc(L(s[1], s[2]))} (${list.length})</summary>` + (list.length ? list.map(c => { const q = lastQuote(c); return `<div class="ag-rowx" style="padding:8px 0;border-bottom:1px solid #f0e8e8;"><div style="min-width:0;flex:1;"><button class="at-btn sm" data-open="${esc(c.id)}" style="max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.name)}</button><div class="ag-meta">${esc(quoteLine(q) || (c.phone || ''))}${c.followUp ? ' · ' + esc(L('follow up ', 'fuatilia ') + c.followUp) : ''}</div></div><select class="ag-sel" data-st="${esc(c.id)}" aria-label="${esc(L('Status of ', 'Hali ya ') + c.name)}">${STATUSES.map(x => `<option value="${x[0]}" ${x[0] === c.status ? 'selected' : ''}>${esc(L(x[1], x[2]))}</option>`).join('')}</select></div>`; }).join('') : `<p class="ag-fine" style="margin:6px 0 10px;">${esc(L('No clients here.', 'Hakuna wateja hapa.'))}</p>`) + `</details>`;
  });
  html += `<div class="at-row"><button class="at-btn" id="bzAll">${esc(L('All clients', 'Wateja wote'))}</button><button class="at-btn pri" id="bzNew">${esc(L('New client', 'Mteja mpya'))}</button></div>`;
  body.innerHTML = html;

  $$('[data-open]', body).forEach(e => e.addEventListener('click', ev => { if(ev.target.closest('[data-msg]') || ev.target.closest('select')) return; T.openClient(e.dataset.open); }));
  $$('[data-msg]', body).forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); const c = clients().find(x => x.id === b.dataset.msg); if(c) openMessage(c, b.dataset.kind); }));
  $$('[data-st]', body).forEach(sel => sel.addEventListener('change', () => { const a = clients(), c = a.find(x => x.id === sel.dataset.st); if(!c) return; c.status = sel.value; c.updatedAt = nowTs(); if(c.status === 'won'){ if(!c.wonAt) c.wonAt = nowTs(); } else delete c.wonAt; saveClients(a); drawBusiness(body); }));
  $('#glSave', body).addEventListener('click', () => { const v = {}; ['clients', 'quotes', 'won'].forEach(k => { v[k] = Math.min(9999, digits($('#gl_' + k, body).value)); }); put(K(GOALS_KEY), v); toast(L('Goals saved.', 'Malengo yamehifadhiwa.')); drawBusiness(body); });
  const bz = $('#bzBackup', body); if(bz) bz.addEventListener('click', openBackup);
  $('#bzAll', body).addEventListener('click', () => T.openClients()); $('#bzNew', body).addEventListener('click', () => T.openClient(null));
}

/* ---------- glossary practice quiz ---------- */
const QZ_KEY = 'illustrator_quiz_v1';
function openPractice(){
  showPanel(L('Practice quiz', 'Jaribio la mazoezi'), body => {
    const G = (root.HELP_CONTENT && root.HELP_CONTENT.GLOSSARY) || [];
    const st = get(K(QZ_KEY), { played: 0, best: 0, streak: 0, lastDate: '', right: 0, asked: 0 });
    const QB = root.QuizBank;
    const SEL_KEY = 'illustrator_quiz_sel_v1', EXTRA_KEY = 'illustrator_quiz_extra_v1', SEEN_KEY = 'illustrator_quiz_seen_v1';
    let pace = get(K('illustrator_quiz_pace_v1'), 'off');
    const sel = Object.assign({ mode: 'only', lines: [], topics: [], level: 2, n: 10 }, get(K(SEL_KEY), {}));
    const topicName = id => { const t = QB.TOPICS.find(x => x[0] === id); return t ? L(t[1], t[2]) : id; };
    const lineName = id => { const t = QB.LINES.find(x => x[0] === id); return t ? L(t[1], t[2]) : id; };
    const extra = () => (get(K(EXTRA_KEY), { items: [] }).items || []);
    // Optional online update: a file on the same server can add new questions without a new app version. Offline, the last copy is used.
    const refreshExtra = () => { if(navigator.onLine === false || !root.fetch) return; const ctl = root.AbortController ? new root.AbortController() : null; const tm = setTimeout(() => { try{ ctl && ctl.abort(); }catch(e){} }, 6000);
      root.fetch('quiz-bank-extra.json', { cache: 'no-store', signal: ctl ? ctl.signal : undefined }).then(r => r.ok ? r.json() : null).then(j => { clearTimeout(tm); const items = QB.cleanExtra(j); if(j) put(K(EXTRA_KEY), { at: Date.now(), items }); const n = $('#qzExtra', body); if(n) n.textContent = items.length ? L(items.length + ' extra question(s) loaded from the company.', 'Maswali ' + items.length + ' ya ziada yamepakiwa kutoka kwa kampuni.') : ''; }).catch(() => clearTimeout(tm)); };
    const describe = () => {
      const parts = sel.lines.map(lineName).concat(sel.topics.map(topicName));
      if(!parts.length) return L('Everything: all lines and all topics.', 'Kila kitu: bima zote na mada zote.');
      return (sel.mode === 'except' ? L('Everything except: ', 'Kila kitu isipokuwa: ') : L('Only: ', 'Pekee: ')) + parts.join(', ') + '.';
    };
    const chk = (grp, id, label, on) => `<label class="ag-chk"><input type="checkbox" data-grp="${grp}" value="${esc(id)}" ${on ? 'checked' : ''}> <span>${esc(label)}</span></label>`;
    const weak = st => { const t = st.topics || {}; return Object.keys(t).filter(k => t[k].a >= 5).map(k => [k, Math.round(t[k].r / t[k].a * 100), t[k].a]).sort((a, b) => a[1] - b[1]).slice(0, 3); };
    const menu = () => {
      const w = weak(st);
      body.innerHTML = `<p style="font-size:14px;margin-top:0;">${esc(L('Sales Academy: product knowledge, calculations, competitors, objections, sales skills and the Kenyan market, at four levels. Questions are fresh each time. Nothing here is recorded or sent anywhere.', 'Chuo cha mauzo: ujuzi wa bidhaa, hesabu, washindani, pingamizi, ujuzi wa mauzo na soko la Kenya, kwa ngazi nne. Maswali ni mapya kila mara. Hakuna kinachorekodiwa wala kutumwa.'))}</p>
        <h3 class="ag-sec">${esc(L('Learning paths', 'Njia za kujifunza'))}</h3><p class="ag-fine" style="margin-top:0;">${esc(L('Tap a path to set the level and topics. You can still change them below.', 'Gusa njia ili kuweka ngazi na mada. Unaweza kubadilisha hapa chini.'))}</p>
        <div class="at-row" id="qzPaths">${QB.PATHS.map(p => `<button type="button" class="at-btn sm" data-path="${p.id}" title="${esc(p.why)}">${esc(L(p.en, p.sw))}</button>`).join('')}${w.length ? `<button type="button" class="at-btn sm" id="qzWeak">${esc(L('My weak spots', 'Maeneo yangu dhaifu'))}</button>` : ''}</div>
        <label for="qzLevel">${esc(L('Level', 'Ngazi'))}</label><select id="qzLevel">${QB.LEVELS.map(l => `<option value="${l[0]}" ${sel.level === l[0] ? 'selected' : ''}>${l[0]}. ${esc(L(l[1], l[2]))}</option>`).join('')}</select>
        <fieldset class="ag-fs"><legend>${esc(L('How to choose', 'Jinsi ya kuchagua'))}</legend>
          <label class="ag-chk"><input type="radio" name="qzMode" value="only" ${sel.mode === 'only' ? 'checked' : ''}> <span>${esc(L('Only what I tick below', 'Ninachotia tiki pekee'))}</span></label>
          <label class="ag-chk"><input type="radio" name="qzMode" value="except" ${sel.mode === 'except' ? 'checked' : ''}> <span>${esc(L('Everything EXCEPT what I tick below', 'Kila kitu ISIPOKUWA ninachotia tiki'))}</span></label></fieldset>
        <fieldset class="ag-fs"><legend>${esc(L('Line of insurance', 'Aina ya bima'))}</legend>${QB.LINES.map(l => chk('line', l[0], L(l[1], l[2]), sel.lines.indexOf(l[0]) >= 0)).join('')}</fieldset>
        <fieldset class="ag-fs"><legend>${esc(L('Topic', 'Mada'))}</legend>${QB.TOPICS.map(t => chk('topic', t[0], L(t[1], t[2]), sel.topics.indexOf(t[0]) >= 0)).join('')}</fieldset>
        <div class="ag-meta" id="qzDesc" role="status" aria-live="polite">${esc(describe())}</div>
        <label for="qzN">${esc(L('Number of questions', 'Idadi ya maswali'))}</label><select id="qzN">${[10, 15, 20].map(n => `<option value="${n}" ${sel.n === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <label for="qzTime">${esc(L('Time limit', 'Kikomo cha muda'))}</label><select id="qzTime">${[['off', L('No timer', 'Bila kipima muda')], ['1', L('Timed: standard', 'Kwa muda: kawaida')], ['1.5', L('Timed: relaxed (50% more time)', 'Kwa muda: kwa utulivu (muda zaidi kwa 50%)')]].map(o => `<option value="${o[0]}" ${String(pace) === o[0] ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>
        <p class="ag-fine" style="margin-top:0;">${esc(L('Timed: each question has its own countdown (15 to 60 seconds), longer for calculations and long questions. Running out of time counts as a miss and shows the answer.', 'Kwa muda: kila swali lina kipima muda chake (sekunde 15 hadi 60), kirefu kwa hesabu na maswali marefu. Muda ukiisha ni kosa na jibu linaonyeshwa.'))}</p>
        <div class="at-row"><button class="at-btn pri" id="qzGo">${esc(L('Start', 'Anza'))}</button></div><p class="ag-fine" id="qzExtra"></p>
        <div class="at-card" style="margin-top:14px;"><h3>${esc(L('My practice record', 'Rekodi yangu ya mazoezi'))}</h3><div class="ag-meta">${esc(L('Quizzes played', 'Majaribio'))}: <b>${st.played}</b> · ${esc(L('Best score', 'Alama bora'))}: <b>${st.best}%</b> · ${esc(L('Day streak', 'Siku mfululizo'))}: <b>${st.streak}</b>${st.asked ? ' · ' + esc(L('Overall accuracy', 'Usahihi wa jumla')) + ': <b>' + Math.round(st.right / st.asked * 100) + '%</b>' : ''}${st.timedPlayed ? ' · ' + esc(L('Timed quizzes', 'Majaribio ya muda')) + ': <b>' + st.timedPlayed + '</b> (' + esc(L('timed out', 'muda uliisha')) + ' ' + (st.timedOut || 0) + ')' : ''}</div>
        ${w.length ? `<div class="ag-meta" style="margin-top:6px;">${esc(L('Weakest areas so far: ', 'Maeneo dhaifu zaidi: '))}${w.map(x => esc(topicName(x[0])) + ' ' + x[1] + '%').join(', ')}</div>` : ''}</div>`;
      const read = () => { sel.mode = ($('input[name=qzMode]:checked', body) || {}).value || 'only'; sel.lines = $$('input[data-grp=line]:checked', body).map(x => x.value); sel.topics = $$('input[data-grp=topic]:checked', body).map(x => x.value); sel.level = +$('#qzLevel', body).value; sel.n = +$('#qzN', body).value; $('#qzDesc', body).textContent = describe(); };
      $$('input[type=checkbox],input[type=radio],#qzLevel,#qzN', body).forEach(x => x.addEventListener('change', read));
      $$('[data-path]', body).forEach(b => b.addEventListener('click', () => { const p = QB.PATHS.find(x => x.id === b.dataset.path); sel.mode = 'only'; sel.lines = []; sel.topics = p.topics.slice(); sel.level = p.level; put(K(SEL_KEY), sel); menu(); toast(L('Path set: ', 'Njia imewekwa: ') + L(p.en, p.sw)); }));
      const wk = $('#qzWeak', body); if(wk) wk.addEventListener('click', () => { sel.mode = 'only'; sel.lines = []; sel.topics = weak(st).map(x => x[0]); put(K(SEL_KEY), sel); menu(); });
      $('#qzGo', body).addEventListener('click', () => {
        read(); put(K(SEL_KEY), sel); pace = $('#qzTime', body).value; put(K('illustrator_quiz_pace_v1'), pace);
        const seen = get(K(SEEN_KEY), []);
        const qs = QB.buildSalesQuiz({ lines: sel.lines, topics: sel.topics, mode: sel.mode, level: sel.level, n: sel.n, glossaryQs: buildQuiz(G, 'all', 80), market: root.MARKET_DATA, extra: extra(), seen });
        if(qs.length < 3){ toast(L('No questions match that choice. Try different ticks.', 'Hakuna maswali yanayolingana. Jaribu chaguo tofauti.')); return; }
        if(qs.widened) toast(L('Few questions match both choices, so you will get all questions on the ticked topics.', 'Maswali machache yanalingana na chaguo zote mbili, kwa hivyo utapata maswali yote ya mada ulizochagua.'));
        else if(qs.length < sel.n) toast(L('Only ' + qs.length + ' question(s) match that choice.', 'Maswali ' + qs.length + ' pekee yanalingana na chaguo hilo.'));
        put(K(SEEN_KEY), seen.concat(qs.map(q => q.id)).slice(-300));
        run(qs, pace === 'off' ? 0 : +pace);
      });
      const ex = extra().length; const n = $('#qzExtra', body); if(n && ex) n.textContent = L(ex + ' extra question(s) loaded from the company.', 'Maswali ' + ex + ' ya ziada yamepakiwa kutoka kwa kampuni.');
    };
    const run = (qs, paceN) => {
      let i = 0, score = 0, timeouts = 0; const missed = [], tally = {}; let tick = null;
      const stopTimer = () => { if(tick){ clearInterval(tick); tick = null; } };
      const ask = () => {
        stopTimer(); const q = qs[i]; const secs = paceN ? secondsFor(q, paceN) : 0;
        body.innerHTML = `<div class="ag-meta">${esc(L('Question', 'Swali'))} ${i + 1} / ${qs.length} · ${esc(L('Score', 'Alama'))} ${score}</div><div class="at-bar"><i style="width:${Math.round(i / qs.length * 100)}%"></i></div>
          ${secs ? `<div class="ag-timer" role="timer" aria-label="${esc(L('Time left', 'Muda uliobaki'))}"><div class="ag-meta" style="display:flex;justify-content:space-between;"><span>${esc(L('Time left', 'Muda uliobaki'))}</span><b id="qzSecs">${secs}s</b></div><div class="at-bar" style="height:10px;"><i id="qzTBar" style="width:100%;background:#1f6b3a;"></i></div><span class="ag-sr" id="qzSr" aria-live="polite"></span></div>` : ''}
          <p class="ag-def">${esc(q.def)}</p><div class="ag-meta">${esc(q.prompt === 'Which term is this?' ? L('Which term is this?', 'Hili ni neno gani?') : L('Choose the best answer.', 'Chagua jibu bora.'))}</div><div id="qzOpts">${q.opts.map((o, n) => `<button class="ag-opt" data-n="${n}">${esc(o)}</button>`).join('')}</div><div id="qzFb"></div>`;
        let answered = false;
        const answer = (n, b) => {
          if(answered) return; answered = true; stopTimer();
          const right = n === q.answer, late = n < 0; if(right) score++; else { missed.push(q); if(late) timeouts++; }
          const tp = q.topic || 'terms'; (tally[tp] = tally[tp] || { r: 0, a: 0 }).a++; if(right) tally[tp].r++;
          $$('.ag-opt', body).forEach(x => { x.disabled = true; if(+x.dataset.n === q.answer) x.classList.add('ok'); else if(x === b) x.classList.add('bad'); });
          $('#qzFb', body).innerHTML = `<div class="at-card" style="margin-top:8px;"><b>${esc(right ? L('Correct.', 'Sahihi.') : late ? L('Time is up. The answer is ', 'Muda umeisha. Jibu ni ') + q.term + '.' : L('Not quite. The answer is ', 'Si sahihi. Jibu ni ') + q.term + '.')}</b><div style="font-size:14px;margin-top:6px;line-height:1.5;">${esc(q.full)}</div>${q.ex ? `<div class="ag-meta" style="margin-top:6px;">${esc(L('Example: ', 'Mfano: ') + q.ex)}</div>` : ''}</div><div class="at-row"><button class="at-btn pri" id="qzNext">${esc(i + 1 < qs.length ? L('Next', 'Endelea') : L('See my score', 'Ona alama yangu'))}</button></div>`;
          $('#qzNext', body).addEventListener('click', () => { i++; if(i < qs.length) ask(); else finish(); });
          $('#qzNext', body).focus();
        };
        $$('.ag-opt', body).forEach(b => b.addEventListener('click', () => answer(+b.dataset.n, b)));
        if(secs){
          // The countdown pauses while the app is in the background, so switching to a call does not cost the agent the question.
          let deadline = Date.now() + secs * 1000, pausedAt = 0, said10 = false, said5 = false;
          tick = setInterval(() => {
            if(!body.isConnected){ stopTimer(); return; }
            if(document.hidden){ if(!pausedAt) pausedAt = Date.now(); return; }
            if(pausedAt){ deadline += Date.now() - pausedAt; pausedAt = 0; }
            const left = Math.max(0, deadline - Date.now()), sec = Math.ceil(left / 1000);
            const bar = $('#qzTBar', body), lab = $('#qzSecs', body); if(!bar || !lab) return;
            bar.style.width = Math.round(left / (secs * 1000) * 100) + '%'; bar.style.background = sec <= 5 ? '#b3261e' : sec <= 10 ? '#c27a00' : '#1f6b3a'; lab.textContent = sec + 's';
            const sr = $('#qzSr', body); if(sr && sec <= 10 && !said10){ said10 = true; sr.textContent = L('10 seconds left', 'Sekunde 10 zimebaki'); } if(sr && sec <= 5 && !said5){ said5 = true; sr.textContent = L('5 seconds left', 'Sekunde 5 zimebaki'); }
            if(left <= 0) answer(-1, null);
          }, 200);
        }
      };
      const finish = () => {
        const pct = Math.round(score / qs.length * 100), t = today(), y = new Date(Date.now() - DAY), yd = ymd(y);
        stopTimer(); if(paceN){ st.timedPlayed = (st.timedPlayed || 0) + 1; st.timedOut = (st.timedOut || 0) + timeouts; }
        st.topics = st.topics || {}; Object.keys(tally).forEach(k => { const o = st.topics[k] || { r: 0, a: 0 }; o.r += tally[k].r; o.a += tally[k].a; st.topics[k] = o; });
        st.played++; st.right += score; st.asked += qs.length; st.best = Math.max(st.best, pct); st.streak = st.lastDate === t ? st.streak : st.lastDate === yd ? st.streak + 1 : 1; st.lastDate = t; put(K(QZ_KEY), st);
        body.innerHTML = `<div class="at-card"><div class="ag-big">${score} / ${qs.length}</div><div>${esc(pct >= 80 ? L('Strong result.', 'Matokeo mazuri.') : pct >= 50 ? L('Good start. Review the ones you missed.', 'Mwanzo mzuri. Pitia ulizokosea.') : L('Keep practising. The Help glossary explains every term.', 'Endelea kufanya mazoezi. Faharasa ya Msaada inaeleza kila neno.'))}</div><div class="ag-meta" style="margin-top:6px;">${esc(L('Best score', 'Alama bora'))}: ${st.best}% · ${esc(L('Day streak', 'Siku mfululizo'))}: ${st.streak}</div>${paceN && timeouts ? `<div class="ag-meta">${esc(L('Ran out of time on ' + timeouts + ' question(s).', 'Muda uliisha kwenye maswali ' + timeouts + '.'))}</div>` : ''}</div>` +
          (missed.length ? `<h3 class="ag-sec">${esc(L('To review', 'Za kupitia'))}</h3>` + missed.map(q => `<div class="at-card"><h3>${esc(q.topic ? q.def : q.term)}</h3><div style="font-size:14px;line-height:1.5;">${q.topic ? '<b>' + esc(q.term) + '</b><br>' : ''}${esc(q.full)}</div></div>`).join('') : '') +
          `<div class="at-row"><button class="at-btn pri" id="qzAgain">${esc(L('Play again', 'Cheza tena'))}</button></div>`;
        $('#qzAgain', body).addEventListener('click', menu);
      };
      ask();
    };
    if(G.length < 20){ body.innerHTML = `<p>${esc(L('The glossary has not loaded yet. Check your connection and reopen the app.', 'Faharasa haijapakia. Angalia mtandao kisha ufungue programu tena.'))}</p>`; return; }
    menu(); refreshExtra();
  });
}

/* ---------- cover-needed calculator ---------- */
const NEEDS_KEY = 'illustrator_needs_v1';
function needsSummary(r, i){
  const nm = { income: L('Replace income', 'Kuchukua nafasi ya kipato'), debts: L('Clear debts', 'Kulipa madeni'), education: L("Children's education", 'Elimu ya watoto'), final: L('Funeral and final expenses', 'Mazishi na gharama za mwisho'), emergency: L('Emergency fund', 'Hazina ya dharura') };
  const lines = [L('Cover needed (planning guide)', 'Bima inayohitajika (mwongozo wa kupanga)')];
  r.parts.filter(p => p.amount > 0).forEach(p => lines.push(`${nm[p.id]}: ${kes(p.amount)}`));
  lines.push(L('Total need', 'Jumla ya mahitaji') + ': ' + kes(r.total));
  if(r.existing) lines.push(L('Less existing cover', 'Toa bima iliyopo') + ': ' + kes(r.existing));
  if(r.savings) lines.push(L('Less savings and investments', 'Toa akiba na uwekezaji') + ': ' + kes(r.savings));
  lines.push(L('Suggested additional cover', 'Bima ya ziada inayopendekezwa') + ': ' + kes(r.gap));
  lines.push(L('This is a planning estimate, not a quote. It ignores inflation and investment returns.', 'Haya ni makadirio ya kupanga, si nukuu. Hayazingatii mfumuko wa bei wala faida ya uwekezaji.'));
  return lines.join('\n');
}
function openNeeds(){
  showPanel(L('Cover needed', 'Bima inayohitajika'), body => {
    const saved = get(K(NEEDS_KEY), null) || {};
    const v = Object.assign({ monthlyIncome: '', years: 10, debts: '', kids: '', eduPerChild: 500000, funeral: 300000, emergencyMonths: 3, existingCover: '', savings: '' }, saved);
    const f = (id, label, hint) => `<label for="nd_${id}">${esc(label)}</label><input id="nd_${id}" type="text" inputmode="numeric" maxlength="12" value="${v[id] === '' || v[id] == null ? '' : Number(v[id]).toLocaleString('en-KE')}"${hint ? ` placeholder="${esc(hint)}"` : ''}>`;
    body.innerHTML = `<p style="font-size:14px;margin-top:0;">${esc(L('A quick guide to how much life cover a family may need. Fill in what you know with the client; the figures update as you type.', 'Mwongozo wa haraka wa kiasi cha bima ya maisha ambacho familia inaweza kuhitaji. Jaza unachojua pamoja na mteja; takwimu hubadilika unapoandika.'))}</p>
      ${f('monthlyIncome', L('Monthly income (KES)', 'Kipato cha kila mwezi (KES)'), 'e.g. 80,000')}${f('years', L('Years the family would need that income', 'Miaka familia itahitaji kipato hicho'), '10')}
      ${f('debts', L('Debts to clear (loans, mortgage)', 'Madeni ya kulipa (mikopo, rehani)'))}
      <div class="ag-grid2"><div>${f('kids', L('Children to educate', 'Watoto wa kusomesha'))}</div><div>${f('eduPerChild', L('Education cost per child', 'Gharama ya elimu kwa mtoto'))}</div></div>
      <div class="ag-grid2"><div>${f('funeral', L('Funeral and final expenses', 'Mazishi na gharama za mwisho'))}</div><div>${f('emergencyMonths', L('Emergency fund (months of income)', 'Hazina ya dharura (miezi ya kipato)'))}</div></div>
      <div class="ag-grid2"><div>${f('existingCover', L('Existing life cover', 'Bima ya maisha iliyopo'))}</div><div>${f('savings', L('Savings and investments to count', 'Akiba na uwekezaji wa kuhesabu'))}</div></div>
      <div id="ndOut" aria-live="polite"></div>
      <div class="at-row" id="ndBtns"><button class="at-btn" id="ndCopy">${esc(L('Copy', 'Nakili'))}</button><button class="at-btn" id="ndWa">WhatsApp</button><button class="at-btn" id="ndNote">${esc(L('Add to a client\'s notes', 'Ongeza kwenye maelezo ya mteja'))}</button><button class="at-btn pri" id="ndDiag">${esc(L('Find a plan for this client', 'Tafuta mpango kwa mteja huyu'))}</button></div>
      <p class="ag-fine">${esc(L('Method: income replacement (monthly income × 12 × years) + debts + education + final expenses + emergency fund, less existing cover and savings. The education and funeral amounts are starting assumptions, so change them to suit the family. Not a quote or advice; ignores inflation and returns.', 'Njia: kuchukua nafasi ya kipato (kipato cha mwezi × 12 × miaka) + madeni + elimu + gharama za mwisho + hazina ya dharura, ukitoa bima iliyopo na akiba. Kiasi cha elimu na mazishi ni dhana za kuanzia, kwa hivyo zibadilishe kulingana na familia. Si nukuu wala ushauri; haizingatii mfumuko wa bei na faida.'))}</p>`;
    const ids = ['monthlyIncome', 'years', 'debts', 'kids', 'eduPerChild', 'funeral', 'emergencyMonths', 'existingCover', 'savings'];
    const read = () => { const o = {}; ids.forEach(id => { o[id] = digits($('#nd_' + id, body).value); }); return o; };
    let cur = null;
    const calc = () => {
      const inp = read(); cur = { r: computeNeeds(inp), inp }; put(K(NEEDS_KEY), inp); const r = cur.r;
      const nm = { income: L('Replace income', 'Kipato'), debts: L('Debts', 'Madeni'), education: L('Education', 'Elimu'), final: L('Final expenses', 'Gharama za mwisho'), emergency: L('Emergency fund', 'Dharura') };
      $('#ndOut', body).innerHTML = r.total ? `<div class="at-card"><div class="ag-meta">${esc(L('Suggested additional cover', 'Bima ya ziada inayopendekezwa'))}</div><div class="ag-big">${kes(r.gap)}</div>
        <div class="ag-meta">${esc(L('Total need ', 'Jumla ya mahitaji '))}${kes(r.total)} · ${esc(L('counted against ', 'imepunguzwa na '))}${kes(r.offset)}</div>
        ${r.covered ? `<div class="at-chip green" style="margin-top:6px;">${esc(L('Existing cover and savings already meet this estimate.', 'Bima na akiba zilizopo tayari zinatosha makadirio haya.'))}</div>` : ''}
        ${r.parts.filter(p => p.amount > 0).map(p => `<div style="margin-top:8px;font-size:13.5px;">${esc(nm[p.id])}: <b>${kes(p.amount)}</b> <span class="ag-meta">(${p.pct}%)</span><div class="at-bar"><i style="width:${p.pct}%"></i></div></div>`).join('')}
        ${r.ruleOfThumb ? `<div class="ag-fine">${esc(L('For comparison, a common rule of thumb is 10 × annual income: ', 'Kwa kulinganisha, kanuni ya kawaida ni mara 10 ya kipato cha mwaka: '))}${kes(r.ruleOfThumb)}.</div>` : ''}</div>` : `<p class="ag-fine">${esc(L('Enter the monthly income to see the estimate.', 'Weka kipato cha kila mwezi kuona makadirio.'))}</p>`;
    };
    ids.forEach(id => { const el = $('#nd_' + id, body); el.addEventListener('input', calc); el.addEventListener('blur', () => { el.value = el.value ? digits(el.value).toLocaleString('en-KE') : ''; }); });
    calc();
    const text = () => needsSummary(cur.r, cur.inp);
    $('#ndCopy', body).addEventListener('click', async () => { if(!cur.r.total) return; try{ await navigator.clipboard.writeText(text()); toast(L('Copied.', 'Imenakiliwa.')); }catch(e){} });
    $('#ndWa', body).addEventListener('click', () => { if(cur.r.total) window.open('https://wa.me/?text=' + encodeURIComponent(text()), '_blank'); });
    $('#ndNote', body).addEventListener('click', () => {
      if(!cur.r.total) return; const list = clients(); if(!list.length) return toast(L('Add a client first.', 'Ongeza mteja kwanza.'));
      showPanel(L('Choose a client', 'Chagua mteja'), b2 => {
        b2.innerHTML = list.map(c => `<div class="at-item" data-id="${esc(c.id)}"><div class="t">${esc(c.name)}</div></div>`).join('');
        $$('.at-item', b2).forEach(e => e.addEventListener('click', () => { const a = clients(), c = a.find(x => x.id === e.dataset.id); if(!c) return; c.notes = (String(c.notes || '') + (c.notes ? '\n\n' : '') + text()).slice(0, 800); c.updatedAt = nowTs(); saveClients(a); toast(L('Added to ', 'Imeongezwa kwa ') + c.name); backPanel(); }));
      });
    });
    $('#ndDiag', body).addEventListener('click', () => {
      const kids = cur.inp.kids; closePanel(); state = defaultState(); state.mode = 'diagnose'; state.dStep = 1;
      state.diag.dependants = kids >= 5 ? '5+' : String(kids); state.diag.childrenCount = kids;
      if(cur.inp.existingCover > 0){ state.diag.hasCover = 'yes'; state.diag.coverAmount = cur.inp.existingCover; } else state.diag.hasCover = 'no';
      if(cur.inp.debts > 0){ state.diag.liabilities = ['Other debt']; state.diag.debtAmount = cur.inp.debts; }
      goDiagnose(1);
    });
  });
}

/* ---------- backup & restore ---------- */
function download(name, mime, text){
  const blob = new Blob([text], { type: mime }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function openBackup(){
  showPanel(L('Backup & restore', 'Nakala na kurejesha'), body => {
    const draw = () => {
      const cl = clients(), q = cl.reduce((n, c) => n + (c.quotes || []).length, 0), bk = backupAgeDays();
      body.innerHTML = `<div class="at-card"><h3>${esc(L('On this phone', 'Kwenye simu hii'))}</h3><div class="ag-meta">${cl.length} ${esc(L('clients', 'wateja'))} · ${q} ${esc(L('saved quotes', 'nukuu zilizohifadhiwa'))}<br>${esc(bk === null ? L('Never backed up.', 'Hajawahi kuhifadhiwa nakala.') : L('Last backup: ' + bk + ' day(s) ago.', 'Nakala ya mwisho: siku ' + bk + ' zilizopita.'))}</div></div>
        <p class="ag-fine">${esc(L('Clients and saved quotes live only on this phone. A backup file lets you move to a new phone or recover after losing this one. The file contains your clients\' names and phone numbers, so keep it private.', 'Wateja na nukuu zilizohifadhiwa ziko kwenye simu hii pekee. Faili ya nakala hukuwezesha kuhamia simu mpya au kurejesha baada ya kupoteza hii. Faili ina majina na namba za simu za wateja wako, kwa hivyo ihifadhi kwa siri.'))}</p>
        <div class="at-row"><button class="at-btn pri" id="bkJson" ${cl.length ? '' : 'disabled'}>${esc(L('Download backup', 'Pakua nakala'))}</button><button class="at-btn" id="bkCsv" ${cl.length ? '' : 'disabled'}>${esc(L('Download client list (Excel)', 'Pakua orodha ya wateja (Excel)'))}</button></div>
        <div class="ag-sec">${esc(L('Restore from a backup file', 'Rejesha kutoka kwenye faili ya nakala'))}</div>
        <label for="bkFile">${esc(L('Choose the backup file', 'Chagua faili ya nakala'))}</label><input id="bkFile" type="file" accept=".json,application/json"><div id="bkMsg" class="ag-fine" aria-live="polite"></div>`;
      $('#bkJson', body).addEventListener('click', () => {
        const data = { format: 'plan-illustrator-backup', version: 1, exportedAt: new Date().toISOString(), appVersion: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '', agent: agentName(), clients: clients(), goals: getGoals() };
        download('plan-illustrator-backup-' + today() + '.json', 'application/json', JSON.stringify(data)); put(K(BACKUP_KEY), nowTs()); toast(L('Backup downloaded.', 'Nakala imepakuliwa.')); draw();
      });
      $('#bkCsv', body).addEventListener('click', () => { download('my-clients-' + today() + '.csv', 'text/csv;charset=utf-8', clientsToCsv(clients())); toast(L('Client list downloaded.', 'Orodha ya wateja imepakuliwa.')); });
      $('#bkFile', body).addEventListener('change', e => {
        const file = e.target.files && e.target.files[0], msg = $('#bkMsg', body); if(!file) return;
        if(file.size > 8e6){ msg.textContent = L('That file is too large to be a backup.', 'Faili hiyo ni kubwa mno kuwa nakala.'); return; }
        const rd = new FileReader();
        rd.onload = () => {
          const r = parseBackup(String(rd.result || '')); if(!r.ok){ msg.style.color = '#b3261e'; msg.textContent = r.error; return; }
          const m = mergeClients(clients(), r.clients); saveClients(m.clients);
          if(r.goals && !['clients', 'quotes', 'won'].some(k => (getGoals()[k] || 0) > 0)) put(K(GOALS_KEY), r.goals);
          msg.style.color = '#1f6b3a'; msg.textContent = L(`Restored. ${m.added} added, ${m.updated} updated, ${m.kept} already up to date${r.skipped ? ', ' + r.skipped + ' skipped as unreadable' : ''}.`, `Imerejeshwa. ${m.added} vimeongezwa, ${m.updated} vimesasishwa, ${m.kept} tayari vya kisasa${r.skipped ? ', ' + r.skipped + ' vimerukwa kwa kutosomeka' : ''}.`);
        };
        rd.onerror = () => { msg.style.color = '#b3261e'; msg.textContent = L('The file could not be read.', 'Faili haikuweza kusomwa.'); };
        rd.readAsText(file);
      });
    };
    draw();
  });
}

/* ---------- optional PIN lock ---------- */
const LOCK_KEY = 'illustrator_lock_v1';
const lockCfg = () => get(K(LOCK_KEY), null);
const hex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
async function hashPin(pin, salt){
  try{
    const enc = new TextEncoder(); const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
    return 'p1:' + hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256));
  }catch(e){ let h = 5381; const s = pin + ':' + salt; for(let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return 'f1:' + h.toString(16); }
}
const newSalt = () => Array.from(crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(12)) : [1, 2, 3, 4, 5, 6, 7, 8]).map(b => b.toString(16)).join('');
let locked = false, hiddenAt = 0, inertSaved = [];
function setInert(on){
  if(on){ inertSaved = []; Array.from(document.body.children).forEach(el => { if(el.id !== 'agLock' && !el.inert){ el.inert = true; inertSaved.push(el); } }); }
  else { inertSaved.forEach(el => { el.inert = false; }); inertSaved = []; }
}
function showLock(){
  const cfg = lockCfg(); if(!cfg || locked || !loggedIn()) return; locked = true; injectCss();
  const el = document.createElement('div'); el.id = 'agLock'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'agLockT');
  el.innerHTML = `<h2 id="agLockT">${esc(L('Enter your PIN', 'Weka PIN yako'))}</h2><p>${esc(agentName())}</p><div class="dots" aria-hidden="true"></div>
    <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-d="${n}" aria-label="${n}">${n}</button>`).join('')}<button data-act="clear" aria-label="${esc(L('Clear', 'Futa'))}" style="font-size:16px;">${esc(L('Clear', 'Futa'))}</button><button data-d="0" aria-label="0">0</button><button data-act="back" aria-label="${esc(L('Delete', 'Ondoa'))}" style="font-size:20px;">&#9003;</button></div>
    <div class="err" id="agLockErr" role="alert"></div><button class="forgot" id="agForgot">${esc(L('Forgot my PIN', 'Nimesahau PIN yangu'))}</button>`;
  document.body.appendChild(el); setInert(true);
  let entry = '', busy = false, fails = 0, until = 0; const len = cfg.len || 4;
  const dots = $('.dots', el), err = $('#agLockErr', el);
  const paint = () => { dots.innerHTML = Array.from({ length: len }, (_, i) => `<i class="${i < entry.length ? 'on' : ''}"></i>`).join(''); };
  const check = async () => {
    if(busy) return; if(Date.now() < until){ err.textContent = L('Too many tries. Wait a moment.', 'Majaribio mengi. Subiri kidogo.'); entry = ''; paint(); return; }
    busy = true; const h = await hashPin(entry, cfg.salt); busy = false;
    if(h === cfg.hash){ el.remove(); setInert(false); locked = false; hiddenAt = 0; return; }
    fails++; entry = ''; paint(); err.textContent = L('Wrong PIN.', 'PIN si sahihi.');
    if(fails >= 5){ fails = 0; until = Date.now() + 30000; err.textContent = L('Too many tries. Wait 30 seconds.', 'Majaribio mengi. Subiri sekunde 30.'); }
  };
  const press = d => { if(entry.length >= len) return; entry += d; err.textContent = ''; paint(); if(entry.length === len) check(); };
  paint();
  $$('[data-d]', el).forEach(b => b.addEventListener('click', () => press(b.dataset.d)));
  $('[data-act=clear]', el).addEventListener('click', () => { entry = ''; err.textContent = ''; paint(); });
  $('[data-act=back]', el).addEventListener('click', () => { entry = entry.slice(0, -1); paint(); });
  el.addEventListener('keydown', e => { if(/^\d$/.test(e.key)) press(e.key); else if(e.key === 'Backspace'){ entry = entry.slice(0, -1); paint(); } });
  $('#agForgot', el).addEventListener('click', () => {
    if(!window.confirm(L('Signing out turns the PIN off. Your saved clients stay on this phone and return when you sign in again. Sign out now?', 'Kutoka kunazima PIN. Wateja ulio nao wanabaki kwenye simu hii na watarudi ukiingia tena. Utoke sasa?'))) return;
    try{ localStorage.removeItem(K(LOCK_KEY)); }catch(e){} if(typeof signOut === 'function') signOut(); else location.reload();
  });
  const first1 = $('[data-d="1"]', el); if(first1) first1.focus();
}
function openLock(){
  showPanel(L('App lock (PIN)', 'Kufunga programu (PIN)'), body => {
    const draw = () => {
      const cfg = lockCfg();
      const mins = (v) => `<label for="lkMin">${esc(L('Lock the app', 'Funga programu'))}</label><select id="lkMin">${[[0, L('Every time I leave the app', 'Kila ninapoondoka kwenye programu')], [1, L('After 1 minute away', 'Baada ya dakika 1')], [5, L('After 5 minutes away', 'Baada ya dakika 5')], [15, L('After 15 minutes away', 'Baada ya dakika 15')]].map(o => `<option value="${o[0]}" ${+v === o[0] ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
      const pin = (id, label) => `<label for="${id}">${esc(label)}</label><input id="${id}" type="password" inputmode="numeric" autocomplete="off" maxlength="6" pattern="[0-9]*">`;
      body.innerHTML = (cfg ? `<div class="at-banner info"><span>${esc(L('App lock is ON. The app asks for your PIN when it opens and when you come back to it.', 'Kufunga programu kumewashwa. Programu huomba PIN unapoifungua na unaporudi.'))}</span></div>${mins(cfg.mins)}<div class="at-row"><button class="at-btn pri" id="lkSaveMin">${esc(L('Save', 'Hifadhi'))}</button><button class="at-btn" id="lkTest">${esc(L('Lock now', 'Funga sasa'))}</button></div>
        <details class="ag-det"><summary>${esc(L('Change PIN', 'Badilisha PIN'))}</summary>${pin('lkOld', L('Current PIN', 'PIN ya sasa'))}${pin('lkN1', L('New PIN (4 to 6 digits)', 'PIN mpya (tarakimu 4 hadi 6)'))}${pin('lkN2', L('Repeat new PIN', 'Rudia PIN mpya'))}<div class="at-row"><button class="at-btn pri" id="lkChange">${esc(L('Change PIN', 'Badilisha PIN'))}</button></div></details>
        <details class="ag-det"><summary>${esc(L('Turn off app lock', 'Zima kufunga programu'))}</summary>${pin('lkOff', L('Current PIN', 'PIN ya sasa'))}<div class="at-row"><button class="at-btn danger" id="lkTurnOff">${esc(L('Turn off', 'Zima'))}</button></div></details>`
        : `<p style="font-size:14px;margin-top:0;">${esc(L('Set a PIN so the app asks for it before showing client details. Useful when you hand your phone to someone. You stay signed in; the PIN only covers the screen.', 'Weka PIN ili programu iiombe kabla ya kuonyesha maelezo ya mteja. Inafaa unapomkabidhi mtu simu yako. Unabaki umeingia; PIN inafunika skrini tu.'))}</p>${pin('lkN1', L('PIN (4 to 6 digits)', 'PIN (tarakimu 4 hadi 6)'))}${pin('lkN2', L('Repeat PIN', 'Rudia PIN'))}${mins(5)}<div class="at-row"><button class="at-btn pri" id="lkSet">${esc(L('Turn on app lock', 'Washa kufunga programu'))}</button></div>`)
        + `<div id="lkMsg" class="ag-fine" role="alert" style="color:#b3261e;"></div><p class="ag-fine">${esc(L('This is a screen lock to stop casual viewing. It does not encrypt what is stored on the phone, so also use your phone\'s own screen lock. If you forget the PIN you must sign out and sign in again.', 'Hii ni kufunga skrini ili kuzuia kuangaliwa kwa kawaida. Haifichi kwa msimbo data iliyo kwenye simu, kwa hivyo tumia pia kufuli ya simu yako. Ukisahau PIN lazima utoke kisha uingie tena.'))}</p>`;
      const msg = t => { $('#lkMsg', body).textContent = t; };
      const valid = (a, b) => { if(!/^\d{4,6}$/.test(a)){ msg(L('The PIN must be 4 to 6 digits.', 'PIN lazima iwe na tarakimu 4 hadi 6.')); return false; } if(a !== b){ msg(L('The two PINs do not match.', 'PIN mbili hazilingani.')); return false; } return true; };
      const save = async (p, m) => { const salt = newSalt(); put(K(LOCK_KEY), { salt, hash: await hashPin(p, salt), len: p.length, mins: m, at: nowTs() }); };
      const checkOld = async id => { const c = lockCfg(); const ok = (await hashPin($('#' + id, body).value, c.salt)) === c.hash; if(!ok) msg(L('That is not your current PIN.', 'Hiyo si PIN yako ya sasa.')); return ok; };
      if(cfg){
        $('#lkSaveMin', body).addEventListener('click', () => { const c = lockCfg(); c.mins = +$('#lkMin', body).value; put(K(LOCK_KEY), c); toast(L('Saved.', 'Imehifadhiwa.')); });
        $('#lkTest', body).addEventListener('click', () => { closePanel(); setTimeout(showLock, 50); });
        $('#lkChange', body).addEventListener('click', async () => { if(!(await checkOld('lkOld'))) return; const a = $('#lkN1', body).value, b = $('#lkN2', body).value; if(!valid(a, b)) return; await save(a, lockCfg().mins); toast(L('PIN changed.', 'PIN imebadilishwa.')); draw(); });
        $('#lkTurnOff', body).addEventListener('click', async () => { if(!(await checkOld('lkOff'))) return; try{ localStorage.removeItem(K(LOCK_KEY)); }catch(e){} toast(L('App lock is off.', 'Kufunga programu kumezimwa.')); draw(); });
      } else {
        $('#lkSet', body).addEventListener('click', async () => { const a = $('#lkN1', body).value, b = $('#lkN2', body).value; if(!valid(a, b)) return; await save(a, +$('#lkMin', body).value); toast(L('App lock is on.', 'Kufunga programu kumewashwa.')); draw(); });
      }
    };
    draw();
  });
}
document.addEventListener('visibilitychange', () => {
  if(document.hidden){ hiddenAt = Date.now(); return; }
  const cfg = lockCfg(); if(!cfg || !loggedIn() || !hiddenAt) return;
  if(Date.now() - hiddenAt >= (cfg.mins || 0) * 60000) showLock();
});

/* ---------- more pitch cards and practice clients ---------- */
T.PITCH.push(
  { cat: 'Money', t: ['"The premium is too high for me right now."', '"Ada ni kubwa mno kwangu kwa sasa."'], en: 'Thank you for being open about it. Let us look at what is realistic: a smaller sum assured, a longer term, or a payment frequency that matches your income can all bring the premium down. I would rather you keep a plan you can pay for the whole term than start one that lapses.', sw: 'Asante kwa uwazi wako. Tuangalie kinachowezekana: kiasi kidogo cha bima, muda mrefu zaidi, au mzunguko wa malipo unaoendana na kipato chako vinaweza kupunguza ada. Ningependa uendelee na mpango unaoweza kuulipia muda wote kuliko kuanza ule utakaokwisha.', tip: ['Change one thing at a time and show the new premium each time.', 'Badilisha kitu kimoja kwa wakati na uonyeshe ada mpya kila mara.'] },
  { cat: 'Trust', t: ['"My friend\'s claim was rejected."', '"Dai la rafiki yangu lilikataliwa."'], en: 'I am sorry to hear that. Claims are usually rejected because something was not disclosed or a waiting period or exclusion applied. That is why I will go through the questions with you carefully and show you the exclusions before you sign. If you remember what happened to your friend, I can explain how it would work under this plan.', sw: 'Pole kusikia hivyo. Madai mara nyingi hukataliwa kwa sababu kuna kitu hakikutajwa au muda wa kusubiri au kighairi kilihusika. Ndiyo maana nitapitia maswali pamoja nawe kwa makini na kukuonyesha vighairi kabla ya kusaini. Ukikumbuka kilichompata rafiki yako, naweza kukueleza jinsi lingefanyika chini ya mpango huu.', tip: ['Do not speak badly of other insurers. Stay on disclosure and exclusions.', 'Usisemee vibaya kampuni nyingine. Zingatia kutaja taarifa zote na vighairi.'] },
  { cat: 'Timing', t: ['"Come back next month."', '"Rudi mwezi ujao."'], en: 'Of course. So that the next conversation is useful, which part should I prepare: the amount, the term, or how the money is paid out? I will message you before then, and if your age or circumstances change in the meantime, the figures can change too.', sw: 'Sawa kabisa. Ili mazungumzo yajayo yawe ya manufaa, nijiandae kwa sehemu gani: kiasi, muda, au jinsi pesa zinavyolipwa? Nitakutumia ujumbe kabla ya hapo, na kama umri au hali yako ikibadilika wakati huo, takwimu pia zinaweza kubadilika.', tip: ['Set a follow-up date in My clients before you leave.', 'Weka tarehe ya kufuatilia kwenye Wateja wangu kabla ya kuondoka.'] },
  { cat: 'Product', t: ['"I have NHIF, so I am covered."', '"Nina NHIF, kwa hivyo nimelindwa."'], en: 'NHIF is a useful base for hospital costs. It does not replace life cover: it does not pay your family if you die, or replace your income if you cannot work. It also has limits for some treatments. Shall we check what it would not cover for your family?', sw: 'NHIF ni msingi mzuri wa gharama za hospitali. Haichukui nafasi ya bima ya maisha: haimlipi familia yako ukifa wala haibadilishi kipato chako usipoweza kufanya kazi. Pia ina mipaka kwa baadhi ya matibabu. Tuangalie kisichogharamiwa kwa familia yako?', tip: ['Check current benefits before quoting limits.', 'Hakiki mafao ya sasa kabla ya kutaja mipaka.'] },
  { cat: 'Closing', t: ['Closing: handling a long silence', 'Kufunga: kushughulikia ukimya mrefu'], en: 'It sounds like there may be something still on your mind. What would you need to see or hear to feel comfortable deciding?', sw: 'Inaonekana kuna kitu bado kiko akilini mwako. Unahitaji kuona au kusikia nini ili ujisikie huru kuamua?', tip: ['Stop talking after the question and let the client answer.', 'Nyamaza baada ya swali na umruhusu mteja ajibu.'] }
);
T.SCENARIOS.push(
  { id: 'mercy', name: 'Mercy, 49 — retirement', story: 'Mercy is a married nurse whose children have finished school. She wants a steady retirement income in about 15 years and can set aside KES 20,000 a month.', expect: ['Faida Maisha'], lesson: 'Retirement is a long-horizon goal with no children left to educate. The app ranks whole-life protection with savings first; compare it with Fanaka and Smart Save, and be clear about what is guaranteed and what is only estimated.',
    diag: { age: 49, gender: 'Female', income: 'KES 100,001–200,000', maritalStatus: 'married', dependants: '1', childrenCount: 0, hasCover: 'no', liabilities: ['SACCO loan'], debtAmount: 300000, savingsConsistency: 'usually', liquidityNeed: 'low', protectionPriority: 'important', existingInvestments: 'some' }, goal: { goal: 'retirement', horizon: '11–15 years', freq: 'Monthly', inputMode: 'premium', monthlySaving: 20000 } },
  { id: 'kevin', name: 'Kevin, 32 — starting a business', story: 'Kevin is single and wants to save for the capital to start a shop in 4 to 5 years. He has some savings and wants to keep access to his money.', expect: ['Faida Elite'], lesson: 'Only one plan is even a consideration here, and only weakly: a 5-year horizon with a need for access suits few products. Do not force a sale; explain the cost of early exit before any figures.',
    diag: { age: 32, gender: 'Male', income: 'KES 50,000–100,000', maritalStatus: 'single', dependants: '0', childrenCount: 0, hasCover: 'no', liabilities: ['No significant debt'], savingsConsistency: 'usually', liquidityNeed: 'high', protectionPriority: 'low', existingInvestments: 'some' }, goal: { goal: 'business_start', horizon: '4–5 years', freq: 'Monthly', inputMode: 'premium', monthlySaving: 12000 } },
  { id: 'njeri', name: 'Njeri, 36 — single mother', story: 'Njeri is a single mother of two who runs a salon. Her income is irregular and she worries about what happens to her children if she dies. She has a small SACCO loan.', expect: ['Smart Scholar', 'Faida Maisha'], lesson: 'The app puts the education plan first because she has two children, but her real worry is protection if she dies, so compare Faida Maisha. Match the payment frequency to her irregular income so the policy does not lapse.',
    diag: { age: 36, gender: 'Female', income: 'KES 50,000–100,000', maritalStatus: 'single', dependants: '2', childrenCount: 2, hasCover: 'no', liabilities: ['SACCO loan'], debtAmount: 150000, savingsConsistency: 'sometimes', liquidityNeed: 'moderate', protectionPriority: 'high', existingInvestments: 'none' }, goal: { goal: 'cushion', horizon: '6–10 years', freq: 'Monthly', inputMode: 'premium', monthlySaving: 6000 } },
  { id: 'kamau', name: 'Mzee Kamau, 52 — leaving a legacy', story: 'Mr Kamau owns land and a rental building. He wants to leave something for his grandchildren and to cover inheritance costs, and can pay a larger monthly premium.', expect: ['Faida Maisha'], lesson: 'Legacy goals favour whole-life or long-term cover. Check age limits and term options at his age before promising anything.',
    diag: { age: 52, gender: 'Male', income: 'KES 200,001–500,000', maritalStatus: 'married', dependants: '2', childrenCount: 0, hasCover: 'no', liabilities: ['No significant debt'], savingsConsistency: 'always', liquidityNeed: 'low', protectionPriority: 'important', existingInvestments: 'significant' }, goal: { goal: 'legacy', horizon: '11–15 years', freq: 'Monthly', inputMode: 'premium', monthlySaving: 30000 } }
);

/* ---------- home screen and account sheet ---------- */
function decorateHome(){
  if(!loggedIn()) return; const home = $('#atHome'); if(!home || $('#agHome')) return; injectCss();
  const grid = $('#app .mode-grid'), due = dueClients().length, bd = birthdayAlerts();
  if(bd.length && grid){
    const b = bd[0];
    grid.insertAdjacentHTML('beforebegin', `<div class="at-banner info" id="agBd"><span><b>${bd.length}</b> ${esc(L('client birthday(s) coming up', 'siku za kuzaliwa za wateja zinakaribia'))}: ${esc(b.c.name)} ${esc(bdayText(b.b))}</span><button class="at-btn sm" id="agBdGo">${esc(L('Open', 'Fungua'))}</button></div>`);
    const go = $('#agBdGo'); if(go) go.addEventListener('click', openBusiness);
  }
  const n = due + bd.length;
  home.insertAdjacentHTML('beforeend', `<span id="agHome" hidden></span>
    <button class="at-tile" id="agBiz"><b>${esc(L('My business', 'Biashara yangu'))}</b><span>${esc(L('Today, goals and pipeline', 'Leo, malengo na mchakato wa mauzo'))}</span>${n ? `<i class="at-badge">${n}</i>` : ''}</button>
    <button class="at-tile" id="agNeeds"><b>${esc(L('Cover needed', 'Bima inayohitajika'))}</b><span>${esc(L('How much cover a family may need', 'Kiasi cha bima ambacho familia inaweza kuhitaji'))}</span></button>
    <button class="at-tile" id="agQuiz"><b>${esc(L('Practice quiz', 'Jaribio la mazoezi'))}</b><span>${esc(L('Test yourself on insurance terms', 'Jipime kwa maneno ya bima'))}</span></button>`);
  $('#agBiz').addEventListener('click', openBusiness); $('#agNeeds').addEventListener('click', openNeeds); $('#agQuiz').addEventListener('click', openPractice);
}
(root.AccountExtras = root.AccountExtras || []).push(
  { id: 'backup', label: () => L('Backup & restore', 'Nakala na kurejesha'), fn: openBackup },
  { id: 'lock', label: () => lockCfg() ? L('App lock (PIN): on', 'Kufunga programu (PIN): imewashwa') : L('App lock (PIN)', 'Kufunga programu (PIN)'), fn: openLock }
);
if(typeof render === 'function'){
  const _render = render;
  render = function(){ const r = _render.apply(this, arguments); try{ if(typeof state !== 'undefined' && state.mode === 'home') decorateHome(); }catch(e){ console.error('agent-growth', e); } return r; };
}
root.AgentGrowth = Object.assign({ openBusiness, openMessage, openPractice, openNeeds, openBackup, openLock, showLock, birthdayAlerts, templates, hashPin }, PURE);
injectCss();
const boot = () => { try{ if(loggedIn() && lockCfg()) showLock(); }catch(e){} };
if(document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})(typeof window !== 'undefined' ? window : null);
