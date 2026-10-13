/**
 * Faida calculation engine — extracted verbatim from the
 * validated Plan Illustrator. Pure functions, no DOM dependency.
 */
(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory;
  } else {
    root.FaidaEngine = factory;
  }
})(typeof self !== 'undefined' ? self : this, function(FAIDA){
  'use strict';

function faidaAgeANB(dobStr){
  const dob = new Date(dobStr);
  const today = new Date();
  const msPerYear = 365.25*24*3600*1000;
  const years = (today-dob)/msPerYear;
  return Math.ceil(years - 1e-9);
}

function faidaFreqInfo(freq){
  const row = FAIDA.freq.find(r=>r[0]===freq);
  return {name:row[0], intervalMonths:row[1], perYear:row[2], minPremium: typeof row[3]==='string'?parseFloat(row[3].replace(/,/g,'')):row[3], convFactor:row[4]};
}

function getQx(age, gender){
  const row = FAIDA.qx.find(r=>r[0]===age);
  if(!row) return 0;
  return gender==='Male' ? row[1] : row[2];
}

function faidaWithdrawalFactor(policyYear, freq){
  const row = FAIDA.withdrawal.find(r=>r[0]===policyYear) || FAIDA.withdrawal[FAIDA.withdrawal.length-1];
  const raw = freq==='Single' ? row[2] : row[1];
  return typeof raw === 'string' ? parseFloat(raw)/100 : raw;
}

function faidaAgeMaxTerm(age){
  const row = FAIDA.ageLimits.find(r=>r[0]===age);
  return row ? {maxTerm:row[1], maxMaturityAge: typeof row[2]==='string'?parseFloat(row[2]):row[2]} : null;
}

function faidaRiderRate(table, age, term){
  const row = table.rows.find(r=>r[0]===age);
  if(!row) return null;
  const idx = table.terms.indexOf(term);
  if(idx===-1) return null;
  const v = row[idx+1];
  return (v===''||v===null||v===undefined) ? null : v;
}

function faidaRiderSinglePremium(table, age, term, freq, riderSA){
  const rate = faidaRiderRate(table, age, term);
  if(rate===null) return null;
  const fi = faidaFreqInfo(freq);
  const termMultiplier = freq==='Single' ? term : 1;
  return Math.ceil(rate * fi.convFactor * termMultiplier * riderSA / 1000);
}

/**
 * Faida Maisha and Faida Elimu both carry a Last Expense rider, and a
 * second mandatory rider (Whole Life Cover for Maisha, Waiver of Premium
 * for Elimu). In the source workbook these are NOT optional add-ons and
 * their premiums are billed on top of the periodic premium (Faida_Maisha!
 * K27/K28/K30, Faida_Elimu!K26/K27/K29) — but, per the per-policy fund
 * simulation sheets (PerPolWorking_PH-Account_Maisha/_Elimu, column J,
 * "Mortality & Riders Charge"), that rider cost is only ever deducted from
 * the illustrated Fund Value for Faida Elite; for Maisha/Elimu the fund is
 * driven purely by the periodic premium. The riders are a real, mandatory
 * extra cost to the client (and must be disclosed as part of what they pay
 * and what their cover amounts to) but they do not move the Fund
 * Value/Withdrawal Value/Maturity Value figures. Faida Elite has neither
 * rider in the source model — its single Sum Assured is priced invisibly
 * inside the fund via the qx mortality table, which getQx()/the mortality
 * charge below already does correctly.
 */
function faidaRiderPremiums({product, ageANB, term, freq, sumAssured, lastExpenseSA, baseYearlyPremium}){
  const out = {
    lastExpenseSA: 0, lastExpensePerPeriod: 0, lastExpenseAvailable: true,
    secondRiderLabel: null, secondRiderSA: 0, secondRiderPerPeriod: 0, secondRiderAvailable: true
  };
  if(product !== 'Faida Maisha' && product !== 'Faida Elimu') return out;

  const leSA = (lastExpenseSA===undefined || lastExpenseSA===null) ? 100000 : lastExpenseSA;
  out.lastExpenseSA = leSA;
  // Last Expense is priced off the dedicated Death/LE rate table (qx!G:R)
  // for every product EXCEPT Faida Maisha, which reuses the Whole Life
  // rate table (qx!AI:AT) for its Last Expense line too (Faida_Maisha!K27
  // uses the same OFFSET(qx!$AI$2,...) branch as K28's Whole Life Cover —
  // only the "else" branch, which Elimu falls into, uses qx!G:R).
  const leTable = product === 'Faida Maisha' ? FAIDA.wholeLifeMaisha : FAIDA.deathLE;
  const lePrem = faidaRiderSinglePremium(leTable, ageANB, term, freq, leSA);
  out.lastExpenseAvailable = lePrem !== null;
  out.lastExpensePerPeriod = lePrem===null ? 0 : lePrem;

  if(product === 'Faida Maisha'){
    out.secondRiderLabel = 'Whole Life Cover';
    out.secondRiderSA = sumAssured || 0;
    const wlPrem = faidaRiderSinglePremium(FAIDA.wholeLifeMaisha, ageANB, term, freq, out.secondRiderSA);
    out.secondRiderAvailable = wlPrem !== null;
    out.secondRiderPerPeriod = wlPrem===null ? 0 : wlPrem;
  } else {
    // Faida Elimu: the Waiver of Premium sum assured is not a user input —
    // it's auto-derived as the total premiums payable over the term
    // (Faida_Elimu!J27 = Yearly_Premium_Elimu * Term_Elimu), and only
    // applies to recurring-premium policies (a Single-premium policy has
    // nothing left to waive, Faida_Elimu!J27 = 0 for Freq="Single").
    out.secondRiderLabel = 'Waiver of Premium';
    if(freq !== 'Single'){
      out.secondRiderSA = baseYearlyPremium * term;
      const wopPrem = faidaRiderSinglePremium(FAIDA.wop, ageANB, term, freq, out.secondRiderSA);
      out.secondRiderAvailable = wopPrem !== null;
      out.secondRiderPerPeriod = wopPrem===null ? 0 : wopPrem;
    }
  }
  return out;
}

function simulateFaida({product, gender, ageANB, term, freq, periodicPremium, sumAssured, lastExpenseSA}){
  const fi = faidaFreqInfo(freq);
  const yearlyPremium = periodicPremium * fi.perYear;
  const totalMonths = term*12;

  // Faida Elimu has no user-entered Sum Assured in the source model (no
  // "Sum_Assured_Elimu" named range) — whatever the caller passes is
  // ignored so it can never be fabricated into a death benefit.
  const effectiveSumAssured = product === 'Faida Elimu' ? 0 : (sumAssured || 0);

  const riders = faidaRiderPremiums({
    product, ageANB, term, freq, sumAssured: effectiveSumAssured, lastExpenseSA, baseYearlyPremium: yearlyPremium
  });

  const yearEnd = {};
  const annualCharge = {};
  FAIDA.returnRates.forEach(([name, rate])=>{
    let E = 0;
    const byYear = {};
    for(let m=1; m<=totalMonths; m++){
      const policyYear = Math.floor((m-1)/12)+1;
      const age = ageANB + policyYear - 1;
      let premium = 0;
      if(freq==='Single'){
        premium = (m===1) ? yearlyPremium : 0;
      } else if(m===1 || ((m-1) % fi.intervalMonths === 0)){
        premium = yearlyPremium / fi.perYear;
      }
      // Only Faida Elite deducts a mortality/rider charge from the fund
      // itself (PerPolWorking column J is hardcoded to 0 for Maisha/Elimu).
      const mortalityCharge = product==='Faida Elite' ? (getQx(age,gender)/1000)*effectiveSumAssured : 0;
      if(name==='Optimistic'){ annualCharge[policyYear] = (annualCharge[policyYear]||0) + mortalityCharge; }
      const K = E + premium - mortalityCharge;
      const monthlyRate = Math.pow(1+rate, 1/12) - 1;
      const N = K*monthlyRate;
      const Q = (m>totalMonths) ? 0 : K+N;
      E = Q;
      if(m % 12 === 0){
        let death;
        if(product === 'Faida Elite'){
          death = Q + effectiveSumAssured;
        } else if(product === 'Faida Maisha'){
          // Death Benefit = Fund Value + Whole Life Sum Assured only.
          // The source workbook's own formula (Faida_Maisha!S35 =
          // M35+Sum_Assured_Maisha+$J$27) also adds the Last Expense SA,
          // but a real, signed Faida Maisha illustration (Bonface Inganga,
          // 25 Jul 2026 — Single premium 2,000,000, SA 1,000,000, Last
          // Expense SA 100,000, term 7) shows Death Benefit = Fund + SA
          // exactly, every year, every scenario, with Last Expense SA
          // consistently NOT included. That printed, client-facing output
          // outranks the spreadsheet formula here.
          death = Q + riders.secondRiderSA;
        } else {
          // Faida Elimu has no life-cover death benefit in the source
          // model (no Death Benefit columns on its summary sheet) — only
          // the fund itself is payable; Waiver of Premium is a disability
          // benefit, not a death payout.
          death = Q;
        }
        byYear[policyYear] = {
          fund: Q,
          fullWD: faidaWithdrawalFactor(policyYear, freq)*Q,
          death
        };
      }
    }
    yearEnd[name] = byYear;
  });
  const investmentPremiumPaid = freq==='Single' ? yearlyPremium :
    (()=>{ let t=0; for(let m=1;m<=totalMonths;m++){ if(m===1||((m-1)%fi.intervalMonths===0)) t+=yearlyPremium/fi.perYear; } return t; })();
  const paymentCount = freq==='Single' ? 1 : (()=>{ let n=0; for(let m=1;m<=totalMonths;m++){ if(m===1||((m-1)%fi.intervalMonths===0)) n++; } return n; })();
  // Total premium actually billed to the client, on top of the periodic
  // premium (Faida_Maisha!K30 = K28[Whole Life]+Periodic_Premium_Maisha;
  // Faida_Elimu!K29 = K27[WOP]+Periodic_Premium_Elimu — in both sheets only
  // the SECOND rider is added to what's billed). Last Expense is priced and
  // disclosed as a benefit (Faida_Maisha!K27 / Faida_Elimu!K26) but, per
  // those same formulas, is never added into the client's billed premium —
  // it's carried only in the "Annual Insurance Premium" fund-charge row,
  // which (per PerPolWorking_PH-Account_*, see simulateFaida above) never
  // actually reduces Maisha's/Elimu's illustrated Fund Value either.
  const totalRiderPremiumPaid = riders.secondRiderPerPeriod * paymentCount;
  const totalPremiumPaid = investmentPremiumPaid + totalRiderPremiumPaid;
  const totalCharges = Object.values(annualCharge).reduce((a,b)=>a+b,0);
  return {
    yearEnd, annualCharge, yearlyPremium,
    investmentPremiumPaid,
    totalPremiumPaid,
    totalRiderPremiumPaid,
    totalContributions: investmentPremiumPaid-totalCharges,
    riders
  };
}


  return { faidaAgeANB, faidaFreqInfo, getQx, faidaWithdrawalFactor, faidaAgeMaxTerm, faidaRiderRate, faidaRiderSinglePremium, faidaRiderPremiums, simulateFaida };
});
