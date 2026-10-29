/* ============================================================
   AGENT APPLICATIONS & SERVICING — loaded after agent-tools.js.
   Quote-to-application hand-over (client details, beneficiaries, documents, e-signature, premium collection),
   client view (large text, English / Kiswahili), policies and renewals, complaints, suitability record,
   licence and knowledge quiz, company products, and the offline "waiting to upload" queue.
   Everything works from the company's settings (/agents/me/status); features switched off there do not appear.
   ============================================================ */
(function(){
'use strict';
if(window.__agentApps || !window.AgentTools) return; window.__agentApps = true;
const T = window.AgentTools, { showPanel, backPanel, closePanel, L, esc, toast, $, $$, get, put, K, uid, today, online, loggedIn } = T;
const base = () => `${BACKEND_API}/api/companies/${BACKEND_COMPANY_ID}`;
const ready = () => typeof OTP_ENABLED !== 'undefined' && OTP_ENABLED && loggedIn() && AGENT.token;
const KES = n => (n == null || n === '' || isNaN(n)) ? '' : 'KES ' + Math.round(Number(n)).toLocaleString('en-KE');
const FREQS = [['monthly', 'Monthly', 'Kila mwezi'], ['quarterly', 'Quarterly', 'Kila robo mwaka'], ['semiannual', 'Half-yearly', 'Kila nusu mwaka'], ['annual', 'Yearly', 'Kila mwaka']];
const freqLabel = f => { const r = FREQS.find(x => x[0] === f); return r ? L(r[1], r[2]) : f; };
const FREQ_N = { monthly: 12, quarterly: 4, semiannual: 2, annual: 1 };

async function api(path, opts){
  const o = Object.assign({ headers: {} }, opts || {}); o.headers = Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + AGENT.token }, o.headers);
  if(o.body && typeof o.body !== 'string') o.body = JSON.stringify(o.body);
  const res = await fetch(base() + path, o); let j = null; try{ j = await res.json(); }catch(e){}
  if(!res.ok){ const err = new Error((j && j.error) || ('Request failed (' + res.status + ')')); err.status = res.status; err.problems = j && j.problems; throw err; }
  return j;
}

