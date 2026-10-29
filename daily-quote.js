/* ============================================================
   DAILY SPARK — one motivational quote per agent per day, shown once, as a greeting card.
   - Shows the first time the agent opens the app on a given (local) day, morning, afternoon or evening.
   - Each agent walks through the whole library in their own shuffled order, so a quote does not repeat
     until every quote (1,000+) has been shown, and colleagues do not all see the same one on the same day.
   - Library: daily-quotes.js (loaded on demand, cached for offline use).
   - Testing: open the app with ?dq=random to see a random card every time (nothing is recorded);
     the home screen also has a "Today's spark" tile to read today's quote again.
   ============================================================ */
(function(){
'use strict';
if(window.__dailyQuote || !window.AgentTools) return; window.__dailyQuote = true;
const T = window.AgentTools, { L, esc, $, get, put, K, loggedIn } = T;
const KEY = 'illustrator_dq_v1';

/* ---------- picking a quote ---------- */
function mulberry(seed){ return function(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(str){ let h = 2166136261; for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function dayNumber(d){ return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); }
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const permCache = {};
function permutation(n, who){ const k = who + '|' + n; if(permCache[k]) return permCache[k]; const a = Array.from({ length: n }, (_, i) => i), r = mulberry(hash(k)); for(let i = n - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return permCache[k] = a; }
function pickIndex(n, who, date){ return permutation(n, who)[dayNumber(date) % n]; }

/* ---------- library loading ---------- */
let loading = null;
function library(){
  if(window.DAILY_QUOTES) return Promise.resolve(window.DAILY_QUOTES);
  if(loading) return loading;
  return loading = new Promise(res => { const s = document.createElement('script'); s.src = 'daily-quotes.js'; s.onload = () => res(window.DAILY_QUOTES || []); s.onerror = () => { loading = null; res([]); }; document.head.appendChild(s); });
}

/* ---------- look ---------- */
const PALETTES = [
  ['#000000', '#000000', '#e6b566']
];
const CSS = `
#dqBack{position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.78);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:dqFade .35s ease both;}
#dqCard{position:relative;width:100%;max-width:430px;max-height:92vh;overflow:auto;border-radius:28px;color:#fff;box-shadow:0 30px 70px rgba(0,0,0,.6),0 0 0 1px rgba(230,181,102,.35) inset;animation:dqPop .55s cubic-bezier(.2,.9,.25,1.1) both;font-family:Georgia,'Times New Roman',serif;}
#dqCard .dq-bg{position:absolute;inset:0;border-radius:28px;overflow:hidden;pointer-events:none;}
#dqCard .dq-in{position:relative;padding:26px 24px 22px;}
#dqCard .dq-x{position:absolute;top:10px;right:10px;width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.14);color:#fff;font:400 26px/1 system-ui,sans-serif;cursor:pointer;z-index:2;}
#dqCard .dq-x:hover{background:rgba(255,255,255,.26);}
#dqCard .dq-tag{display:inline-flex;align-items:center;gap:7px;font:700 11px/1 system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:var(--dq-acc);}
#dqCard .dq-tag i{display:inline-block;width:22px;height:2px;background:var(--dq-acc);border-radius:2px;}
#dqCard .dq-hi{font:600 22px/1.25 Georgia,serif;margin:12px 44px 4px 0;}
#dqCard .dq-date{font:13px system-ui,sans-serif;opacity:.75;}
#dqCard .dq-mark{font:700 92px/0.7 Georgia,serif;color:var(--dq-acc);opacity:.9;margin:22px 0 0;height:46px;}
#dqCard blockquote{margin:6px 0 0;padding:0;font-style:italic;letter-spacing:.005em;text-wrap:balance;}
#dqCard .dq-by{display:flex;align-items:center;gap:12px;margin-top:20px;}
#dqCard .dq-mono{flex:none;width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 16px system-ui,sans-serif;color:#2b1a12;background:linear-gradient(135deg,var(--dq-acc),#fff3d6);box-shadow:0 4px 14px rgba(0,0,0,.3);}
#dqCard .dq-au{font:700 16px/1.25 system-ui,sans-serif;}
#dqCard .dq-src{font:italic 13px/1.3 Georgia,serif;opacity:.78;margin-top:2px;}
#dqCard .dq-rule{height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);margin:20px 0 14px;}
#dqCard .dq-meta{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font:12.5px system-ui,sans-serif;opacity:.85;}
#dqCard .dq-btns{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;}
#dqCard .dq-go{flex:1;min-width:150px;border:0;border-radius:16px;padding:14px 18px;min-height:50px;font:700 16px system-ui,sans-serif;color:#2b1a12;background:linear-gradient(135deg,var(--dq-acc),#fff0c9);cursor:pointer;box-shadow:0 8px 22px rgba(0,0,0,.28);}
#dqCard .dq-sh{border:1.5px solid rgba(255,255,255,.55);border-radius:16px;padding:14px 18px;min-height:50px;font:600 15px system-ui,sans-serif;color:#fff;background:transparent;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;}
#dqCard button:focus-visible,#dqCard a:focus-visible{outline:3px solid #fff;outline-offset:2px;}
@keyframes dqFade{from{opacity:0}to{opacity:1}}
@keyframes dqPop{from{opacity:0;transform:translateY(22px) scale(.94)}to{opacity:1;transform:none}}
@keyframes dqFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
#dqCard .dq-orb{animation:dqFloat 7s ease-in-out infinite;}
@media (prefers-reduced-motion:reduce){#dqBack,#dqCard,#dqCard .dq-orb{animation:none!important;}}
@media print{#dqBack{display:none!important;}}
`;
function injectCss(){ if($('#dqCss')) return; const s = document.createElement('style'); s.id = 'dqCss'; s.textContent = CSS; document.head.appendChild(s); }

function art(p){
  return `<svg class="dq-bg" viewBox="0 0 430 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" width="100%" height="100%">
  <defs><linearGradient id="dqg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[0]}"/></linearGradient>
  <radialGradient id="dqglow" cx=".85" cy=".08" r=".7"><stop offset="0" stop-color="${p[2]}" stop-opacity=".22"/><stop offset="1" stop-color="${p[2]}" stop-opacity="0"/></radialGradient></defs>
  <rect width="430" height="560" fill="url(#dqg)"/>
  <g fill="none" stroke="#e6b566" stroke-opacity=".14" stroke-width="1.2" class="dq-orb"><circle cx="370" cy="60" r="70"/><circle cx="370" cy="60" r="115"/><circle cx="370" cy="60" r="165"/><circle cx="370" cy="60" r="220"/></g>
  <g stroke="${p[2]}" stroke-opacity=".12" stroke-width="1.5">${Array.from({ length: 9 }, (_, i) => `<line x1="${-20 + i * 24}" y1="560" x2="${120 + i * 24}" y2="440"/>`).join('')}</g>
  <path d="M0 470 C 90 430, 170 520, 260 470 S 400 430, 430 455 L430 560 L0 560Z" fill="#000" fill-opacity="0"/>
  <circle cx="60" cy="500" r="3" fill="${p[2]}" fill-opacity=".8"/><circle cx="395" cy="300" r="2.5" fill="${p[2]}" fill-opacity=".7"/><circle cx="330" cy="520" r="2" fill="#fff" fill-opacity=".6"/><circle cx="30" cy="250" r="2" fill="#fff" fill-opacity=".5"/></svg>`;
}

/* ---------- text helpers ---------- */
function greeting(now){
  const h = now.getHours(); const part = h < 12 ? 0 : h < 17 ? 1 : 2;
  const en = ['Good morning', 'Good afternoon', 'Good evening'][part], sw = ['Habari za asubuhi', 'Habari za mchana', 'Habari za jioni'][part];
  return L(en, sw);
}
function firstName(){ const n = ((typeof AGENT !== 'undefined' && AGENT && AGENT.name) || '').trim().split(/\s+/)[0] || ''; return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : L('Agent', 'Wakala'); }
function initials(a){ if(/\d|proverb|saying|motto/i.test(a)){ return /swahili|kenyan/i.test(a) ? 'KE' : '❝'; } const w = a.replace(/[^A-Za-zÀ-ÿ'.\s-]/g, ' ').split(/\s+/).filter(x => x && !/^(jr\.?|the|of|von|de|van)$/i.test(x)); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); }
function sizeFor(len){ return len < 70 ? 27 : len < 120 ? 23 : len < 190 ? 20 : 17; }
function sourceLine(q){ const s = q[2] || ''; if(!s) return ''; if(/^meaning: /i.test(s)) return L('Meaning: ', 'Maana: ') + s.slice(9); if(/^idea from /i.test(s)) return L('A key idea from ', 'Wazo kuu kutoka ') + s.slice(10); if(/^[A-Z][a-z]+ \d+:\d+$|^\d? ?[A-Z][a-z]+ \d+:\d+$/.test(s)) return s; return L('From ', 'Kutoka ') + s; }

/* ---------- the card ---------- */
function build(q, opts){
  injectCss(); const old = $('#dqBack'); if(old) old.remove();
  const now = new Date(), p = PALETTES[(dayNumber(now) + hash(q[1])) % PALETTES.length];
  const wrap = document.createElement('div'); wrap.id = 'dqBack';
  const streak = opts.streak > 1 ? L(opts.streak + '-day streak', 'Siku ' + opts.streak + ' mfululizo') : L('A new day, a fresh start', 'Siku mpya, mwanzo mpya');
  const dateTxt = now.toLocaleDateString(T.lang() === 'sw' ? 'sw-KE' : 'en-KE', { weekday: 'long', day: 'numeric', month: 'long' });
  wrap.innerHTML = `<div id="dqCard" role="dialog" aria-modal="true" aria-labelledby="dqHi" aria-describedby="dqQ" style="--dq-acc:${p[2]}">${art(p)}
   <div class="dq-in"><button class="dq-x" id="dqX" aria-label="${esc(L('Close', 'Funga'))}">&times;</button>
   <div class="dq-tag"><i></i>${esc(L("Today's spark", 'Cheche ya leo'))}</div>
   <h2 class="dq-hi" id="dqHi">${esc(greeting(now))}, ${esc(firstName())}</h2><div class="dq-date">${esc(dateTxt)}</div>
   <div class="dq-mark" aria-hidden="true">&ldquo;</div>
   <blockquote id="dqQ" style="font-size:${sizeFor(q[0].length)}px;line-height:1.38;">${esc(q[0])}</blockquote>
   <div class="dq-by"><div class="dq-mono" aria-hidden="true">${esc(initials(q[1]))}</div><div><div class="dq-au">${esc(q[1])}</div>${sourceLine(q) ? `<div class="dq-src">${esc(sourceLine(q))}</div>` : ''}</div></div>
   <div class="dq-rule"></div><div class="dq-meta"><span>${esc(streak)}</span><span>${esc(L('Make today count.', 'Fanya leo ihesabike.'))}</span></div>
   <div class="dq-btns"><button class="dq-go" id="dqGo">${esc(L("Let's go", 'Tuanze'))}</button><a class="dq-sh" id="dqSh" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('“' + q[0] + '” — ' + q[1])}">${esc(L('Share', 'Shiriki'))}</a></div></div></div>`;
  document.body.appendChild(wrap);
  const prev = document.activeElement; const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); if(prev && prev.focus) try{ prev.focus(); }catch(e){} };
  const onKey = e => { if(e.key === 'Escape') close(); if(e.key === 'Tab'){ const f = Array.from(wrap.querySelectorAll('button,a')); if(!f.length) return; const first = f[0], last = f[f.length - 1]; if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); } else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); } } };
  document.addEventListener('keydown', onKey);
  $('#dqX', wrap).addEventListener('click', close); $('#dqGo', wrap).addEventListener('click', close);
  wrap.addEventListener('click', e => { if(e.target === wrap) close(); });
  setTimeout(() => { const g = $('#dqGo', wrap); if(g) g.focus(); }, 60);
}

/* ---------- once per day ---------- */
const who = () => (typeof AGENT !== 'undefined' && AGENT && (AGENT.agentId || AGENT.phone)) || 'anon';
const state = () => get(K(KEY), { last: '', streak: 0, idx: -1 });
let showing = false;
async function showToday(force){
  if(showing) return; showing = true;
  try{
    const lib = await library(); if(!lib.length) return;
    const params = new URLSearchParams(location.search), rnd = params.get('dq') === 'random';
    const now = new Date(), today = ymd(now), st = state();
    if(rnd){ build(lib[Math.floor(Math.random() * lib.length)], { streak: 3 }); return; }
    const idx = pickIndex(lib.length, String(who()), now);
    if(force){ build(lib[idx], { streak: st.streak || 1 }); return; }
    if(st.last === today) return;
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1), streak = st.last === ymd(y) ? (st.streak || 0) + 1 : 1;
    put(K(KEY), { last: today, streak, idx });
    build(lib[idx], { streak });
  } finally { showing = false; }
}
function due(){
  if(!loggedIn() || !AGENT.token && !AGENT.phone) return false;
  const s = window.AgentApps && window.AgentApps.status && window.AgentApps.status(); if(s && s.features && s.features.dailyQuote === false) return false;
  if(new URLSearchParams(location.search).get('dq') === 'random') return !$('#dqBack');
  return state().last !== ymd(new Date()) && !$('#dqBack');
}
let armed = false;
function maybe(){
  if(armed || !due()) return; armed = true;
  setTimeout(async () => { try{ if(window.AgentApps && !window.AgentApps.status()) await Promise.race([window.AgentApps.loadStatus(false), new Promise(r => setTimeout(r, 2500))]); }catch(e){} armed = false; if(!due()) return; if($('#atPanel') || ($('#gateScreen') && $('#gateScreen').style.display !== 'none')) return; showToday(false); }, 900);
}
function homeTile(){
  const grid = $('#atHome'); if(!grid || $('#dqTile')) return;
  const b = document.createElement('button'); b.className = 'at-tile'; b.id = 'dqTile'; b.innerHTML = `<b>${esc(L("Today's spark", 'Cheche ya leo'))}</b><span>${esc(L('Read today\'s thought again', 'Soma wazo la leo tena'))}</span>`;
  b.addEventListener('click', () => showToday(true)); grid.appendChild(b);
}
if(typeof render === 'function'){
  const _r = render;
  render = function(){ const r = _r.apply(this, arguments); try{ if(loggedIn()){ maybe(); if(state && document.body) homeTile(); } }catch(e){ console.error('daily-quote', e); } return r; };
}
window.DailyQuote = { pickIndex, permutation, showToday, dayNumber, state };
setTimeout(maybe, 2600);
})();
