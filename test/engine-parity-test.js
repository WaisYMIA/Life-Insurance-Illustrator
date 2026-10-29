#!/usr/bin/env node
/**
 * Calculation self-check: the calculators inside plan-illustrator.html must give exactly the same
 * figures as the tested engines in /engines (which the regression suite pins to signed illustrations).
 * If someone edits one copy and not the other, this fails and the release is blocked.
 * Run: node test/engine-parity-test.js   (needs Playwright + Chromium; skips with a notice if unavailable)
 */
'use strict';
const path = require('path'), fs = require('fs');
let chromium; try { ({ chromium } = require('playwright')); } catch(e){ try { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); } catch(e2){ console.log('engine parity: SKIPPED (Playwright not installed)'); process.exit(0); } }
const FanakaEngine = require('../engines/fanaka-engine.js'), FaidaEngine = require('../engines/faida-engine.js'), SmartSaveEngine = require('../engines/smartsave-engine.js');
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/fanaka-data.json')));
DATA.plans = DATA.plans.filter(p => DATA.prates.some(r => r.plan === p.name));
const FAIDA = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/faida-data.json')));
const SS = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/smartsave-data.json')));
const fanaka = FanakaEngine(DATA), faida = FaidaEngine(FAIDA), ss = SmartSaveEngine(SS);
const norm = v => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x)));
let pass = 0, fail = 0; const fails = [];
const same = (label, a, b) => { const A = JSON.stringify(norm(a)), B = JSON.stringify(norm(b)); if(A === B) pass++; else { fail++; if(fails.length < 8) fails.push(label + '\n   page:   ' + A.slice(0, 160) + '\n   engine: ' + B.slice(0, 160)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('file://' + path.join(__dirname, '../plan-illustrator.html')); await page.waitForTimeout(600);
  // Fanaka
  const fCases = [];
  for(const plan of DATA.plans) for(const age of [22, 35, 48]) for(const term of [10, 15, 20]) if(age <= plan.maxAge && term >= (plan.minTerm || 1) && term <= (plan.maxTerm || 99) && age + term <= (plan.maxMatAge || 99)) fCases.push({ name: plan.name, age, term });
  const fPage = await page.evaluate(cs => cs.map(c => { const plan = DATA.plans.find(p => p.name === c.name); const ctx = { plan, age: c.age, term: c.term, freq: 'Annually', riders: {}, isSingle: false, SA: 1000000 }; let prem = null, mat = null, sa = null; try { prem = premiumFromSA(ctx); mat = estimateMaturityBreakdown({ plan, age: c.age, term: c.term, SA: 1000000, bonusRate: 0.045 }); sa = solveSAFromPremium({ plan, age: c.age, term: c.term, freq: 'Annually', riders: {}, isSingle: false, premium: 60000 }); } catch(e){ prem = 'ERR'; } return { prem, mat, sa }; }), fCases);
  fCases.forEach((c, i) => { const plan = DATA.plans.find(p => p.name === c.name); let prem, mat, sa; try { prem = fanaka.premiumFromSA({ plan, age: c.age, term: c.term, freq: 'Annually', riders: {}, isSingle: false, SA: 1000000 }); mat = fanaka.estimateMaturityBreakdown({ plan, age: c.age, term: c.term, SA: 1000000, bonusRate: 0.045 }); sa = fanaka.solveSAFromPremium({ plan, age: c.age, term: c.term, freq: 'Annually', riders: {}, isSingle: false, premium: 60000 }); } catch(e){ prem = 'ERR'; } same(`Fanaka ${c.name} age ${c.age} term ${c.term}`, fPage[i], { prem, mat, sa }); });
  // Faida
  const dCases = []; for(const product of ['Faida Elimu', 'Faida Maisha', 'Faida Elite']) for(const ageANB of [28, 40]) for(const term of [8, 12]) for(const freq of ['Monthly', 'Yearly']) dCases.push({ product, gender: 'Male', ageANB, term, freq, periodicPremium: freq === 'Monthly' ? 10000 : 120000, sumAssured: product === 'Faida Elite' ? 0 : 3000000, lastExpenseSA: 100000 });
  const dPage = await page.evaluate(cs => cs.map(c => { try { const r = simulateFaida(c); return { y: r.yearEnd, t: r.totalContributions }; } catch(e){ return 'ERR'; } }), dCases);
  dCases.forEach((c, i) => { let r; try { const x = faida.simulateFaida(c); r = { y: x.yearEnd, t: x.totalContributions }; } catch(e){ r = 'ERR'; } same(`Faida ${c.product} ${c.ageANB}/${c.term}/${c.freq}`, dPage[i], r); });
  // Smart Save / Scholar
  const sCases = []; for(const product of ['Smart Save', 'Smart Scholar']) for(const age of [25, 38]) for(const term of [10, 15]) sCases.push({ product, age, term, freq: 'Monthly', sumAssured: 1000000 });
  const sPage = await page.evaluate(cs => cs.map(c => { try { return { p: ssComputePremium(c.product, c.age, c.term, c.freq, c.sumAssured), s: ssSimulate({ product: c.product, age: c.age, term: c.term, freq: c.freq, sumAssured: c.sumAssured, bonusRate: 0.04 }) }; } catch(e){ return 'ERR'; } }), sCases);
  sCases.forEach((c, i) => { let r; try { r = { p: ss.ssComputePremium(c.product, c.age, c.term, c.freq, c.sumAssured), s: ss.ssSimulate({ product: c.product, age: c.age, term: c.term, freq: c.freq, sumAssured: c.sumAssured, bonusRate: 0.04 }) }; } catch(e){ r = 'ERR'; } same(`SmartSave ${c.product} ${c.age}/${c.term}`, sPage[i], r); });
  await browser.close();
  console.log(`engine parity: ${pass} identical, ${fail} different (${fCases.length} Fanaka, ${dCases.length} Faida, ${sCases.length} Smart Save cases)`);
  if(fails.length) console.log(fails.join('\n'));
  if(errs.length) console.log('page errors:', errs.slice(0, 3));
  process.exit(fail || errs.length ? 1 : 0);
})();
