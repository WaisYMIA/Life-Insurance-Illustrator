#!/usr/bin/env node
/**
 * Regression suite — the automatic safety net for the Plan Illustrator.
 *
 * Every scenario in here was validated against a real printed illustration
 * from the insurer during development. If any of these numbers ever change,
 * something in the engine broke — full stop, don't ship until it's fixed.
 *
 * Run: node test/regression-suite.js
 * Exit code 0 = all pass, 1 = at least one failure (safe to wire into CI).
 */
'use strict';

const path = require('path');
const fs = require('fs');

const FanakaEngine = require('../engines/fanaka-engine.js');
const FaidaEngine = require('../engines/faida-engine.js');
const SmartSaveEngine = require('../engines/smartsave-engine.js');
const UtilsEngine = require('../engines/utils-engine.js');

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/fanaka-data.json')));
const FAIDA = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/faida-data.json')));
const SMARTSAVE = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/smartsave-data.json')));

DATA.plans = DATA.plans.filter(p => DATA.prates.some(r => r.plan === p.name));

const fanaka = FanakaEngine(DATA);
const faida = FaidaEngine(FAIDA);
const smartsave = SmartSaveEngine(SMARTSAVE);
const utils = UtilsEngine;

let pass = 0, fail = 0;
const failures = [];

