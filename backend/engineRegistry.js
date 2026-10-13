/**
 * Engine registry — loads the pure calculation engines and exposes one
 * consistent compute(engineType, data, input) interface across the three
 * different native call shapes. The actual math lives untouched in /engines.
 */
'use strict';
const FanakaEngine = require('../engines/fanaka-engine.js');
const FaidaEngine = require('../engines/faida-engine.js');
const SmartSaveEngine = require('../engines/smartsave-engine.js');

function computeFanaka(DATA, input){
  DATA = { ...DATA, plans: DATA.plans.filter(p => DATA.prates.some(r => r.plan === p.name)) };
  const engine = FanakaEngine(DATA);
  const plan = DATA.plans.find(p => p.name === input.planName);
  if(!plan) throw { status: 400, message: `Unknown plan: ${input.planName}` };

  const riders = input.riders || {};
  let SA, premiumOut;

  if(input.mode === 'premium'){
    SA = engine.solveSAFromPremium({ plan, age: input.age, term: input.term, freq: input.freq, premium: input.value, riders, isSingle: !!input.isSingle });
    if(SA === null) throw { status: 422, message: 'Could not solve for Sum Assured with the given inputs.' };
    premiumOut = engine.premiumFromSA({ plan, age: input.age, term: input.term, riders, isSingle: !!input.isSingle, SA });
  } else if(input.mode === 'sa'){
    SA = input.value;
    premiumOut = engine.premiumFromSA({ plan, age: input.age, term: input.term, riders, isSingle: !!input.isSingle, SA });
  } else if(input.mode === 'target'){
    SA = engine.solveSAFromTarget({ plan, age: input.age, term: input.term, targetAmt: input.value, bonusRate: input.bonusRate });
    if(SA === null) throw { status: 422, message: 'Could not solve Sum Assured from the given target amount.' };
    premiumOut = engine.premiumFromSA({ plan, age: input.age, term: input.term, riders, isSingle: !!input.isSingle, SA });
  } else {
    throw { status: 400, message: `Unknown mode: ${input.mode}` };
  }

  const maturity = plan.par
    ? engine.estimateMaturityBreakdown({ plan, age: input.age, term: input.term, SA, bonusRate: input.bonusRate })
    : null;

  return { planName: plan.name, sumAssured: SA, premiums: premiumOut, maturity };
}

function computeFaida(FAIDA, input){
  const engine = FaidaEngine(FAIDA);
  const result = engine.simulateFaida({
    product: input.product,
    gender: input.gender,
    ageANB: input.ageANB,
    term: input.term,
    freq: input.freq,
    periodicPremium: input.periodicPremium,
    sumAssured: input.sumAssured || 0,
    lastExpenseSA: input.lastExpenseSA,
  });
  return {
    product: input.product,
    yearEnd: result.yearEnd,
    totalContributions: result.totalContributions,
    // investmentPremiumPaid drives the illustrated Fund Value (periodic
    // premium only). totalPremiumPaid is what's actually billed, matching
    // Faida_Maisha!K30/Faida_Elimu!K29 and the real signed illustration
    // this was validated against — periodic + the mandatory second rider
    // (Whole Life Cover for Maisha, Waiver of Premium for Elimu). Last
    // Expense is charged from the fund rather than billed, so it's left out
    // of totalPremiumPaid and out of every total here (see
    // engines/faida-engine.js) — it's shown only as its own rider line.
    investmentPremiumPaid: result.investmentPremiumPaid,
    totalPremiumPaid: result.totalPremiumPaid,
    totalRiderPremiumPaid: result.totalRiderPremiumPaid,
    riders: result.riders,
  };
}

function computeSmartSave(SMARTSAVE, input){
  const engine = SmartSaveEngine(SMARTSAVE);
  let sumAssured, premium;

  if(input.mode === 'sa' || input.mode === 'target'){
    // Target mode mirrors Smart Save/Scholar's "Target Val Quote" sheet:
    // back-solve the Sum Assured needed to reach a target maturity payout
    // (Maturity = SA*(1+2*bonusRate*term)), then price it like an SA quote.
    sumAssured = input.mode === 'target'
      ? input.value / (1 + 2*(input.bonusRate||0)*input.term)
      : input.value;
    const p = engine.ssComputePremium(input.product, input.age, input.term, input.freq, sumAssured);
    if(!p || p.error) throw { status: 422, message: p && p.error ? `Below minimum premium (${p.minPremium})` : 'Could not compute premium.' };
    premium = p.premium;
  } else if(input.mode === 'premium'){
    premium = input.value;
    sumAssured = engine.ssComputeSA(input.product, input.age, input.term, input.freq, premium);
    if(sumAssured === null) throw { status: 422, message: 'Could not solve Sum Assured from the given premium.' };
    if(sumAssured && sumAssured.error) throw { status: 422, message: `This premium implies a Sum Assured below the minimum of ${sumAssured.minSumAssured}.` };
  } else {
    throw { status: 400, message: `Unknown mode: ${input.mode}` };
  }

  const sim = engine.ssSimulate({ product: input.product, age: input.age, term: input.term, freq: input.freq, sumAssured, bonusRate: input.bonusRate });
  return { product: input.product, sumAssured, premium, yearByYear: sim };
}

const COMPUTERS = { fanaka: computeFanaka, faida: computeFaida, smartsave: computeSmartSave };

function compute(engineType, data, input){
  const fn = COMPUTERS[engineType];
  if(!fn) throw { status: 400, message: `Unknown engine type: ${engineType}` };
  return fn(data, input);
}

module.exports = { compute };