/* ---------- small IndexedDB store for photos (too big for localStorage) ---------- */
let _db = null;
function idb(){ return _db || (_db = new Promise((ok, no) => { try{ const r = indexedDB.open('illustrator_files', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }catch(e){ no(e); } })); }
async function fput(k, v){ try{ const d = await idb(); return await new Promise((ok, no) => { const t = d.transaction('f', 'readwrite'); t.objectStore('f').put(v, k); t.oncomplete = ok; t.onerror = () => no(t.error); }); }catch(e){ memFiles[k] = v; } }
async function fget(k){ try{ if(memFiles[k]) return memFiles[k]; const d = await idb(); return await new Promise((ok, no) => { const r = d.transaction('f').objectStore('f').get(k); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); }catch(e){ return memFiles[k]; } }
async function fdel(prefix){ try{ const d = await idb(); const t = d.transaction('f', 'readwrite'), s = t.objectStore('f'); s.openCursor().onsuccess = ev => { const c = ev.target.result; if(c){ if(String(c.key).indexOf(prefix) === 0) c.delete(); c.continue(); } }; }catch(e){} Object.keys(memFiles).forEach(k => { if(k.indexOf(prefix) === 0) delete memFiles[k]; }); }
const memFiles = {};

/* ---------- company status (what is switched on, can this agent sell) ---------- */
const ST_KEY = 'illustrator_status_v1';
let STATUS = null, stAt = 0;
function status(){ if(STATUS) return STATUS; const c = get(K(ST_KEY), null); STATUS = c; return c; }
async function loadStatus(force){
  if(!ready() || !online()) return status();
  if(!force && Date.now() - stAt < 120000) return status();
  stAt = Date.now();
  try{ STATUS = await api('/agents/me/status'); put(K(ST_KEY), STATUS); applyBranding(STATUS.company); }catch(e){ if(e.status === 401){ /* main app handles sign-out */ } }
  return status();
}
const feat = k => { const s = status(); return !s || !s.features ? true : s.features[k] !== false; };

/* ---------- branding from the company profile ---------- */
function applyBranding(co){
  try{
    if(co && co.support_phone) window.__supportPhone = co.support_phone;
    fetch(`${BACKEND_API}/api/public/companies/${BACKEND_COMPANY_ID}`).then(r => r.ok ? r.json() : null).then(c => {
      if(!c) return; const ok = v => /^#[0-9a-fA-F]{6}$/.test(v || ''); const r = document.documentElement.style;
      if(ok(c.color_primary)) r.setProperty('--brand', c.color_primary); if(ok(c.color_secondary)) r.setProperty('--brand-dark', c.color_secondary);
      if(c.app_name){ document.title = c.app_name; const h = $('header.top h1'); if(h && !h.dataset.branded){ h.dataset.branded = '1'; } }
    }).catch(() => {});
  }catch(e){}
}

/* ---------- outbox: things waiting to reach the office ---------- */
const OB_KEY = 'illustrator_outbox_v1', APPS_KEY = 'illustrator_apps_v1';
const outbox = () => get(K(OB_KEY), []), saveOutbox = a => put(K(OB_KEY), a);
const apps = () => get(K(APPS_KEY), []), saveApps = a => put(K(APPS_KEY), a);
const pendingApps = () => apps().filter(a => a.stage === 'queued');
const pendingCount = () => outbox().length + pendingApps().length;
function queue(type, path, body){ const o = outbox(); o.push({ id: uid(), type, path, body, at: Date.now(), tries: 0 }); saveOutbox(o); }
let flushing = false;
async function flushAll(){
  if(flushing || !ready() || !online()) return; flushing = true; let sent = 0;
  try{
    for(const it of outbox().slice()){
      try{ await api(it.path, { method: 'POST', body: it.body }); sent++; saveOutbox(outbox().filter(x => x.id !== it.id)); }
      catch(e){ if(e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429){ it.error = e.message; it.tries++; const o = outbox().map(x => x.id === it.id ? it : x); saveOutbox(o); } else break; }
    }
    for(const a of pendingApps()){ try{ const r = await transmit(a, true); if(r.ok) sent++; }catch(e){} }
  } finally { flushing = false; }
  if(sent){ toast(L(sent + ' item(s) sent to the office.', 'Vitu ' + sent + ' vimetumwa ofisini.')); if(typeof state !== 'undefined' && state.mode === 'home') try{ render(); }catch(e){} }
}
const typeLabel = t => ({ complaint: L('Complaint', 'Malalamiko'), suitability: L('Suitability record', 'Rekodi ya ufaafu') }[t] || t);
function openOutbox(){
  showPanel(L('Waiting to upload', 'Vinasubiri kutumwa'), body => {
    const ob = outbox(), pa = pendingApps();
    body.innerHTML = `<div class="at-card"><p style="margin:0;font-size:14px;">${esc(online() ? L('You are online. Items send automatically; tap Send now to try again.', 'Una mtandao. Vitu hutumwa vyenyewe; bonyeza Tuma sasa kujaribu tena.') : L('You are offline. These will send by themselves when the phone has data again.', 'Hauna mtandao. Vitatumwa vyenyewe mtandao ukirudi.'))}</p><div class="at-row"><button class="at-btn pri" id="obGo" ${online() ? '' : 'disabled'}>${esc(L('Send now', 'Tuma sasa'))}</button></div><div id="obMsg" role="status" aria-live="polite"></div></div>` +
      (pa.map(a => `<div class="at-item"><div class="t">${esc(L('Application', 'Maombi'))}: ${esc((a.client && a.client.fullName) || a.ref)}</div><div class="s">${esc(a.plan && a.plan.product)} · ${esc(a.queueNote || L('waiting to send', 'inasubiri kutumwa'))}</div></div>`).join('') +
       ob.map(x => `<div class="at-item"><div class="t">${esc(typeLabel(x.type))}: ${esc((x.body && (x.body.clientName || x.body.name)) || '')}</div><div class="s">${esc(x.error ? L('Problem: ', 'Tatizo: ') + x.error : L('waiting to send', 'inasubiri kutumwa'))}</div>${x.error ? `<div class="at-row"><button class="at-btn sm danger" data-rm="${esc(x.id)}">${esc(L('Remove', 'Ondoa'))}</button></div>` : ''}</div>`).join('') || (pa.length ? '' : `<p class="muted">${esc(L('Nothing is waiting.', 'Hakuna kinachosubiri.'))}</p>`));
    $('#obGo', body).addEventListener('click', async () => { await flushAll(); drawAgain(); });
    $$('[data-rm]', body).forEach(b => b.addEventListener('click', () => { saveOutbox(outbox().filter(x => x.id !== b.dataset.rm)); drawAgain(); }));
  });
}
function drawAgain(){ backPanel(); openOutbox(); }

/* ---------- photos: shrink before storing / sending ---------- */
function shrinkImage(file, maxSide, q){
  return new Promise((ok, no) => {
    if(file.type === 'application/pdf'){ if(file.size > 900000) return no(new Error(L('PDF is too large. Use a photo instead.', 'PDF ni kubwa mno. Tumia picha.'))); const r = new FileReader(); r.onload = () => ok({ data: String(r.result).split(',')[1], preview: null, mime: 'application/pdf' }); r.onerror = () => no(new Error('read')); r.readAsDataURL(file); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { try{
      const sc = Math.min(1, maxSide / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      let d = c.toDataURL('image/jpeg', q); if(d.length > 1400000) d = c.toDataURL('image/jpeg', .5);
      URL.revokeObjectURL(url); ok({ data: d.split(',')[1], preview: d, mime: 'image/jpeg' }); }catch(e){ no(e); } };
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error(L('That file is not a photo.', 'Faili hilo si picha.'))); };
    img.src = url;
  });
}

/* ---------- signature pad ---------- */
function signaturePad(host, label){
  host.innerHTML = `<label>${esc(label)}</label><canvas width="520" height="180" style="width:100%;height:150px;border:1px dashed #999;border-radius:10px;background:#fff;touch-action:none;" role="img" aria-label="${esc(L('Signature box. Draw with a finger.', 'Sehemu ya sahihi. Chora kwa kidole.'))}"></canvas><div class="at-row"><button type="button" class="at-btn sm" data-clear>${esc(L('Clear', 'Futa'))}</button></div>`;
  const c = $('canvas', host), x = c.getContext('2d'); let draw = false, inked = false;
  const reset = () => { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.strokeStyle = '#111'; x.lineWidth = 3; x.lineCap = 'round'; inked = false; }; reset();
  const pos = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.addEventListener('pointerdown', e => { draw = true; try{ c.setPointerCapture(e.pointerId); }catch(_){} const [a, b] = pos(e); x.beginPath(); x.moveTo(a, b); e.preventDefault(); });
  c.addEventListener('pointermove', e => { if(!draw) return; const [a, b] = pos(e); x.lineTo(a, b); x.stroke(); inked = true; e.preventDefault(); });
  const up = () => { draw = false; }; c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  $('[data-clear]', host).addEventListener('click', reset);
  return { has: () => inked, data: () => c.toDataURL('image/png') };
}

/* ============================================================
   APPLICATION WIZARD
   ============================================================ */
const BLANK_DECL = { smoker: null, conditions: null, conditionsDetail: '', otherCover: null, otherCoverDetail: '', accepted: false };
function newRef(){ return 'APP-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(); }
function planFromSnapshot(snap){
  if(!snap) return { product: '', premium: '', frequency: 'monthly', source: 'manual' };
  const inp = snap.inputs || {}; const money = s => { const n = parseInt(String(s || '').replace(/[^\d]/g, ''), 10); return isFinite(n) && n > 0 ? n : ''; };
  let premium = '', freq = (['monthly', 'quarterly', 'semiannual', 'annual'].includes(inp.freq) ? inp.freq : 'monthly');
  const pItem = (snap.items || []).find(i => /premium|ada|contribution|mchango/i.test(i.l)); if(pItem) premium = money(pItem.v);
  if(!premium && inp.periodicPremium) premium = Number(inp.periodicPremium);
  const sa = inp.sumAssured || ''; const term = inp.term || '';
  return { product: snap.product || snap.title || '', premium, frequency: freq, sumAssured: sa, term, source: 'illustration', headline: snap.hero && snap.hero.value };
}
function startApplication(opts){
  opts = opts || {};
  const st = status();
  if(st && st.canSell === false){ return blocked(st); }
  const draftId = opts.ref, existing = draftId ? apps().find(a => a.ref === draftId) : null;
  const A = existing || { ref: newRef(), stage: 'draft', step: 0, plan: planFromSnapshot(opts.snapshot), client: Object.assign({ idType: 'national_id' }, opts.client || {}), beneficiaries: [{ name: '', relationship: '', share: 100, dob: '', phone: '', trusteeName: '' }], declaration: Object.assign({}, BLANK_DECL), docs: {}, consent: false, createdAt: Date.now() };
  if(opts.plan) Object.assign(A.plan, opts.plan);
  if(opts.client && !existing) Object.assign(A.client, opts.client);
  showPanel(L('New application', 'Maombi mapya'), body => wizard(body, A));
}
function blocked(st){
  showPanel(L('Not able to send applications yet', 'Bado huwezi kutuma maombi'), body => {
    body.innerHTML = `<div class="at-card"><h3>${esc(L('Before you can send an application', 'Kabla ya kutuma maombi'))}</h3>${(st.reasons || []).map(r => `<p style="margin:6px 0;">• ${esc(r)}</p>`).join('')}<div class="at-row"><button class="at-btn pri" id="goLic">${esc(L('My licence and training', 'Leseni na mafunzo yangu'))}</button></div></div>`;
    $('#goLic', body).addEventListener('click', openLicence);
  });
}
const STEPS = () => [L('Client', 'Mteja'), L('Plan', 'Mpango'), L('Beneficiaries', 'Wanufaika'), L('Health', 'Afya'), L('Documents', 'Hati'), L('Sign & send', 'Saini na tuma')];
function persist(A){ const a = apps().filter(x => x.ref !== A.ref); a.unshift(A); saveApps(a.slice(0, 40)); }
function inp(id, label, val, type, extra){ return `<label for="${id}">${esc(label)}</label><input id="${id}" type="${type || 'text'}" value="${esc(val == null ? '' : val)}" ${extra || ''}>`; }
function wizard(body, A){
  const steps = STEPS(); const s = A.step || 0;
  const head = `<div class="at-card" style="padding:10px 12px;"><div class="at-bar" role="progressbar" aria-label="${esc(L('Progress', 'Maendeleo'))}" aria-valuemin="1" aria-valuemax="${steps.length}" aria-valuenow="${s + 1}"><i style="width:${Math.round((s + 1) / steps.length * 100)}%"></i></div><b>${esc(L('Step', 'Hatua'))} ${s + 1}/${steps.length}: ${esc(steps[s])}</b></div><div id="wzErr" role="alert" aria-live="assertive"></div>`;
  const nav = `<div class="at-row" style="margin-top:14px;">${s > 0 ? `<button class="at-btn" id="wzBack">${esc(L('Back', 'Rudi'))}</button>` : ''}<button class="at-btn pri" id="wzNext">${esc(s === steps.length - 1 ? L('Send application', 'Tuma maombi') : L('Next', 'Endelea'))}</button><button class="at-btn" id="wzSave">${esc(L('Save and close', 'Hifadhi na funga'))}</button></div>`;
  body.innerHTML = head + `<div id="wzBody"></div>` + nav;
  const host = $('#wzBody', body), err = m => { $('#wzErr', body).innerHTML = m ? `<div class="at-banner warn">${m}</div>` : ''; if(m) $('#wzErr', body).scrollIntoView({ block: 'nearest' }); };
  let collect = () => true;
  if(s === 0) collect = stepClient(host, A);
  if(s === 1) collect = stepPlan(host, A);
  if(s === 2) collect = stepBens(host, A);
  if(s === 3) collect = stepHealth(host, A);
  if(s === 4) collect = stepDocs(host, A, body);
  if(s === 5) collect = stepSign(host, A);
  const go = d => { A.step = Math.max(0, Math.min(steps.length - 1, s + d)); persist(A); wizard(body, A); };
  $('#wzBack', body) && $('#wzBack', body).addEventListener('click', () => { collect(true); go(-1); });
  $('#wzSave', body).addEventListener('click', () => { collect(true); persist(A); toast(L('Saved. Find it under "Applications".', 'Imehifadhiwa. Itafute kwenye "Maombi".')); closePanel(); });
  $('#wzNext', body).addEventListener('click', async () => {
    const problems = collect(false); if(problems !== true && problems && problems.length){ err(problems.map(p => '• ' + esc(p)).join('<br>')); return; }
    err(''); persist(A);
    if(s < steps.length - 1) return go(1);
    const btn = $('#wzNext', body); btn.disabled = true; btn.textContent = L('Sending…', 'Inatuma…');
    const r = await transmit(A, false); btn.disabled = false; btn.textContent = L('Send application', 'Tuma maombi');
    if(r.problems) return err(r.problems.map(p => '• ' + esc(p)).join('<br>'));
    if(r.error) return err(esc(r.error));
    if(r.queued) return queuedScreen(body, A);
    sentScreen(body, A);
  });
}
function stepClient(host, A){
  const c = A.client;
  host.innerHTML = `<div class="at-card">${inp('c_name', L('Full name (as on ID)', 'Jina kamili (kama kwenye kitambulisho)'), c.fullName, 'text', 'autocomplete="off"')}
  <div class="at-row"><div style="flex:1;min-width:140px;">${inp('c_dob', L('Date of birth', 'Tarehe ya kuzaliwa'), c.dob, 'date')}</div><div style="flex:1;min-width:120px;"><label for="c_gender">${esc(L('Gender', 'Jinsia'))}</label><select id="c_gender"><option value="">–</option><option value="female"${c.gender === 'female' ? ' selected' : ''}>${esc(L('Female', 'Mwanamke'))}</option><option value="male"${c.gender === 'male' ? ' selected' : ''}>${esc(L('Male', 'Mwanamume'))}</option><option value="other"${c.gender === 'other' ? ' selected' : ''}>${esc(L('Other', 'Nyingine'))}</option></select></div></div>
  <div class="at-row"><div style="flex:1;min-width:120px;"><label for="c_idt">${esc(L('ID type', 'Aina ya kitambulisho'))}</label><select id="c_idt"><option value="national_id"${c.idType === 'national_id' ? ' selected' : ''}>${esc(L('National ID', 'Kitambulisho cha Taifa'))}</option><option value="passport"${c.idType === 'passport' ? ' selected' : ''}>${esc(L('Passport', 'Pasipoti'))}</option><option value="alien_id"${c.idType === 'alien_id' ? ' selected' : ''}>${esc(L('Alien ID', 'Kitambulisho cha mgeni'))}</option></select></div><div style="flex:1;min-width:140px;">${inp('c_id', L('ID number', 'Nambari ya kitambulisho'), c.idNumber, 'text', 'inputmode="numeric"')}</div></div>
  ${inp('c_kra', L('KRA PIN', 'KRA PIN'), c.kraPin, 'text', 'autocapitalize="characters" placeholder="A123456789B"')}
  ${inp('c_phone', L('Phone (M-Pesa number if possible)', 'Simu (nambari ya M-Pesa kama inawezekana)'), c.phone, 'tel', 'inputmode="tel" placeholder="07XX XXX XXX"')}${inp('c_email', L('Email (optional)', 'Barua pepe (si lazima)'), c.email, 'email')}
  ${inp('c_addr', L('Town / county', 'Mji / kaunti'), c.address)}${inp('c_occ', L('Occupation', 'Kazi'), c.occupation)}${inp('c_emp', L('Employer (optional)', 'Mwajiri (si lazima)'), c.employer)}</div>`;
  return soft => {
    const v = id => $('#' + id, host).value.trim(); Object.assign(c, { fullName: v('c_name'), dob: v('c_dob'), gender: v('c_gender'), idType: v('c_idt'), idNumber: v('c_id'), kraPin: v('c_kra').toUpperCase(), phone: v('c_phone'), email: v('c_email'), address: v('c_addr'), occupation: v('c_occ'), employer: v('c_emp') });
    if(soft) return true; const p = [];
    if(c.fullName.length < 3) p.push(L('Enter the client\'s full name.', 'Weka jina kamili la mteja.'));
    if(!/^\d{4}-\d{2}-\d{2}$/.test(c.dob)) p.push(L('Enter the date of birth.', 'Weka tarehe ya kuzaliwa.'));
    if(c.idNumber.length < 5) p.push(L('Enter the ID number.', 'Weka nambari ya kitambulisho.'));
    if(!/^[A-Z]\d{9}[A-Z]$/.test(c.kraPin)) p.push(L('KRA PIN looks wrong (for example A123456789B).', 'KRA PIN inaonekana si sahihi (mfano A123456789B).'));
    if(!/^(\+?254|0)?[17]\d{8}$/.test(c.phone.replace(/\s/g, ''))) p.push(L('Enter a valid Kenyan phone number.', 'Weka nambari sahihi ya simu ya Kenya.'));
    if(c.address.length < 2) p.push(L('Enter the town or county.', 'Weka mji au kaunti.')); if(c.occupation.length < 2) p.push(L('Enter the occupation.', 'Weka kazi.'));
    return p;
  };
}
function stepPlan(host, A){
  const p = A.plan;
  host.innerHTML = `<div class="at-card">${p.source === 'illustration' ? `<p class="at-banner info" style="margin:0 0 8px;">${esc(L('Filled in from the illustration you just ran. Check the figures.', 'Imejazwa kutoka kwenye makadirio uliyofanya. Hakiki namba.'))}</p>` : ''}
  ${inp('p_prod', L('Product', 'Bidhaa'), p.product)}${inp('p_prem', L('Premium (KES)', 'Ada (KES)'), p.premium, 'text', 'inputmode="numeric"')}
  <label for="p_freq">${esc(L('How often will they pay?', 'Watalipa mara ngapi?'))}</label><select id="p_freq">${FREQS.map(f => `<option value="${f[0]}"${p.frequency === f[0] ? ' selected' : ''}>${esc(L(f[1], f[2]))}</option>`).join('')}</select>
  ${inp('p_sa', L('Sum assured (KES, if any)', 'Kiasi cha bima (KES, kama kipo)'), p.sumAssured, 'text', 'inputmode="numeric"')}${inp('p_term', L('Term in years (if any)', 'Muda kwa miaka (kama upo)'), p.term, 'text', 'inputmode="numeric"')}</div>`;
  return soft => {
    const n = id => { const x = parseInt($('#' + id, host).value.replace(/[^\d]/g, ''), 10); return isFinite(x) ? x : ''; };
    p.product = $('#p_prod', host).value.trim(); p.premium = n('p_prem'); p.frequency = $('#p_freq', host).value; p.sumAssured = n('p_sa'); p.term = n('p_term');
    if(soft) return true; const e = [];
    if(!p.product) e.push(L('Choose the product.', 'Chagua bidhaa.')); if(!(p.premium > 0)) e.push(L('Enter the premium.', 'Weka kiasi cha ada.')); return e;
  };
}
function stepBens(host, A){
  const list = A.beneficiaries;
  const draw = () => {
    host.innerHTML = `<p class="muted" style="font-size:13px;">${esc(L('Who receives the benefit if the client dies? Shares must add up to 100%. For a child under 18, name a trustee or guardian.', 'Nani anapokea faida mteja akifariki? Mgawo lazima ujumlishe 100%. Kwa mtoto chini ya miaka 18, taja mlezi au mdhamini.'))}</p>` +
      list.map((b, i) => `<div class="at-card" data-b="${i}"><h3>${esc(L('Beneficiary', 'Mnufaika'))} ${i + 1}</h3>${inp('b_n' + i, L('Full name', 'Jina kamili'), b.name)}<div class="at-row"><div style="flex:1;min-width:130px;">${inp('b_r' + i, L('Relationship', 'Uhusiano'), b.relationship, 'text', 'placeholder="' + esc(L('Spouse, child…', 'Mke/mume, mtoto…')) + '"')}</div><div style="width:100px;">${inp('b_s' + i, L('Share %', 'Mgawo %'), b.share, 'text', 'inputmode="decimal"')}</div></div><div class="at-row"><div style="flex:1;min-width:130px;">${inp('b_d' + i, L('Date of birth', 'Tarehe ya kuzaliwa'), b.dob, 'date')}</div><div style="flex:1;min-width:130px;">${inp('b_p' + i, L('Phone (optional)', 'Simu (si lazima)'), b.phone, 'tel')}</div></div>${inp('b_t' + i, L('Trustee / guardian (if under 18)', 'Mlezi / mdhamini (kama chini ya miaka 18)'), b.trusteeName)}${list.length > 1 ? `<button type="button" class="at-btn sm danger" data-del="${i}">${esc(L('Remove', 'Ondoa'))}</button>` : ''}</div>`).join('') +
      `<div class="at-row"><button type="button" class="at-btn" id="bAdd" ${list.length >= 6 ? 'disabled' : ''}>${esc(L('Add another beneficiary', 'Ongeza mnufaika mwingine'))}</button></div><p id="bSum" class="muted" aria-live="polite"></p>`;
    $$('[data-del]', host).forEach(b => b.addEventListener('click', () => { read(); list.splice(Number(b.dataset.del), 1); draw(); }));
    $('#bAdd', host).addEventListener('click', () => { read(); list.push({ name: '', relationship: '', share: 0, dob: '', phone: '', trusteeName: '' }); draw(); });
    $$('input', host).forEach(i => i.addEventListener('input', sum)); sum();
  };
  const read = () => list.forEach((b, i) => { const v = id => ($('#' + id + i, host) || { value: '' }).value.trim(); b.name = v('b_n'); b.relationship = v('b_r'); b.share = parseFloat(v('b_s')) || 0; b.dob = v('b_d'); b.phone = v('b_p'); b.trusteeName = v('b_t'); });
  const sum = () => { read(); const t = list.reduce((a, b) => a + (b.share || 0), 0); const el = $('#bSum', host); if(el) el.textContent = L('Shares total: ', 'Jumla ya mgawo: ') + Math.round(t * 100) / 100 + '%' + (Math.abs(t - 100) < .01 ? ' ✓' : ''); };
  draw();
  return soft => {
    read(); if(soft) return true; const e = []; let t = 0;
    list.forEach((b, i) => { const n = i + 1; if(b.name.length < 3) e.push(L('Beneficiary ' + n + ': enter the full name.', 'Mnufaika ' + n + ': weka jina kamili.')); if(b.relationship.length < 2) e.push(L('Beneficiary ' + n + ': enter the relationship.', 'Mnufaika ' + n + ': weka uhusiano.')); t += b.share;
      if(b.dob){ const age = (Date.now() - new Date(b.dob).getTime()) / 31557600000; if(age < 18 && b.trusteeName.length < 3) e.push(L('Beneficiary ' + n + ' is under 18: name a trustee or guardian.', 'Mnufaika ' + n + ' ni chini ya miaka 18: taja mlezi au mdhamini.')); } });
    if(Math.abs(t - 100) > .01) e.push(L('Shares add up to ' + t + '%. They must be 100%.', 'Mgawo unajumlisha ' + t + '%. Lazima uwe 100%.')); return e;
  };
}
function yn(id, label, val){ return `<fieldset style="border:0;padding:0;margin:0 0 10px;"><legend style="font-size:14px;font-weight:600;margin-bottom:4px;">${esc(label)}</legend><label style="display:inline-flex;align-items:center;margin-right:18px;font-size:15px;"><input type="radio" name="${id}" value="yes"${val === true ? ' checked' : ''}> ${esc(L('Yes', 'Ndiyo'))}</label><label style="display:inline-flex;align-items:center;font-size:15px;"><input type="radio" name="${id}" value="no"${val === false ? ' checked' : ''}> ${esc(L('No', 'Hapana'))}</label></fieldset>`; }
function stepHealth(host, A){
  const d = A.declaration, st = status(), text = (st && st.declarationText) || '';
  host.innerHTML = `<div class="at-card">${yn('d_smoke', L('Does the client smoke or use tobacco?', 'Je, mteja anavuta sigara au tumbaku?'), d.smoker)}${yn('d_cond', L('Has the client been diagnosed with, or treated for, a serious illness or condition in the last 5 years?', 'Je, mteja amewahi kugunduliwa au kutibiwa ugonjwa mkubwa katika miaka 5 iliyopita?'), d.conditions)}<div id="d_cd" ${d.conditions ? '' : 'hidden'}>${inp('d_cdt', L('Give details', 'Toa maelezo'), d.conditionsDetail)}</div>${yn('d_oth', L('Does the client already have other life cover?', 'Je, mteja ana bima nyingine ya maisha?'), d.otherCover)}<div id="d_od" ${d.otherCover ? '' : 'hidden'}>${inp('d_odt', L('Company and amount', 'Kampuni na kiasi'), d.otherCoverDetail)}</div>
  <div class="at-banner info" style="display:block;">${esc(text)}</div><label style="display:flex;gap:8px;align-items:flex-start;font-size:14px;color:inherit;"><input type="checkbox" id="d_acc" ${d.accepted ? 'checked' : ''} style="margin-top:3px;"> ${esc(L('The client has read this declaration and confirms the answers are true and complete.', 'Mteja amesoma tamko hili na anathibitisha majibu ni kweli na kamili.'))}</label></div>`;
  const rv = n => { const e = $('input[name=' + n + ']:checked', host); return e ? e.value === 'yes' : null; };
  host.addEventListener('change', () => { $('#d_cd', host).hidden = rv('d_cond') !== true; $('#d_od', host).hidden = rv('d_oth') !== true; });
  return soft => {
    d.smoker = rv('d_smoke'); d.conditions = rv('d_cond'); d.conditionsDetail = $('#d_cdt', host).value.trim(); d.otherCover = rv('d_oth'); d.otherCoverDetail = $('#d_odt', host).value.trim(); d.accepted = $('#d_acc', host).checked;
    if(soft) return true; const e = [];
    if(d.smoker === null) e.push(L('Answer the smoking question.', 'Jibu swali la uvutaji.')); if(d.conditions === null) e.push(L('Answer the health question.', 'Jibu swali la afya.')); else if(d.conditions && d.conditionsDetail.length < 3) e.push(L('Give details of the condition.', 'Toa maelezo ya hali hiyo.'));
    if(d.otherCover === null) e.push(L('Answer the other-cover question.', 'Jibu swali la bima nyingine.')); if(!d.accepted) e.push(L('The client must accept the declaration.', 'Mteja lazima akubali tamko.')); return e;
  };
}
function stepDocs(host, A, panel){
  const st = status(), req = (st && st.docsRequired) || ['national_id_front', 'national_id_back', 'kra_pin'], labels = (st && st.docLabels) || { national_id_front: 'ID — front', national_id_back: 'ID — back', kra_pin: 'KRA PIN certificate', beneficiary_form: 'Beneficiary form', other: 'Other' };
  const kinds = Array.from(new Set(req.concat(['beneficiary_form'])));
  host.innerHTML = `<p class="muted" style="font-size:13px;">${esc(L('Take a clear photo of each document. Photos are made smaller automatically so they send even on a weak connection.', 'Piga picha wazi ya kila hati. Picha hupunguzwa ukubwa ili zitumwe hata mtandao ukiwa dhaifu.'))}</p>` +
    kinds.map(k => `<div class="at-card"><b>${esc(labels[k] || k)}</b> ${req.includes(k) ? `<span class="at-chip red">${esc(L('required', 'lazima'))}</span>` : `<span class="at-chip">${esc(L('optional', 'si lazima'))}</span>`}<div id="dp_${k}" class="muted" style="font-size:12.5px;margin:4px 0;">${A.docs[k] ? '✓ ' + esc(L('Saved on this phone', 'Imehifadhiwa kwenye simu hii')) : esc(L('Not added yet', 'Haijaongezwa'))}</div><img id="di_${k}" alt="" style="max-width:120px;max-height:90px;display:${A.docs[k] ? 'block' : 'none'};border-radius:6px;"><label class="at-btn sm" style="display:inline-block;margin-top:6px;" for="df_${k}">${esc(A.docs[k] ? L('Replace', 'Badilisha') : L('Take photo / choose file', 'Piga picha / chagua faili'))}</label><input type="file" id="df_${k}" accept="image/*,application/pdf" capture="environment" style="position:absolute;left:-9999px;" data-k="${k}"></div>`).join('');
  $$('input[type=file]', host).forEach(f => f.addEventListener('change', async () => {
    const k = f.dataset.k, file = f.files[0]; if(!file) return; const msg = $('#dp_' + k, host); msg.textContent = L('Processing…', 'Inachakata…');
    try{ const r = await shrinkImage(file, 1280, .72); await fput(A.ref + '/' + k, { data: r.data, mime: r.mime, name: file.name }); A.docs[k] = { at: Date.now(), uploaded: false }; persist(A); msg.textContent = '✓ ' + L('Saved on this phone', 'Imehifadhiwa kwenye simu hii') + ' (' + Math.round(r.data.length * .75 / 1024) + ' KB)'; const im = $('#di_' + k, host); if(r.preview){ im.src = r.preview; im.style.display = 'block'; } }
    catch(e){ msg.textContent = e.message; }
  }));
  return soft => { if(soft) return true; const miss = req.filter(k => !A.docs[k]); return miss.map(k => L('Add: ', 'Ongeza: ') + (labels[k] || k)); };
}
let sigApi = null;
function stepSign(host, A){
  const st = status(), consent = (st && st.consentText) || '';
  const c = A.client, p = A.plan;
  host.innerHTML = `<div class="at-card"><h3>${esc(L('Check with the client', 'Hakiki na mteja'))}</h3><div style="font-size:14px;line-height:1.6;"><b>${esc(c.fullName)}</b> · ${esc(c.phone)}<br>${esc(p.product)} — <b>${esc(KES(p.premium))}</b> ${esc(freqLabel(p.frequency))}${p.sumAssured ? '<br>' + esc(L('Cover', 'Bima')) + ': ' + esc(KES(p.sumAssured)) : ''}${p.term ? ' · ' + esc(p.term) + ' ' + esc(L('years', 'miaka')) : ''}<br>${esc(L('Beneficiaries', 'Wanufaika'))}: ${A.beneficiaries.map(b => esc(b.name) + ' (' + esc(b.share) + '%)').join(', ')}</div></div>
  <div class="at-card"><div class="at-banner info" style="display:block;">${esc(consent)}</div><label style="display:flex;gap:8px;align-items:flex-start;font-size:14px;color:inherit;"><input type="checkbox" id="s_cons" ${A.consent ? 'checked' : ''} style="margin-top:3px;"> ${esc(L('The client agrees to the above and to the application being sent.', 'Mteja anakubali hayo hapo juu na maombi kutumwa.'))}</label><div id="sigHost" style="margin-top:10px;"></div><p class="muted" style="font-size:12px;">${esc(L('The client signs with a finger. The date and time are recorded.', 'Mteja anasaini kwa kidole. Tarehe na saa vinarekodiwa.'))}</p></div>`;
  sigApi = signaturePad($('#sigHost', host), L('Client signature', 'Sahihi ya mteja'));
  if(A.signature){ const im = new Image(); im.onload = () => { const cv = $('canvas', host); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); sigApi.has = () => true; sigApi.data = () => A.signature; }; im.src = A.signature; }
  return soft => { A.consent = $('#s_cons', host).checked; if(sigApi.has()) A.signature = sigApi.data(); if(soft) return true; const e = []; if(!A.consent) e.push(L('The client must agree to the consent.', 'Mteja lazima akubali idhini.')); if(!A.signature) e.push(L('The client must sign.', 'Mteja lazima asaini.')); return e; };
}

/* ---------- sending (resumable: every step is safe to repeat) ---------- */
async function transmit(A, background){
  if(!ready() || !online()){ A.stage = 'queued'; A.queueNote = L('waiting for a connection', 'inasubiri mtandao'); persist(A); return { queued: true }; }
  try{
    await api('/applications', { method: 'POST', body: { ref: A.ref, plan: A.plan, client: A.client, beneficiaries: A.beneficiaries, declaration: A.declaration, clientKey: A.clientKey } });
    for(const k of Object.keys(A.docs)){
      if(A.docs[k].uploaded) continue; const f = await fget(A.ref + '/' + k); if(!f) throw Object.assign(new Error(L('A photo is missing on this phone. Add it again.', 'Picha haipo kwenye simu hii. Iongeze tena.')), { status: 400 });
      await api('/applications/' + A.ref + '/docs', { method: 'POST', body: { kind: k, data: f.data, filename: f.name } }); A.docs[k].uploaded = true; persist(A);
    }
    const r = await api('/applications/' + A.ref + '/submit', { method: 'POST', body: { signature: A.signature, consent: A.consent } });
    A.stage = 'sent'; A.sentAt = Date.now(); A.serverStatus = r.status; delete A.queueNote; persist(A); fdel(A.ref + '/'); return { ok: true };
  }catch(e){
    if(e.problems){ A.stage = 'draft'; persist(A); return { problems: e.problems }; }
    if(e.status === 409 && /already been sent/i.test(e.message)){ A.stage = 'sent'; persist(A); return { ok: true }; }
    if(e.status && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429){ if(background){ A.stage = 'draft'; A.queueNote = e.message; persist(A); } return { error: e.message }; }
    A.stage = 'queued'; A.queueNote = L('will retry when the connection is good', 'itajaribu tena mtandao ukiwa mzuri'); persist(A); return { queued: true };
  }
}
function queuedScreen(body, A){
  body.innerHTML = `<div class="at-card"><h3>${esc(L('Saved — will send when online', 'Imehifadhiwa — itatumwa ukiwa na mtandao'))}</h3><p>${esc(L('The application is safe on this phone. It will go to the office automatically as soon as there is a good connection. You can see it under "Waiting to upload".', 'Maombi yamehifadhiwa salama kwenye simu hii. Yatatumwa ofisini yenyewe mtandao ukipatikana. Yataonekana kwenye "Vinasubiri kutumwa".'))}</p><div class="at-row"><button class="at-btn pri" id="qOk">${esc(L('Done', 'Sawa'))}</button></div></div>`;
  $('#qOk', body).addEventListener('click', closePanel);
}
function sentScreen(body, A){
  const st = status() || {}, mp = st.payments && st.payments.mode === 'mpesa';
  body.innerHTML = `<div class="at-card"><h3>✓ ${esc(L('Application sent', 'Maombi yametumwa'))}</h3><p style="margin:4px 0;">${esc(L('Reference', 'Nambari ya kumbukumbu'))}: <b>${esc(A.ref)}</b></p><p>${esc(L('The office will review it. You can follow the progress under "Applications".', 'Ofisi itayapitia. Unaweza kufuatilia kwenye "Maombi".'))}</p></div>
  <div class="at-card"><h3>${esc(L('Collect the first premium', 'Kusanya ada ya kwanza'))}</h3><p style="font-size:14px;">${esc(KES(A.plan.premium))} ${esc(freqLabel(A.plan.frequency))}</p>${inp('pay_phone', L('M-Pesa number', 'Nambari ya M-Pesa'), A.client.phone, 'tel')}<div class="at-row"><button class="at-btn pri" id="payGo">${esc(mp ? L('Send payment request to phone', 'Tuma ombi la malipo kwa simu') : L('Show payment instructions', 'Onyesha maelekezo ya malipo'))}</button></div><div id="payOut" role="status" aria-live="polite" style="margin-top:8px;"></div></div><div class="at-row"><button class="at-btn" id="sDone">${esc(L('Done', 'Sawa'))}</button></div>`;
  $('#sDone', body).addEventListener('click', closePanel);
  $('#payGo', body).addEventListener('click', () => payFlow(A, $('#pay_phone', body).value, $('#payOut', body)));
}
async function payFlow(A, phone, out){
  out.textContent = L('Please wait…', 'Tafadhali subiri…');
  try{
    const r = await api('/applications/' + A.ref + '/pay', { method: 'POST', body: { phone, amount: A.plan.premium } });
    if(r.mode === 'manual'){ out.innerHTML = `<div class="at-banner info" style="display:block;">${esc(r.instructions)}<br><b>${esc(L('Account / reference', 'Akaunti / kumbukumbu'))}: ${esc(r.accountRef)}</b>${r.shortcode ? '<br>' + esc(L('Paybill/Till', 'Paybill/Till')) + ': <b>' + esc(r.shortcode) + '</b>' : ''}<br>${esc(L('The office confirms the payment when it is received.', 'Ofisi itathibitisha malipo yakipokelewa.'))}</div>`; return; }
    out.innerHTML = `<div class="at-banner info" style="display:block;">${esc(r.message)}</div>`;
    for(let i = 0; i < 20; i++){ await new Promise(z => setTimeout(z, 4000)); if(!$('#payOut')) return; const s = await api('/applications/' + A.ref + '/payment'); if(s.paymentStatus === 'paid'){ out.innerHTML = `<div class="at-banner info" style="display:block;">✓ ${esc(L('Payment received', 'Malipo yamepokelewa'))}${s.payment && s.payment.receipt ? ' — ' + esc(s.payment.receipt) : ''}</div>`; return; } if(s.payment && s.payment.status === 'failed'){ out.innerHTML = `<div class="at-banner warn">${esc(L('The payment did not go through. Try again.', 'Malipo hayakukamilika. Jaribu tena.'))}</div>`; return; } }
    out.innerHTML += `<div class="muted">${esc(L('Still waiting. You can check later under "Applications".', 'Bado inasubiri. Unaweza kukagua baadaye kwenye "Maombi".'))}</div>`;
  }catch(e){ out.innerHTML = `<div class="at-banner warn">${esc(e.message)}</div>`; }
}

/* ---------- list of my applications ---------- */
const STATUS_TXT = { draft: ['Draft', 'Rasimu'], queued: ['Waiting to send', 'Inasubiri kutumwa'], submitted: ['Sent', 'Imetumwa'], under_review: ['Under review', 'Inakaguliwa'], info_needed: ['More information needed', 'Taarifa zaidi zinahitajika'], approved: ['Approved', 'Imekubaliwa'], issued: ['Policy issued', 'Sera imetolewa'], declined: ['Declined', 'Imekataliwa'] };
const stTxt = s => { const r = STATUS_TXT[s] || [s, s]; return L(r[0], r[1]); };
async function openApplications(){
  showPanel(L('Applications', 'Maombi'), async body => {
    const local = apps(); let remote = []; body.innerHTML = '<p class="muted">…</p>';
    if(ready() && online()){ try{ remote = await api('/applications/mine'); }catch(e){} }
    const rm = new Map(remote.map(r => [r.ref, r]));
    const rows = local.map(a => ({ a, r: rm.get(a.ref) })); remote.forEach(r => { if(!local.find(a => a.ref === r.ref)) rows.push({ a: null, r }); });
    body.innerHTML = `<div class="at-row"><button class="at-btn pri" id="apNew">${esc(L('New application', 'Maombi mapya'))}</button></div>` + (rows.map(({ a, r }) => { const stt = r ? r.status : (a.stage === 'sent' ? 'submitted' : a.stage); const name = (a && a.client && a.client.fullName) || (r && r.clientName) || ''; const prod = (a && a.plan && a.plan.product) || (r && r.product) || ''; const ref = (a && a.ref) || r.ref;
      return `<div class="at-item" data-ref="${esc(ref)}"><div class="t">${esc(name || ref)}</div><div class="s">${esc(prod)} · <span class="at-chip ${stt === 'issued' || stt === 'approved' ? 'green' : stt === 'info_needed' || stt === 'declined' ? 'red' : 'amber'}">${esc(stTxt(stt))}</span>${r && r.paymentStatus === 'paid' ? ' <span class="at-chip green">' + esc(L('Premium paid', 'Ada imelipwa')) + '</span>' : ''}${r && r.policyNo ? ' ' + esc(r.policyNo) : ''}</div>${r && r.adminNote ? `<div class="s" style="color:#b3261e;">${esc(r.adminNote)}</div>` : ''}</div>`; }).join('') || `<p class="muted">${esc(L('No applications yet.', 'Hakuna maombi bado.'))}</p>`);
    $('#apNew', body).addEventListener('click', () => startApplication({}));
    $$('[data-ref]', body).forEach(el => el.addEventListener('click', () => { const row = rows.find(x => ((x.a && x.a.ref) || x.r.ref) === el.dataset.ref); const a = row.a, r = row.r;
      if(a && (a.stage === 'draft' || (r && r.status === 'info_needed'))){ a.stage = 'draft'; a.step = a.step || 0; persist(a); startApplication({ ref: a.ref }); }
      else if(r && ['submitted', 'approved', 'issued', 'under_review'].includes(r.status) && r.paymentStatus !== 'paid' && a){ showPanel(L('Collect premium', 'Kusanya ada'), b => { b.innerHTML = '<div class="at-card" id="pb"></div><div id="payOut2" role="status" aria-live="polite"></div>'; $('#pb', b).innerHTML = `<h3>${esc(a.client.fullName)}</h3><p>${esc(KES(a.plan.premium))} ${esc(freqLabel(a.plan.frequency))}</p>${inp('pay_phone', L('M-Pesa number', 'Nambari ya M-Pesa'), a.client.phone, 'tel')}<button class="at-btn pri" id="payGo2">${esc(L('Collect premium', 'Kusanya ada'))}</button>`; $('#payGo2', b).addEventListener('click', () => { const o = $('#payOut2', b); o.id = 'payOut'; payFlow(a, $('#pay_phone', b).value, o); }); }); } }));
  });
}

/* ============================================================
   CLIENT VIEW — what you pay, what you get (large type, EN / SW)
   ============================================================ */
let CV_BIG = true;
function openClientView(snap){
  snap = snap || T.snapNow(); if(!snap) return;
  showPanel(L('Client view', 'Mwonekano wa mteja'), body => {
    const big = CV_BIG;
    const pay = (snap.items || []).filter(i => /premium|ada|contribution|mchango/i.test(i.l)).slice(0, 2), others = (snap.items || []).filter(i => pay.indexOf(i) < 0).slice(0, 6);
    const note = L('This is an illustration to help you decide. It is not a promise of future returns. Figures may change. Ask your agent anything you do not understand.', 'Hii ni makadirio ya kukusaidia kuamua. Si ahadi ya faida ya baadaye. Namba zinaweza kubadilika. Muulize wakala wako chochote usichoelewa.');
    body.innerHTML = `<div style="font-size:${big ? 21 : 16}px;line-height:1.45;">
    <div class="at-row" style="margin:0 0 10px;"><button class="at-btn sm" id="cvLang">${esc(L('Kiswahili', 'English'))}</button><button class="at-btn sm" id="cvSize">${esc(big ? L('Smaller text', 'Maandishi madogo') : L('Larger text', 'Maandishi makubwa'))}</button></div>
    <div class="at-card" style="border-width:2px;"><div style="font-size:.7em;font-weight:700;letter-spacing:.06em;color:var(--brand);">${esc(L('WHAT YOU PAY', 'UNACHOLIPA'))}</div>${pay.length ? pay.map(i => `<div>${esc(i.l)}: <b>${esc(i.v)}</b></div>`).join('') : `<div><b>${esc(snap.title || '')}</b></div>`}</div>
    <div class="at-card" style="border-width:2px;"><div style="font-size:.7em;font-weight:700;letter-spacing:.06em;color:var(--brand);">${esc(L('WHAT YOU GET', 'UNACHOKIPATA'))}</div><div>${esc(snap.hero && snap.hero.label)}</div><div style="font-size:1.5em;font-weight:800;color:var(--brand-dark);">${esc(snap.hero && snap.hero.value)}</div><div style="font-size:.8em;">${esc(snap.hero && snap.hero.sub)}</div>${others.map(i => `<div style="font-size:.85em;margin-top:4px;">${esc(i.l)}: <b>${esc(i.v)}</b></div>`).join('')}</div>
    <p style="font-size:.7em;color:#6b5b5b;">${esc(note)}</p>
    <div class="at-row"><button class="at-btn pri" id="cvApply" style="font-size:.8em;">${esc(L('Apply now', 'Omba sasa'))}</button><button class="at-btn" id="cvShare" style="font-size:.8em;">${esc(L('Send to my phone', 'Nitumie kwenye simu yangu'))}</button></div></div>`;
    $('#cvLang', body).addEventListener('click', () => { T.setLang(T.lang() === 'sw' ? 'en' : 'sw'); backPanel(); openClientView(snap); });
    $('#cvSize', body).addEventListener('click', () => { CV_BIG = !big; backPanel(); openClientView(snap); });
    $('#cvApply', body).addEventListener('click', () => startApplication({ snapshot: snap }));
    $('#cvShare', body).addEventListener('click', () => T.shareSheet(snap, null));
  });
}

/* ============================================================
   POLICIES & RENEWALS
   ============================================================ */
const POL_KEY = 'illustrator_policies_v1';
async function loadPolicies(){ if(ready() && online()){ try{ const r = await api('/policies/mine'); put(K(POL_KEY), r); return r; }catch(e){} } return get(K(POL_KEY), { summary: { total: 0 }, policies: [] }); }
function reminderText(p){ return L(`Hello ${p.clientName.split(' ')[0]}, your premium of ${KES(p.premium)} for policy ${p.policyNo} ${p.state === 'overdue' ? 'was due on ' + p.nextDueDate : 'is due on ' + p.nextDueDate}. Please pay to keep your cover active. Thank you.`, `Habari ${p.clientName.split(' ')[0]}, ada yako ya ${KES(p.premium)} ya sera ${p.policyNo} ${p.state === 'overdue' ? 'ilistahili tarehe ' + p.nextDueDate : 'inastahili tarehe ' + p.nextDueDate}. Tafadhali lipa ili bima yako iendelee. Asante.`); }
function openPolicies(){
  showPanel(L('Policies & renewals', 'Sera na malipo ya ada'), async body => {
    body.innerHTML = '<p class="muted">…</p>'; const r = await loadPolicies(); const ps = r.policies || [];
    const group = (title, list, cls) => list.length ? `<h3 style="margin:14px 0 4px;color:var(--brand-dark);font-size:14px;">${esc(title)} (${list.length})</h3>` + list.map(p => { const wa = T.waNumber(p.clientPhone); return `<div class="at-item" style="cursor:default;"><div class="t">${esc(p.clientName)} <span class="at-chip ${cls}">${esc(p.state === 'overdue' ? L('Overdue ', 'Imechelewa ') + Math.abs(p.daysToDue) + L(' days', ' siku') : p.state === 'due_soon' ? L('Due in ', 'Inadaiwa baada ya ') + p.daysToDue + L(' days', ' siku') : p.state === 'lapsed' ? L('Lapsed', 'Imekwisha') : L('Active', 'Hai'))}</span></div><div class="s">${esc(p.policyNo)} · ${esc(p.product)} · ${esc(KES(p.premium))} ${esc(freqLabel(p.frequency))}${p.nextDueDate ? ' · ' + esc(L('next due', 'inayofuata')) + ' ' + esc(p.nextDueDate) : ''}</div><div class="at-row">${p.clientPhone ? `<a class="at-btn sm" href="tel:${esc(p.clientPhone)}">${esc(L('Call', 'Piga simu'))}</a><a class="at-btn sm" href="sms:${esc(p.clientPhone)}?body=${encodeURIComponent(reminderText(p))}">SMS</a>` : ''}${wa ? `<a class="at-btn sm" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(reminderText(p))}">WhatsApp</a>` : ''}</div></div>`; }).join('') : '';
    body.innerHTML = `<div class="at-card"><div class="at-row" style="margin:0;"><span class="at-chip red">${esc(L('Overdue', 'Zilizochelewa'))}: ${ps.filter(p => p.state === 'overdue').length}</span><span class="at-chip amber">${esc(L('Due in 14 days', 'Zinakaribia'))}: ${ps.filter(p => p.state === 'due_soon').length}</span><span class="at-chip">${esc(L('Lapsed', 'Zilizokwisha'))}: ${ps.filter(p => p.state === 'lapsed').length}</span></div>${online() ? '' : `<p class="muted" style="margin:6px 0 0;">${esc(L('Offline: showing the last list downloaded.', 'Hauna mtandao: inaonyesha orodha ya mwisho.'))}</p>`}</div>` +
      (group(L('Overdue', 'Zilizochelewa'), ps.filter(p => p.state === 'overdue'), 'red') + group(L('Due in the next 14 days', 'Zinakaribia siku 14'), ps.filter(p => p.state === 'due_soon'), 'amber') + group(L('Lapsed', 'Zilizokwisha'), ps.filter(p => p.state === 'lapsed'), 'red') + group(L('Other policies', 'Sera nyingine'), ps.filter(p => !['overdue', 'due_soon', 'lapsed'].includes(p.state)), 'green') || `<p class="muted">${esc(L('No policies are linked to you yet. Policies appear here when the office issues them from your applications or imports them.', 'Hakuna sera zilizounganishwa nawe bado.'))}</p>`);
  });
}

/* ============================================================
   COMPLAINTS
   ============================================================ */
const CATS = [['claim', 'Claim', 'Madai'], ['premium_or_billing', 'Premium / billing', 'Ada / bili'], ['service', 'Service', 'Huduma'], ['agent_conduct', 'Agent conduct', 'Tabia ya wakala'], ['policy_admin', 'Policy administration', 'Usimamizi wa sera'], ['other', 'Other', 'Nyingine']];
function openComplaint(){
  showPanel(L('Log a complaint', 'Andika malalamiko'), async body => {
    body.innerHTML = `<div class="at-card"><p class="muted" style="margin:0 0 6px;font-size:13px;">${esc(L('Write down a complaint from a client. The company must respond within its set period.', 'Andika malalamiko ya mteja. Kampuni lazima ijibu ndani ya muda uliowekwa.'))}</p>${inp('m_name', L('Client name', 'Jina la mteja'), '')}${inp('m_phone', L('Client phone', 'Simu ya mteja'), '', 'tel')}${inp('m_pol', L('Policy number (if known)', 'Nambari ya sera (kama inajulikana)'), '')}<label for="m_cat">${esc(L('Type', 'Aina'))}</label><select id="m_cat">${CATS.map(c => `<option value="${c[0]}">${esc(L(c[1], c[2]))}</option>`).join('')}</select><label for="m_desc">${esc(L('What happened?', 'Nini kilitokea?'))}</label><textarea id="m_desc" rows="5"></textarea><div class="at-row"><button class="at-btn pri" id="mGo">${esc(L('Submit', 'Tuma'))}</button></div><div id="mMsg" role="alert" aria-live="assertive"></div></div><div id="mList"></div>`;
    $('#mGo', body).addEventListener('click', async () => {
      const b = { clientRef: 'CMP-' + uid().toUpperCase().padStart(8, '0'), clientName: $('#m_name', body).value.trim(), clientPhone: $('#m_phone', body).value.trim(), policyNo: $('#m_pol', body).value.trim(), category: $('#m_cat', body).value, description: $('#m_desc', body).value.trim() };
      const msg = $('#mMsg', body); if(b.clientName.length < 2) return msg.innerHTML = `<div class="at-banner warn">${esc(L('Enter the client\'s name.', 'Weka jina la mteja.'))}</div>`; if(b.description.length < 10) return msg.innerHTML = `<div class="at-banner warn">${esc(L('Describe the complaint in a sentence or more.', 'Eleza malalamiko kwa sentensi moja au zaidi.'))}</div>`;
      try{ if(!ready() || !online()) throw Object.assign(new Error('offline'), { offline: true }); const r = await api('/complaints', { method: 'POST', body: b }); msg.innerHTML = `<div class="at-banner info">✓ ${esc(L('Logged. Reference', 'Imesajiliwa. Kumbukumbu'))} ${esc(r.ref)}. ${esc(L('The company must respond by', 'Kampuni lazima ijibu kufikia'))} ${esc(r.respondBy)}.</div>`; }
      catch(e){ if(e.offline || !e.status){ queue('complaint', '/complaints', b); msg.innerHTML = `<div class="at-banner info">${esc(L('Saved on this phone. It will be sent when there is a connection.', 'Imehifadhiwa kwenye simu. Itatumwa mtandao ukipatikana.'))}</div>`; } else { msg.innerHTML = `<div class="at-banner warn">${esc(e.message)}</div>`; return; } }
      ['m_name', 'm_phone', 'm_pol', 'm_desc'].forEach(i => { $('#' + i, body).value = ''; });
    });
    if(ready() && online()){ try{ const l = await api('/complaints/mine'); $('#mList', body).innerHTML = l.length ? `<h3 style="margin:14px 0 4px;font-size:14px;">${esc(L('My complaints', 'Malalamiko yangu'))}</h3>` + l.map(c => `<div class="at-item" style="cursor:default;"><div class="t">${esc(c.clientName)} <span class="at-chip ${c.status === 'resolved' || c.status === 'closed' ? 'green' : 'amber'}">${esc(c.status)}</span></div><div class="s">${esc(c.ref)} · ${esc(c.category)}${c.respondBy ? ' · ' + esc(L('respond by', 'jibu kabla ya')) + ' ' + esc(c.respondBy) : ''}${c.resolution ? '<br>' + esc(c.resolution) : ''}</div></div>`).join('') : ''; }catch(e){} }
  });
}

/* ============================================================
   SUITABILITY / NEEDS-ANALYSIS RECORD
   ============================================================ */
const DISCL = [['risks', 'The main risks and what is not covered were explained', 'Hatari kuu na yasiyolipwa yalielezwa'], ['costs', 'All premiums, charges and the cost over time were explained', 'Ada zote, gharama na jumla kwa muda vilielezwa'], ['surrender', 'What happens if premiums stop (lapse, surrender value) was explained', 'Kinachotokea ada ikisimama kilielezwa'], ['cooling', 'The right to cancel / free-look period was explained', 'Haki ya kughairi ilielezwa'], ['alternatives', 'Other suitable options were discussed', 'Chaguo zingine zinazofaa zilijadiliwa']];
function openSuitability(snap){
  snap = snap || (loggedIn() && state.mode !== 'home' ? (() => { try{ return T.snapNow(); }catch(e){ return null; } })() : null);
  showPanel(L('Needs & suitability record', 'Rekodi ya mahitaji na ufaafu'), body => {
    const rec = (snap && snap.product) || '';
    body.innerHTML = `<div class="at-card"><p class="muted" style="margin:0 0 6px;font-size:13px;">${esc(L('Keep a signed record that the product suits the client. This protects the client, you and the company.', 'Weka rekodi iliyosainiwa kuwa bidhaa inamfaa mteja. Hii inamlinda mteja, wewe na kampuni.'))}</p>${inp('u_name', L('Client name', 'Jina la mteja'), (snap && snap.clientName) || '')}${inp('u_phone', L('Client phone', 'Simu ya mteja'), '', 'tel')}${inp('u_goal', L('What does the client need? (goal, who depends on them, budget)', 'Mteja anahitaji nini? (lengo, wanaomtegemea, bajeti)'), '')}${inp('u_rec', L('Product recommended', 'Bidhaa iliyopendekezwa'), rec)}${inp('u_ch', L('Product the client chose', 'Bidhaa aliyochagua mteja'), rec)}<div id="u_dev" hidden>${inp('u_devr', L('Why did the client choose differently?', 'Kwa nini mteja alichagua tofauti?'), '')}</div><label for="u_why">${esc(L('Why this suits the client', 'Kwa nini inamfaa mteja'))}</label><textarea id="u_why" rows="3"></textarea><b style="font-size:13px;">${esc(L('Explained to the client', 'Kilichoelezwa kwa mteja'))}</b>${DISCL.map(d => `<label style="display:flex;gap:8px;align-items:flex-start;font-size:14px;margin:6px 0;color:inherit;"><input type="checkbox" data-d="${esc(d[1])}" style="margin-top:3px;"> ${esc(L(d[1], d[2]))}</label>`).join('')}<div id="u_sig"></div><div class="at-row"><button class="at-btn pri" id="uGo">${esc(L('Save record', 'Hifadhi rekodi'))}</button></div><div id="uMsg" role="alert" aria-live="assertive"></div></div>`;
    const sg = signaturePad($('#u_sig', body), L('Client signature', 'Sahihi ya mteja'));
    const dev = () => { $('#u_dev', body).hidden = !($('#u_rec', body).value.trim() && $('#u_rec', body).value.trim() !== $('#u_ch', body).value.trim()); }; $('#u_rec', body).addEventListener('input', dev); $('#u_ch', body).addEventListener('input', dev); dev();
    $('#uGo', body).addEventListener('click', async () => {
      const msg = $('#uMsg', body), v = id => $('#' + id, body).value.trim();
      const b = { clientRef: 'SUI-' + uid().toUpperCase().padStart(8, '0'), clientName: v('u_name'), clientPhone: v('u_phone'), needs: { summary: v('u_goal') }, recommended: v('u_rec'), chosen: v('u_ch'), rationale: v('u_why'), deviationReason: v('u_devr'), disclosures: $$('[data-d]:checked', body).map(c => c.dataset.d), signature: sg.has() ? sg.data() : '', occurredAt: new Date().toISOString() };
      const warn = t => msg.innerHTML = `<div class="at-banner warn">${esc(t)}</div>`;
      if(b.clientName.length < 2) return warn(L('Enter the client\'s name.', 'Weka jina la mteja.')); if(!b.chosen) return warn(L('Say which product the client chose.', 'Taja bidhaa aliyochagua mteja.')); if(b.rationale.length < 10) return warn(L('Write why this product suits the client.', 'Andika kwa nini bidhaa inamfaa mteja.')); if(!b.disclosures.length) return warn(L('Tick what you explained to the client.', 'Weka tiki kwa ulichomweleza mteja.')); if(!b.signature) return warn(L('The client must sign.', 'Mteja lazima asaini.'));
      try{ if(!ready() || !online()) throw Object.assign(new Error('offline'), { offline: true }); await api('/suitability', { method: 'POST', body: b }); toast(L('Record saved.', 'Rekodi imehifadhiwa.')); backPanel(); }
      catch(e){ if(e.offline || !e.status){ queue('suitability', '/suitability', b); toast(L('Saved on this phone; will send when online.', 'Imehifadhiwa kwenye simu; itatumwa ukiwa na mtandao.')); backPanel(); } else warn(e.message); }
    });
  });
}

/* ============================================================
   LICENCE & TRAINING QUIZ
   ============================================================ */
function openLicence(){
  showPanel(L('My licence & training', 'Leseni na mafunzo yangu'), async body => {
    body.innerHTML = '<p class="muted">…</p>'; const st = await loadStatus(true); if(!st){ body.innerHTML = `<p class="muted">${esc(L('Connect to the internet to see this.', 'Unganisha mtandao ili kuona hii.'))}</p>`; return; }
    const lc = st.licence || {}, qz = st.quiz || {};
    body.innerHTML = `<div class="at-card"><h3>${esc(L('Can I send applications?', 'Naweza kutuma maombi?'))}</h3>${st.canSell ? `<div class="at-banner info">✓ ${esc(L('Yes. Your licence and training are in order.', 'Ndiyo. Leseni na mafunzo yako yako sawa.'))}</div>` : (st.reasons || []).map(r => `<div class="at-banner warn">${esc(r)}</div>`).join('')}</div>
    <div class="at-card"><h3>${esc(L('IRA licence', 'Leseni ya IRA'))}</h3>${inp('l_no', L('Licence number', 'Nambari ya leseni'), lc.no)}${inp('l_exp', L('Expiry date', 'Tarehe ya kuisha'), lc.expiry, 'date')}<div class="at-row"><button class="at-btn pri" id="lSave">${esc(L('Save licence', 'Hifadhi leseni'))}</button></div><div id="lMsg" role="alert"></div><p class="muted" style="font-size:12px;">${esc(L('The office checks your number against the IRA register.', 'Ofisi hukagua nambari yako kwenye rejista ya IRA.'))}</p></div>
    <div class="at-card"><h3>${esc(L('Knowledge quiz', 'Jaribio la maarifa'))}</h3><p style="margin:0 0 6px;font-size:14px;">${qz.passed ? '✓ ' + esc(L('Passed. Valid until', 'Umefaulu. Halali hadi')) + ' ' + esc(qz.validUntil || '') : esc(L('Not passed yet. 10 questions on fair selling and good practice.', 'Hujafaulu bado. Maswali 10 kuhusu uuzaji wa haki na mazoea mazuri.'))}</p><div class="at-row"><button class="at-btn pri" id="qStart" ${online() ? '' : 'disabled'}>${esc(qz.passed ? L('Take it again', 'Fanya tena') : L('Start the quiz', 'Anza jaribio'))}</button></div></div>`;
    $('#lSave', body).addEventListener('click', async () => { const m = $('#lMsg', body); try{ await api('/agents/me/licence', { method: 'PUT', body: { licenceNo: $('#l_no', body).value.trim(), licenceExpiry: $('#l_exp', body).value } }); await loadStatus(true); backPanel(); openLicence(); toast(L('Licence saved.', 'Leseni imehifadhiwa.')); }catch(e){ m.innerHTML = `<div class="at-banner warn">${esc(e.message)}</div>`; } });
    $('#qStart', body).addEventListener('click', openQuiz);
  });
}
function openQuiz(){
  showPanel(L('Knowledge quiz', 'Jaribio la maarifa'), async body => {
    body.innerHTML = '<p class="muted">…</p>'; let q; try{ q = await api('/quiz'); }catch(e){ body.innerHTML = `<div class="at-banner warn">${esc(e.message)}</div>`; return; }
    body.innerHTML = q.questions.map((x, i) => `<fieldset class="at-card" style="border:1px solid var(--line,#e6dcdc);"><legend style="font-weight:700;font-size:14.5px;padding:0 4px;">${i + 1}. ${esc(x.q)}</legend>${x.o.map((o, j) => `<label style="display:flex;gap:8px;align-items:flex-start;font-size:14.5px;margin:6px 0;color:inherit;"><input type="radio" name="q_${esc(x.id)}" value="${j}" style="margin-top:3px;"> ${esc(o)}</label>`).join('')}</fieldset>`).join('') + `<div class="at-row"><button class="at-btn pri" id="qSub">${esc(L('Submit answers', 'Tuma majibu'))}</button></div><div id="qOut" role="status" aria-live="polite"></div>`;
    $('#qSub', body).addEventListener('click', async () => {
      const answers = {}; q.questions.forEach(x => { const c = $('input[name=q_' + x.id + ']:checked', body); if(c) answers[x.id] = Number(c.value); });
      if(Object.keys(answers).length < q.questions.length) return $('#qOut', body).innerHTML = `<div class="at-banner warn">${esc(L('Answer every question.', 'Jibu maswali yote.'))}</div>`;
      try{ const r = await api('/quiz/attempts', { method: 'POST', body: { token: q.token, answers } }); await loadStatus(true);
        $('#qOut', body).innerHTML = `<div class="at-banner ${r.passed ? 'info' : 'warn'}"><b>${r.score}/${r.total} (${r.percent}%)</b> — ${esc(r.passed ? L('Passed.', 'Umefaulu.') : L('Not passed. Pass mark is ', 'Hujafaulu. Alama ya kufaulu ni ') + r.passMark + '%.')}</div>` + r.review.filter(x => !x.correct).map(x => { const qq = q.questions.find(z => z.id === x.id); return `<div class="at-item" style="cursor:default;"><div class="t">${esc(qq.q)}</div><div class="s"><b>${esc(L('Answer', 'Jibu'))}:</b> ${esc(qq.o[x.answer])}<br>${esc(x.explanation)}</div></div>`; }).join(''); $('#qSub', body).disabled = true;
      }catch(e){ $('#qOut', body).innerHTML = `<div class="at-banner warn">${esc(e.message)}</div>`; }
    });
  });
}

/* ============================================================
   COMPANY PRODUCTS (term life, group life, funeral, credit life, pension)
   ============================================================ */
const CP_KEY = 'illustrator_custom_products_v1';
async function loadCustom(){ if(ready() && online()){ try{ const r = await api('/products/custom'); put(K(CP_KEY), r.products || []); return r.products || []; }catch(e){} } return get(K(CP_KEY), []); }
function openCustomList(){
  showPanel(L('More products', 'Bidhaa zaidi'), async body => {
    body.innerHTML = '<p class="muted">…</p>'; const list = await loadCustom();
    body.innerHTML = list.length ? list.map((p, i) => `<div class="at-item" data-i="${i}"><div class="t">${esc(p.name)}</div><div class="s">${esc(({ term_life: ['Term life', 'Bima ya muda'], group_life: ['Group life', 'Bima ya kikundi'], funeral: ['Funeral', 'Mazishi'], credit_life: ['Credit life', 'Bima ya mkopo'], pension: ['Pension', 'Pensheni'] }[p.kind] || ['', '']).map((x, k) => k === (T.lang() === 'sw' ? 1 : 0) ? x : null).filter(Boolean)[0] || p.kind)}</div></div>`).join('') : `<p class="muted">${esc(L('Your company has not published other products yet.', 'Kampuni yako haijachapisha bidhaa zingine bado.'))}</p>`;
    $$('[data-i]', body).forEach(el => el.addEventListener('click', () => openCustomCalc(list[Number(el.dataset.i)])));
  });
}
function openCustomCalc(p){
  showPanel(p.name, body => {
    if(typeof CustomProducts === 'undefined'){ body.innerHTML = '<p class="muted">Not available.</p>'; return; }
    const fields = CustomProducts.schema(p.kind, p.definition);
    body.innerHTML = `<div class="at-card">${fields.map(f => f.type === 'select' ? `<label for="cf_${f.key}">${esc(f.label)}</label><select id="cf_${f.key}" data-k="${f.key}">${f.options.map(o => `<option value="${esc(o.value)}"${String(f.default) === o.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>` : f.type === 'bool' ? `<label style="display:flex;gap:8px;align-items:center;color:inherit;font-size:15px;margin:8px 0;"><input type="checkbox" id="cf_${f.key}" data-k="${f.key}"> ${esc(f.label)}</label>` : `<label for="cf_${f.key}">${esc(f.label)}</label><input id="cf_${f.key}" data-k="${f.key}" inputmode="numeric" value="${esc(f.default == null ? '' : f.default)}">`).join('')}<div class="at-row"><button class="at-btn pri" id="cfGo">${esc(L('Calculate', 'Kokotoa'))}</button></div></div><div id="cfOut" role="status" aria-live="polite"></div>`;
    $('#cfGo', body).addEventListener('click', () => {
      const input = {}; $$('[data-k]', body).forEach(el => { input[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; });
      const r = CustomProducts.calc(p.kind, p.definition, input); const out = $('#cfOut', body);
      if(!r.ok) return out.innerHTML = `<div class="at-banner warn">${esc(r.errors.join(' '))}</div>`;
      const money = x => x.fmt === 'money' ? KES(x.value) : x.value;
      out.innerHTML = `<div class="at-card" style="border-width:2px;"><div class="muted" style="font-size:12.5px;">${esc(r.headline.label)}</div><div style="font-size:26px;font-weight:800;color:var(--brand-dark);">${esc(typeof r.headline.value === 'number' ? KES(r.headline.value) : r.headline.value)}</div><div style="font-size:13px;">${esc(r.headline.sub || '')}</div></div><table class="at-table">${r.rows.map(x => `<tr><td>${esc(x.label)}</td><td><b>${esc(money(x))}</b>${x.note ? '<br><span class="muted">' + esc(x.note) + '</span>' : ''}</td></tr>`).join('')}</table>${(r.notes || []).map(n => '<p class="muted" style="font-size:12px;margin:4px 0;">' + esc(n) + '</p>').join('')}<p class="muted" style="font-size:12px;">${esc(L('Illustration only, based on the company\'s published rates.', 'Makadirio tu, kwa viwango vilivyochapishwa na kampuni.'))}</p><div class="at-row"><button class="at-btn pri" id="cfApply">${esc(L('Start application', 'Anza maombi'))}</button></div>`;
      $('#cfApply', body).addEventListener('click', () => { const prem = r.premium || (r.headline && typeof r.headline.value === 'number' && /premium/i.test(r.headline.label) ? r.headline.value : ''); startApplication({ plan: { product: p.name, premium: prem ? Math.round(prem) : '', frequency: input.freq || 'monthly', sumAssured: input.sumAssured || '', term: input.term || '', source: 'custom', pkey: p.pkey } }); });
    });
  });
}

/* ============================================================
   HOME: tiles, badges, banners
   ============================================================ */
function releaseBanner(){
  const b = get('illustrator_banner_v1', null); if(!b || !b.enforceAt) return '';
  const when = new Date(b.enforceAt); if(when.getTime() < Date.now() - 864e5) return '';
  const d = when.toLocaleDateString('en-KE', { dateStyle: 'medium' });
  return `<div class="at-banner info" role="status"><span>${esc(b.text || L('A new version of this app will be required from ' + d + '. Update before then so you are not interrupted with a client.', 'Toleo jipya la programu litahitajika kuanzia ' + d + '. Sasisha kabla ya hapo usikatizwe ukiwa na mteja.'))}</span></div>`;
}
function decorate(){
  if(!loggedIn() || !$('#app .mode-grid') || $('#apHome')) return;
  const st = status(), grid = $('#atHome'); if(!grid) return;
  const pc = pendingCount(), due = (st && st.renewalsDue) || get(K(POL_KEY), { policies: [] }).policies.filter(p => p.state === 'overdue' || p.state === 'due_soon').length, need = (st && st.applicationsNeedInfo) || 0;
  let top = releaseBanner();
  if(st && st.canSell === false && st.reasons && st.reasons.length) top += `<div class="at-banner warn" id="apGate"><span>${esc(st.reasons[0])}</span><button class="at-btn sm" id="apGateGo">${esc(L('Fix this', 'Rekebisha'))}</button></div>`;
  if(pc) top += `<div class="at-banner warn" id="apWait"><span><b>${pc}</b> ${esc(L('waiting to upload', 'vinasubiri kutumwa'))}${online() ? '' : ' (' + esc(L('offline', 'hauna mtandao')) + ')'}</span><button class="at-btn sm" id="apWaitGo">${esc(L('Details', 'Maelezo'))}</button></div>`;
  if(need) top += `<div class="at-banner warn"><span><b>${need}</b> ${esc(L('application(s) need more information', 'maombi yanahitaji taarifa zaidi'))}</span><button class="at-btn sm" id="apNeedGo">${esc(L('Open', 'Fungua'))}</button></div>`;
  const tiles = [];
  if(feat('applications')) tiles.push(['apApps', L('Applications', 'Maombi'), L('Start, continue and track', 'Anza, endelea na fuatilia'), need ? need : 0]);
  if(feat('policies')) tiles.push(['apPol', L('Policies & renewals', 'Sera na ada'), L('Who to call about premiums', 'Nani wa kupigia kuhusu ada'), due]);
  if(feat('customProducts')) tiles.push(['apCust', L('More products', 'Bidhaa zaidi'), L('Term, group, funeral, credit, pension', 'Muda, kikundi, mazishi, mkopo, pensheni'), 0]);
  if(feat('suitability')) tiles.push(['apSuit', L('Needs & suitability', 'Mahitaji na ufaafu'), L('Signed record for a sale', 'Rekodi iliyosainiwa ya mauzo'), 0]);
  if(feat('complaints')) tiles.push(['apCmp', L('Complaints', 'Malalamiko'), L('Log a client complaint', 'Andika malalamiko ya mteja'), 0]);
  tiles.push(['apLic', L('Licence & training', 'Leseni na mafunzo'), L('Licence, expiry, knowledge quiz', 'Leseni, kuisha, jaribio'), st && st.canSell === false ? 1 : 0]);
  tiles.push(['apSize', L('Text size', 'Ukubwa wa maandishi'), document.body.classList.contains('ap-large') ? L('Large: ON', 'Kubwa: IMEWASHWA') : L('Make the whole app easier to read', 'Fanya programu ionekane vizuri zaidi'), 0]);
  const anchor = $('#atDraft') || $('#atDue') || $('#app .mode-grid'); if(top) anchor.insertAdjacentHTML('beforebegin', top);
  grid.insertAdjacentHTML('beforeend', `<span id="apHome" hidden></span>` + tiles.map(t => `<button class="at-tile" id="${t[0]}"><b>${esc(t[1])}</b><span>${esc(t[2])}</span>${t[3] ? `<i class="at-badge">${t[3]}</i>` : ''}</button>`).join(''));
  const on = (id, fn) => { const el = $('#' + id); if(el) el.addEventListener('click', fn); };
  on('apApps', openApplications); on('apPol', openPolicies); on('apCust', openCustomList); on('apSuit', () => openSuitability()); on('apCmp', openComplaint); on('apLic', openLicence); on('apGateGo', openLicence); on('apWaitGo', openOutbox); on('apNeedGo', openApplications);
  on('apSize', () => { setLarge(!document.body.classList.contains('ap-large')); try{ render(); }catch(e){} });
  loadStatus(false).then(s => { if(s && !(window.__apDrew)){ window.__apDrew = true; setTimeout(() => { window.__apDrew = false; }, 5000); } });
}
function decorateResultExtra(){
  const tools = $('#atTools'); if(!tools || $('#apRes')) return; const row = $('.at-row', tools); if(!row) return;
  const html = (feat('applications') ? `<button class="at-btn pri" id="apRes">${esc(L('Start application', 'Anza maombi'))}</button>` : '') + `<button class="at-btn" id="apCv">${esc(L('Client view', 'Mwonekano wa mteja'))}</button>` + (feat('suitability') ? `<button class="at-btn" id="apSu">${esc(L('Suitability record', 'Rekodi ya ufaafu'))}</button>` : '');
  row.insertAdjacentHTML('beforeend', html);
  const on = (id, fn) => { const el = $('#' + id); if(el) el.addEventListener('click', fn); };
  on('apRes', () => startApplication({ snapshot: T.snapNow() })); on('apCv', () => openClientView(T.snapNow())); on('apSu', () => openSuitability(T.snapNow()));
}

/* ---------- large text / accessibility ---------- */
const LARGE_KEY = 'illustrator_large_text_v1';
function setLarge(on){ put(LARGE_KEY, !!on); document.body.classList.toggle('ap-large', !!on); }
const css = document.createElement('style'); css.textContent = `body.ap-large{font-size:118%;} body.ap-large .at-btn,body.ap-large .btn,body.ap-large button{min-height:48px;} body.ap-large input,body.ap-large select{font-size:17px!important;}
.at-btn:focus-visible,.at-tile:focus-visible,.at-item:focus-visible,#atPanel input:focus-visible,#atPanel select:focus-visible,#atPanel textarea:focus-visible,button:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #1a5fb4;outline-offset:2px;}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important;}}
a.at-btn{text-decoration:none;display:inline-flex;align-items:center;} #atPanel fieldset{margin:8px 0;}`; document.head.appendChild(css);
setLarge(!!get(LARGE_KEY, false));

/* ---------- wiring ---------- */
if(typeof render === 'function'){
  const _r = render;
  render = function(){ const r = _r.apply(this, arguments); try{ if(state.mode === 'home') decorate(); else decorateResultExtra(); }catch(e){ console.error('agent-apps', e); } return r; };
}
window.AgentApps = { startApplication, openApplications, openPolicies, openComplaint, openSuitability, openLicence, openCustomList, openClientView, openOutbox, flushAll, pendingCount, loadStatus, status, transmit };
window.addEventListener('online', () => { loadStatus(true); flushAll(); });
setInterval(() => { if(online() && pendingCount()) flushAll(); }, 60000);
setTimeout(() => { loadStatus(true).then(() => { flushAll(); try{ render(); }catch(e){} }); }, 2200);
})();