function check(label, actual, expected, tolerance){
  tolerance = tolerance || 0;
  const a = Math.round(actual);
  const e = Math.round(expected);
  const ok = Math.abs(a - e) <= tolerance;
  if(ok){
    pass++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${label}: ${a}`);
  } else {
    fail++;
    failures.push({label, actual: a, expected: e});
    console.log(`  \x1b[31mFAIL\x1b[0m  ${label}: got ${a}, expected ${e}`);
  }
}

function section(title){
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

section('Fanaka Plan Layer 1');
{
  const plan = DATA.plans.find(p => p.name === 'Fanaka Plan Layer 1');
  let SA = fanaka.solveSAFromPremium({plan, age: 35, term: 5, freq: 'Monthly', premium: 20000, riders: {}, isSingle: false});
  check('SA at age 35 (premium 20,000/mo)', SA, 991746);
  let mat = fanaka.estimateMaturityBreakdown({plan, age: 35, term: 5, SA, bonusRate: 0.045});
  check('Maturity value at age 35', mat.total, 1338857);
  let prem = fanaka.premiumFromSA({plan, age: 35, term: 5, riders: {}, isSingle: false, SA});
  check('Premium round-trip (should return to 20,000)', prem.Monthly.total, 20000);
  SA = fanaka.solveSAFromPremium({plan, age: 28, term: 5, freq: 'Monthly', premium: 190000, riders: {}, isSingle: false});
  check('SA at age 28 (premium 190,000/mo)', SA, 9467015);
  SA = fanaka.solveSAFromTarget({plan, age: 28, term: 5, targetAmt: 650000, bonusRate: 0.045});
  check('SA from target amount (650,000 target)', SA, 472727);
  let mb = fanaka.estimateMaturityBreakdown({plan, age: 35, term: 8, SA: 1000000, bonusRate: 0.045});
  check('Guaranteed bonus, 8yr term (expect 10% = 100,000)', mb.guaranteedBonus, 100000);
  mb = fanaka.estimateMaturityBreakdown({plan, age: 35, term: 15, SA: 1000000, bonusRate: 0.045});
  check('Guaranteed bonus, 15yr term (expect 20% = 200,000)', mb.guaranteedBonus, 200000);
}

section('Faida Elite');
{
  const res = faida.simulateFaida({product: 'Faida Elite', gender: 'Male', ageANB: 28, term: 5, freq: 'Single', periodicPremium: 650000, sumAssured: 100000});
  check('Year 1 fund value, Optimistic', res.yearEnd.Optimistic[1].fund, 727577);
  check('Year 1 fund value, Realistic', res.yearEnd.Realistic[1].fund, 714582);
  check('Year 1 fund value, Pessimistic', res.yearEnd.Pessimistic[1].fund, 701586);
  check('Year 5 fund value, Realistic', res.yearEnd.Realistic[5].fund, 1044366);
  check('Year 5 fund value, Pessimistic', res.yearEnd.Pessimistic[5].fund, 952719);
  check('Total contributions (net of insurance charges)', res.totalContributions, 648091);
}

section('Faida Maisha (mandatory Whole Life + Last Expense riders)');
{
  // Scenario taken verbatim from the source illustrator workbook's own
  // embedded example (Faida_Maisha sheet): Male, entry age 55, term 5,
  // Yearly, periodic premium 60,000, Whole Life Sum Assured 50,000,000,
  // Last Expense SA left at its default 100,000. Rider premiums and the
  // billed "Total Premium" are rate-independent (pure age/term lookups),
  // so they're pinned exactly; fund/death figures use the system's
  // existing (separately-tracked) return-rate assumptions, so only the
  // death-minus-fund identity — which depends only on rider math — is
  // checked, not the absolute fund value.
  const res = faida.simulateFaida({product: 'Faida Maisha', gender: 'Male', ageANB: 55, term: 5, freq: 'Yearly', periodicPremium: 60000, sumAssured: 50000000});
  check('Last Expense premium (Faida_Maisha!K27)', res.riders.lastExpensePerPeriod, 2932);
  check('Whole Life premium (Faida_Maisha!K28)', res.riders.secondRiderPerPeriod, 1466000);
  check('Total Premium billed, 5 years (Faida_Maisha!J35 x 5 = K30 x 5)', res.totalPremiumPaid, 1526000 * 5);
  check('Investment premium feeding the fund (periodic premium only)', res.investmentPremiumPaid, 60000 * 5);
  check('Death benefit = Fund + Whole Life SA only (Last Expense SA excluded — see the PDF-sourced section below)', res.yearEnd.Optimistic[1].death - res.yearEnd.Optimistic[1].fund, 50000000);
}

section('Faida Maisha — real signed illustration (Bonface Inganga, 25 Jul 2026)');
{
  // A real, client-signed Faida Maisha illustration PDF, not a workbook
  // example: Male, entry age 36, term 7, Single premium 2,000,000, Whole
  // Life Sum Assured 1,000,000, Last Expense SA 100,000 (default). This is
  // the strongest evidence available — actual production output — and it
  // disagrees with the source workbook's own Death Benefit formula (which
  // adds the Last Expense SA; the real illustration does not). Every
  // fund/withdrawal/death figure below is checked to the exact shilling
  // against all 7 years and all 3 scenarios printed on that document.
  const res = faida.simulateFaida({product: 'Faida Maisha', gender: 'Male', ageANB: 36, term: 7, freq: 'Single', periodicPremium: 2000000, sumAssured: 1000000});
  check('Last Expense premium', res.riders.lastExpensePerPeriod, 9247);
  check('Whole Life premium', res.riders.secondRiderPerPeriod, 92470);
  check('Total Single Premium (2,000,000 + Whole Life only, Last Expense excluded)', res.totalPremiumPaid, 2092470);
  const pdfFund = {1:[2240000,2200000,2160000], 2:[2508800,2420000,2332800], 3:[2809856,2662000,2519424], 4:[3147039,2928200,2720978], 5:[3524683,3221020,2938656], 6:[3947645,3543122,3173749], 7:[4421363,3897434,3427649]};
  const pdfDeath = {1:[3240000,3200000,3160000], 2:[3508800,3420000,3332800], 3:[3809856,3662000,3519424], 4:[4147039,3928200,3720978], 5:[4524683,4221020,3938656], 6:[4947645,4543122,4173749], 7:[5421363,4897434,4427649]};
  const scenarios = ['Optimistic','Realistic','Pessimistic'];
  for(let y=1;y<=7;y++){
    scenarios.forEach((s,i)=>{
      check(`Year ${y} Fund Value, ${s}`, res.yearEnd[s][y].fund, pdfFund[y][i]);
      check(`Year ${y} Death Benefit, ${s}`, res.yearEnd[s][y].death, pdfDeath[y][i]);
    });
  }
}

section('Faida Elimu (mandatory Waiver of Premium + Last Expense riders, no life-cover SA)');
{
  // Scenario from the source workbook's Faida_Elimu example: Male, entry
  // age 38, term 15, Monthly, periodic premium 5,029. Elimu has no
  // Sum_Assured named range in the source model — the Waiver of Premium
  // benefit's Sum Assured is auto-derived as yearly premium x term, and
  // there is no death-benefit Sum Assured at all (only the fund is
  // payable), so a caller-supplied sumAssured must be fully ignored.
  const res = faida.simulateFaida({product: 'Faida Elimu', gender: 'Male', ageANB: 38, term: 15, freq: 'Monthly', periodicPremium: 5029, sumAssured: 999999999});
  check('Last Expense premium (Faida_Elimu!K26)', res.riders.lastExpensePerPeriod, 16);
  check('Waiver of Premium Sum Assured (Faida_Elimu!J27 = Yearly Premium x Term)', res.riders.secondRiderSA, 60348 * 15);
  check('Waiver of Premium premium (Faida_Elimu!K27)', res.riders.secondRiderPerPeriod, 91);
  check('Total Monthly Premium (Faida_Elimu!K29 = K27 + Periodic Premium)', res.totalPremiumPaid / (15*12), 5120);
  check('Death benefit ignores any caller-supplied Sum Assured (fund only)', res.yearEnd.Optimistic[1].death, res.yearEnd.Optimistic[1].fund);
}

section('Smart Save');
{
  const age = 42; // pinned — age stated in the reference PDF, not derived from a live-clock DOB calc
  const p = smartsave.ssComputePremium('Smart Save', age, 10, 'Monthly', 1000000);
  check('Monthly premium', p.premium, 10628);
  const sim = smartsave.ssSimulate({product: 'Smart Save', age, term: 10, freq: 'Monthly', sumAssured: 1000000, bonusRate: 0.04});
  check('Withdrawal value, year 3', sim[2].withdrawal, 183000);
  check('Withdrawal value, year 10', sim[9].withdrawal, 1400000);
  check('Maturity value, year 10', sim[9].maturity, 1800000);
}

section('Smart Scholar');
{
  const age = 40; // pinned — age stated in the reference PDF (DOB-based calc drifts with real time)
  const p = smartsave.ssComputePremium('Smart Scholar', age, 8, 'Monthly', 265700);
  check('Monthly premium', p.premium, 3500);
  const sim = smartsave.ssSimulate({product: 'Smart Scholar', age, term: 8, freq: 'Monthly', sumAssured: 265700, bonusRate: 0.04});
  check('Withdrawal value, year 3', sim[2].withdrawal, 60480);
  check('Withdrawal value, year 8', sim[7].withdrawal, 350724);
  check('Maturity value, year 8', sim[7].maturity, 435748);
}

section('Smart Save / Smart Scholar — Waiver of Premium rules overlooked by the illustrator');
{
  // Smart_Save_Premium_Quote!I33: WOP only applies when Freq<>"Single" — a
  // Single-premium policy has no future premiums left to waive, so the
  // Excel blanks the rider row out entirely.
  check('WOP premium is 0 for Single premium (nothing to waive)', smartsave.ssRiderPremium('WOP', 0, 7, 'Single', 2000000), 0);
  check('WOP SA basis is 0 for Single premium', smartsave.ssRiderSA('WOP', 1000000, {term:7, freq:'Single', periodicPremium:2000000}), 0);

  // Smart_Save_Premium_Quote!J33: WOP's disclosed "Sum Assured" is the total
  // premiums payable over the term (Periodic_Premium * payments/year *
  // Term) — not the life cover Sum Assured.
  const wopSA = smartsave.ssRiderSA('WOP', 5874003, {term:5, freq:'Monthly', periodicPremium:61196});
  check('WOP SA basis = periodic premium * payments/year * term', wopSA, 61196*12*5);

  // Smart_Save_Premium_Quote!J22 / Smart_Scholar_Premium_Quote!J22: a
  // premium that implies a Sum Assured below KES 200,000 is rejected
  // ("Increase the premium to meet the minimum Sum Assured requirements"),
  // for both products.
  const lowSave = smartsave.ssComputeSA('Smart Save', 18, 5, 'Monthly', 2000);
  check('Smart Save: premium implying SA < 200,000 is rejected', lowSave && lowSave.error ? 1 : 0, 1);
  const okSave = smartsave.ssComputeSA('Smart Save', 42, 10, 'Monthly', 10628);
  check('Smart Save: premium implying SA >= 200,000 still resolves normally', okSave, 1000000, 1000);
}

section('Smart Save / Smart Scholar — target maturity amount (Target Val Quote sheet)');
{
  // Smart_Save_Target_Val_Quote!J23: Sum_Assured = Target_Maturity / (1 +
  // Bonus_Rate*Term*2). Verified by round-tripping back through ssSimulate's
  // own maturity formula (Sum_Assured + Bonus_Rate*Sum_Assured*Term*2).
  const age = 42, term = 10, bonusRate = 0.04, target = 1800000;
  const impliedSA = target / (1 + 2*bonusRate*term);
  const sim = smartsave.ssSimulate({product: 'Smart Save', age, term, freq: 'Monthly', sumAssured: impliedSA, bonusRate});
  check('Target mode: back-solved SA reproduces the target maturity amount', sim[term-1].maturity, target, 1);
}

section('Age-next-birthday calculation (isolated from the fragile-DOB tests above)');
{
  // Test well clear of exact year boundaries — the formula's 365.25-day
  // approximation can land on either side of a whole year exactly at the
  // boundary itself (leap-year alignment varies by which specific window
  // you pick), so a boundary test would be flaky through no fault of the
  // engine. Testing a birthday clearly in the past/future avoids that.
  const today = new Date();
  const bornYears = (y) => new Date(today.getFullYear() - y, today.getMonth(), today.getDate());
  const shiftDays = (d, days) => new Date(d.getTime() + days*86400000);
  const toStr = (d) => d.toISOString().slice(0,10);

  check('ANB, birthday 200 days ago (should be age+1)', smartsave.ssAgeANB(toStr(shiftDays(bornYears(30), -200))), 31);
  check('ANB, birthday in 200 days (should be current age)', smartsave.ssAgeANB(toStr(shiftDays(bornYears(30), 200))), 30);
}

section('Kenyan phone validation');
{
  const validCases = ['0712345678', '0112345678', '+254712345678', '254712345678', '0712 345 678'];
  const invalidCases = ['12345', '071234567', '07123456789', '0812345678', 'abcdefghij', ''];
  validCases.forEach(v => check(`"${v}" should be valid`, utils.normalizeKenyanPhone(v) ? 1 : 0, 1));
  invalidCases.forEach(v => check(`"${v}" should be invalid`, utils.normalizeKenyanPhone(v) ? 1 : 0, 0));
}

console.log(`\n${'='.repeat(50)}`);
console.log(`\x1b[1mTOTAL: ${pass} passed, ${fail} failed\x1b[0m`);
if(fail > 0){
  console.log('\nFailed checks:');
  failures.forEach(f => console.log(`  - ${f.label}: got ${f.actual}, expected ${f.expected}`));
}
console.log('='.repeat(50));

const resultsPath = path.join(__dirname, 'last-run-results.json');
fs.writeFileSync(resultsPath, JSON.stringify({
  ranAt: new Date().toISOString(),
  pass, fail, total: pass + fail, failures
}, null, 2));

process.exit(fail > 0 ? 1 : 0);
