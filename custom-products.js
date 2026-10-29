/* ============================================================
   CUSTOM PRODUCTS ENGINE (UMD) — term life, group life, funeral, credit life, pension.
   One pure module used by the server (validation, preview, parity tests) and by the app (agent calculators),
   so a product prices identically in both places. The company supplies the rates in the admin panel;
   the starter templates carry SAMPLE figures only and cannot be published until real rates are entered
   and a rate source is recorded.
   ============================================================ */
(function(root, factory){
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else root.CustomProducts = factory();
}(typeof self !== 'undefined' ? self : this, function(){
'use strict';

const KINDS = {
  term_life:  { label: 'Term life',   blurb: 'Pure life cover for a fixed term' },
  group_life: { label: 'Group life',  blurb: 'Cover for an employer\'s staff, priced per scheme' },
  funeral:    { label: 'Funeral',     blurb: 'Family funeral cover at fixed monthly premiums' },
  credit_life:{ label: 'Credit life', blurb: 'Clears a loan if the borrower dies' },
  pension:    { label: 'Pension',     blurb: 'Retirement savings projection' }
};
const FREQ = { monthly: { n: 12, label: 'Monthly' }, quarterly: { n: 4, label: 'Quarterly' }, semiannual: { n: 2, label: 'Half-yearly' }, annual: { n: 1, label: 'Yearly' } };

const isNum = v => typeof v === 'number' && isFinite(v);
const round = v => Math.round(v);
function toNum(v){ if(v === '' || v == null) return NaN; const n = Number(String(v).replace(/[,\s]/g, '')); return isFinite(n) ? n : NaN; }
function bandFor(bands, x, fromKey, toKey){ return (bands || []).find(b => x >= b[fromKey] && x <= b[toKey]) || null; }
function levyTotal(amount, levies){ let t = 0; (levies || []).forEach(l => { t += amount * (Number(l.pct) || 0) / 100; }); return t; }

/* ---------- templates (SAMPLE figures) ---------- */
function template(kind){
  const note = 'SAMPLE figures for layout only. Replace every rate with the company\'s approved rates before publishing.';
  const base = { sample: true, rateSource: '', levies: [], note };
  if(kind === 'term_life') return Object.assign({}, base, { minAge: 18, maxAge: 65, maxMaturityAge: 75, minSum: 500000, maxSum: 50000000, sumStep: 50000, terms: [5, 10, 15, 20],
    bands: [{ ageFrom: 18, ageTo: 30, rates: { 5: 1.1, 10: 1.3, 15: 1.6, 20: 2.0 } }, { ageFrom: 31, ageTo: 40, rates: { 5: 1.6, 10: 1.9, 15: 2.4, 20: 3.0 } }, { ageFrom: 41, ageTo: 50, rates: { 5: 3.0, 10: 3.6, 15: 4.6, 20: 5.8 } }, { ageFrom: 51, ageTo: 65, rates: { 5: 6.5, 10: 8.0, 15: 10.5, 20: 13.0 } }],
    smokerLoadingPct: 50, policyFee: 1200, modal: { monthly: 0.0875, quarterly: 0.2600, semiannual: 0.5100, annual: 1 } });
  if(kind === 'group_life') return Object.assign({}, base, { minMembers: 10, multiples: [1, 2, 3, 4, 5], ratePerMille: 1.6, minPremium: 50000, fee: 0, freeCoverLimit: 5000000,
    ageBands: [{ ageFrom: 18, ageTo: 40, loadingPct: 0 }, { ageFrom: 41, ageTo: 50, loadingPct: 20 }, { ageFrom: 51, ageTo: 65, loadingPct: 60 }] });
  if(kind === 'funeral') return Object.assign({}, base, { minAge: 18, maxAge: 65, maxChildren: 6, maxExtended: 6, waitingPeriodMonths: 6,
    levels: [{ label: 'Silver', principal: 100000, spouse: 100000, child: 50000, parent: 50000 }, { label: 'Gold', principal: 200000, spouse: 200000, child: 100000, parent: 100000 }],
    base: [{ ageFrom: 18, ageTo: 45, premiums: { Silver: 180, Gold: 330 } }, { ageFrom: 46, ageTo: 65, premiums: { Silver: 320, Gold: 600 } }],
    addOns: { spouse: { Silver: 120, Gold: 220 }, child: { Silver: 40, Gold: 75 } },
    extended: [{ ageFrom: 0, ageTo: 64, perPerson: 110 }, { ageFrom: 65, ageTo: 80, perPerson: 320 }] });
  if(kind === 'credit_life') return Object.assign({}, base, { minLoan: 10000, maxLoan: 20000000, minTermMonths: 3, maxTermMonths: 84, minAge: 18, maxAge: 65, maxAgeAtMaturity: 70, minPremium: 100,
    termBands: [{ from: 1, to: 12, perMille: 6 }, { from: 13, to: 36, perMille: 12 }, { from: 37, to: 60, perMille: 19 }, { from: 61, to: 84, perMille: 26 }],
    ageBands: [{ ageFrom: 18, ageTo: 45, loadingPct: 0 }, { ageFrom: 46, ageTo: 65, loadingPct: 35 }] });
  if(kind === 'pension') return Object.assign({}, base, { minAge: 18, maxRetireAge: 75, defaultRetireAge: 60, minMonthly: 1000, annuityRatePct: 6.5, inflationPct: 6,
    profiles: { conservative: { label: 'Conservative', growthPct: 7 }, balanced: { label: 'Balanced', growthPct: 9 }, growth: { label: 'Growth', growthPct: 11 } },
    charges: { contributionPct: 3, annualFundPct: 1.5 }, taxRelief: { monthlyCap: 20000 } });
  return null;
}

/* ---------- validation of a definition ---------- */
function checkBands(errs, bands, fromK, toK, label, minLo, maxHi){
  if(!Array.isArray(bands) || !bands.length){ errs.push(label + ': add at least one band.'); return; }
  const s = bands.slice().sort((a, b) => a[fromK] - b[fromK]);
  s.forEach((b, i) => {
    if(!isNum(b[fromK]) || !isNum(b[toK]) || b[fromK] > b[toK]) errs.push(label + ' ' + (i + 1) + ': "from" must be a number not above "to".');
    if(i > 0 && isNum(s[i - 1][toK]) && b[fromK] <= s[i - 1][toK]) errs.push(label + ': bands ' + i + ' and ' + (i + 1) + ' overlap.');
  });
  if(isNum(minLo) && isNum(s[0][fromK]) && s[0][fromK] > minLo) errs.push(label + ': the first band starts at ' + s[0][fromK] + ' but the product allows ' + minLo + '.');
  if(isNum(maxHi) && isNum(s[s.length - 1][toK]) && s[s.length - 1][toK] < maxHi) errs.push(label + ': the last band ends at ' + s[s.length - 1][toK] + ' but the product allows ' + maxHi + '.');
}
function posNum(errs, v, label, allowZero){ if(!isNum(v) || (allowZero ? v < 0 : v <= 0)) errs.push(label + ' must be ' + (allowZero ? 'zero or more.' : 'above zero.')); }
function validateDefinition(kind, d){
  const errs = [];
  if(!KINDS[kind]) return ['Unknown product type.'];
  if(!d || typeof d !== 'object') return ['The definition is empty.'];
  if(Array.isArray(d.levies)) d.levies.forEach((l, i) => { if(!l.name || !isNum(l.pct) || l.pct < 0 || l.pct > 20) errs.push('Levy ' + (i + 1) + ' needs a name and a percentage from 0 to 20.'); });
  if(kind === 'term_life'){
    ['minAge', 'maxAge', 'minSum', 'maxSum', 'sumStep'].forEach(k => posNum(errs, d[k], k));
    if(isNum(d.minAge) && isNum(d.maxAge) && d.minAge > d.maxAge) errs.push('Minimum age is above maximum age.');
    if(isNum(d.minSum) && isNum(d.maxSum) && d.minSum > d.maxSum) errs.push('Minimum sum assured is above the maximum.');
    if(!Array.isArray(d.terms) || !d.terms.length || d.terms.some(t => !Number.isInteger(t) || t < 1)) errs.push('Terms must be a list of whole years.');
    checkBands(errs, d.bands, 'ageFrom', 'ageTo', 'Age band', d.minAge, d.maxAge);
    (d.bands || []).forEach((b, i) => (d.terms || []).forEach(t => { if(!b.rates || !isNum(b.rates[t]) || b.rates[t] <= 0) errs.push('Age band ' + (i + 1) + ' has no rate for the ' + t + '-year term.'); }));
    posNum(errs, d.smokerLoadingPct, 'Smoker loading', true); posNum(errs, d.policyFee, 'Policy fee', true);
    if(!d.modal || Object.keys(FREQ).some(f => !isNum(d.modal[f]) || d.modal[f] <= 0)) errs.push('Each payment frequency needs a factor (for example monthly 0.0875, yearly 1).');
  } else if(kind === 'group_life'){
    posNum(errs, d.minMembers, 'Minimum members'); posNum(errs, d.ratePerMille, 'Rate per 1,000'); posNum(errs, d.minPremium, 'Minimum premium', true); posNum(errs, d.fee, 'Fee', true);
    if(!Array.isArray(d.multiples) || !d.multiples.length || d.multiples.some(m => !isNum(m) || m <= 0)) errs.push('Salary multiples must be a list of numbers above zero.');
    checkBands(errs, d.ageBands, 'ageFrom', 'ageTo', 'Age band');
    (d.ageBands || []).forEach((b, i) => { if(!isNum(b.loadingPct) || b.loadingPct < -50 || b.loadingPct > 500) errs.push('Age band ' + (i + 1) + ': loading must be a percentage.'); });
  } else if(kind === 'funeral'){
    if(!Array.isArray(d.levels) || !d.levels.length) errs.push('Add at least one cover level.');
    const labels = (d.levels || []).map(l => l.label);
    if(new Set(labels).size !== labels.length || labels.some(l => !l)) errs.push('Cover level names must be unique and not empty.');
    (d.levels || []).forEach(l => ['principal', 'spouse', 'child', 'parent'].forEach(k => { if(!isNum(l[k]) || l[k] < 0) errs.push('Level ' + l.label + ': cover for "' + k + '" must be zero or more.'); }));
    posNum(errs, d.minAge, 'Minimum age'); posNum(errs, d.maxAge, 'Maximum age');
    checkBands(errs, d.base, 'ageFrom', 'ageTo', 'Premium age band', d.minAge, d.maxAge);
    (d.base || []).forEach((b, i) => labels.forEach(l => { if(!b.premiums || !isNum(b.premiums[l]) || b.premiums[l] <= 0) errs.push('Premium age band ' + (i + 1) + ' has no premium for ' + l + '.'); }));
    labels.forEach(l => ['spouse', 'child'].forEach(k => { if(!d.addOns || !d.addOns[k] || !isNum(d.addOns[k][l]) || d.addOns[k][l] < 0) errs.push('Missing ' + k + ' add-on premium for ' + l + '.'); }));
    checkBands(errs, d.extended, 'ageFrom', 'ageTo', 'Extended-family age band');
    (d.extended || []).forEach((b, i) => posNum(errs, b.perPerson, 'Extended-family premium ' + (i + 1)));
  } else if(kind === 'credit_life'){
    ['minLoan', 'maxLoan', 'minTermMonths', 'maxTermMonths', 'minAge', 'maxAge', 'maxAgeAtMaturity'].forEach(k => posNum(errs, d[k], k));
    posNum(errs, d.minPremium, 'Minimum premium', true);
    checkBands(errs, d.termBands, 'from', 'to', 'Term band', d.minTermMonths, d.maxTermMonths);
    (d.termBands || []).forEach((b, i) => posNum(errs, b.perMille, 'Term band ' + (i + 1) + ' rate'));
    checkBands(errs, d.ageBands, 'ageFrom', 'ageTo', 'Age band', d.minAge, d.maxAge);
    (d.ageBands || []).forEach((b, i) => { if(!isNum(b.loadingPct) || b.loadingPct < -50 || b.loadingPct > 500) errs.push('Age band ' + (i + 1) + ': loading must be a percentage.'); });
  } else if(kind === 'pension'){
    ['minAge', 'maxRetireAge', 'defaultRetireAge', 'minMonthly'].forEach(k => posNum(errs, d[k], k));
    posNum(errs, d.annuityRatePct, 'Annuity rate'); posNum(errs, d.inflationPct, 'Inflation', true);
    if(!d.profiles || !Object.keys(d.profiles).length) errs.push('Add at least one investment profile.');
    else Object.entries(d.profiles).forEach(([k, p]) => { if(!p || !p.label || !isNum(p.growthPct) || p.growthPct < -20 || p.growthPct > 40) errs.push('Profile ' + k + ' needs a label and a growth percentage.'); });
    if(!d.charges || !isNum(d.charges.contributionPct) || !isNum(d.charges.annualFundPct) || d.charges.contributionPct < 0 || d.charges.annualFundPct < 0) errs.push('Charges must be zero or more.');
    if(!d.taxRelief || !isNum(d.taxRelief.monthlyCap) || d.taxRelief.monthlyCap < 0) errs.push('The tax-relief monthly cap must be zero or more.');
  }
  return errs;
}
// What must still be true before a product may go live.
function publishBlockers(d){
  const b = [];
  if(!d || d.sample) b.push('The figures are still the sample template. Enter the company\'s approved rates and untick "sample figures".');
  if(!d || !String(d.rateSource || '').trim()) b.push('Record where the rates come from (for example the actuary\'s sign-off reference and date).');
  return b;
}

/* ---------- input forms (generated from the definition) ---------- */
function schema(kind, d){
  const freq = { key: 'freq', label: 'Payment frequency', type: 'select', options: Object.keys(FREQ).map(k => ({ value: k, label: FREQ[k].label })), default: 'monthly' };
  if(kind === 'term_life') return [
    { key: 'age', label: 'Age next birthday', type: 'int', min: d.minAge, max: d.maxAge },
    { key: 'term', label: 'Term (years)', type: 'select', options: d.terms.map(t => ({ value: String(t), label: t + ' years' })), default: String(d.terms[0]) },
    { key: 'sumAssured', label: 'Sum assured (KES)', type: 'money', min: d.minSum, max: d.maxSum, step: d.sumStep },
    { key: 'smoker', label: 'Smoker', type: 'bool' }, freq];
  if(kind === 'group_life') return [
    { key: 'members', label: 'Number of employees', type: 'int', min: d.minMembers, max: 100000 },
    { key: 'avgSalary', label: 'Average annual salary (KES)', type: 'money', min: 1 },
    { key: 'multiple', label: 'Cover as a multiple of salary', type: 'select', options: d.multiples.map(m => ({ value: String(m), label: m + ' × salary' })), default: String(d.multiples[0]) },
    { key: 'avgAge', label: 'Average age of the group', type: 'int', min: 18, max: 70 }];
  if(kind === 'funeral') return [
    { key: 'age', label: 'Age of the main member', type: 'int', min: d.minAge, max: d.maxAge },
    { key: 'level', label: 'Cover level', type: 'select', options: d.levels.map(l => ({ value: l.label, label: l.label + ' (' + l.principal.toLocaleString('en-KE') + ')' })), default: d.levels[0].label },
    { key: 'spouse', label: 'Include spouse', type: 'bool' },
    { key: 'children', label: 'Number of children', type: 'int', min: 0, max: d.maxChildren, default: 0 },
    { key: 'extendedAges', label: 'Extended family: ages, separated by commas (optional)', type: 'text' }];
  if(kind === 'credit_life') return [
    { key: 'age', label: 'Borrower\'s age', type: 'int', min: d.minAge, max: d.maxAge },
    { key: 'loan', label: 'Loan amount (KES)', type: 'money', min: d.minLoan, max: d.maxLoan },
    { key: 'termMonths', label: 'Loan term (months)', type: 'int', min: d.minTermMonths, max: d.maxTermMonths }];
  if(kind === 'pension') return [
    { key: 'age', label: 'Current age', type: 'int', min: d.minAge, max: d.maxRetireAge - 1 },
    { key: 'retireAge', label: 'Retirement age', type: 'int', min: d.minAge + 1, max: d.maxRetireAge, default: d.defaultRetireAge },
    { key: 'monthly', label: 'Monthly contribution (KES)', type: 'money', min: d.minMonthly },
    { key: 'escalation', label: 'Yearly increase in contribution (%)', type: 'int', min: 0, max: 30, default: 0 },
    { key: 'opening', label: 'Existing savings (KES, optional)', type: 'money', min: 0, default: 0 },
    { key: 'profile', label: 'Investment profile', type: 'select', options: Object.keys(d.profiles).map(k => ({ value: k, label: d.profiles[k].label })), default: Object.keys(d.profiles)[0] },
    { key: 'taxRate', label: 'Your tax rate (%) for the relief estimate', type: 'int', min: 0, max: 40, default: 30 }];
  return [];
}

/* ---------- calculators ---------- */
const fail = errors => ({ ok: false, errors });
function range(errs, name, v, lo, hi, label){ if(!isNum(v)) errs.push(label + ' is required.'); else if((isNum(lo) && v < lo) || (isNum(hi) && v > hi)) errs.push(label + ' must be between ' + lo + ' and ' + hi + '.'); }
function applyLevies(amount, d){ const lv = (d.levies || []).map(l => ({ label: l.name, value: round(amount * l.pct / 100) })); return { total: lv.reduce((s, x) => s + x.value, 0), rows: lv }; }

function calcTerm(d, i){
  const e = [];
  const age = toNum(i.age), term = toNum(i.term), sa = toNum(i.sumAssured); const freq = FREQ[i.freq] ? i.freq : 'monthly';
  range(e, 'age', age, d.minAge, d.maxAge, 'Age'); range(e, 'sa', sa, d.minSum, d.maxSum, 'Sum assured');
  if(!d.terms.includes(term)) e.push('Choose one of the available terms.');
  if(isNum(age) && isNum(term) && age + term > d.maxMaturityAge) e.push('Age at the end of the term (' + (age + term) + ') is above the maximum of ' + d.maxMaturityAge + '.');
  if(isNum(sa) && d.sumStep && sa % d.sumStep !== 0) e.push('Sum assured must be a multiple of ' + d.sumStep.toLocaleString('en-KE') + '.');
  if(e.length) return fail(e);
  const band = bandFor(d.bands, age, 'ageFrom', 'ageTo'); if(!band) return fail(['No rate is available for this age.']);
  const rate = band.rates[term], smoker = !!i.smoker && toNum(d.smokerLoadingPct) > 0;
  const base = sa / 1000 * rate, loadAmt = smoker ? base * d.smokerLoadingPct / 100 : 0;
  const beforeLevy = base + loadAmt + (d.policyFee || 0), lev = applyLevies(beforeLevy, d), annual = beforeLevy + lev.total;
  const modal = annual * d.modal[freq], periods = FREQ[freq].n;
  const rows = [{ label: 'Sum assured', value: round(sa), fmt: 'money' }, { label: 'Term', value: term + ' years', fmt: 'text' }, { label: 'Base premium (per year)', value: round(base), fmt: 'money' }];
  if(smoker) rows.push({ label: 'Smoker loading', value: round(loadAmt), fmt: 'money' });
  if(d.policyFee) rows.push({ label: 'Policy fee (per year)', value: round(d.policyFee), fmt: 'money' });
  lev.rows.forEach(r => rows.push({ label: r.label, value: r.value, fmt: 'money' }));
  rows.push({ label: 'Total premium for the year', value: round(annual), fmt: 'money' }, { label: 'Total paid over the term', value: round(modal * periods * term), fmt: 'money', note: 'if every premium is paid' });
  return { ok: true, headline: { label: FREQ[freq].label + ' premium', value: round(modal), fmt: 'money', sub: 'Cover of KES ' + round(sa).toLocaleString('en-KE') + ' for ' + term + ' years' }, rows, notes: ['Pure protection: no savings or maturity benefit.', 'The premium is guaranteed only as the policy terms state. This is an estimate until underwriting accepts the application.'], inputs: { age, term, sumAssured: sa, smoker: !!i.smoker, freq } };
}
function calcGroup(d, i){
  const e = []; const members = toNum(i.members), sal = toNum(i.avgSalary), mult = toNum(i.multiple), age = toNum(i.avgAge);
  range(e, 'm', members, d.minMembers, 100000, 'Number of employees'); range(e, 's', sal, 1, 1e9, 'Average salary'); range(e, 'a', age, 18, 70, 'Average age');
  if(!d.multiples.includes(mult)) e.push('Choose one of the available salary multiples.');
  if(e.length) return fail(e);
  const band = bandFor(d.ageBands, round(age), 'ageFrom', 'ageTo'); if(!band) return fail(['No rate is available for this average age.']);
  const perMember = sal * mult, total = perMember * members; const raw = total / 1000 * d.ratePerMille * (1 + band.loadingPct / 100) + (d.fee || 0);
  const minApplied = raw < d.minPremium; const before = Math.max(raw, d.minPremium), lev = applyLevies(before, d), annual = before + lev.total;
  const rows = [{ label: 'Cover per employee', value: round(perMember), fmt: 'money' }, { label: 'Total cover for the scheme', value: round(total), fmt: 'money' }, { label: 'Age loading applied', value: band.loadingPct + '%', fmt: 'text' }];
  if(minApplied) rows.push({ label: 'Minimum premium applied', value: round(d.minPremium), fmt: 'money' });
  lev.rows.forEach(r => rows.push({ label: r.label, value: r.value, fmt: 'money' }));
  rows.push({ label: 'Cost per employee per month', value: round(annual / members / 12), fmt: 'money' });
  const notes = ['A quotation for planning. The scheme is priced and accepted by underwriting after member data is reviewed.'];
  if(d.freeCoverLimit && perMember > d.freeCoverLimit) notes.push('Cover per employee is above the free cover limit of KES ' + d.freeCoverLimit.toLocaleString('en-KE') + '; medical evidence may be needed for the excess.');
  return { ok: true, headline: { label: 'Annual scheme premium', value: round(annual), fmt: 'money', sub: members + ' employees, cover ' + mult + ' × salary' }, rows, notes, inputs: { members, avgSalary: sal, multiple: mult, avgAge: age } };
}
function calcFuneral(d, i){
  const e = []; const age = toNum(i.age), kids = toNum(i.children == null || i.children === '' ? 0 : i.children);
  const level = d.levels.find(l => l.label === i.level);
  range(e, 'a', age, d.minAge, d.maxAge, 'Age'); range(e, 'k', kids, 0, d.maxChildren, 'Number of children');
  if(!level) e.push('Choose a cover level.');
  let ext = []; if(i.extendedAges != null && String(i.extendedAges).trim()){ ext = Array.isArray(i.extendedAges) ? i.extendedAges.map(Number) : String(i.extendedAges).split(/[,;\s]+/).filter(Boolean).map(Number); if(ext.some(a => !isNum(a) || a < 0 || a > 120)) e.push('Extended family ages must be numbers.'); if(ext.length > d.maxExtended) e.push('At most ' + d.maxExtended + ' extended family members.'); }
  if(e.length) return fail(e);
  const band = bandFor(d.base, age, 'ageFrom', 'ageTo'); if(!band) return fail(['No premium is available for this age.']);
  let total = band.premiums[level.label]; const rows = [{ label: 'Main member (' + level.label + ')', value: total, fmt: 'money', note: 'cover ' + level.principal.toLocaleString('en-KE') }];
  if(i.spouse){ const p = d.addOns.spouse[level.label]; total += p; rows.push({ label: 'Spouse', value: p, fmt: 'money', note: 'cover ' + level.spouse.toLocaleString('en-KE') }); }
  if(kids > 0){ const p = d.addOns.child[level.label] * kids; total += p; rows.push({ label: kids + ' child' + (kids > 1 ? 'ren' : ''), value: p, fmt: 'money', note: 'cover ' + level.child.toLocaleString('en-KE') + ' each' }); }
  for(const a of ext){ const b = bandFor(d.extended, a, 'ageFrom', 'ageTo'); if(!b) return fail(['Extended family member aged ' + a + ' cannot be covered.']); total += b.perPerson; }
  if(ext.length) rows.push({ label: ext.length + ' extended family member' + (ext.length > 1 ? 's' : ''), value: ext.reduce((s, a) => s + bandFor(d.extended, a, 'ageFrom', 'ageTo').perPerson, 0), fmt: 'money' });
  const lev = applyLevies(total, d); lev.rows.forEach(r => rows.push({ label: r.label, value: r.value, fmt: 'money' })); total += lev.total;
  return { ok: true, headline: { label: 'Monthly premium', value: round(total), fmt: 'money', sub: level.label + ' cover' }, rows, notes: ['Waiting period: ' + (d.waitingPeriodMonths || 0) + ' months for death from natural causes. Accidental death is covered from the start unless the policy says otherwise.', 'An estimate until the application is accepted.'], inputs: { age, level: level.label, spouse: !!i.spouse, children: kids, extendedAges: ext } };
}
function calcCredit(d, i){
  const e = []; const age = toNum(i.age), loan = toNum(i.loan), months = toNum(i.termMonths);
  range(e, 'a', age, d.minAge, d.maxAge, 'Age'); range(e, 'l', loan, d.minLoan, d.maxLoan, 'Loan amount'); range(e, 't', months, d.minTermMonths, d.maxTermMonths, 'Loan term');
  if(isNum(age) && isNum(months) && age + months / 12 > d.maxAgeAtMaturity) e.push('Age when the loan ends is above the maximum of ' + d.maxAgeAtMaturity + '.');
  if(e.length) return fail(e);
  const tb = bandFor(d.termBands, Math.round(months), 'from', 'to'), ab = bandFor(d.ageBands, age, 'ageFrom', 'ageTo'); if(!tb || !ab) return fail(['No rate is available for these details.']);
  const raw = loan / 1000 * tb.perMille * (1 + ab.loadingPct / 100), before = Math.max(raw, d.minPremium || 0), lev = applyLevies(before, d), single = before + lev.total;
  const rows = [{ label: 'Loan amount', value: round(loan), fmt: 'money' }, { label: 'Loan term', value: months + ' months', fmt: 'text' }, { label: 'Rate per 1,000 of loan', value: tb.perMille, fmt: 'text' }];
  if(ab.loadingPct) rows.push({ label: 'Age loading', value: ab.loadingPct + '%', fmt: 'text' });
  lev.rows.forEach(r => rows.push({ label: r.label, value: r.value, fmt: 'money' }));
  rows.push({ label: 'If added to the loan, extra per month', value: round(single / months), fmt: 'money', note: 'before any interest on the premium' });
  return { ok: true, headline: { label: 'Single premium', value: round(single), fmt: 'money', sub: 'Covers the loan for ' + months + ' months' }, rows, notes: ['Pays the outstanding loan balance if the borrower dies during the term, subject to the policy terms.'], inputs: { age, loan, termMonths: months } };
}
function calcPension(d, i){
  const e = []; const age = toNum(i.age), ret = toNum(i.retireAge == null || i.retireAge === '' ? d.defaultRetireAge : i.retireAge), monthly = toNum(i.monthly), esc = toNum(i.escalation == null || i.escalation === '' ? 0 : i.escalation), open = toNum(i.opening == null || i.opening === '' ? 0 : i.opening), taxRate = toNum(i.taxRate == null || i.taxRate === '' ? 0 : i.taxRate);
  const prof = d.profiles[i.profile || Object.keys(d.profiles)[0]];
  range(e, 'a', age, d.minAge, d.maxRetireAge - 1, 'Age'); range(e, 'r', ret, isNum(age) ? age + 1 : d.minAge + 1, d.maxRetireAge, 'Retirement age'); range(e, 'm', monthly, d.minMonthly, 1e8, 'Monthly contribution'); range(e, 'e', esc, 0, 30, 'Yearly increase'); range(e, 'o', open, 0, 1e11, 'Existing savings'); range(e, 't', taxRate, 0, 40, 'Tax rate');
  if(!prof) e.push('Choose an investment profile.');
  if(e.length) return fail(e);
  const years = ret - age, r = Math.pow(1 + (prof.growthPct - d.charges.annualFundPct) / 100, 1 / 12) - 1;
  let bal = open, contrib = monthly, paid = 0, charged = 0;
  for(let y = 0; y < years; y++){ for(let m = 0; m < 12; m++){ const net = contrib * (1 - d.charges.contributionPct / 100); charged += contrib - net; bal = (bal + net) * (1 + r); paid += contrib; } contrib *= 1 + esc / 100; }
  const real = bal / Math.pow(1 + d.inflationPct / 100, years), income = bal * d.annuityRatePct / 100 / 12, relief = Math.min(monthly, d.taxRelief.monthlyCap) * 12 * taxRate / 100;
  const rows = [{ label: 'Years to retirement', value: years, fmt: 'int' }, { label: 'Total contributions', value: round(paid + open), fmt: 'money' }, { label: 'Charges on contributions', value: round(charged), fmt: 'money' }, { label: 'Growth earned (after fund charges)', value: round(bal - paid - open + charged), fmt: 'money' },
    { label: 'Projected fund at ' + ret, value: round(bal), fmt: 'money', strong: true }, { label: 'In today\'s money (after ' + d.inflationPct + '% yearly inflation)', value: round(real), fmt: 'money' }, { label: 'Estimated monthly pension', value: round(income), fmt: 'money', note: 'at ' + d.annuityRatePct + '% a year of the fund' }, { label: 'Estimated tax relief each year', value: round(relief), fmt: 'money', note: 'on up to KES ' + d.taxRelief.monthlyCap.toLocaleString('en-KE') + ' a month' }];
  return { ok: true, headline: { label: 'Projected fund at age ' + ret, value: round(bal), fmt: 'money', sub: prof.label + ' profile, assumed growth ' + prof.growthPct + '% a year' }, rows, notes: ['A projection, not a promise: actual returns can be lower or higher.', 'Tax relief depends on your tax position and the rules in force; confirm with the scheme administrator or a tax adviser.'], inputs: { age, retireAge: ret, monthly, escalation: esc, opening: open, profile: i.profile || Object.keys(d.profiles)[0], taxRate } };
}
function calc(kind, d, input){
  const errs = validateDefinition(kind, d); if(errs.length) return fail(['This product is not set up correctly: ' + errs[0]]);
  const i = input || {};
  try {
    if(kind === 'term_life') return calcTerm(d, i); if(kind === 'group_life') return calcGroup(d, i);
    if(kind === 'funeral') return calcFuneral(d, i); if(kind === 'credit_life') return calcCredit(d, i); if(kind === 'pension') return calcPension(d, i);
  } catch(err){ return fail(['Could not calculate: ' + err.message]); }
  return fail(['Unknown product type.']);
}
return { KINDS, FREQ, template, validateDefinition, publishBlockers, schema, calc };
}));
