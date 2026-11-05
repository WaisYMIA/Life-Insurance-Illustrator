/* ============================================================
   MARKET COMPARISON (v2026.11.6) — loaded after agent-growth.js.
   Browse life products from Kenyan insurers by category, open the details, and compare 2–3 side by side.
   Data: market-data.js (desk research from public pages; always verify with the insurer's own documents).
   ============================================================ */
(function(root){
const CATS = [
  ['term-life', 'Term life', 'Maisha ya muda'], ['whole-life', 'Whole life', 'Maisha yote'], ['endowment-savings', 'Savings & endowment', 'Akiba na endowment'],
  ['education', 'Education', 'Elimu'], ['investment-linked', 'Investment-linked', 'Uwekezaji'], ['funeral-family-protection', 'Funeral & family', 'Mazishi na familia'],
  ['credit-mortgage', 'Credit & mortgage', 'Mikopo na rehani'], ['pension-retirement', 'Pension & retirement', 'Pensheni'], ['group', 'Group', 'Kikundi'], ['other', 'Other', 'Nyingine']
];
const GUIDE = {
  'term-life': { what: 'Pure protection for a fixed period. It pays only if the life assured dies (or claims a rider) inside the term.', who: 'Breadwinners, young families, people with loans.',
    cmp: ['Maximum cover and entry/maturity age', 'Cover without a medical test', 'Whether premiums stay level for the whole term', 'Riders: critical illness, disability, premium waiver', 'Can it be converted to a savings or whole life plan?'],
    sell: 'Lead with income replacement: how many years of salary would the family need? It is the cheapest cover per shilling.',
    obj: [['I get nothing back if I live.', 'You are buying protection, like motor cover. If a return matters, show a savings plan or a plan with a maturity benefit alongside.'], ['I am young and healthy.', 'Premiums are lowest and approval easiest now; waiting only raises the price.']] },
  'whole-life': { what: 'Cover for life, not for a period. A payout is certain, so it is used for legacy, estate costs and wealth transfer.', who: 'Higher-income clients, business owners, parents planning inheritance.',
    cmp: ['Premium paying period vs. lifetime cover', 'Does the benefit grow each year?', 'Medical-free limit and trust/beneficiary options', 'Included disability, critical illness or funeral benefits', 'Surrender or loan terms'],
    sell: 'Frame it as certainty: it will pay one day, and it can be set up so the family receives it in the way the client chooses.',
    obj: [['It is expensive.', 'It costs more than term because it never expires. Show the premium-paying period (for example 10, 15 or 20 years) rather than the lifetime.'], ['I will never use it.', 'Your family will. It also covers estate and succession costs without selling assets.']] },
  'endowment-savings': { what: 'Disciplined savings with life cover. A lump sum is paid at maturity or earlier on death, with bonuses where the product declares them.', who: 'Salaried clients who struggle to save, goal-based savers.',
    cmp: ['Guaranteed vs. bonus-based returns', 'Minimum premium and term', 'Early surrender and loan rules', 'What happens on death or disability (premiums waived? benefit paid?)', 'Tax treatment'],
    sell: 'Sell the habit and the guarantee: money that is hard to touch, plus protection that continues if the client cannot pay.',
    obj: [['I can save in a bank or SACCO.', 'Yes, and the value here is the protection on top and the discipline of a contract. Show the premium waiver on death or disability.'], ['I might need the money early.', 'Check the loan and partial-withdrawal terms with the client before signing, and say them plainly.']] },
  'education': { what: 'Saving for school fees with life cover, so the education fund survives the parent.', who: 'Parents and guardians with children aged 0 to 18.',
    cmp: ['Guaranteed payouts vs. bonus-based or fund-value maturity', 'Payout flexibility (lump sum, termly, annual)', 'Premium waiver on death or disability', 'Policy term vs. the child\'s school stages', 'Child-related riders (accident, hospital)'],
    sell: 'Work backward from the fee year: when will the child need the money, and what happens to the plan if the parent dies first?',
    obj: [['School fees can be paid when they come.', 'Fees rise every year and arrive in lumps. A fund set up early removes the shock and keeps going if the parent dies.'], ['I will use my business income.', 'Business income is not guaranteed; the plan is the part of the budget that stays safe.']] },
  'investment-linked': { what: 'Savings invested in a managed fund, with life cover. Returns move with the fund, so there is no fixed guarantee.', who: 'Clients comfortable with some market risk who want growth and flexibility.',
    cmp: ['Fund type and any guarantee', 'Charges and when they are taken', 'Partial withdrawal rules and lock-in', 'Top-ups and flexibility', 'Death, disability and waiver benefits'],
    sell: 'Explain fund value, not a promise. Show conservative, middle and optimistic growth, and the effect of charges.',
    obj: [['What if the fund loses?', 'Show the range openly; long terms and regular saving smooth the ride. This is not for money needed next year.']] },
  'funeral-family-protection': { what: 'Low-cost cover that pays quickly towards funeral and last expenses, often for the whole family.', who: 'Families of any income, groups, SACCO and chama members.',
    cmp: ['Sum assured per member and who is covered', 'Waiting period and claim speed', 'Maximum entry age', 'Premium per month and how it changes with age', 'Whether it can be paid via M-Pesa'],
    sell: 'Speed and simplicity: a fast payout when the family needs cash most. Easy first policy for a new client.',
    obj: [['The family will contribute.', 'Contributions take days and strain relationships; cover pays within days with no collection.']] },
  'credit-mortgage': { what: 'Cover that clears a loan or mortgage if the borrower dies or is disabled.', who: 'Borrowers, homeowners, lenders.',
    cmp: ['Whether cover reduces with the loan', 'Who is the beneficiary (lender or family)', 'Premium basis: single or regular', 'Disability and job-loss add-ons'],
    sell: 'Protect the family home: without it, the loan falls on the survivors.',
    obj: [['The bank already covers me.', 'Check what the lender\'s cover really pays and for how long; a personal policy is portable.']] },
  'pension-retirement': { what: 'Long-term retirement saving, with a pension or lump sum at retirement and tax relief within legal limits.', who: 'Self-employed people, those without an employer scheme, anyone close to retirement.',
    cmp: ['Individual pension vs. provident fund', 'Minimum contribution and flexibility', 'Retirement age and access rules', 'Drawdown or annuity options at retirement', 'Charges and fund options'],
    sell: 'Start with the gap: what income will the client need at 60? Then show the compound effect of starting early.',
    obj: [['Retirement is far away.', 'Every year of delay costs more than it looks; show the start-now vs. start-later numbers.']] },
  'group': { what: 'Cover for a group (employer, SACCO or association) under one master policy.', who: 'Employers, SACCOs, associations.',
    cmp: ['Free cover limit (no medical)', 'Who is eligible and age limits', 'Claims process and speed', 'Add-ons: funeral, disability, critical illness'],
    sell: 'Employee benefit and retention story for employers; simple, low-cost protection for groups.', obj: [] },
  'other': { what: 'Products that do not fit the other groups.', who: 'Depends on the product.', cmp: ['Read the product page and brochure'], sell: 'Explain in plain words who it is for and what it pays.', obj: [] }
};
const catName = (c, sw) => { const x = CATS.find(k => k[0] === c); return x ? (sw ? x[2] : x[1]) : c; };
const ROWS = [
  ['Insurer', p => p._ins], ['What it is', p => p.summary], ['Who it is for', p => p.client], ['How it works', p => p.how], ['Key features', p => p.features], ['Benefits', p => p.benefits],
  ['Riders and options', p => p.riders], ['Entry age', p => p.age], ['Term', p => p.term], ['Minimum premium or cover', p => p.min], ['Payment options', p => p.pay],
  ['Exclusions and waiting periods', p => p.excl], ['Selling advantages', p => p.pros], ['Watch-outs', p => p.cons], ['Source', p => p._src]
];
function flat(data){ const out = []; (data && data.insurers || []).forEach(i => i.products.forEach(p => out.push(Object.assign({ _ins: i.name, _insId: i.id }, p, { _src: p.src ? (p.official ? 'Insurer\'s own page: ' : 'Secondary source: ') + p.src : '' })))); return out; }
function filter(list, o){
  const q = (o.q || '').trim().toLowerCase();
  return list.filter(p => (!o.cat || o.cat === 'all' || p.cat === o.cat) && (!o.ins || o.ins === 'all' || p._insId === o.ins) &&
    (!q || [p.name, p._ins, p.summary, p.client, p.features.join(' ')].join(' ').toLowerCase().includes(q)));
}
function counts(list){ const c = { all: list.length }; list.forEach(p => { c[p.cat] = (c[p.cat] || 0) + 1; }); return c; }
function jubileeMatches(list, p){ return p._insId === 'jubilee' ? [] : list.filter(x => x._insId === 'jubilee' && x.cat === p.cat); }
const PURE = { CATS, GUIDE, ROWS, flat, filter, counts, jubileeMatches, catName };
if(typeof module !== 'undefined' && module.exports) module.exports = PURE;
if(!root || !root.AgentTools || root.__marketCompare) return; root.__marketCompare = true;

/* ======================= browser part ======================= */
const T = root.AgentTools, { showPanel, esc, L, $, $$, toast } = T;
const CSS = `
.mk-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;} .mk-chip{border:1.5px solid var(--line,#e6dcdc);background:#fff;color:inherit;border-radius:999px;padding:7px 12px;font:600 13px system-ui,sans-serif;cursor:pointer;min-height:36px;} .mk-chip[aria-pressed="true"]{background:var(--brand);border-color:var(--brand);color:#fff;}
.mk-card{border:1px solid var(--line,#e6dcdc);background:#fff;border-radius:14px;padding:12px 14px;margin:10px 0;} .mk-card.jub{border-left:5px solid var(--brand);}
.mk-ins{font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted,#6b5b5b);} .mk-name{font-size:16px;font-weight:700;margin:2px 0 4px;} .mk-sum{font-size:14px;line-height:1.45;margin:4px 0;} .mk-line{font-size:12.5px;color:var(--muted,#6b5b5b);margin:4px 0;}
.mk-tag{display:inline-block;border-radius:999px;font-size:11.5px;font-weight:700;padding:2px 8px;margin-right:4px;background:#eee;color:#444;} .mk-tag.ok{background:#e4f4e6;color:#14532d;} .mk-tag.warn{background:#fff1d6;color:#7a4b00;}
.mk-det h4{margin:12px 0 4px;font-size:12.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted,#6b5b5b);} .mk-det ul{margin:0;padding-left:18px;font-size:14px;line-height:1.45;} .mk-det p{margin:0;font-size:14px;line-height:1.45;}
.mk-pro h4{color:#14532d;} .mk-con h4{color:#8a2a1f;}
.mk-bar{position:sticky;bottom:0;background:#fff;border-top:1px solid var(--line,#e6dcdc);padding:8px 0;margin-top:10px;display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;}
.mk-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--line,#e6dcdc);border-radius:12px;} .mk-table{border-collapse:collapse;font-size:13.5px;line-height:1.45;min-width:100%;} .mk-table th,.mk-table td{border-bottom:1px solid var(--line,#e6dcdc);padding:8px 10px;vertical-align:top;text-align:left;} .mk-table th[scope=row]{background:#faf6f6;font-weight:700;width:130px;min-width:130px;position:sticky;left:0;} .mk-table td{min-width:210px;} .mk-table thead th{background:var(--brand);color:#fff;} .mk-table ul{margin:0;padding-left:16px;}
.mk-in{width:100%;box-sizing:border-box;padding:10px;border:1.5px solid var(--line,#e6dcdc);border-radius:10px;font:15px system-ui,sans-serif;margin:4px 0;}
`;
function injectCss(){ if($('#mkCss')) return; const s = document.createElement('style'); s.id = 'mkCss'; s.textContent = CSS; document.head.appendChild(s); }
const DATA = () => root.MARKET_DATA || { insurers: [] };
const picks = [];
const list = (a) => a && a.length ? `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
const sect = (t, v, cls) => v && (Array.isArray(v) ? v.length : String(v).trim()) ? `<div class="${cls || ''}"><h4>${esc(t)}</h4>${Array.isArray(v) ? list(v) : `<p>${esc(v)}</p>`}</div>` : '';

function open(){
  injectCss(); const all = flat(DATA()); const ins = DATA().insurers || [];
  showPanel(L('Market comparison', 'Ulinganisho wa soko'), body => {
    const o = { cat: 'all', ins: 'all', q: '' }; const opened = new Set();
    const draw = () => {
      const cnt = counts(filter(all, { ins: o.ins, q: o.q })); const res = filter(all, o);
      const g = o.cat !== 'all' ? GUIDE[o.cat] : null; const insSel = ins.find(i => i.id === o.ins);
      body.innerHTML = `
        <p class="ag-fine" style="margin-top:0;">${esc(L('Desk research from the insurers\' public pages, checked ' + (DATA().built || '') + '. Use it to prepare conversations, not to quote. Always confirm figures and terms in the insurer\'s own brochure or policy document.', 'Utafiti wa mezani kutoka kurasa za umma za kampuni. Tumia kujiandaa kwa mazungumzo, si kunukuu bei. Thibitisha takwimu kwenye nyaraka rasmi za kampuni.'))}</p>
        <label for="mkQ" class="ag-meta">${esc(L('Search', 'Tafuta'))}</label><input id="mkQ" class="mk-in" type="search" value="${esc(o.q)}" placeholder="${esc(L('Product, insurer or feature', 'Bidhaa, kampuni au kipengele'))}">
        <label for="mkIns" class="ag-meta">${esc(L('Insurer', 'Kampuni'))}</label><select id="mkIns" class="mk-in">${[['all', L('All insurers', 'Kampuni zote')]].concat(ins.map(i => [i.id, i.name + ' (' + i.products.length + ')'])).map(x => `<option value="${esc(x[0])}"${x[0] === o.ins ? ' selected' : ''}>${esc(x[1])}</option>`).join('')}</select>
        <div class="mk-chips" role="group" aria-label="${esc(L('Category', 'Aina'))}">${[['all', L('All', 'Zote')]].concat(CATS.map(c => [c[0], L(c[1], c[2])])).filter(c => c[0] === 'all' || cnt[c[0]]).map(c => `<button type="button" class="mk-chip" data-cat="${c[0]}" aria-pressed="${o.cat === c[0]}">${esc(c[1])} (${cnt[c[0]] || 0})</button>`).join('')}</div>
        ${insSel && insSel.note ? `<div class="mk-card"><div class="mk-ins">${esc(L('About this data', 'Kuhusu data hii'))}</div><p class="mk-sum">${esc(insSel.note)}</p>${insSel.products.length ? '' : `<p class="mk-sum"><b>${esc(L('No products could be captured for this insurer.', 'Hakuna bidhaa zilizopatikana kwa kampuni hii.'))}</b></p>`}</div>` : ''}
        ${g ? `<details class="ag-det" open><summary style="padding:10px 0;font-weight:700;cursor:pointer;">${esc(L('How to compare and sell: ', 'Jinsi ya kulinganisha na kuuza: ') + catName(o.cat, L('a', 'b') === 'b'))}</summary>
          <div class="mk-det"><p>${esc(g.what)}</p>${sect(L('Typical client', 'Mteja wa kawaida'), g.who)}${sect(L('Compare on', 'Linganisha kwa'), g.cmp)}${sect(L('Sales angle', 'Mbinu ya mauzo'), g.sell)}
          ${g.obj.length ? `<h4>${esc(L('Common objections', 'Pingamizi za kawaida'))}</h4><ul>${g.obj.map(x => `<li><b>${esc(x[0])}</b> ${esc(x[1])}</li>`).join('')}</ul>` : ''}</div></details>` : ''}
        <div class="ag-meta" role="status" aria-live="polite">${esc(L(res.length + ' product(s)', 'Bidhaa ' + res.length))}</div>
        ${res.map(p => card(p, all, opened.has(p.id))).join('') || `<div class="mk-card">${esc(L('Nothing matches. Try another category or clear the search.', 'Hakuna kinacholingana. Jaribu aina nyingine.'))}</div>`}
        <div class="mk-bar"><span class="ag-meta">${esc(L('Selected to compare: ', 'Zilizochaguliwa: '))}<b>${picks.length}</b> / 3</span><span><button type="button" class="at-btn" id="mkClr"${picks.length ? '' : ' disabled'}>${esc(L('Clear', 'Futa'))}</button> <button type="button" class="at-btn pri" id="mkGo"${picks.length < 2 ? ' disabled' : ''}>${esc(L('Compare side by side', 'Linganisha'))}</button></span></div>`;
      const q = $('#mkQ', body); q.addEventListener('input', () => { o.q = q.value; const pos = q.selectionStart; draw(); const n = $('#mkQ', body); n.focus(); try{ n.setSelectionRange(pos, pos); }catch(e){} });
      $('#mkIns', body).addEventListener('change', e => { o.ins = e.target.value; draw(); });
      $$('[data-cat]', body).forEach(b => b.addEventListener('click', () => { o.cat = b.dataset.cat; draw(); }));
      $$('[data-det]', body).forEach(b => b.addEventListener('click', () => { const id = b.dataset.det; opened.has(id) ? opened.delete(id) : opened.add(id); const y = body.scrollTop; draw(); body.scrollTop = y; }));
      $$('[data-pick]', body).forEach(b => b.addEventListener('click', () => { pick(b.dataset.pick); const y = body.scrollTop; draw(); body.scrollTop = y; }));
      $('#mkClr', body).addEventListener('click', () => { picks.length = 0; draw(); });
      $('#mkGo', body).addEventListener('click', () => compare(all));
    };
    draw();
  });
}
function pick(id){ const i = picks.indexOf(id); if(i >= 0) picks.splice(i, 1); else if(picks.length < 3) picks.push(id); else toast(L('You can compare up to 3 products.', 'Unaweza kulinganisha bidhaa 3 tu.')); }
function card(p, all, isOpen){
  const on = picks.includes(p.id);
  const jm = jubileeMatches(all, p);
  return `<div class="mk-card${p._insId === 'jubilee' ? ' jub' : ''}"><div class="mk-ins">${esc(p._ins)} · ${esc(catName(p.cat))}</div><div class="mk-name">${esc(p.name)}</div><div class="mk-sum">${esc(p.summary)}</div>
    <div class="mk-line">${[p.age && L('Entry age', 'Umri') + ': ' + p.age, p.term && L('Term', 'Muda') + ': ' + p.term, p.min && L('From', 'Kuanzia') + ': ' + p.min].filter(Boolean).map(esc).join(' · ') || esc(L('Entry age, term and premium not published on the source page.', 'Umri, muda na malipo hayajachapishwa.'))}</div>
    <span class="mk-tag ${p.official ? 'ok' : 'warn'}">${esc(p.official ? L('Insurer\'s own page', 'Ukurasa wa kampuni') : L('Secondary source: verify', 'Chanzo cha pili: thibitisha'))}</span>
    <div class="at-row"><button type="button" class="at-btn" data-det="${esc(p.id)}" aria-expanded="${isOpen}">${esc(isOpen ? L('Hide details', 'Ficha') : L('Details, pros and cons', 'Maelezo, faida na hasara'))}</button>
    <button type="button" class="at-btn" data-pick="${esc(p.id)}" aria-pressed="${on}">${esc(on ? L('Selected ✓', 'Imechaguliwa ✓') : L('Add to compare', 'Ongeza kulinganisha'))}</button></div>
    ${isOpen ? `<div class="mk-det">${sect(L('Who it is for', 'Kwa nani'), p.client)}${sect(L('How it works', 'Inavyofanya kazi'), p.how)}${sect(L('Key features', 'Vipengele'), p.features)}${sect(L('Benefits', 'Faida'), p.benefits)}${sect(L('Riders and options', 'Nyongeza'), p.riders)}${sect(L('Payment options', 'Njia za malipo'), p.pay)}${sect(L('Exclusions and waiting periods', 'Vikwazo'), p.excl)}${sect(L('Other points', 'Mengineyo'), p.distinct)}
      ${sect(L('Selling advantages', 'Faida za kuuza'), p.pros, 'mk-pro')}${sect(L('Watch-outs', 'Tahadhari'), p.cons, 'mk-con')}
      ${jm.length ? `<h4>${esc(L('Jubilee products in the same category', 'Bidhaa za Jubilee za aina hii'))}</h4><div class="at-row">${jm.map(x => `<button type="button" class="at-btn" data-pick="${esc(x.id)}" aria-pressed="${picks.includes(x.id)}">${esc((picks.includes(x.id) ? '✓ ' : '+ ') + x.name)}</button>`).join('')}</div>` : ''}
      <p class="ag-fine">${esc(L('Source', 'Chanzo'))}: ${esc(p._src)}. ${esc(p.srcNote)}</p></div>` : ''}</div>`;
}
function compare(all){
  const ps = picks.map(id => all.find(p => p.id === id)).filter(Boolean); if(ps.length < 2) return;
  showPanel(L('Side by side', 'Mlinganisho'), body => {
    const cell = v => Array.isArray(v) ? (v.length ? list(v) : '—') : (v && String(v).trim() ? esc(v) : '<span class="ag-meta">' + esc(L('Not published', 'Haijachapishwa')) + '</span>');
    const rows = ROWS.map(r => `<tr><th scope="row">${esc(r[0])}</th>${ps.map(p => `<td>${cell(r[1](p))}</td>`).join('')}</tr>`).join('');
    body.innerHTML = `<p class="ag-fine" style="margin-top:0;">${esc(L('Swipe sideways to see every product. “Selling advantages” and “Watch-outs” are our reading of the published facts, not the insurer\'s claims.', 'Telezesha pembeni kuona bidhaa zote. “Faida za kuuza” na “Tahadhari” ni tafsiri yetu ya data iliyochapishwa.'))}</p>
      <div class="mk-scroll" tabindex="0" role="region" aria-label="${esc(L('Comparison table', 'Jedwali la mlinganisho'))}"><table class="mk-table"><thead><tr><th scope="col">${esc(L('Product', 'Bidhaa'))}</th>${ps.map(p => `<th scope="col">${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  });
}
(root.AccountExtras = root.AccountExtras || []).unshift({ id: 'market', label: () => L('Market comparison', 'Ulinganisho wa soko'), fn: open });
root.MarketCompare = Object.assign({ open }, PURE);
injectCss();
})(typeof window !== 'undefined' ? window : null);
