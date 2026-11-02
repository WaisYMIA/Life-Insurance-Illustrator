/* ============================================================
   CALCULATOR — a floating calculator for quick estimations while quoting.
   - A round button sits bottom-right on every screen (above the feedback/install buttons' row). Tap to open a compact panel
     that does not hide the quote behind it on tablets and PCs; on phones it opens above the button.
   - Full keyboard support (digits, + - * /, %, Enter, Backspace, Esc). Percentages work the way people expect:
     200000 + 10% = 220000.
   - Copy the result (or any line in the history) with one tap. Commas on/off is remembered.
   ============================================================ */
(function(){
'use strict';
if(window.__appCalc) return; window.__appCalc = true;

/* ---------- arithmetic (no eval) ---------- */
const OPS = '+−×÷';
function tokenize(expr){
  const out = []; let i = 0;
  while(i < expr.length){
    const c = expr[i];
    if(/[0-9.]/.test(c)){ let j = i; while(j < expr.length && /[0-9.]/.test(expr[j])) j++; const n = parseFloat(expr.slice(i, j)); if(isNaN(n)) return null; let pct = false; if(expr[j] === '%'){ pct = true; j++; } out.push({ n, pct }); i = j; }
    else if(OPS.includes(c)){ out.push({ op: c }); i++; }
    else return null;
  }
  return out;
}
function evaluate(expr){
  const tk = tokenize(expr); if(!tk || !tk.length) return null;
  // fold unary minus into the following number
  const t = []; for(let i = 0; i < tk.length; i++){ const k = tk[i]; if(k.op === '−' && (i === 0 || tk[i - 1].op) && tk[i + 1] && tk[i + 1].n !== undefined){ t.push({ n: -tk[i + 1].n, pct: tk[i + 1].pct }); i++; } else t.push(k); }
  if(t[0].op || t[t.length - 1].op) return null;
  for(let i = 0; i < t.length; i++){ if((i % 2 === 0) === (t[i].op !== undefined)) return null; }
  // terms: runs joined by × ÷
  const terms = []; let cur = { sign: '+', val: null, single: null };
  let acc = t[0].pct ? t[0].n / 100 : t[0].n, single = t[0].pct ? t[0] : null, pendingSign = '+', i = 1;
  const flush = () => { terms.push({ sign: pendingSign, val: acc, pctOnly: single && single.pct ? single.n : null }); };
  while(i < t.length){
    const op = t[i].op, r = t[i + 1]; const rv = r.pct ? r.n / 100 : r.n;
    if(op === '×'){ acc = acc * rv; single = null; }
    else if(op === '÷'){ if(rv === 0) return { error: 'Cannot divide by zero' }; acc = acc / rv; single = null; }
    else { flush(); pendingSign = op === '+' ? '+' : '-'; acc = rv; single = r.pct ? r : null; }
    i += 2;
  }
  flush();
  let total = terms[0].val;
  for(let k = 1; k < terms.length; k++){ const tm = terms[k]; const amt = tm.pctOnly !== null ? total * tm.pctOnly / 100 : tm.val; total = tm.sign === '+' ? total + amt : total - amt; }
  if(!isFinite(total)) return { error: 'Result too large' };
  return { value: parseFloat(total.toPrecision(12)) };
}
function fmtNumber(v, commas){
  if(typeof v !== 'number') return '';
  if(Math.abs(v) >= 1e15 || (v !== 0 && Math.abs(v) < 1e-9)) return v.toExponential(6).replace(/\.?0+e/, 'e');
  const s = String(parseFloat(v.toPrecision(12)));
  if(s.includes('e')) return s;
  const neg = s[0] === '-', body = neg ? s.slice(1) : s, [ip, fp] = body.split('.');
  return (neg ? '-' : '') + (commas ? ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ip) + (fp ? '.' + fp : '');
}
function fmtExpr(expr, commas){ return expr.replace(/\d+(\.\d*)?|\.\d+/g, m => { const [ip, fp] = m.split('.'); const g = commas ? ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ip; return m.includes('.') ? g + '.' + (fp || '') : g; }); }
window.AppCalc = { evaluate, fmtNumber, fmtExpr };

/* ---------- state ---------- */
const HKEY = 'illustrator_calc_v1';
let expr = '', justDone = false, mem = 0, commas = true, history = [], err = '';
try{ const s = JSON.parse(localStorage.getItem(HKEY) || '{}'); commas = s.commas !== false; history = Array.isArray(s.history) ? s.history.slice(0, 8) : []; }catch(e){}
const save = () => { try{ localStorage.setItem(HKEY, JSON.stringify({ commas, history })); }catch(e){} };
const lastNumber = () => { const m = expr.match(/[0-9.]+%?$/); return m ? m[0] : ''; };

function press(k){
  err = '';
  if(/^[0-9]$/.test(k)){ if(justDone){ expr = ''; justDone = false; } const ln = lastNumber(); if(ln === '0' && !ln.includes('.')) expr = expr.slice(0, -1); if(expr.endsWith('%')) return; if(lastNumber().replace('.', '').length >= 15) return; expr += k; }
  else if(k === '.'){ if(justDone){ expr = ''; justDone = false; } if(expr.endsWith('%')) return; const ln = lastNumber(); if(ln.includes('.')) return; expr += ln ? '.' : '0.'; }
  else if(OPS.includes(k)){ if(justDone) justDone = false; if(!expr){ if(k === '−') expr = '−'; return render(); } if(/[+−×÷]$/.test(expr)){ if(expr.length === 1) return render(); if(k === '−' && /[×÷]$/.test(expr)) { expr += '−'; return render(); } expr = expr.replace(/[+−×÷]+$/, '') + k; } else expr += k; }
  else if(k === '%'){ if(!/[0-9]$/.test(expr)) return; expr += '%'; justDone = false; }
  else if(k === 'back'){ if(justDone){ expr = ''; justDone = false; } else expr = expr.slice(0, -1); }
  else if(k === 'clear'){ expr = ''; justDone = false; }
  else if(k === 'neg'){ negate(); }
  else if(k === '='){ equals(); return; }
  render();
}
function negate(){
  if(!expr) return;
  const m = expr.match(/^(.*?)([0-9.]+%?)$/); if(!m) return;
  const before = m[1], num = m[2];
  if(!before) expr = '−' + num;
  else if(before === '−') expr = num;
  else if(/[×÷]−$/.test(before)) expr = before.slice(0, -1) + num;
  else if(/[×÷]$/.test(before)) expr = before + '−' + num;
  else if(/\+$/.test(before)) expr = before.slice(0, -1) + '−' + num;
  else if(/−$/.test(before)) expr = before.slice(0, -1) + '+' + num;
  justDone = false;
}
function equals(){
  const e = expr.replace(/[+−×÷]+$/, ''); if(!e) return;
  const r = evaluate(e);
  if(!r){ err = 'Check the numbers'; return render(); }
  if(r.error){ err = r.error; return render(); }
  history.unshift({ e: e, v: r.value }); history = history.slice(0, 8); save();
  expr = String(r.value).includes('e') ? String(r.value) : (r.value < 0 ? '−' + String(-r.value) : String(r.value)); justDone = true;
  render(true);
}
function currentValue(){ const e = expr.replace(/[+−×÷]+$/, ''); if(!e) return null; const r = evaluate(e); return r && r.value !== undefined ? r.value : null; }
function resultText(){ const v = currentValue(); return v === null ? '' : fmtNumber(v, commas); }

/* ---------- copy ---------- */
async function copyText(text, label){
  if(!text) return;
  let ok = false;
  try{ await navigator.clipboard.writeText(text); ok = true; }catch(e){}
  if(!ok){ try{ const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); }catch(e){} }
  flash(ok ? (label || 'Copied') : 'Could not copy');
}
let flashT = null;
function flash(msg){ const el = document.getElementById('calcFlash'); if(!el) return; el.textContent = msg; el.classList.add('on'); clearTimeout(flashT); flashT = setTimeout(() => el.classList.remove('on'), 1600); const live = document.getElementById('calcLive'); if(live) live.textContent = msg; }

/* ---------- look ---------- */
const CSS = `
#calcFab{position:fixed;right:14px;bottom:14px;z-index:9985;width:54px;height:54px;border-radius:50%;border:0;background:var(--brand,#7b2434);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.28);transition:transform .15s ease,box-shadow .15s ease;padding:0;}
#calcFab:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(0,0,0,.32);}
#calcFab:active{transform:scale(.94);}
#calcFab[aria-expanded=true]{background:var(--brand-dark,#4c1520);}
#calcFab svg{width:26px;height:26px;}
#calcFab .tip{position:absolute;right:62px;white-space:nowrap;background:#2b1d1d;color:#fff;font:600 12.5px system-ui,sans-serif;padding:6px 10px;border-radius:8px;opacity:0;pointer-events:none;transition:opacity .15s;}
@media (hover:hover){#calcFab:hover .tip{opacity:1;}}
#calcFab:focus-visible,#calcPanel button:focus-visible{outline:3px solid #e6b566;outline-offset:2px;}
#calcPanel{position:fixed;right:14px;bottom:78px;z-index:9986;width:min(318px,calc(100vw - 28px));max-height:calc(100vh - 96px);overflow:auto;background:#fffdfb;border-radius:22px;box-shadow:0 18px 48px rgba(40,10,15,.38),0 0 0 1px rgba(123,36,52,.12);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#2b1d1d;animation:calcIn .18s ease both;box-sizing:border-box;}
@keyframes calcIn{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
#calcPanel .c-top{display:flex;align-items:center;justify-content:space-between;padding:10px 12px 0 16px;}
#calcPanel .c-top b{font:700 13px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#7b2434;}
#calcPanel .c-top .c-ic{border:0;background:transparent;color:#7b2434;width:40px;height:40px;border-radius:50%;cursor:pointer;font:600 18px/1 system-ui,sans-serif;display:inline-flex;align-items:center;justify-content:center;}
#calcPanel .c-top .c-ic:hover{background:rgba(123,36,52,.09);}
#calcPanel .c-disp{margin:4px 12px 8px;padding:10px 14px 10px;background:#f6efe9;border-radius:16px;text-align:right;min-height:84px;display:flex;flex-direction:column;justify-content:flex-end;}
#calcPanel .c-expr{font:500 15px/1.3 system-ui,sans-serif;color:#6b5656;min-height:20px;word-break:break-all;overflow-wrap:anywhere;}
#calcPanel .c-res{font:700 34px/1.15 system-ui,sans-serif;color:#2b1d1d;word-break:break-all;cursor:pointer;min-height:40px;font-variant-numeric:tabular-nums;}
#calcPanel .c-res.sm{font-size:26px;} #calcPanel .c-res.xs{font-size:20px;}
#calcPanel .c-res.err{font-size:16px;color:#a3182f;font-weight:600;}
#calcPanel .c-mem{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:0 12px;}
#calcPanel .c-mem button{border:0;background:transparent;color:#7b2434;font:700 13px system-ui,sans-serif;min-height:34px;border-radius:10px;cursor:pointer;}
#calcPanel .c-mem button:hover{background:rgba(123,36,52,.08);}
#calcPanel .c-keys{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:6px 12px 10px;}
#calcPanel .k{border:0;border-radius:16px;min-height:54px;font:600 21px system-ui,sans-serif;cursor:pointer;background:#fff;color:#2b1d1d;box-shadow:0 1px 0 rgba(0,0,0,.08),0 0 0 1px rgba(0,0,0,.06) inset;transition:transform .06s ease,background .12s;}
#calcPanel .k:active{transform:scale(.94);background:#f1e7e1;}
#calcPanel .k.op{background:#f4e6e8;color:#7b2434;font-size:24px;}
#calcPanel .k.fn{background:#efe9e4;color:#4c1520;font-size:17px;}
#calcPanel .k.eq{background:linear-gradient(135deg,#e6b566,#f3d9a4);color:#2b1a12;font-size:26px;box-shadow:0 4px 12px rgba(230,181,102,.45);}
#calcPanel .c-foot{display:flex;gap:8px;padding:0 12px 12px;}
#calcPanel .c-copy{flex:1;border:0;border-radius:14px;min-height:48px;background:#7b2434;color:#fff;font:700 15px system-ui,sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;}
#calcPanel .c-copy:hover{background:#4c1520;}
#calcPanel .c-copy:disabled{opacity:.45;cursor:default;}
#calcPanel .c-tg{border:1.5px solid #d9c9c9;background:#fff;border-radius:14px;min-height:48px;padding:0 12px;color:#4c1520;font:600 14px system-ui,sans-serif;cursor:pointer;}
#calcPanel .c-tg[aria-pressed=true]{background:#f4e6e8;border-color:#7b2434;}
#calcPanel .c-hist{border-top:1px solid #eadfdf;padding:8px 12px 12px;}
#calcPanel .c-hist h3{margin:0 0 4px;font:700 12px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#6b5656;display:flex;justify-content:space-between;align-items:center;}
#calcPanel .c-hist h3 button{border:0;background:transparent;color:#7b2434;font:600 12.5px system-ui,sans-serif;cursor:pointer;min-height:32px;}
#calcPanel .c-h{display:flex;width:100%;border:0;background:transparent;text-align:right;padding:8px 6px;border-radius:10px;cursor:pointer;font:14px system-ui,sans-serif;color:#2b1d1d;justify-content:space-between;gap:10px;min-height:44px;align-items:center;}
#calcPanel .c-h:hover{background:#f6efe9;}
#calcPanel .c-h span:first-child{color:#6b5656;text-align:left;word-break:break-all;} #calcPanel .c-h span:last-child{font-weight:700;white-space:nowrap;}
#calcFlash{position:absolute;left:50%;top:50px;transform:translateX(-50%) translateY(-4px);background:#2b1d1d;color:#fff;font:600 12.5px system-ui,sans-serif;padding:7px 12px;border-radius:999px;opacity:0;pointer-events:none;transition:opacity .15s,transform .15s;}
#calcFlash.on{opacity:1;transform:translateX(-50%);}
#calcPanel .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}
#floatInstall{bottom:80px!important;}
#updReady{bottom:80px!important;}
body.calc-open #floatInstall,body.calc-open #updReady{display:none!important;}
body{padding-bottom:84px!important;}
@media (min-width:768px){#calcFab{right:24px;bottom:24px;}#calcPanel{right:24px;bottom:90px;width:332px;}#floatInstall{right:24px!important;bottom:90px!important;}}
@media (max-height:620px){#calcPanel .k{min-height:44px;}#calcPanel .c-disp{min-height:70px;}}
@media (prefers-reduced-motion:reduce){#calcPanel{animation:none;}#calcFab,#calcPanel .k{transition:none;}}
@media print{#calcFab,#calcPanel{display:none!important;}}
`;
const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="4.5" y="2.8" width="15" height="18.4" rx="3"/><rect x="7.5" y="5.8" width="9" height="3.6" rx=".8"/><path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01M16 16.5h.01"/></svg>';
const KEYS = [['clear', 'AC', 'fn', 'Clear all'], ['back', '⌫', 'fn', 'Delete last'], ['%', '%', 'fn', 'Percent'], ['÷', '÷', 'op', 'Divide'],
  ['7', '7'], ['8', '8'], ['9', '9'], ['×', '×', 'op', 'Multiply'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['−', '−', 'op', 'Minus'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+', 'op', 'Plus'],
  ['neg', '±', 'fn', 'Change sign'], ['0', '0'], ['.', '.', '', 'Decimal point'], ['=', '=', 'eq', 'Equals']];

/* ---------- the panel ---------- */
let panel = null, fab = null, showHist = false;
function build(){
  if(!document.getElementById('calcCss')){ const s = document.createElement('style'); s.id = 'calcCss'; s.textContent = CSS; document.head.appendChild(s); }
  fab = document.createElement('button'); fab.id = 'calcFab'; fab.type = 'button'; fab.setAttribute('aria-label', 'Calculator'); fab.setAttribute('aria-expanded', 'false'); fab.setAttribute('aria-controls', 'calcPanel');
  fab.innerHTML = ICON + '<span class="tip" aria-hidden="true">Calculator</span>'; fab.addEventListener('click', toggle); document.body.appendChild(fab);
  syncVisibility();
}
function open(){
  if(panel) return; fab.setAttribute('aria-expanded', 'true'); document.body.classList.add('calc-open');
  panel = document.createElement('div'); panel.id = 'calcPanel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Calculator'); panel.tabIndex = -1;
  panel.innerHTML = `<div id="calcFlash" aria-hidden="true"></div><div class="sr" id="calcLive" role="status" aria-live="polite"></div>
   <div class="c-top"><b>Calculator</b><span><button type="button" class="c-ic" id="calcHist" aria-label="Show history" aria-pressed="false" title="History">&#128337;</button><button type="button" class="c-ic" id="calcX" aria-label="Close calculator">&times;</button></span></div>
   <div class="c-disp"><div class="c-expr" id="calcExpr"></div><div class="c-res" id="calcRes" title="Tap to copy" role="button" tabindex="0" aria-label="Result. Press to copy."></div></div>
   <div class="c-mem"><button type="button" data-m="mc" aria-label="Memory clear">MC</button><button type="button" data-m="mr" aria-label="Memory recall">MR</button><button type="button" data-m="m-" aria-label="Subtract from memory">M−</button><button type="button" data-m="m+" aria-label="Add to memory">M+</button></div>
   <div class="c-keys">${KEYS.map(k => `<button type="button" class="k ${k[2] || ''}" data-k="${k[0]}" aria-label="${k[3] || k[1]}">${k[1]}</button>`).join('')}</div>
   <div class="c-foot"><button type="button" class="c-copy" id="calcCopy"><span aria-hidden="true">&#10064;</span> Copy result</button><button type="button" class="c-tg" id="calcCommas" aria-pressed="${commas}" title="Thousand separators">1,000</button></div>
   <div class="c-hist" id="calcHistBox" hidden></div>`;
  document.body.appendChild(panel);
  panel.addEventListener('click', onClick); panel.addEventListener('keydown', onKey);
  document.getElementById('calcRes').addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); copyResult(); } });
  render(); panel.focus({ preventScroll: true });
}
function close(){ if(!panel) return; panel.remove(); panel = null; document.body.classList.remove('calc-open'); fab.setAttribute('aria-expanded', 'false'); try{ fab.focus({ preventScroll: true }); }catch(e){} }
function toggle(){ panel ? close() : open(); }
function copyResult(){ const t = resultText(); if(!t){ flash('Nothing to copy'); return; } copyText(t, 'Copied ' + t); }
function onClick(e){
  const b = e.target.closest('button'); if(!b) { if(e.target.id === 'calcRes') copyResult(); return; }
  if(b.id === 'calcX') return close();
  if(b.id === 'calcCopy') return copyResult();
  if(b.id === 'calcCommas'){ commas = !commas; save(); b.setAttribute('aria-pressed', commas); return render(); }
  if(b.id === 'calcHist'){ showHist = !showHist; b.setAttribute('aria-pressed', showHist); b.setAttribute('aria-label', showHist ? 'Hide history' : 'Show history'); return render(); }
  if(b.dataset.k !== undefined) return press(b.dataset.k);
  if(b.dataset.m){ const v = currentValue(); if(b.dataset.m === 'mc'){ mem = 0; flash('Memory cleared'); } else if(b.dataset.m === 'mr'){ const s = fmtNumber(mem, false).replace('-', '−'); if(justDone) { expr = ''; justDone = false; } expr += s; render(); } else if(v !== null){ mem += b.dataset.m === 'm+' ? v : -v; flash('Memory: ' + fmtNumber(mem, commas)); } else flash('Enter a number first'); return; }
  if(b.dataset.h !== undefined){ const h = history[+b.dataset.h]; if(h) copyText(`${fmtExpr(h.e, commas).replace(/([+−×÷])/g, ' $1 ')} = ${fmtNumber(h.v, commas)}`, 'Copied calculation'); return; }
  if(b.dataset.hv !== undefined){ const h = history[+b.dataset.hv]; if(h) copyText(fmtNumber(h.v, commas), 'Copied ' + fmtNumber(h.v, commas)); return; }
  if(b.id === 'calcHistClear'){ history = []; save(); render(); }
}
function onKey(e){
  if(e.key === 'Escape'){ e.preventDefault(); return close(); }
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target; if(t && t.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;   // let a focused button activate normally
  const map = { '*': '×', 'x': '×', 'X': '×', '/': '÷', '-': '−', '+': '+', '%': '%', '.': '.', ',': '.', 'Enter': '=', '=': '=', 'Backspace': 'back', 'Delete': 'clear', 'c': 'clear', 'C': 'clear' };
  const k = /^[0-9]$/.test(e.key) ? e.key : map[e.key]; if(!k) return;
  e.preventDefault(); press(k);
}
function render(done){
  if(!panel) return;
  const ex = document.getElementById('calcExpr'), rs = document.getElementById('calcRes'), cp = document.getElementById('calcCopy');
  const e = fmtExpr(expr, commas).replace(/([+−×÷])/g, ' $1 ').replace(/^ −/, '−').replace(/ ([×÷]) −/g, ' $1 −').trim();
  let main = '', sub = '';
  if(err){ main = err; }
  else if(done && history[0]){ sub = fmtExpr(history[0].e, commas).replace(/([+−×÷])/g, ' $1 ').trim() + ' ='; main = fmtNumber(history[0].v, commas); }
  else {
    sub = expr ? e : '';
    const r = currentValue(), hasOp = /[+−×÷%]/.test(expr.replace(/^−/, ''));
    main = !expr ? '0' : (hasOp && r !== null) ? fmtNumber(r, commas) : fmtExpr(expr.replace(/[+−×÷]+$/, ''), commas) || '0';
  }
  ex.textContent = sub; rs.textContent = main || '0'; rs.className = 'c-res' + (err ? ' err' : main.length > 17 ? ' xs' : main.length > 11 ? ' sm' : '');
  cp.disabled = !(currentValue() !== null || done);
  const hb = document.getElementById('calcHistBox'); hb.hidden = !showHist;
  if(showHist){ hb.innerHTML = `<h3>History <button type="button" id="calcHistClear">Clear</button></h3>` + (history.length ? history.map((h, i) => `<button type="button" class="c-h" data-h="${i}" title="Copy this calculation"><span>${esc(fmtExpr(h.e, commas).replace(/([+−×÷])/g, ' $1 '))}</span><span>= ${esc(fmtNumber(h.v, commas))}</span></button>`).join('') : '<p style="margin:6px 4px;color:#6b5656;font-size:13.5px;">Your calculations appear here. Tap one to copy it.</p>'); }
  if(done){ const live = document.getElementById('calcLive'); if(live) live.textContent = 'Result ' + main; }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- visibility: not on the sign-in screen, nor while printing ---------- */
function syncVisibility(){
  if(!fab) return; const g = document.getElementById('gateScreen'); const gate = g && getComputedStyle(g).display !== 'none';
  fab.style.display = gate ? 'none' : 'flex'; if(gate && panel) close();
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
setInterval(syncVisibility, 300);
document.addEventListener('keydown', e => { if((e.key === 'Escape') && panel && !panel.contains(document.activeElement)) { /* Escape anywhere closes it when nothing else is open */ if(!document.querySelector('#dqBack,#helpPanel,#atPanel,#acctSheet,#fbSheet')) close(); } });
window.AppCalc.open = open; window.AppCalc.close = close;
})();
