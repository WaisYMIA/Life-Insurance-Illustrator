/**
 * Fanaka calculation engine — extracted verbatim from the
 * validated Plan Illustrator. Pure functions, no DOM dependency.
 */
(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory;
  } else {
    root.FanakaEngine = factory;
  }
})(typeof self !== 'undefined' ? self : this, function(DATA){
  'use strict';

const FREQS = ["Monthly","Quarterly","Semi-Annually","Annually"];

function planTermOptions(plan){
  const opts = [];
  if(plan.termStep>0){
    for(let t=plan.minTerm; t<=plan.maxTerm; t+=plan.termStep) opts.push(t);
  } else {
    opts.push(plan.minTerm||plan.maxTerm||0);
  }
  return opts;
}

function availableRiders(plan){
  return DATA.riderNames.map((name,i)=>({name, idx:i, available: plan.riders[i]===1}))
    .filter(r=>r.available);
}

function riderCategory(planName){
  if(planName==="Joint Maxlife") return "JointMaxlife";
  if(planName==="Joint Supermaxlife") return "JointSupermaxlife";
  if(planName==="Single Maxlife" || planName==="Single Supermaxlife") return "SingleMaxlife";
  return "Other";
}

function getRateRow(planName, age, term, premiumDependsOnTerm){
  return DATA.prates.find(p=>p.plan===planName && p.anb===age && (!premiumDependsOnTerm || p.term===term));
}

function getSingleRate(age, term){
  const row = DATA.single.find(r=>r[0]===age);
  if(!row) return null;
  const colIdx = term-4; // row = [ANB, term5, term6, ... term20]; VLOOKUP col_index (Term-3) is 1-based over [ANB,term5,...]
  return row[colIdx];
}

function convFactorBand(band, freq){
  return DATA.conv[band][freq];
}

function freqOnlyFactor(freq){
  const map = {Monthly:0.0896,Quarterly:0.2575,"Semi-Annually":0.5075,Annually:1.0};
  return map[freq];
}

function riderCostPerMille(plan, riders){
  const cat = riderCategory(plan.name);
  const R = DATA.riderRates;
  let sum = 0;
  const lines = [];
  if(riders.ADB){ sum += R.ADB[cat]; lines.push(["Accidental Death Benefit", R.ADB[cat]]); }
  if(riders.TPD){ sum += R.TPD[cat]; lines.push(["Total & Permanent Disability", R.TPD[cat]]); }
  if(riders.AAHR){ const v=R.AAHR[cat]*0.4; sum += v; lines.push(["Adult Accident Hospitalization", v]); }
  if(riders.CAHR){ const v=R.CAHR[cat]*0.4; sum += v; lines.push(["Child Accident Hospitalization", v]); }
  return {sum, lines};
}

function solveSAFromPremium(ctx){
  const {plan, age, term, freq, premium, riders, isSingle} = ctx;
  const WOP_rate = 0.03;
  const LE_LA_rate = 15.0, LE_BC_rate = 15.0;

  const leDeduction = (100000*(LE_LA_rate/1000)*(riders.LE_LA?1:0)) + (50000*(LE_BC_rate/1000)*(riders.LE_BC?1:0));
  const wopDivisor = 1 + (WOP_rate*(riders.WOP?1:0));
  const numerator = ((premium - leDeduction) / wopDivisor) * 1000;

  const {sum:riderPerMille} = riderCostPerMille(plan, riders);
  const riderTermFreq = (riderPerMille / wopDivisor) * freqOnlyFactor(freq);

  function passWithBand(band){
    let baseRatePerMille;
    if(isSingle){
      baseRatePerMille = getSingleRate(age, term);
    } else {
      const row = getRateRow(plan.name, age, term, plan.premiumDependsOnTerm);
      if(!row) return null;
      baseRatePerMille = row.rate * convFactorBand(band, freq);
    }
    if(baseRatePerMille===null || baseRatePerMille===undefined) return null;
    const denom = baseRatePerMille + riderTermFreq;
    if(denom<=0) return null;
    return numerator/denom;
  }
  const low = passWithBand("100-249");
  const high = passWithBand("250+");
  const candidates = [low,high].filter(v=>v!==null && !isNaN(v));
  if(candidates.length===0) return null;
  return Math.max(...candidates);
}

function premiumFromSA(ctx){
  const {plan, age, term, riders, isSingle, SA} = ctx;
  const band = SA >= DATA.convThreshold ? "250+" : "100-249";
  const WOP_rate = 0.03;

  const out = {};
  FREQS.forEach(freq=>{
    let baseRatePerMille;
    if(isSingle){
      baseRatePerMille = getSingleRate(age, term);
    } else {
      const row = getRateRow(plan.name, age, term, plan.premiumDependsOnTerm);
      baseRatePerMille = row ? row.rate * convFactorBand(band, freq) : null;
    }
    if(baseRatePerMille===null || baseRatePerMille===undefined || age>plan.maxMatAge){
      out[freq] = {base:0, riders:0, wopLoad:0, total:0, discounted:0};
      return;
    }
    let base = Math.ceil(baseRatePerMille/1000*SA);

    const {sum:riderPerMille, lines} = riderCostPerMille(plan, riders);
    let riderPrem = (riderPerMille/1000*SA) * freqOnlyFactor(freq);
    if(riders.LE_LA) riderPrem += (100000*15.0/1000) * freqOnlyFactor(freq);
    if(riders.LE_BC) riderPrem += (50000*15.0/1000) * freqOnlyFactor(freq);
    riderPrem = Math.ceil(riderPrem);

    let total = base + riderPrem;
    if(riders.WOP) total = total*(1+WOP_rate);
    total = Math.ceil(total);

    const capMap = {Monthly:5000,Quarterly:15000,"Semi-Annually":30000,Annually:60000};
    const taxRelief = plan.taxApplicable ? Math.round(Math.min(0.15*total, capMap[freq])) : 0;

    out[freq] = {base, riders:riderPrem, total, taxRelief};
  });
  return out;
}

function solveSAFromTarget(ctx){
  const {plan, age, term, targetAmt, bonusRate} = ctx;
  const name = plan.name;
  const row = getRateRow(name, age, term, plan.premiumDependsOnTerm);
  const rateCol3 = row ? row.surv : null; // used by Joint/Single Maxlife family
  if(name==="Anticipated Endowment (5 payments)"){
    return targetAmt/(0.45+(bonusRate*term));
  }
  if(name.startsWith("Career Life Plan")){
    const v = targetAmt/(1+(bonusRate*term));
    return v<200000 ? null : v;
  }
  if(name.startsWith("Fanaka")){
    const v = term<=10 ? targetAmt/(1.1+(bonusRate+0.01)*term) : targetAmt/(1.2+bonusRate*term);
    return v<350000 ? null : v;
  }
  if(["Joint Maxlife","Joint Supermaxlife","Jubilant","Single Maxlife","Single Supermaxlife"].includes(name)){
    if(rateCol3===null||rateCol3===undefined) return null;
    return targetAmt/(rateCol3+(bonusRate*term));
  }
  if(name==="Triplex"){
    return targetAmt/(0.5+(bonusRate*term));
  }
  // Mortgage, Term Assurance, Whole Assurance(limited Term): SA == target amount
  return targetAmt;
}

function reversionaryBonusPct(plan, term, bonusRate){
  const zeroBonusPlans = ["Mortgage","Term Assurance","Whole Assurance(limited Term)","Whole Assurance(unlimited term-Without Profit)"];
  if(zeroBonusPlans.includes(plan.name)) return 0;
  if(plan.name.startsWith("Fanaka")){
    return term<=10 ? (bonusRate+0.005)*term : bonusRate*term;
  }
  return bonusRate*term;
}

function estimateMaturityBreakdown(ctx){
  const {plan, age, term, SA, bonusRate} = ctx;
  if(!plan.par) return null;
  const row = getRateRow(plan.name, age, term, plan.premiumDependsOnTerm);
  const survFactor = row ? row.surv : 0;
  const basic = SA*survFactor;
  const guaranteedBonus = plan.terminalBonus ? (term<=10 ? 0.10*SA : 0.20*SA) : 0;
  const bonusPct = reversionaryBonusPct(plan, term, bonusRate);
  const projectedBonus = bonusPct*SA;
  const total = basic + guaranteedBonus + projectedBonus;
  return {basic, guaranteedBonus, projectedBonus, bonusPct, annualBonusRate: term>0?bonusPct/term:0, total, survFactor};
}

function estimateMaturity(ctx){
  const b = estimateMaturityBreakdown(ctx);
  return b ? b.total : null;
}

function ageNextBirthday(dobStr){
  const dob = new Date(dobStr);
  const today = new Date();
  // TRUNC(YEARFRAC(dob,today)) + 1  -- approximate with actual/365 fraction
  const msPerYear = 365.25*24*3600*1000;
  const yearsElapsed = (today - dob) / msPerYear;
  return Math.trunc(yearsElapsed) + 1;
}

function equivalentAge(age1, age2){
  const diff = Math.abs(age1-age2);
  const row = DATA.seniority.find(r=>r[0]===diff);
  const addition = row ? row[1] : 0;
  return Math.min(age1,age2) + addition;
}


  return { planTermOptions, availableRiders, riderCategory, getRateRow, getSingleRate, convFactorBand, freqOnlyFactor, riderCostPerMille, solveSAFromPremium, premiumFromSA, solveSAFromTarget, reversionaryBonusPct, estimateMaturityBreakdown, estimateMaturity, ageNextBirthday, equivalentAge };
});
