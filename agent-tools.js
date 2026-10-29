/* ============================================================
   AGENT TOOLS (v2026.10.24) — loaded after the main app.
   Clients & follow-ups · share as PDF/WhatsApp · comparison · what-if · pitch helper ·
   Swahili summaries · needs-gap chart · "why this plan" · saved progress · training mode ·
   hand-over to sales · my progress vs targets · published-rates sync · compliance trail.
   Everything here is added around the existing screens; it never changes the calculators.
   ============================================================ */
(function(){
'use strict';
if(window.__agentTools) return; window.__agentTools = true;

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => opsEscape(s == null ? '' : s);
const agentKey = () => (typeof AGENT !== 'undefined' && AGENT && (AGENT.agentId || AGENT.phone)) || 'anon';
const K = n => n + ':' + agentKey();
const get = (k, d) => lsGet(k, d), put = (k, v) => lsSet(k, v);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const num = v => { const n = parseInt(String(v == null ? '' : v).replace(/[^\d]/g, ''), 10); return isFinite(n) ? n : null; };
const online = () => navigator.onLine !== false;
const loggedIn = () => typeof AGENT !== 'undefined' && !!AGENT;

/* ---------- language (EN / Kiswahili) ---------- */
const LANG_KEY = 'illustrator_lang_v1', TRAIN_KEY = 'illustrator_training_v1';
function lang(){ return get(LANG_KEY, 'en') === 'sw' ? 'sw' : 'en'; }
function L(en, sw){ return lang() === 'sw' && sw ? sw : en; }
function setLang(l){ put(LANG_KEY, l === 'sw' ? 'sw' : 'en'); }
function training(){ return !!get(TRAIN_KEY, false); }
function setTraining(on){ put(TRAIN_KEY, !!on); document.body.classList.toggle('at-training', !!on); }

/* ---------- styles ---------- */
const CSS = `
.at-card{background:#fff;border:1px solid var(--line,#e6dcdc);border-radius:14px;padding:14px 16px;margin:12px 0;}
.at-card h3{margin:0 0 8px;font-size:15px;color:var(--brand-dark);}
.at-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}
.at-btn{border:1px solid var(--brand);background:#fff;color:var(--brand);border-radius:10px;padding:10px 14px;font:600 14px system-ui,sans-serif;cursor:pointer;min-height:42px;}
.at-btn.pri{background:var(--brand);color:#fff;}
.at-btn.sm{padding:6px 10px;min-height:34px;font-size:13px;}
.at-btn.danger{border-color:#b3261e;color:#b3261e;}
.at-btn:disabled{opacity:.5;}
.at-home{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;}
.at-tile{border:1px solid var(--line,#e6dcdc);background:#fff;border-radius:14px;padding:12px;cursor:pointer;text-align:left;font:inherit;position:relative;}
.at-tile b{display:block;font-size:14.5px;color:var(--brand-dark);margin-bottom:2px;}
.at-tile span{font-size:12.5px;color:var(--muted,#6b5b5b);line-height:1.35;display:block;}
.at-badge{position:absolute;top:8px;right:8px;background:#b3261e;color:#fff;border-radius:999px;font-size:11.5px;font-weight:700;padding:1px 7px;}
.at-banner{border-radius:12px;padding:10px 12px;margin:10px 0;font-size:13.5px;line-height:1.45;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;}
.at-banner.warn{background:#fff4e0;border:1px solid #f0c987;color:#6b4300;}
.at-banner.info{background:var(--brand-light,#f4e6e8);border:1px solid #e3c3c9;color:var(--brand-dark);}
#atPanel{position:fixed;inset:0;z-index:9000;background:#faf7f7;display:flex;flex-direction:column;font-family:system-ui,sans-serif;}
#atPanel .at-top{background:var(--brand);color:#fff;display:flex;align-items:center;gap:10px;padding:10px 12px;}
#atPanel .at-top h2{margin:0;font-size:17px;flex:1;font-family:var(--font-display,inherit);}
#atPanel .at-top button{background:transparent;border:0;color:#fff;font-size:24px;line-height:1;cursor:pointer;min-width:40px;min-height:40px;}
#atPanel .at-body{flex:1;overflow:auto;padding:12px 14px 80px;-webkit-overflow-scrolling:touch;}
#atPanel input,#atPanel select,#atPanel textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #d9cccc;border-radius:10px;font:15px system-ui,sans-serif;margin:4px 0 10px;background:#fff;}
#atPanel label{font-size:12.5px;color:var(--muted,#6b5b5b);font-weight:600;}
#atPanel input[type=range]{padding:0;border:0;}
#atPanel input[type=checkbox]{width:auto;margin:0 8px 0 0;}
.at-item{border:1px solid var(--line,#e6dcdc);background:#fff;border-radius:12px;padding:10px 12px;margin:8px 0;cursor:pointer;}
.at-item .t{font-weight:700;font-size:15px;}
.at-item .s{font-size:12.5px;color:var(--muted,#6b5b5b);margin-top:2px;}
.at-chip{display:inline-block;border-radius:999px;font-size:11.5px;font-weight:700;padding:2px 8px;margin-right:4px;background:#eee;color:#444;}
.at-chip.red{background:#fde8e6;color:#b3261e;} .at-chip.amber{background:#fff1d6;color:#8a5a00;} .at-chip.green{background:#e3f2e8;color:#1f6b3a;}
.at-table{width:100%;border-collapse:collapse;font-size:13px;}
.at-table th,.at-table td{border-bottom:1px solid #eee;padding:6px 6px;text-align:left;vertical-align:top;}
.at-table th{font-size:12px;color:var(--muted,#6b5b5b);}
.at-table td.best{background:#e8f5ec;font-weight:700;}
.at-bar{height:16px;border-radius:8px;background:#eee;overflow:hidden;margin:4px 0 2px;}
.at-bar>i{display:block;height:100%;background:var(--brand);}
.at-bar.gap>i{background:#b3261e;} .at-bar.ok>i{background:#1f6b3a;}
.at-why summary{cursor:pointer;color:var(--brand);font-weight:600;font-size:13.5px;margin:6px 0;}
.at-train{position:fixed;top:0;left:0;right:0;z-index:8000;background:#b3261e;color:#fff;font:700 12px system-ui,sans-serif;text-align:center;padding:3px 8px;letter-spacing:.04em;}
body.at-training{padding-top:20px;}
@media print{#atPanel,.at-card,.at-home,.at-banner,.at-train{display:none!important;} body.at-training #printReport::before,body.at-training .sign-block::before{content:"TRAINING — NOT A QUOTE";display:block;color:#b3261e;font-weight:700;text-align:center;border:2px solid #b3261e;padding:4px;margin:6px 0;}}
`;
function injectCss(){ if($('#atCss')) return; const st = document.createElement('style'); st.id = 'atCss'; st.textContent = CSS; document.head.appendChild(st); }

/* ---------- panel stack ---------- */
const stack = [];
function panelEl(){
  let el = $('#atPanel');
  if(!el){
    el = document.createElement('div'); el.id = 'atPanel'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'atTitle');
    el.innerHTML = '<div class="at-top"><button id="atBack" aria-label="Back">&#8592;</button><h2 id="atTitle"></h2><button id="atClose" aria-label="Close">&times;</button></div><div class="at-body" id="atBody"></div>';
    document.body.appendChild(el);
    $('#atClose', el).addEventListener('click', closePanel);
    $('#atBack', el).addEventListener('click', backPanel);
    document.addEventListener('keydown', e => { if(e.key === 'Escape' && $('#atPanel')) backPanel(); });
  }
  return el;
}
function showPanel(title, fn){ stack.push({ title, fn }); drawPanel(); }
function drawPanel(){
  const top = stack[stack.length - 1]; if(!top) return closePanel();
  const el = panelEl(); $('#atTitle', el).textContent = top.title; const body = $('#atBody', el); body.innerHTML = ''; body.scrollTop = 0;
  $('#atBack', el).style.visibility = stack.length > 1 ? 'visible' : 'hidden';
  top.fn(body);
}
function backPanel(){ stack.pop(); if(stack.length) drawPanel(); else closePanel(); }
function closePanel(){ stack.length = 0; const el = $('#atPanel'); if(el) el.remove(); if(typeof render === 'function') { try{ if(state.mode === 'home') render(); }catch(e){} } }
function toast(msg){ if(typeof opsToast === 'function') opsToast(msg); }
function confirmBox(msg){ return window.confirm(msg); }

/* ---------- quiet tracking while training / what-if ---------- */
let quiet = 0;
const _track = window.track || (typeof track === 'function' ? track : null);
if(typeof track === 'function'){
  const orig = track;
  window.track = track = function(ev, props){ if(quiet > 0 || training()) return; return orig.apply(this, arguments); };
}

/* ---------- compliance trail (quote records) ---------- */
const QQ_KEY = 'illustrator_qq_v1';
function ratesLabel(){ try{ const v = (typeof RATES_VERSION !== 'undefined' ? RATES_VERSION : {}); const used = productEngineKey(); return v[used] || 'built-in'; }catch(e){ return 'built-in'; } }
function productEngineKey(){ if(state.mode === 'diagnose') return 'fanaka'; return state.category || 'fanaka'; }
function inputsNow(){
  try{
    if(state.mode === 'diagnose'){ const d = state.diag, g = d.goals[0] || {}; return { kind: 'diagnosis', age: d.age, dependants: d.dependants, children: d.childrenCount, goal: g.goal, horizon: g.horizon, freq: g.freq, basis: g.inputMode, amount: g.inputMode === 'premium' ? g.monthlySaving : g.inputMode === 'sumAssured' ? g.sumAssured : g.targetAmount }; }
    if(state.category === 'faida'){ const f = state.faida; return { product: f.product, ageANB: f.dob ? faidaAgeANB(f.dob) : null, term: f.term, freq: f.freq, periodicPremium: f.periodicPremium, sumAssured: f.sumAssured, taxRelief: !!f.taxRelief }; }
    if(state.category === 'smartsave'){ const s = state.smartsave; return { product: s.product, age: s.dob ? ssAgeANB(s.dob) : null, term: s.term, freq: s.freq, mode: s.mode, value: s.inputValue, bonusRate: s.bonusRate, riders: s.riders }; }
    return { plan: state.plan && state.plan.name, age: state.age, term: state.term, freq: state.freq, mode: state.mode, value: state.inputValue, bonusRate: state.bonusRate, taxRelief: !!state.taxRelief, joint: !!state.isJoint };
  }catch(e){ return {}; }
}
function recordQuote(action, snap){
  if(training() || !loggedIn() || !OTP_ENABLED) return;
  const q = get(K(QQ_KEY), []);
  q.push({ product: (snap && snap.product) || productLabelNow(), action, ratesVersion: ratesLabel(), appVersion: APP_VERSION, termsVersion: TERMS_VERSION, language: lang(), at: new Date().toISOString(), inputs: inputsNow(), result: snap ? { headline: snap.hero && snap.hero.value, label: snap.hero && snap.hero.label } : {} });
  put(K(QQ_KEY), q.slice(-100)); flushQuotes();
}
let flushing = false;
async function flushQuotes(){
  if(flushing || !online() || !AGENT || !AGENT.token) return;
  const q = get(K(QQ_KEY), []); if(!q.length) return; flushing = true;
  try{
    const res = await fetch(`${BACKEND_API}/api/companies/${BACKEND_COMPANY_ID}/quotes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AGENT.token }, body: JSON.stringify({ records: q.slice(0, 50) }) });
    if(res.ok){ const rest = get(K(QQ_KEY), []).slice(Math.min(50, q.length)); put(K(QQ_KEY), rest); }
  }catch(e){} finally { flushing = false; }
}

/* ---------- published rates: download in background, apply on next start ---------- */
const RATES_KEY = 'illustrator_rates_v1';
async function syncRates(){
  if(!OTP_ENABLED || !AGENT || !AGENT.token || !online()) return;
  try{
    const auth = { headers: { Authorization: 'Bearer ' + AGENT.token } };
    const mr = await fetch(`${BACKEND_API}/api/companies/${BACKEND_COMPANY_ID}/rates/manifest`, auth); if(!mr.ok) return;
    const man = await mr.json();
    let cache = get(RATES_KEY, null); if(!cache || String(cache.company) !== String(BACKEND_COMPANY_ID)) cache = { company: String(BACKEND_COMPANY_ID), versions: {}, data: {} };
    let changed = false;
    for(const e of ['fanaka', 'faida', 'smartsave']){
      const m = man[e], have = cache.versions[e];
      if(!m){ if(have){ delete cache.versions[e]; delete cache.data[e]; changed = true; } continue; }
      if(have && have.id === m.versionId) continue;
      const dr = await fetch(`${BACKEND_API}/api/companies/${BACKEND_COMPANY_ID}/rates/${e}`, auth); if(!dr.ok) continue;
      const j = await dr.json(); cache.versions[e] = { id: j.versionId, n: j.versionNumber }; cache.data[e] = j.data; changed = true;
    }
    if(changed){ try{ localStorage.setItem(RATES_KEY, JSON.stringify(cache)); window.__ratesPending = true; if(typeof state !== 'undefined' && state.mode === 'home') render(); }catch(e){ /* storage full: keep the built-in rates */ } }
  }catch(e){}
}

/* ---------- my progress vs targets ---------- */
let standing = get('illustrator_standing_v1', null);
async function loadStanding(){
  if(!OTP_ENABLED || !AGENT || !AGENT.token || !online() || training()) return;
  try{
    const res = await fetch(`${BACKEND_API}/api/companies/${BACKEND_COMPANY_ID}/agents/me/standing`, { headers: { Authorization: 'Bearer ' + AGENT.token } });
    if(!res.ok) return; standing = await res.json(); put('illustrator_standing_v1', standing);
    if(state.mode === 'home'){ const slot = $('#atStanding'); if(slot) slot.outerHTML = standingHtml(); }
  }catch(e){}
}
function bar(pct, cls){ return `<div class="at-bar ${cls || ''}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`; }
function standingHtml(){
  if(!standing || !standing.me) return '<span id="atStanding"></span>';
  const t = standing.targets || {}, m = standing.me; const rows = [];
  const add = (label, v, g) => { if(g > 0) rows.push(`<div style="font-size:13px;margin-top:6px;">${esc(label)}: <b>${v}</b> / ${g}${bar(Math.round(v / g * 100), v >= g ? 'ok' : '')}</div>`); };
  add(L('Calculations', 'Hesabu'), m.calcs, t.calcs); add(L('Illustrations printed / shared', 'Michoro iliyochapishwa / kushirikiwa'), m.prints, t.prints); add(L('Leads handed over', 'Wateja watarajiwa waliokabidhiwa'), m.leads, t.leads);
  return `<div class="at-card" id="atStanding"><h3>${esc(L('My progress this month', 'Maendeleo yangu mwezi huu'))}</h3>${rows.join('') || `<div style="font-size:13px;color:var(--muted)">${esc(L('No targets have been set yet.', 'Hakuna malengo yaliyowekwa bado.'))}</div>`}<div style="font-size:12.5px;color:var(--muted);margin-top:8px;">${esc(L('Rank', 'Nafasi'))} #${m.rank} ${esc(L('of', 'kati ya'))} ${standing.of}</div></div>`;
}

/* ---------- saved progress (drafts) ---------- */
const DRAFT_KEY = 'illustrator_draft_v1';
function meaningful(){
  if(typeof state === 'undefined' || state.mode === 'home') return false;
  if(state.mode === 'diagnose') return state.dStep > 1 || state.diag.age !== null;
  return state.step >= 2;
}
function saveDraft(){
  try{
    if(!loggedIn() || !meaningful()) return;
    const copy = JSON.parse(JSON.stringify(Object.assign({}, state, { plan: null })));
    put(K(DRAFT_KEY), { at: Date.now(), planName: state.plan ? state.plan.name : null, state: copy, label: state.mode === 'diagnose' ? L('Client needs diagnosis', 'Uchambuzi wa mahitaji ya mteja') : productLabelNow() });
  }catch(e){}
}
function getDraft(){ const d = get(K(DRAFT_KEY), null); if(!d || Date.now() - d.at > 7 * 864e5) return null; return d; }
function resumeDraft(){
  const d = getDraft(); if(!d) return;
  const s = Object.assign(defaultState(), d.state);
  if(d.planName) s.plan = (DATA.plans || []).find(p => p.name === d.planName) || null;
  state = s;
  if(state.mode === 'diagnose') goDiagnose(state.dStep || 1); else go(state.step || 1);
}
function discardDraft(){ try{ localStorage.removeItem(K(DRAFT_KEY)); }catch(e){} }

/* ---------- snapshots of what is on screen ---------- */
const SW_LABELS = {
  'Estimated Payout': 'Malipo yanayokadiriwa', 'Age next birthday': 'Umri (siku ya kuzaliwa ijayo)', 'Term': 'Muda wa mkataba', 'Sum Assured': 'Kiasi cha Bima', 'Frequency': 'Mzunguko wa malipo',
  'One-off premium': 'Ada ya mara moja', 'Single premium': 'Ada ya mara moja', 'Base premium': 'Ada ya msingi', 'Tax relief benefit': 'Nafuu ya kodi', 'Basic Sum Assured (survival benefit)': 'Kiasi cha Bima cha msingi (faida ya kuishi)',
  'Estimated payout at maturity': 'Malipo yanayokadiriwa wakati wa kukomaa', 'Projected value at maturity': 'Thamani inayokadiriwa wakati wa kukomaa', 'Fund Value': 'Thamani ya Mfuko', 'Premium': 'Ada', 'Monthly': 'Kila mwezi', 'Quarterly': 'Kila robo mwaka', 'Annually': 'Kila mwaka', 'Semi-annually': 'Kila nusu mwaka',
  'Total contributions': 'Jumla ya michango', 'Policy term': 'Muda wa bima', 'Projected value': 'Thamani inayokadiriwa', 'Whole Life Cover': 'Bima ya Maisha Yote', 'Last Expense cover': 'Bima ya gharama za mazishi', 'Waiver of Premium': 'Msamaha wa ada'
};
const txt = e => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');
function swLabel(s){ if(lang() !== 'sw') return s; if(SW_LABELS[s]) return SW_LABELS[s]; const key = Object.keys(SW_LABELS).find(k => s.toLowerCase().indexOf(k.toLowerCase()) === 0); return key ? SW_LABELS[key] + s.slice(key.length) : s; }
function scrapeIllustration(){
  const root = $('#app'); const hero = $('.result-hero', root);
  const items = $$('.summary-grid .sg-item', root).map(e => ({ l: txt($('.sg-label', e)), v: txt($('.sg-value', e)) }));
  const lines = []; $$('.rider-line', root).forEach(e => { const kids = e.children; const l = txt(kids[0]), v = txt($('.rval', e) || kids[kids.length - 1]); if(l && v && !/^[—-]$/.test(v)) lines.push({ l, v }); });
  $$('.freq-table tbody tr', root).forEach(tr => { const td = tr.children; if(td.length >= 4) lines.push({ l: txt(td[0]) + ' ' + L('premium', 'ada'), v: txt(td[3]) }); });
  const hv = txt($('.rvalue', hero));
  return { id: uid(), at: Date.now(), kind: 'illustration', product: productLabelNow(), title: productLabelNow(), clientName: (state.clientName || (state.faida && state.faida.clientName) || (state.smartsave && state.smartsave.clientName) || '').trim(),
    hero: { label: txt($('.rlabel', hero)), value: hv, num: num(hv), sub: txt($('.rsub', hero)) }, items, lines: lines.slice(0, 18), inputs: inputsNow(), rates: ratesLabel() };
}
function diagSnapshot(){
  const d = state.diag, needs = computeNeedScores(d), fits = scoreProducts(d, needs), calc = runAllProducts(d);
  const lines = []; fits.forEach(f => { const c = calc.find(x => x.name === f.name); if(c && c.eligible) lines.push({ l: f.name + (f.tier ? ' — ' + f.tier : ''), v: fmt(c.premiumMonthly) + ' / ' + (c.freqLabel || 'Monthly') + ' → ' + fmt(Math.round(c.maturity)) }); });
  const top = fits.find(f => { const c = calc.find(x => x.name === f.name); return c && c.eligible; });
  const g = d.goals[0] || {};
  const items = [{ l: L('Age', 'Umri'), v: String(d.age == null ? '—' : d.age) }, { l: L('Dependants', 'Wanaomtegemea'), v: String(d.dependants == null ? '—' : d.dependants) }, { l: L('Goal', 'Lengo'), v: ((GOAL_OPTIONS.find(x => x.id === g.goal) || {}).label) || '—' }];
  return { id: uid(), at: Date.now(), kind: 'diagnosis', product: 'Needs diagnosis', title: L('Needs diagnosis', 'Uchambuzi wa mahitaji'), clientName: '', hero: { label: L('Best fit', 'Bidhaa inayofaa zaidi'), value: top ? top.name : '—', num: null, sub: '' }, items, lines: lines.slice(0, 8), inputs: inputsNow(), rates: ratesLabel(), needs: { goal: Math.round(needs.goalFunding), education: Math.round(needs.education), protection: Math.round(needs.protection), wealth: Math.round(needs.wealth), liquidity: Math.round(needs.liquidity), discipline: Math.round(needs.discipline) } };
}
const snapNow = () => (state.mode === 'diagnose') ? diagSnapshot() : scrapeIllustration();

/* ---------- clients ---------- */
const CL_KEY = 'illustrator_clients_v1';
const clients = () => get(K(CL_KEY), []);
const saveClients = a => put(K(CL_KEY), a);
const STATUSES = [['new', 'New', 'Mpya'], ['contacted', 'Contacted', 'Amewasiliwa'], ['quoted', 'Quoted', 'Amepewa nukuu'], ['won', 'Won', 'Amenunua'], ['lost', 'Lost', 'Hakununua']];
const statusLabel = s => { const r = STATUSES.find(x => x[0] === s) || STATUSES[0]; return L(r[1], r[2]); };
function dueState(c){ if(!c.followUp || c.status === 'won' || c.status === 'lost') return null; const t = today(); return c.followUp < t ? 'overdue' : c.followUp === t ? 'today' : 'later'; }
function dueCount(){ return clients().filter(c => { const s = dueState(c); return s === 'overdue' || s === 'today'; }).length; }
function waNumber(p){ const d = String(p || '').replace(/[^\d]/g, ''); if(!d) return ''; if(d.startsWith('254')) return d; if(d.startsWith('0')) return '254' + d.slice(1); if(d.length === 9) return '254' + d; return d; }

function openClients(filter){
  showPanel(L('My clients', 'Wateja wangu'), body => {
    let f = filter || 'all', q = '';
    body.innerHTML = `<input id="clQ" type="search" placeholder="${esc(L('Search name or phone', 'Tafuta jina au simu'))}"><div class="at-row" style="margin:0 0 6px;"><button class="at-btn sm ${f === 'all' ? 'pri' : ''}" data-f="all">${esc(L('All', 'Wote'))}</button><button class="at-btn sm ${f === 'due' ? 'pri' : ''}" data-f="due">${esc(L('Follow-ups due', 'Ufuatiliaji unaohitajika'))}</button><button class="at-btn sm pri" id="clNew" style="margin-left:auto;">+ ${esc(L('New client', 'Mteja mpya'))}</button></div><div id="clList"></div><p style="font-size:12px;color:var(--muted);">${esc(L('Client records are kept only on this phone. They are not sent to the company unless you hand a client to the sales team.', 'Rekodi za wateja zinahifadhiwa kwenye simu hii pekee. Hazitumwi kwa kampuni isipokuwa ukimkabidhi mteja kwa timu ya mauzo.'))}</p>`;
    const draw = () => {
      let list = clients().slice().sort((a, b) => (a.followUp || '9999') < (b.followUp || '9999') ? -1 : 1);
      if(f === 'due') list = list.filter(c => ['overdue', 'today'].indexOf(dueState(c)) >= 0);
      if(q) list = list.filter(c => (c.name + ' ' + (c.phone || '')).toLowerCase().indexOf(q) >= 0);
      $('#clList', body).innerHTML = list.length ? list.map(c => { const ds = dueState(c); return `<div class="at-item" data-id="${c.id}"><div class="t">${esc(c.name)} ${ds === 'overdue' ? `<span class="at-chip red">${esc(L('Overdue', 'Imechelewa'))}</span>` : ds === 'today' ? `<span class="at-chip amber">${esc(L('Today', 'Leo'))}</span>` : ''}</div><div class="s">${esc(c.phone || '')} · ${esc(statusLabel(c.status))} · ${(c.quotes || []).length} ${esc(L('saved', 'zilizohifadhiwa'))}${c.followUp ? ' · ' + esc(L('Follow up', 'Fuatilia')) + ' ' + esc(c.followUp) : ''}</div></div>`; }).join('') : `<p style="color:var(--muted)">${esc(L('No clients here yet.', 'Hakuna wateja bado.'))}</p>`;
      $$('#clList .at-item', body).forEach(e => e.addEventListener('click', () => openClient(e.dataset.id)));
    };
    $('#clQ', body).addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); draw(); });
    $$('[data-f]', body).forEach(b => b.addEventListener('click', () => { f = b.dataset.f; $$('[data-f]', body).forEach(x => x.classList.toggle('pri', x === b)); draw(); }));
    $('#clNew', body).addEventListener('click', () => openClient(null));
    draw();
  });
}
function openClient(id, then){
  const all = clients(); let c = id ? all.find(x => x.id === id) : null; const isNew = !c;
  if(isNew) c = { id: uid(), name: '', phone: '', email: '', notes: '', followUp: '', followNote: '', status: 'new', quotes: [], createdAt: Date.now() };
  showPanel(isNew ? L('New client', 'Mteja mpya') : c.name, body => {
    body.innerHTML = `<label>${esc(L('Name', 'Jina'))}</label><input id="cName" value="${esc(c.name)}" maxlength="120">
      <label>${esc(L('Phone', 'Simu'))}</label><input id="cPhone" type="tel" value="${esc(c.phone)}" maxlength="20">
      <label>Email</label><input id="cEmail" type="email" value="${esc(c.email)}" maxlength="160">
      <label>${esc(L('Status', 'Hali'))}</label><select id="cStatus">${STATUSES.map(s => `<option value="${s[0]}" ${c.status === s[0] ? 'selected' : ''}>${esc(L(s[1], s[2]))}</option>`).join('')}</select>
      <label>${esc(L('Follow-up date', 'Tarehe ya kufuatilia'))}</label><input id="cFollow" type="date" value="${esc(c.followUp)}">
      <label>${esc(L('Follow-up note', 'Maelezo ya ufuatiliaji'))}</label><input id="cFollowNote" value="${esc(c.followNote || '')}" maxlength="160" placeholder="${esc(L('e.g. Call after salary day', 'mfano: Piga simu baada ya siku ya mshahara'))}">
      <label>${esc(L('Notes', 'Maelezo'))}</label><textarea id="cNotes" rows="3" maxlength="800">${esc(c.notes || '')}</textarea>
      <div class="at-row"><button class="at-btn pri" id="cSave">${esc(L('Save', 'Hifadhi'))}</button>${isNew ? '' : `<button class="at-btn" id="cCall">${esc(L('Call', 'Piga simu'))}</button><button class="at-btn" id="cWa">WhatsApp</button><button class="at-btn" id="cLead">${esc(L('Hand to sales team', 'Mkabidhi timu ya mauzo'))}</button>`}</div><div id="cMsg" style="margin-top:8px;font-size:13px;"></div>
      <div id="cQuotes"></div>${isNew ? '' : `<div class="at-row"><button class="at-btn danger sm" id="cDel">${esc(L('Delete client', 'Futa mteja'))}</button></div>`}`;
    const read = () => { c.name = $('#cName', body).value.trim(); c.phone = $('#cPhone', body).value.trim(); c.email = $('#cEmail', body).value.trim(); c.status = $('#cStatus', body).value; c.followUp = $('#cFollow', body).value; c.followNote = $('#cFollowNote', body).value.trim(); c.notes = $('#cNotes', body).value.trim(); c.updatedAt = Date.now(); };
    const persist = () => { const a = clients(); const i = a.findIndex(x => x.id === c.id); if(i >= 0) a[i] = c; else a.unshift(c); saveClients(a); };
    $('#cSave', body).addEventListener('click', () => { read(); if(!c.name){ $('#cMsg', body).textContent = L('Enter the client\'s name.', 'Weka jina la mteja.'); return; } persist(); if(then) then(c); backPanel(); });
    if(!isNew){
      $('#cCall', body).addEventListener('click', () => { if(c.phone) location.href = 'tel:' + c.phone.replace(/\s/g, ''); });
      $('#cWa', body).addEventListener('click', () => { const n = waNumber(c.phone); if(n) window.open('https://wa.me/' + n, '_blank'); });
      $('#cLead', body).addEventListener('click', () => { read(); persist(); openLeadForm(c); });
      $('#cDel', body).addEventListener('click', () => { if(confirmBox(L('Delete this client and their saved quotes from this phone?', 'Futa mteja huyu na nukuu zake kwenye simu hii?'))){ saveClients(clients().filter(x => x.id !== c.id)); backPanel(); } });
      const qs = $('#cQuotes', body); const sel = new Set();
      const drawQ = () => {
        qs.innerHTML = `<h3 style="margin:16px 0 6px;color:var(--brand-dark);">${esc(L('Saved quotes', 'Nukuu zilizohifadhiwa'))}</h3>` + ((c.quotes || []).length ? c.quotes.map(q => `<div class="at-item" style="cursor:default;"><label style="display:flex;align-items:center;font-size:14px;color:inherit;font-weight:600;"><input type="checkbox" data-q="${q.id}" ${sel.has(q.id) ? 'checked' : ''}> ${esc(q.title)} — ${esc((q.hero && q.hero.value) || '')}</label><div class="s">${new Date(q.at).toLocaleDateString('en-KE')} · ${esc((q.hero && q.hero.label) || '')}</div><div class="at-row"><button class="at-btn sm" data-share="${q.id}">${esc(L('Share', 'Shiriki'))}</button><button class="at-btn sm danger" data-del="${q.id}">${esc(L('Remove', 'Ondoa'))}</button></div></div>`).join('') + `<div class="at-row"><button class="at-btn pri" id="cCmp">${esc(L('Compare selected', 'Linganisha zilizochaguliwa'))}</button></div>` : `<p style="color:var(--muted);font-size:13px;">${esc(L('Nothing saved yet. Open an illustration and tap "Save to client".', 'Hakuna kilichohifadhiwa. Fungua mchoro na ubonyeze "Hifadhi kwa mteja".'))}</p>`);
        $$('[data-q]', qs).forEach(cb => cb.addEventListener('change', () => { cb.checked ? sel.add(cb.dataset.q) : sel.delete(cb.dataset.q); }));
        $$('[data-share]', qs).forEach(b => b.addEventListener('click', () => shareSheet(c.quotes.find(x => x.id === b.dataset.share), c)));
        $$('[data-del]', qs).forEach(b => b.addEventListener('click', () => { c.quotes = c.quotes.filter(x => x.id !== b.dataset.del); persist(); drawQ(); }));
        const cm = $('#cCmp', qs); if(cm) cm.addEventListener('click', () => { const picks = c.quotes.filter(x => sel.has(x.id)); if(picks.length < 2) return toast(L('Tick at least two quotes to compare.', 'Chagua nukuu angalau mbili kulinganisha.')); compareSheet(picks.slice(0, 3)); });
      };
      drawQ();
    }
  });
}
function openLeadForm(c){
  showPanel(L('Hand to sales team', 'Mkabidhi timu ya mauzo'), body => {
    const last = (c.quotes || [])[0];
    const summary = last ? `${last.title}: ${(last.hero && last.hero.label) || ''} ${(last.hero && last.hero.value) || ''}` : '';
    const blocked = training() ? L('Training mode is on, so nothing is sent.', 'Hali ya mafunzo imewashwa, hakuna kinachotumwa.') : (!OTP_ENABLED || !AGENT || !AGENT.token) ? L('Handing over needs the company connection. Sign in with the company link first.', 'Kukabidhi kunahitaji muunganisho wa kampuni. Ingia kwanza kupitia kiungo cha kampuni.') : !online() ? L('You are offline. Connect to the internet and try again.', 'Hauko mtandaoni. Unganisha intaneti ujaribu tena.') : '';
    body.innerHTML = `<p style="font-size:13.5px;">${esc(L('This sends the client\'s name and contact to the company\'s sales / underwriting team so they can follow up. Only do this with the client\'s permission.', 'Hii inatuma jina na mawasiliano ya mteja kwa timu ya mauzo/uandishi wa bima ya kampuni ili wafuatilie. Fanya hivi kwa idhini ya mteja pekee.'))}</p>
      <label>${esc(L('Client', 'Mteja'))}</label><input id="lName" value="${esc(c.name)}" maxlength="120">
      <label>${esc(L('Phone', 'Simu'))}</label><input id="lPhone" type="tel" value="${esc(c.phone)}"><label>Email</label><input id="lEmail" type="email" value="${esc(c.email)}">
      <label>${esc(L('What the client needs', 'Mteja anachohitaji'))}</label><textarea id="lNeeds" rows="3" maxlength="1200">${esc(summary)}</textarea>
      <label>${esc(L('Note for the team', 'Ujumbe kwa timu'))}</label><textarea id="lNote" rows="2" maxlength="600">${esc(c.followNote || '')}</textarea>
      <label style="display:flex;align-items:flex-start;gap:6px;font-size:13.5px;color:inherit;"><input type="checkbox" id="lConsent" style="margin-top:3px;"> <span>${esc(L('The client agreed to be contacted by the company.', 'Mteja amekubali kuwasiliwa na kampuni.'))}</span></label>
      <div class="at-row"><button class="at-btn pri" id="lSend" ${blocked ? 'disabled' : ''}>${esc(L('Send to sales team', 'Tuma kwa timu ya mauzo'))}</button></div><div id="lMsg" style="margin-top:8px;font-size:13.5px;color:${blocked ? '#b3261e' : 'inherit'};">${esc(blocked)}</div>`;
    $('#lSend', body).addEventListener('click', async () => {
      const msg = $('#lMsg', body), btn = $('#lSend', body);
      if(!$('#lConsent', body).checked){ msg.style.color = '#b3261e'; msg.textContent = L('Tick that the client agreed to be contacted.', 'Thibitisha kuwa mteja amekubali kuwasiliwa.'); return; }
      btn.disabled = true; msg.style.color = 'inherit'; msg.textContent = L('Sending…', 'Inatuma…');
      try{
        const res = await fetch(`${BACKEND_API}/api/companies/${BACKEND_COMPANY_ID}/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AGENT.token }, body: JSON.stringify({ clientName: $('#lName', body).value, clientPhone: $('#lPhone', body).value, clientEmail: $('#lEmail', body).value, product: last ? last.product : '', needsSummary: $('#lNeeds', body).value, note: $('#lNote', body).value, consent: true }) });
        const j = await res.json().catch(() => ({}));
        if(!res.ok) throw new Error(j.error || 'Could not send.');
        const a = clients(), i = a.findIndex(x => x.id === c.id); if(i >= 0){ a[i].leadSentAt = Date.now(); a[i].status = a[i].status === 'new' ? 'contacted' : a[i].status; saveClients(a); }
        msg.style.color = '#1f6b3a'; msg.textContent = L('Sent. The sales team will follow up.', 'Imetumwa. Timu ya mauzo itafuatilia.');
      }catch(e){ btn.disabled = false; msg.style.color = '#b3261e'; msg.textContent = e.message; }
    });
  });
}
function saveToClient(snap){
  showPanel(L('Save to client', 'Hifadhi kwa mteja'), body => {
    const list = clients();
    const prefill = (snap.clientName || '').trim();
    body.innerHTML = `<label>${esc(L('Client', 'Mteja'))}</label><select id="sSel"><option value="">+ ${esc(L('New client', 'Mteja mpya'))}</option>${list.map(c => `<option value="${c.id}" ${prefill && c.name.toLowerCase() === prefill.toLowerCase() ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <div id="sNew"><label>${esc(L('Name', 'Jina'))}</label><input id="sName" value="${esc(prefill)}" maxlength="120"><label>${esc(L('Phone', 'Simu'))}</label><input id="sPhone" type="tel"></div>
      <label>${esc(L('Follow-up date (optional)', 'Tarehe ya kufuatilia (si lazima)'))}</label><input id="sFollow" type="date">
      <div class="at-row"><button class="at-btn pri" id="sGo">${esc(L('Save', 'Hifadhi'))}</button></div><div id="sMsg" style="color:#b3261e;font-size:13px;margin-top:6px;"></div>`;
    const sync = () => { $('#sNew', body).style.display = $('#sSel', body).value ? 'none' : ''; }; $('#sSel', body).addEventListener('change', sync); sync();
    $('#sGo', body).addEventListener('click', () => {
      const a = clients(); let c = a.find(x => x.id === $('#sSel', body).value);
      if(!c){ const name = $('#sName', body).value.trim(); if(!name){ $('#sMsg', body).textContent = L('Enter the client\'s name.', 'Weka jina la mteja.'); return; } c = { id: uid(), name, phone: $('#sPhone', body).value.trim(), email: '', notes: '', followUp: '', followNote: '', status: 'new', quotes: [], createdAt: Date.now() }; a.unshift(c); }
      const fu = $('#sFollow', body).value; if(fu) c.followUp = fu;
      c.quotes = [Object.assign({}, snap, { id: uid(), at: Date.now() })].concat(c.quotes || []).slice(0, 30); if(c.status === 'new') c.status = 'quoted'; c.updatedAt = Date.now();
      saveClients(a); toast(L('Saved to ', 'Imehifadhiwa kwa ') + c.name); backPanel();
    });
  });
}

/* ---------- share: WhatsApp, PDF, copy ---------- */
function summaryText(snap, c){
  const co = (typeof BRAND_NAME !== 'undefined' && BRAND_NAME) || document.title || 'Plan Illustrator';
  const lines = [`*${snap.title}* — ${L('summary', 'muhtasari')}`]; const name = (c && c.name) || snap.clientName; if(name) lines.push(L('Prepared for: ', 'Imeandaliwa kwa: ') + name);
  if(snap.hero && snap.hero.value) lines.push('', `${swLabel(snap.hero.label || '')}: ${snap.hero.value}`);
  (snap.items || []).forEach(i => lines.push(`${swLabel(i.l)}: ${i.v}`));
  if(snap.lines && snap.lines.length){ lines.push(''); snap.lines.slice(0, 12).forEach(i => lines.push(`• ${swLabel(i.l)}: ${i.v}`)); }
  lines.push('', L('This is an estimate to help you decide. Bonuses and fund values are not guaranteed. The official illustration and policy terms apply.', 'Hii ni makadirio ya kukusaidia kuamua. Bonasi na thamani za mfuko hazihakikishiwi. Mchoro rasmi na masharti ya sera ndiyo yanayotumika.'));
  if(typeof AGENT !== 'undefined' && AGENT) lines.push('', `${L('Your advisor', 'Mshauri wako')}: ${AGENT.name}${AGENT.agencyCode ? ' (' + AGENT.agencyCode + ')' : ''} — ${AGENT.phone}`);
  if(training()) lines.unshift(L('TRAINING EXAMPLE — NOT A QUOTE', 'MFANO WA MAFUNZO — SI NUKUU'), '');
  return lines.join('\n');
}
// A small, dependency-free PDF writer (Helvetica, A4). Characters outside Latin-1 are simplified.
function pdfSafe(s){ return String(s == null ? '' : s).replace(/[—–]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[•·]/g, '-').replace(/→/g, '->').replace(/…/g, '...').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?'); }
const pdfEsc = s => pdfSafe(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
function wrapLine(s, max){ const out = []; String(s).split('\n').forEach(par => { let line = ''; par.split(' ').forEach(w => { if((line + ' ' + w).trim().length > max){ if(line) out.push(line); line = w; } else line = (line + ' ' + w).trim(); }); out.push(line); }); return out; }
function hexRgb(h){ const m = /^#?([0-9a-f]{6})$/i.exec((h || '').trim()); if(!m) return [0.49, 0.14, 0.2]; const n = parseInt(m[1], 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
function buildPdf(snap, c){
  const brand = hexRgb(getComputedStyle(document.documentElement).getPropertyValue('--brand'));
  const pages = []; let ops = [], y = 800;
  const newPage = () => { if(ops.length) pages.push(ops.join('\n')); ops = []; y = 800; };
  const text = (s, x, size, bold, color) => { ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color ? color.join(' ') + ' rg' : '0.1 0.1 0.1 rg'} ${x} ${y} Td (${pdfEsc(s)}) Tj ET`); };
  const need = h => { if(y - h < 60) newPage(); };
  ops.push(`${brand.join(' ')} rg 0 790 595 52 re f`); y = 812; text(snap.title, 40, 18, true, [1, 1, 1]); y = 774;
  if(training()){ text(L('TRAINING EXAMPLE - NOT A QUOTE', 'MFANO WA MAFUNZO - SI NUKUU'), 40, 11, true, [0.7, 0.1, 0.1]); y -= 18; }
  const name = (c && c.name) || snap.clientName; if(name){ text(L('Prepared for: ', 'Imeandaliwa kwa: ') + name, 40, 12, true); y -= 20; }
  text(new Date().toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' }), 40, 10, false, [0.4, 0.4, 0.4]); y -= 26;
  if(snap.hero && snap.hero.value){ text(swLabel(snap.hero.label || ''), 40, 11, false, [0.4, 0.4, 0.4]); y -= 22; text(snap.hero.value, 40, 22, true, brand); y -= 14; if(snap.hero.sub){ text(snap.hero.sub, 40, 9.5, false, [0.4, 0.4, 0.4]); y -= 14; } y -= 8; }
  (snap.items || []).forEach(i => { need(16); text(swLabel(i.l), 40, 10.5, false, [0.4, 0.4, 0.4]); text(i.v, 300, 11, true); y -= 17; });
  if(snap.lines && snap.lines.length){ y -= 8; need(30); text(L('Details', 'Maelezo'), 40, 12, true, brand); y -= 18; snap.lines.forEach(i => { const ls = wrapLine(swLabel(i.l), 46); need(ls.length * 13 + 6); ls.forEach((ln, k) => { text(ln, 40, 10, false); if(k === 0) text(i.v, 380, 10.5, true); y -= 13; }); y -= 3; }); }
  y -= 12; wrapLine(L('This is an estimate to help you decide. Bonuses and fund values are not guaranteed. The official illustration and policy terms apply.', 'Hii ni makadirio ya kukusaidia kuamua. Bonasi na thamani za mfuko hazihakikishiwi. Mchoro rasmi na masharti ya sera ndiyo yanayotumika.'), 95).forEach(l => { need(12); text(l, 40, 8.5, false, [0.4, 0.4, 0.4]); y -= 11; });
  if(typeof AGENT !== 'undefined' && AGENT){ y -= 8; need(30); text(`${L('Your advisor', 'Mshauri wako')}: ${AGENT.name}${AGENT.agencyCode ? ' (' + AGENT.agencyCode + ')' : ''}`, 40, 10.5, true); y -= 14; text(AGENT.phone + (AGENT.email ? ' - ' + AGENT.email : ''), 40, 10, false); }
  pages.push(ops.join('\n'));
  const objs = []; const add = s => { objs.push(s); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>'); add(''); add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  pages.forEach(p => { const cid = add(`<< /Length ${p.length} >>\nstream\n${p}\nendstream`); const pid = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cid} 0 R >>`); kids.push(pid + ' 0 R'); });
  objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length); for(let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return new Blob([bytes], { type: 'application/pdf' });
}
function fileName(snap, c){ return (((c && c.name) || snap.clientName || 'illustration') + '-' + snap.title).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() + '.pdf'; }
function shareSheet(snap, c){
  if(!snap) return;
  showPanel(L('Share with client', 'Shiriki na mteja'), body => {
    const phone = c && c.phone;
    body.innerHTML = `<div class="at-row" style="margin:0 0 10px;"><span style="font-size:13px;align-self:center;">${esc(L('Summary language', 'Lugha ya muhtasari'))}:</span><button class="at-btn sm ${lang() === 'en' ? 'pri' : ''}" data-l="en">English</button><button class="at-btn sm ${lang() === 'sw' ? 'pri' : ''}" data-l="sw">Kiswahili</button></div>
      <textarea id="shText" rows="14" style="font-size:13.5px;"></textarea>
      <div class="at-row"><button class="at-btn pri" id="shWa">WhatsApp</button><button class="at-btn" id="shPdf">${esc(L('PDF file', 'Faili ya PDF'))}</button><button class="at-btn" id="shCopy">${esc(L('Copy text', 'Nakili maandishi'))}</button><button class="at-btn" id="shSms">SMS</button></div>
      <p style="font-size:12.5px;color:var(--muted);margin-top:10px;">${esc(L('The summary does not replace the official printed illustration. Use "Print / Save as PDF" on the illustration screen for the signed document.', 'Muhtasari hauchukui nafasi ya mchoro rasmi uliochapishwa. Tumia "Chapisha / Hifadhi kama PDF" kwenye skrini ya mchoro kwa hati ya kusainiwa.'))}</p>`;
    const refresh = () => { $('#shText', body).value = summaryText(snap, c); };
    $$('[data-l]', body).forEach(b => b.addEventListener('click', () => { setLang(b.dataset.l); $$('[data-l]', body).forEach(x => x.classList.toggle('pri', x === b)); refresh(); }));
    refresh();
    $('#shWa', body).addEventListener('click', () => { recordQuote('share', snap); const n = waNumber(phone); window.open('https://wa.me/' + (n || '') + '?text=' + encodeURIComponent($('#shText', body).value), '_blank'); });
    $('#shSms', body).addEventListener('click', () => { recordQuote('share', snap); location.href = 'sms:' + (phone || '') + '?body=' + encodeURIComponent($('#shText', body).value); });
    $('#shCopy', body).addEventListener('click', async () => { try{ await navigator.clipboard.writeText($('#shText', body).value); toast(L('Copied.', 'Imenakiliwa.')); }catch(e){ $('#shText', body).select(); document.execCommand('copy'); toast(L('Copied.', 'Imenakiliwa.')); } });
    $('#shPdf', body).addEventListener('click', async () => {
      recordQuote('share', snap);
      const blob = buildPdf(snap, c), name = fileName(snap, c), file = new File([blob], name, { type: 'application/pdf' });
      try{ if(navigator.canShare && navigator.canShare({ files: [file] })){ await navigator.share({ files: [file], title: snap.title }); return; } }catch(e){ if(e && e.name === 'AbortError') return; }
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    });
  });
}

/* ---------- comparison tray ---------- */
const CMP_KEY = 'illustrator_cmp_v1';
const tray = () => get(K(CMP_KEY), []);
function addToTray(snap){
  const t = tray(); if(t.length >= 3){ toast(L('The tray holds 3 quotes. Remove one first.', 'Trei ina nukuu 3. Ondoa moja kwanza.')); return openCompareTray(); }
  t.push(snap); put(K(CMP_KEY), t); toast(L('Added to comparison (', 'Imeongezwa kwenye ulinganisho (') + t.length + ')');
}
function openCompareTray(){ const t = tray(); if(!t.length) return toast(L('Nothing in the comparison yet. Open an illustration and tap "Add to comparison".', 'Hakuna kitu kwenye ulinganisho. Fungua mchoro na ubonyeze "Ongeza kwenye ulinganisho".')); compareSheet(t, true); }
function compareSheet(snaps, isTray){
  showPanel(L('Compare', 'Linganisha'), body => {
    const labels = []; snaps.forEach(s => (s.items || []).concat(s.lines || []).forEach(i => { if(labels.indexOf(i.l) < 0) labels.push(i.l); }));
    const best = snaps.filter(s => s.hero && s.hero.num != null).reduce((m, s) => (m == null || s.hero.num > m ? s.hero.num : m), null);
    const val = (s, l) => { const it = (s.items || []).concat(s.lines || []).find(i => i.l === l); return it ? it.v : '—'; };
    body.innerHTML = `<div style="overflow:auto;"><table class="at-table"><thead><tr><th></th>${snaps.map(s => `<th>${esc(s.title)}${s.clientName ? '<br><span style="font-weight:400">' + esc(s.clientName) + '</span>' : ''}</th>`).join('')}</tr></thead><tbody>
      <tr><td><b>${esc(snaps[0].hero ? swLabel(snaps[0].hero.label) : '')}</b></td>${snaps.map(s => `<td class="${s.hero && s.hero.num != null && s.hero.num === best && snaps.length > 1 ? 'best' : ''}">${esc(s.hero ? s.hero.value : '')}</td>`).join('')}</tr>
      ${labels.map(l => `<tr><td>${esc(swLabel(l))}</td>${snaps.map(s => `<td>${esc(val(s, l))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p style="font-size:12.5px;color:var(--muted);">${esc(L('Green = highest projected figure. A higher projection is not automatically better: compare cover, charges, flexibility and what is guaranteed.', 'Kijani = kiasi kikubwa zaidi kinachokadiriwa. Kiasi kikubwa si bora moja kwa moja: linganisha bima, gharama, unyumbufu na kinachohakikishiwa.'))}</p>
      ${isTray ? `<div class="at-row"><button class="at-btn danger sm" id="cmpClear">${esc(L('Clear comparison', 'Futa ulinganisho'))}</button></div>` : ''}`;
    const cl = $('#cmpClear', body); if(cl) cl.addEventListener('click', () => { put(K(CMP_KEY), []); backPanel(); });
  });
}

/* ---------- what-if ---------- */
function whatIfSpec(){
  if(state.mode === 'diagnose' || state.step !== 5) return null;
  if(state.category === 'faida'){
    const f = state.faida, age = f.dob ? faidaAgeANB(f.dob) : null, lim = age != null ? faidaAgeMaxTermFor(f.product, age) : null;
    const tMax = Math.min(15, lim ? lim.maxTerm : 15);
    return { fields: [
      { key: 'amt', label: L('Premium per payment', 'Ada kwa malipo'), get: () => state.faida.periodicPremium, set: v => { state.faida.periodicPremium = v; }, min: Math.max(500, Math.round(f.periodicPremium * 0.4)), max: Math.round(f.periodicPremium * 2.5), step: 500, money: true },
      { key: 'term', label: L('Term (years)', 'Muda (miaka)'), get: () => state.faida.term, set: v => { state.faida.term = v; }, min: 5, max: Math.max(5, tMax), step: 1 } ] };
  }
  if(state.category === 'smartsave'){
    const s = state.smartsave, cfg = (SMARTSAVE.productConfig || {})[s.product] || {};
    const fields = [ { key: 'amt', label: s.mode === 'premium' ? L('Premium per payment', 'Ada kwa malipo') : s.mode === 'target' ? L('Target amount', 'Kiasi lengwa') : L('Sum assured', 'Kiasi cha bima'), get: () => state.smartsave.inputValue, set: v => { state.smartsave.inputValue = v; }, min: Math.max(1000, Math.round(s.inputValue * 0.4)), max: Math.round(s.inputValue * 2.5), step: s.mode === 'premium' ? 500 : 50000, money: true },
      { key: 'term', label: L('Term (years)', 'Muda (miaka)'), get: () => state.smartsave.term, set: v => { state.smartsave.term = v; }, min: cfg.termMin || 5, max: cfg.termMax || 20, step: 1 } ];
    if(s.bonusRate != null) fields.push({ key: 'rate', label: L('Assumed bonus rate', 'Kiwango cha bonasi kinachodhaniwa'), get: () => Math.round(state.smartsave.bonusRate * 1000) / 10, set: v => { state.smartsave.bonusRate = v / 100; }, min: 0, max: 8, step: 0.5, pct: true });
    return { fields };
  }
  const p = state.plan; if(!p) return null;
  const step = p.termStep || 1, minT = p.minTerm || 5; let maxT = p.maxTerm || 30; if(state.age != null && p.maxMatAge) maxT = Math.min(maxT, p.maxMatAge - state.age);
  const fields = [ { key: 'amt', label: state.mode === 'premium' ? L('Premium per payment', 'Ada kwa malipo') : state.mode === 'target' ? L('Target amount', 'Kiasi lengwa') : L('Sum assured', 'Kiasi cha bima'), get: () => state.inputValue, set: v => { state.inputValue = v; }, min: Math.max(1000, Math.round(state.inputValue * 0.4)), max: Math.round(state.inputValue * 2.5), step: state.mode === 'premium' ? 500 : 50000, money: true },
    { key: 'term', label: L('Term (years)', 'Muda (miaka)'), get: () => state.term, set: v => { state.term = v; }, min: minT, max: Math.max(minT, maxT), step } ];
  if(p.par) fields.push({ key: 'rate', label: L('Assumed bonus rate', 'Kiwango cha bonasi kinachodhaniwa'), get: () => Math.round(state.bonusRate * 1000) / 10, set: v => { state.bonusRate = v / 100; }, min: 0, max: 8, step: 0.5, pct: true });
  return { fields };
}
// Re-runs the real screen with changed inputs, reads the result, then puts everything back exactly as it was.
function whatIfRun(spec, vals){
  const saved = JSON.stringify(Object.assign({}, state, { plan: null })), plan = state.plan, sy = window.scrollY, orig = {};
  spec.fields.forEach(f => { orig[f.key] = f.get(); });
  quiet++;
  try{
    spec.fields.forEach(f => f.set(vals[f.key]));
    render();
    if($('#app .err')) return { error: txt($('#app .err')) };
    return scrapeIllustration();
  } finally {
    state = Object.assign(defaultState(), JSON.parse(saved), { plan });
    render(); window.scrollTo(0, sy); quiet--;
    try{ afterRender(); }catch(e){}
  }
}
function whatIfSheet(){
  const spec = whatIfSpec(); if(!spec) return;
  const base = scrapeIllustration();
  showPanel(L('What if…', 'Itakuwaje kama…'), body => {
    const vals = {}; spec.fields.forEach(f => { vals[f.key] = f.get(); });
    body.innerHTML = `<p style="font-size:13px;color:var(--muted);margin-top:0;">${esc(L('Move the sliders to see how the figures change. Nothing is saved or counted.', 'Sogeza vitelezi kuona jinsi namba zinavyobadilika. Hakuna kinachohifadhiwa wala kuhesabiwa.'))}</p>` +
      spec.fields.map(f => `<label>${esc(f.label)}: <b id="wv-${f.key}"></b></label><input type="range" id="wi-${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.get()}">`).join('') +
      `<div class="at-card" id="wiOut"></div><div class="at-row"><button class="at-btn" id="wiReset">${esc(L('Reset', 'Weka upya'))}</button><button class="at-btn pri" id="wiAdd">${esc(L('Add this to comparison', 'Ongeza hii kwenye ulinganisho'))}</button></div>`;
    let last = base, timer = null;
    const lab = f => (f.money ? fmt(vals[f.key]) : f.pct ? vals[f.key] + '%' : vals[f.key]);
    const paint = () => { spec.fields.forEach(f => { $('#wv-' + f.key, body).textContent = lab(f); });
      const out = $('#wiOut', body);
      if(last.error){ out.innerHTML = `<div style="color:#b3261e;font-size:14px;">${esc(last.error)}</div>`; return; }
      const d = (last.hero.num != null && base.hero.num != null) ? last.hero.num - base.hero.num : null;
      out.innerHTML = `<div style="font-size:12.5px;color:var(--muted);">${esc(swLabel(last.hero.label))}</div><div style="font-size:24px;font-weight:800;color:var(--brand);">${esc(last.hero.value)}</div>${d != null && d !== 0 ? `<div style="font-size:13px;color:${d > 0 ? '#1f6b3a' : '#b3261e'};">${d > 0 ? '+' : '−'}${esc(fmt(Math.abs(d)))} ${esc(L('compared with the current illustration', 'ikilinganishwa na mchoro wa sasa'))}</div>` : ''}<table class="at-table" style="margin-top:8px;">${last.items.concat(last.lines.slice(0, 5)).map(i => `<tr><td>${esc(swLabel(i.l))}</td><td><b>${esc(i.v)}</b></td></tr>`).join('')}</table>`; };
    const run = () => { clearTimeout(timer); timer = setTimeout(() => { last = whatIfRun(spec, vals); last.title = base.title; paint(); }, 120); };
    spec.fields.forEach(f => { $('#wi-' + f.key, body).addEventListener('input', e => { vals[f.key] = Number(e.target.value); paint(); run(); }); });
    $('#wiReset', body).addEventListener('click', () => { spec.fields.forEach(f => { vals[f.key] = f.get(); $('#wi-' + f.key, body).value = vals[f.key]; }); last = base; paint(); });
    $('#wiAdd', body).addEventListener('click', () => { if(last.error) return; const s = Object.assign({}, last, { id: uid(), at: Date.now(), title: base.title + ' (' + L('what-if', 'ikiwa') + ')' }); addToTray(s); });
    paint();
  });
}

/* ---------- pitch & objection helper ---------- */
const PITCH = [
  { cat: 'Openers', t: ['Starting the conversation', 'Kuanza mazungumzo'], en: 'Before we talk about any plan, may I ask a few questions about your family and what you are working toward? It takes about five minutes, and then I can show you what fits.', sw: 'Kabla hatujazungumzia mpango wowote, naomba nikuulize maswali machache kuhusu familia yako na unachokifanyia kazi. Inachukua takriban dakika tano, kisha nitakuonyesha kinachofaa.', tip: ['Use the Client Needs Diagnosis. Listen more than you talk.', 'Tumia Uchambuzi wa Mahitaji ya Mteja. Sikiliza kuliko kuzungumza.'] },
  { cat: 'Trust', t: ['"Insurance companies don\'t pay claims."', '"Kampuni za bima hazilipi madai."'], en: 'That worry is common, and it is fair to ask. Claims are paid when the policy terms are met, so the best protection is to be accurate and complete on the application and to read the exclusions together. I will show you what is covered and what is not, and how a claim is made, before you decide.', sw: 'Wasiwasi huo ni wa kawaida na ni haki kuuliza. Madai hulipwa pale masharti ya sera yanapotimizwa, kwa hivyo ulinzi bora ni kujaza fomu kwa usahihi na kamili na kusoma vighairi pamoja. Nitakuonyesha kinachohusika na kisichohusika, na jinsi dai linavyowasilishwa, kabla hujaamua.', tip: ['Never promise a claim will be paid. Show the claims process document.', 'Usiahidi kuwa dai litalipwa. Onyesha hati ya mchakato wa madai.'] },
  { cat: 'Money', t: ['"I can\'t afford it."', '"Siwezi kumudu."'], en: 'Let us start from what you can comfortably set aside each month, not from a product. Even a small amount works, and we can match the payment frequency to when your income arrives. Which amount would you hardly notice leaving your account?', sw: 'Tuanze na kiasi unachoweza kuweka kando kila mwezi bila kuumia, si na bidhaa. Hata kiasi kidogo kinafaa, na tunaweza kulinganisha mzunguko wa malipo na unapopata kipato. Ni kiasi gani ambacho hungehisi kikiondoka kwenye akaunti yako?', tip: ['Use the app in "premium" mode to start from their budget. Do not push a premium they cannot keep paying: a lapsed policy can cost more than it earned.', 'Tumia programu kwa hali ya "ada" kuanzia bajeti yao. Usisukume ada wasiyoweza kuendelea kulipa: sera iliyokufa inaweza kugharimu zaidi kuliko ilivyopata.'] },
  { cat: 'Timing', t: ['"I\'ll think about it."', '"Nitafikiria."'], en: 'Of course, it is an important decision. Which part would you like to think about: the amount, the term, or how it works? I will leave you a summary to look at at home, and I can call you on [day] to answer questions.', sw: 'Sawa kabisa, ni uamuzi muhimu. Ni sehemu gani ungependa kufikiria: kiasi, muda, au jinsi inavyofanya kazi? Nitakuachia muhtasari uusome nyumbani, na nitakupigia simu [siku] kujibu maswali.', tip: ['Save the quote to the client with a follow-up date in the app.', 'Hifadhi nukuu kwa mteja pamoja na tarehe ya kufuatilia kwenye programu.'] },
  { cat: 'Money', t: ['"I already save in a SACCO / chama / bank."', '"Tayari naweka akiba SACCO / chama / benki."'], en: 'That is a good habit and I would keep it. This is meant to sit alongside it: it adds life cover so the goal is still funded if something happens to you, and the fixed commitment helps you avoid dipping into the money. Would your SACCO savings complete the goal if you were not around?', sw: 'Hiyo ni tabia nzuri na ningeishikilia. Hii inaongezea, si kuchukua nafasi: inaongeza bima ya maisha ili lengo likamilike kama jambo likikutokea, na ahadi ya kudumu inakusaidia kutotoa pesa hizo. Je, akiba yako ya SACCO ingetosha kukamilisha lengo kama hungekuwepo?', tip: ['Do not run down the client\'s SACCO or chama. Position the plan as protection plus discipline.', 'Usidharau SACCO au chama cha mteja. Eleza mpango kama ulinzi pamoja na nidhamu.'] },
  { cat: 'Timing', t: ['"I\'m young, I don\'t need it yet."', '"Mimi ni kijana, sihitaji bado."'], en: 'Starting young is the cheapest time: the cost is based on your age today and you keep that advantage for the whole term. Does anyone rely on your income, like parents or siblings, or is there a loan someone else would have to repay?', sw: 'Kuanza ukiwa kijana ndio wakati wa gharama nafuu zaidi: ada inategemea umri wako wa leo na unaendelea kunufaika kwa muda wote wa mkataba. Je, kuna mtu anayetegemea kipato chako, kama wazazi au ndugu, au mkopo ambao mtu mwingine angelazimika kulipa?', tip: ['Ask first. Do not assume dependants.', 'Uliza kwanza. Usidhanie wanaotegemea.'] },
  { cat: 'Product', t: ['"My employer already covers me."', '"Mwajiri wangu tayari ananilinda."'], en: 'Good, that is a solid base. Employer cover usually ends when you leave the job or retire, and is often only a multiple of salary. Shall we check how much it would leave your family, and what would continue if you changed jobs?', sw: 'Vizuri, huo ni msingi imara. Bima ya mwajiri kwa kawaida huisha ukiacha kazi au ukistaafu, na mara nyingi ni mara chache tu za mshahara. Tuangalie ingeacha kiasi gani kwa familia yako, na nini kingeendelea ukibadilisha kazi?', tip: ['Use the needs-gap chart and enter the existing cover.', 'Tumia chati ya pengo la mahitaji na uweke bima iliyopo.'] },
  { cat: 'Product', t: ['"Can I get my money back if I stop?"', '"Naweza kurudishiwa pesa nikiacha?"'], en: 'Let me be clear: these plans are designed to be kept for the full term. If you stop early you may get back less than you paid, or nothing, depending on the plan and how long it ran. I will show you the figures for your plan so you decide with that in mind. If you may need the money before the end, we should look at a more flexible option.', sw: 'Nikuwie wazi: mipango hii imeundwa kudumishwa kwa muda wote. Ukiacha mapema unaweza kurudishiwa kidogo kuliko ulicholipa, au hakuna, kulingana na mpango na muda uliodumu. Nikuonyeshe takwimu za mpango wako uamue ukizingatia hilo. Ukihitaji pesa kabla ya mwisho, tuangalie chaguo lenye unyumbufu zaidi.', tip: ['Disclose surrender terms honestly. Check the plan rules in Help > Products.', 'Eleza masharti ya kusitisha kwa uaminifu. Angalia kanuni za mpango kwenye Msaada > Bidhaa.'] },
  { cat: 'Product', t: ['"Are the bonuses or returns guaranteed?"', '"Bonasi au faida zimehakikishiwa?"'], en: 'No, and I want you to know that. Illustrated bonuses and fund values are estimates and can be higher or lower. What is guaranteed is written in the policy. I will also show you the illustration at a lower assumed rate so you see the range.', sw: 'Hapana, na nataka ujue hilo. Bonasi na thamani za mfuko zilizoonyeshwa ni makadirio na zinaweza kuwa juu au chini. Kinachohakikishiwa kimeandikwa kwenye sera. Nitakuonyesha pia mchoro wenye kiwango cha chini ili uone wigo.', tip: ['Use the What-if sliders to show a lower bonus rate.', 'Tumia vitelezi vya "Itakuwaje kama" kuonyesha kiwango cha chini cha bonasi.'] },
  { cat: 'Timing', t: ['"I need to ask my spouse."', '"Lazima nimuulize mwenzangu."'], en: 'That is sensible, it affects the whole household. Would you like me to prepare a short summary you can share on WhatsApp, and I can join a call or visit when you are both available?', sw: 'Hiyo ni busara, inaathiri kaya nzima. Ungependa nikuandalie muhtasari mfupi wa kutuma kwa WhatsApp, nami nijiunge kwenye simu au ziara mkiwa wote mnapatikana?', tip: ['Use Share > WhatsApp and set a follow-up date.', 'Tumia Shiriki > WhatsApp na weka tarehe ya kufuatilia.'] },
  { cat: 'Product', t: ['"Unit-linked investing is risky."', '"Uwekezaji wa mfuko una hatari."'], en: 'The value can go down as well as up, so the plan should suit how you feel about risk. Let us check: if the fund value dropped for a year, would that worry you? If so, a plan with a more predictable structure may fit better, and we can compare them side by side.', sw: 'Thamani inaweza kushuka pamoja na kupanda, kwa hivyo mpango unapaswa kuendana na uvumilivu wako wa hatari. Tuangalie: ikiwa thamani ya mfuko ingeshuka kwa mwaka mmoja, ungekuwa na wasiwasi? Kama ndiyo, mpango wenye muundo unaotabirika zaidi unaweza kukufaa, na tunaweza kuulinganisha kando kwa kando.', tip: ['Use Compare. Match the product to the client\'s comfort with risk, not to what pays you more.', 'Tumia Linganisha. Linganisha bidhaa na uvumilivu wa mteja wa hatari, si na kinacholipa zaidi.'] },
  { cat: 'Money', t: ['"What does tax relief mean for me?"', '"Nafuu ya kodi inamaanisha nini kwangu?"'], en: 'If you pay tax to KRA, qualifying premiums can reduce your tax: 15% of the premium, up to a yearly limit. It helps, but it is not the reason to buy; the plan should make sense for your goal first. Shall I show the figure for your premium?', sw: 'Ukilipa kodi kwa KRA, ada zinazostahiki zinaweza kupunguza kodi yako: asilimia 15 ya ada, hadi kikomo cha kila mwaka. Inasaidia, lakini si sababu ya kununua; mpango unapaswa kwanza kuwa na maana kwa lengo lako. Nikuonyeshe kiasi kwa ada yako?', tip: ['Tick "Apply tax relief" only for clients who pay tax.', 'Weka alama ya "Tumia nafuu ya kodi" kwa wateja wanaolipa kodi pekee.'] },
  { cat: 'Closing', t: ['Closing: ready to proceed', 'Kufunga: tayari kuendelea'], en: 'Based on what you told me, this plan works toward your goal at the premium we agreed. Before you sign, let us go through what is guaranteed, what is not, and what happens if you miss a payment. Is there any question you would like answered first?', sw: 'Kulingana na ulivyoniambia, mpango huu unaelekea lengo lako kwa ada tuliyokubaliana. Kabla hujasaini, tupitie kinachohakikishiwa, kisichohakikishiwa, na kinachotokea ukikosa malipo. Je, kuna swali ungependa lijibiwe kwanza?', tip: ['Give the client the official printed illustration to sign. The summary is not a contract.', 'Mpe mteja mchoro rasmi uliochapishwa asaini. Muhtasari si mkataba.'] }
];
function openPitch(){
  showPanel(L('Pitch & objections', 'Hoja na pingamizi'), body => {
    const cats = ['All'].concat(Array.from(new Set(PITCH.map(p => p.cat)))); let cat = 'All', q = '';
    body.innerHTML = `<input id="pQ" type="search" placeholder="${esc(L('Search e.g. afford, SACCO, claims', 'Tafuta mfano: kumudu, SACCO, madai'))}"><div class="at-row" id="pCats" style="margin:0 0 8px;"></div><div id="pList"></div><p style="font-size:12px;color:var(--muted);">${esc(L('Suggested wording only. Adapt it to the client, never promise guaranteed returns, and follow the company\'s sales conduct rules. The Swahili text is a draft: ask a colleague to review it before wide use.', 'Maneno yanayopendekezwa tu. Yarekebishe kulingana na mteja, usiahidi faida zilizohakikishwa, na ufuate kanuni za mauzo za kampuni. Maandishi ya Kiswahili ni rasimu: mwombe mwenzako ayakague kabla ya matumizi mapana.'))}</p>`;
    const draw = () => {
      $('#pCats', body).innerHTML = cats.map(c => `<button class="at-btn sm ${c === cat ? 'pri' : ''}" data-c="${esc(c)}">${esc(c === 'All' ? L('All', 'Yote') : c)}</button>`).join('');
      $$('[data-c]', body).forEach(b => b.addEventListener('click', () => { cat = b.dataset.c; draw(); }));
      const i = lang() === 'sw' ? 1 : 0;
      const list = PITCH.filter(p => (cat === 'All' || p.cat === cat) && (!q || (p.t[0] + p.t[1] + p.en + p.sw).toLowerCase().indexOf(q) >= 0));
      $('#pList', body).innerHTML = list.length ? list.map((p, n) => `<div class="at-card"><h3>${esc(p.t[i])}</h3><div style="font-size:14.5px;line-height:1.5;">${esc(i ? p.sw : p.en)}</div><div style="font-size:12.5px;color:var(--muted);margin-top:8px;"><b>${esc(L('Tip', 'Kidokezo'))}:</b> ${esc(p.tip[i])}</div><div class="at-row"><button class="at-btn sm" data-cp="${PITCH.indexOf(p)}">${esc(L('Copy', 'Nakili'))}</button><button class="at-btn sm" data-sw="${PITCH.indexOf(p)}">${esc(i ? 'English' : 'Kiswahili')}</button></div></div>`).join('') : `<p style="color:var(--muted)">${esc(L('Nothing matches.', 'Hakuna kinacholingana.'))}</p>`;
      $$('[data-cp]', body).forEach(b => b.addEventListener('click', async () => { const p = PITCH[+b.dataset.cp]; try{ await navigator.clipboard.writeText(i ? p.sw : p.en); toast(L('Copied.', 'Imenakiliwa.')); }catch(e){} }));
      $$('[data-sw]', body).forEach(b => b.addEventListener('click', () => { setLang(i ? 'en' : 'sw'); draw(); }));
    };
    $('#pQ', body).addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); draw(); });
    draw();
  });
}

/* ---------- training mode ---------- */
const SCENARIOS = [
  { id: 'grace', name: 'Grace, 34 — school fees', story: 'Grace is a married teacher with two young children. She wants to be sure school fees are covered over the next 11–15 years and can set aside KES 10,000 a month. She has no life cover.', expect: ['Smart Scholar', 'Faida Elimu'], lesson: 'Education is the stated goal and she has children, so the education-focused plans lead. Compare Smart Scholar (guaranteed structure) with Faida Elimu (investment-linked) against her comfort with risk.',
    diag: { age: 34, gender: 'Female', income: 'KES 100,001–200,000', maritalStatus: 'married', dependants: '3', childrenCount: 2, hasCover: 'no', liabilities: ['No significant debt'], savingsConsistency: 'usually', liquidityNeed: 'low', protectionPriority: 'important', existingInvestments: 'none' }, goal: { goal: 'education', horizon: '11–15 years', freq: 'Monthly', inputMode: 'premium', monthlySaving: 10000 } },
  { id: 'otieno', name: 'Otieno, 41 — protecting a family', story: 'Otieno is the only earner for a wife and three children and has a KES 4 million mortgage. He has no cover and wants something that protects his family for life and leaves something behind.', expect: ['Faida Maisha'], lesson: 'High dependants, debt and no cover push protection to the top. Whole-life protection (Faida Maisha) fits; check that the premium is affordable before talking about growth.',
    diag: { age: 41, gender: 'Male', income: 'KES 200,001–500,000', maritalStatus: 'married', dependants: '5+', childrenCount: 3, hasCover: 'no', liabilities: ['Mortgage'], debtAmount: 4000000, savingsConsistency: 'usually', liquidityNeed: 'low', protectionPriority: 'high', existingInvestments: 'some' }, goal: { goal: 'legacy', horizon: '16–20 years', freq: 'Monthly', inputMode: 'premium', monthlySaving: 15000 } },
  { id: 'wanjiku', name: 'Wanjiku, 29 — home deposit', story: 'Wanjiku is single with no dependants. She wants a house deposit in 6–10 years but finds it hard to save and tends to spend what is in her account.', expect: ['Fanaka', 'Smart Save'], lesson: 'Her real need is discipline, not protection. A fixed-term plan that is hard to dip into helps. Be honest that early exit costs her.',
    diag: { age: 29, gender: 'Female', income: 'KES 50,000–100,000', maritalStatus: 'single', dependants: '0', childrenCount: 0, hasCover: 'no', liabilities: ['No significant debt'], savingsConsistency: 'rarely', liquidityNeed: 'discipline', protectionPriority: 'low', existingInvestments: 'none' }, goal: { goal: 'home', horizon: '6–10 years', freq: 'Monthly', inputMode: 'premium', monthlySaving: 8000 } },
  { id: 'hassan', name: 'Hassan, 38 — flexible investing', story: 'Hassan owns a business with irregular cash flow. He wants growth with the option to access his money, and he is comfortable with ups and downs.', expect: ['Faida Elite'], lesson: 'High liquidity need and an investment mindset point to the flexible, unit-linked option. Explain the risk that the fund value can fall.',
    diag: { age: 38, gender: 'Male', income: 'KES 500,001–1M', maritalStatus: 'married', dependants: '1', childrenCount: 0, hasCover: 'yes', coverAmount: 5000000, liabilities: ['Business loan'], debtAmount: 1500000, savingsConsistency: 'always', liquidityNeed: 'high', protectionPriority: 'important', existingInvestments: 'none' }, goal: { goal: 'wealth', horizon: '6–10 years', freq: 'Monthly', inputMode: 'premium', monthlySaving: 50000 } }
];
const SCN_KEY = 'illustrator_scn_v1';
function startScenario(sc){
  state = defaultState(); state.mode = 'diagnose'; state.dStep = 1;
  Object.assign(state.diag, JSON.parse(JSON.stringify(sc.diag))); state.diag.goals = [JSON.parse(JSON.stringify(sc.goal))];
  put(SCN_KEY, { id: sc.id }); closePanel(); goDiagnose(1);
}
function openScenarios(){
  showPanel(L('Practice with a sample client', 'Fanya mazoezi na mteja wa mfano'), body => {
    const done = get(K('illustrator_scn_done_v1'), {});
    body.innerHTML = `<p style="font-size:13.5px;margin-top:0;">${esc(L('Pick a client, read the story, run the diagnosis, then say which product you would recommend. The app tells you how its scoring sees it. Training mode must be on, so nothing is recorded.', 'Chagua mteja, soma hadithi, fanya uchambuzi, kisha sema bidhaa ungependekeza. Programu inakueleza jinsi alama zake zinavyoona. Hali ya mafunzo lazima iwe imewashwa, kwa hivyo hakuna kinachorekodiwa.'))}</p>` +
      SCENARIOS.map(s => `<div class="at-item" data-sc="${s.id}"><div class="t">${esc(s.name)} ${done[s.id] ? `<span class="at-chip green">${esc(L('Done', 'Imekamilika'))}</span>` : ''}</div><div class="s">${esc(s.story)}</div></div>`).join('');
    $$('[data-sc]', body).forEach(e => e.addEventListener('click', () => { if(!training()) setTraining(true); startScenario(SCENARIOS.find(s => s.id === e.dataset.sc)); }));
  });
}

/* ---------- diagnosis results: why this plan, needs gap, training check ---------- */
const INCOME_MID = { 'Below KES 50,000': 35000, 'KES 50,000–100,000': 75000, 'KES 100,001–200,000': 150000, 'KES 200,001–500,000': 350000, 'KES 500,001–1M': 750000, 'Above KES 1M': 1200000 };
let gapYears = null;
function defaultGapYears(d){ const n = { '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5+': 5 }[d.dependants] || 0; return n === 0 ? 5 : n <= 2 ? 8 : 10; }
function gapHtml(d){
  const mid = INCOME_MID[d.income]; if(!mid) return `<div class="at-card"><h3>${esc(L('Cover gap', 'Pengo la bima'))}</h3><div style="font-size:13.5px;color:var(--muted);">${esc(L('Add the client\'s income band to see the cover gap.', 'Weka kiwango cha kipato cha mteja kuona pengo la bima.'))}</div></div>`;
  if(gapYears == null) gapYears = defaultGapYears(d);
  const debt = d.debtAmount || 0, need = mid * 12 * gapYears + debt, have = d.hasCover === 'yes' ? (d.coverAmount || 0) : 0, gap = Math.max(0, need - have), pct = need ? Math.round(have / need * 100) : 0;
  return `<div class="at-card" id="atGap"><h3>${esc(L('Cover gap (rule of thumb)', 'Pengo la bima (kanuni ya kidole gumba)'))}</h3>
    <div style="font-size:13px;color:var(--muted);">${esc(L('Cover needed', 'Bima inayohitajika'))}: ${esc(L('income', 'kipato'))} ${esc(fmt(mid))} × 12 × <b>${gapYears}</b> ${esc(L('years', 'miaka'))}${debt ? ' + ' + esc(L('debts', 'madeni')) + ' ' + esc(fmt(debt)) : ''}</div>
    <div class="at-row" style="margin:6px 0;"><button class="at-btn sm" id="gapMinus" aria-label="Fewer years">−</button><button class="at-btn sm" id="gapPlus" aria-label="More years">+</button><span style="font-size:12.5px;color:var(--muted);align-self:center;">${esc(L('years of income to replace', 'miaka ya kipato cha kubadilisha'))}</span></div>
    <div style="font-size:13px;margin-top:8px;">${esc(L('Needed', 'Inayohitajika'))}: <b>${esc(fmt(need))}</b>${bar(100)}</div>
    <div style="font-size:13px;">${esc(L('Existing cover', 'Bima iliyopo'))}: <b>${esc(fmt(have))}</b>${bar(pct, pct >= 100 ? 'ok' : '')}</div>
    <div style="font-size:15px;margin-top:6px;">${gap > 0 ? `${esc(L('Shortfall', 'Pungufu'))}: <b style="color:#b3261e;">${esc(fmt(gap))}</b>` : `<b style="color:#1f6b3a;">${esc(L('No shortfall on this rule of thumb.', 'Hakuna pungufu kwa kanuni hii.'))}</b>`}</div>
    <div style="font-size:12px;color:var(--muted);margin-top:6px;">${esc(L('A quick guide only, using the middle of the income band. Not a full needs analysis.', 'Mwongozo wa haraka tu, ukitumia kati ya kiwango cha kipato. Si uchambuzi kamili wa mahitaji.'))}</div></div>`;
}
function goalGapHtml(d, calc){
  const g = d.goals[0] || {}; if(!g.targetAmount) return '';
  const saved = g.savedAmount || 0; const best = calc.filter(c => c.eligible && c.maturity).sort((a, b) => b.maturity - a.maturity)[0];
  const proj = best ? Math.round(best.maturity) : 0, total = saved + proj, short = Math.max(0, g.targetAmount - total);
  return `<div class="at-card"><h3>${esc(L('Goal gap', 'Pengo la lengo'))}</h3><div style="font-size:13px;">${esc(L('Target', 'Lengo'))}: <b>${esc(fmt(g.targetAmount))}</b>${bar(100)}</div><div style="font-size:13px;">${esc(L('Already saved', 'Tayari imehifadhiwa'))} + ${esc(L('projected by', 'inayokadiriwa na'))} ${esc(best ? best.name : '—')}: <b>${esc(fmt(total))}</b>${bar(Math.round(total / g.targetAmount * 100), short === 0 ? 'ok' : '')}</div><div style="font-size:14px;margin-top:6px;">${short > 0 ? `${esc(L('Shortfall', 'Pungufu'))}: <b style="color:#b3261e;">${esc(fmt(short))}</b> — ${esc(L('consider a higher premium or a longer term.', 'fikiria ada ya juu au muda mrefu zaidi.'))}` : `<b style="color:#1f6b3a;">${esc(L('On track, on these projections.', 'Mko njiani, kwa makadirio haya.'))}</b>`}</div></div>`;
}
function whyHtml(fit){
  const pos = (fit.factors || []).filter(f => f.pts > 0).slice(0, 4), neg = (fit.factors || []).filter(f => f.pts < 0).slice(0, 2), max = Math.max(1, ...pos.map(f => f.pts));
  if(!pos.length && !neg.length) return '';
  return `<details class="at-why"><summary>${esc(L('Why this plan?', 'Kwa nini mpango huu?'))}</summary>${pos.map(f => `<div style="font-size:13px;margin-top:6px;">${esc(f.label)} <span style="color:var(--muted)">(+${f.pts})</span>${bar(Math.round(f.pts / max * 100))}</div>`).join('')}${neg.length ? `<div style="font-size:12.5px;color:#8a5a00;margin-top:8px;">${esc(L('Held back by', 'Inapunguzwa na'))}: ${neg.map(f => esc(f.label) + ' (' + f.pts + ')').join('; ')}</div>` : ''}<div style="font-size:12px;color:var(--muted);margin-top:8px;">${esc(L('Fit score', 'Alama ya kufaa'))}: ${fit.score}. ${esc(L('A guide for the advisor conversation, not a recommendation.', 'Mwongozo kwa mazungumzo ya mshauri, si pendekezo.'))}</div></details>`;
}
function trainingCard(fits){
  const cur = get(SCN_KEY, null), sc = cur && SCENARIOS.find(s => s.id === cur.id); if(!sc || !training()) return '';
  return `<div class="at-card" id="atTrain" style="border-color:#b3261e;"><h3>${esc(L('Training: your call', 'Mafunzo: uamuzi wako'))} — ${esc(sc.name)}</h3><div style="font-size:13.5px;">${esc(L('Which product would you recommend to this client?', 'Ungependekeza bidhaa gani kwa mteja huyu?'))}</div><div class="at-row">${PRODUCT_ENGINES.map(n => `<button class="at-btn sm" data-pick="${esc(n)}">${esc(n)}</button>`).join('')}</div><div id="atTrainOut" style="margin-top:10px;font-size:13.5px;line-height:1.5;"></div></div>`;
}
function wireTraining(fits){
  const cur = get(SCN_KEY, null), sc = cur && SCENARIOS.find(s => s.id === cur.id), card = $('#atTrain'); if(!card || !sc) return;
  $$('[data-pick]', card).forEach(b => b.addEventListener('click', () => {
    const pick = b.dataset.pick, ok = sc.expect.indexOf(pick) >= 0, top = fits.slice(0, 3).map(f => f.name + ' (' + f.score + ')').join(', ');
    $('#atTrainOut', card).innerHTML = `<b style="color:${ok ? '#1f6b3a' : '#b3261e'};">${ok ? esc(L('Good call.', 'Uamuzi mzuri.')) : esc(L('Not the closest fit.', 'Si inayofaa zaidi.'))}</b> ${esc(L('The strongest fits were', 'Zilizofaa zaidi ni'))}: ${esc(sc.expect.join(' / '))}. ${esc(L('The app\'s own ranking', 'Mpangilio wa programu'))}: ${esc(top)}.<br><span style="color:var(--muted)">${esc(sc.lesson)}</span>`;
    const done = get(K('illustrator_scn_done_v1'), {}); done[sc.id] = ok ? 'good' : 'tried'; put(K('illustrator_scn_done_v1'), done);
  }));
}
function decorateDiag(){
  const d = state.diag, needs = computeNeedScores(d), fits = scoreProducts(d, needs), calc = runAllProducts(d);
  const firstCard = $('#app .card'); const html = gapHtml(d) + goalGapHtml(d, calc) + trainingCard(fits);
  if(firstCard && !$('#atGap')) firstCard.insertAdjacentHTML('afterend', html);
  $$('#app .illustrateBtn').forEach(btn => { const fit = fits.find(f => f.name === btn.dataset.product); const card = btn.closest('.card'); if(fit && card && !$('.at-why', card)){ const h = whyHtml(fit); if(h) btn.closest('.btn-row').insertAdjacentHTML('beforebegin', h); } });
  const minus = $('#gapMinus'), plus = $('#gapPlus');
  const redraw = () => { const old = $('#atGap'); if(old){ const t = document.createElement('div'); t.innerHTML = gapHtml(d); old.replaceWith(t.firstElementChild); wireGap(); } };
  function wireGap(){ const m = $('#gapMinus'), p = $('#gapPlus'); if(m) m.addEventListener('click', () => { gapYears = Math.max(1, (gapYears || defaultGapYears(d)) - 1); redraw(); }); if(p) p.addEventListener('click', () => { gapYears = Math.min(30, (gapYears || defaultGapYears(d)) + 1); redraw(); }); }
  wireGap(); wireTraining(fits); decorateResult();
}

/* ---------- result screens: share / save / compare / what-if ---------- */
function decorateResult(){
  const printBtn = $('#printBtn'); if(!printBtn || $('#atTools') || $('#app .err')) return;
  const row = printBtn.closest('.btn-row') || printBtn.parentElement; const canWhatIf = state.mode !== 'diagnose' && !!whatIfSpec();
  const html = `<div class="at-card" id="atTools"><h3>${esc(L('Client tools', 'Zana za mteja'))}</h3><div class="at-row"><button class="at-btn pri" id="tShare">${esc(L('Share with client', 'Shiriki na mteja'))}</button><button class="at-btn" id="tSave">${esc(L('Save to client', 'Hifadhi kwa mteja'))}</button><button class="at-btn" id="tCmp">${esc(L('Add to comparison', 'Ongeza kwenye ulinganisho'))}${tray().length ? ' (' + tray().length + ')' : ''}</button>${canWhatIf ? `<button class="at-btn" id="tWhat">${esc(L('What-if', 'Itakuwaje kama'))}</button>` : ''}</div></div>`;
  row.insertAdjacentHTML('beforebegin', html);
  $('#tShare').addEventListener('click', () => shareSheet(snapNow(), null));
  $('#tSave').addEventListener('click', () => saveToClient(snapNow()));
  $('#tCmp').addEventListener('click', () => { addToTray(snapNow()); const b = $('#tCmp'); if(b) b.textContent = L('Add to comparison', 'Ongeza kwenye ulinganisho') + ' (' + tray().length + ')'; });
  const w = $('#tWhat'); if(w) w.addEventListener('click', whatIfSheet);
}

/* ---------- home screen ---------- */
function decorateHome(){
  const grid = $('#app .mode-grid'); if(!grid || $('#atHome')) return;
  let top = '';
  const draft = getDraft();
  if(draft) top += `<div class="at-banner info" id="atDraft"><span>${esc(L('Unfinished work', 'Kazi isiyokamilika'))}: <b>${esc(draft.label)}</b> (${new Date(draft.at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })})</span><span><button class="at-btn sm pri" id="atResume">${esc(L('Resume', 'Endelea'))}</button> <button class="at-btn sm" id="atDiscard">${esc(L('Discard', 'Futa'))}</button></span></div>`;
  const due = dueCount();
  if(due) top += `<div class="at-banner warn" id="atDue"><span><b>${due}</b> ${esc(L('client follow-up(s) due', 'ufuatiliaji wa wateja unahitajika'))}</span><button class="at-btn sm" id="atDueGo">${esc(L('Open', 'Fungua'))}</button></div>`;
  if(window.__ratesPending) top += `<div class="at-banner info"><span>${esc(L('New product rates were downloaded. They apply the next time the app starts.', 'Viwango vipya vya bidhaa vimepakuliwa. Vitatumika programu itakapofunguliwa tena.'))}</span><button class="at-btn sm pri" id="atRatesGo">${esc(L('Apply now', 'Tumia sasa'))}</button></div>`;
  top += standingHtml();
  grid.insertAdjacentHTML('beforebegin', top);
  const t = tray().length;
  grid.insertAdjacentHTML('afterend', `<div class="at-home" id="atHome">
    <button class="at-tile" id="hClients"><b>${esc(L('My clients', 'Wateja wangu'))}</b><span>${esc(L('Records, follow-ups, saved quotes', 'Rekodi, ufuatiliaji, nukuu zilizohifadhiwa'))}</span>${due ? `<i class="at-badge">${due}</i>` : ''}</button>
    <button class="at-tile" id="hCmp"><b>${esc(L('Compare', 'Linganisha'))}${t ? ' (' + t + ')' : ''}</b><span>${esc(L('Quotes side by side', 'Nukuu kando kwa kando'))}</span></button>
    <button class="at-tile" id="hPitch"><b>${esc(L('Pitch & objections', 'Hoja na pingamizi'))}</b><span>${esc(L('What to say, in English and Kiswahili', 'Cha kusema, kwa Kiingereza na Kiswahili'))}</span></button>
    <button class="at-tile" id="hTrain"><b>${esc(L('Training mode', 'Hali ya mafunzo'))}: ${training() ? esc(L('ON', 'IMEWASHWA')) : esc(L('off', 'imezimwa'))}</b><span>${esc(training() ? L('Tap for sample clients', 'Bonyeza kwa wateja wa mfano') : L('Practise without recording anything', 'Fanya mazoezi bila kurekodi'))}</span></button>
    <button class="at-tile" id="hLang"><b>${esc(L('Language', 'Lugha'))}: ${lang() === 'sw' ? 'Kiswahili' : 'English'}</b><span>${esc(L('For summaries, pitch helper and client tools', 'Kwa muhtasari, hoja na zana za mteja'))}</span></button>
  </div>`);
  const on = (id, fn) => { const el = $(id); if(el) el.addEventListener('click', fn); };
  on('#hClients', () => openClients()); on('#hCmp', openCompareTray); on('#hPitch', openPitch);
  on('#hTrain', () => { if(training()) openScenarios(); else { setTraining(true); render(); toast(L('Training mode is on. Nothing is recorded or sent.', 'Hali ya mafunzo imewashwa. Hakuna kinachorekodiwa wala kutumwa.')); } });
  on('#hLang', () => { setLang(lang() === 'sw' ? 'en' : 'sw'); render(); });
  on('#atResume', resumeDraft); on('#atDiscard', () => { discardDraft(); render(); });
  on('#atDueGo', () => openClients('due')); on('#atRatesGo', () => location.reload());
}
function syncTrainBanner(){
  let b = $('#atTrainBanner');
  if(training()){ if(!b){ b = document.createElement('div'); b.id = 'atTrainBanner'; b.className = 'at-train'; b.style.cursor = 'pointer'; b.addEventListener('click', () => { if(confirmBox(L('Turn training mode off?', 'Zima hali ya mafunzo?'))){ setTraining(false); render(); } }); document.body.appendChild(b); } b.textContent = L('TRAINING MODE — nothing is recorded or sent. Tap to turn off.', 'HALI YA MAFUNZO — hakuna kinachorekodiwa wala kutumwa. Bonyeza kuzima.'); }
  else if(b) b.remove();
}

/* ---------- wiring ---------- */
function isResultScreen(){ return state.mode !== 'home' && state.mode !== 'diagnose' && state.step === 5; }
function afterRender(){
  injectCss(); syncTrainBanner(); document.body.classList.toggle('at-training', training());
  if(quiet > 0 || !loggedIn()) return;
  if(state.mode === 'home') return decorateHome();
  saveDraft();
  if(state.mode === 'diagnose' && state.dStep === 5) return decorateDiag();
  if(isResultScreen()) decorateResult();
}
if(typeof render === 'function'){
  const _render = render;
  render = function(){ const r = _render.apply(this, arguments); try{ afterRender(); }catch(e){ console.error('agent-tools', e); } return r; };
}
if(typeof trackedPrint === 'function'){
  const _tp = trackedPrint;
  trackedPrint = function(){ try{ recordQuote('print', state.mode === 'diagnose' ? diagSnapshot() : scrapeIllustration()); }catch(e){} return _tp.apply(this, arguments); };
}
// expose a few helpers for the account sheet and tests
window.AgentTools = { showPanel, backPanel, closePanel, L, esc, toast, $, $$, get, put, K, uid, today, online, loggedIn, num, clients, saveClients, waNumber, injectCss, openClients, openPitch, openScenarios, shareSheet, snapNow, buildPdf, summaryText, whatIfSpec, setTraining, training, lang, setLang, dueCount, SCENARIOS, PITCH, syncRates, flushQuotes, loadStanding };
injectCss(); setTraining(training());
window.addEventListener('online', () => { flushQuotes(); syncRates(); loadStanding(); });
setTimeout(() => { syncRates(); loadStanding(); flushQuotes(); try{ render(); }catch(e){} }, 1500);
})();
