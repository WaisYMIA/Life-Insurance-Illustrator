/**
 * SmartSave calculation engine — extracted verbatim from the
 * validated Plan Illustrator. Pure functions, no DOM dependency.
 */
(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory;
  } else {
    root.SmartSaveEngine = factory;
  }
})(typeof self !== 'undefined' ? self : this, function(SMARTSAVE){
  'use strict';

function ssAgeANB(dobStr){
  const dob = new Date(dobStr);
  const today = new Date();
  const msPerYear = 365.25*24*3600*1000;
  const years = (today-dob)/msPerYear;
  return Math.ceil(years - 1e-9);
}

function ssFreqInfo(freq){
  const row = SMARTSAVE.freq.find(r=>r[0]===freq);
  return {name:row[0], intervalMonths:row[1], perYear:row[2], minPremium: typeof row[3]==='string'?parseFloat(row[3]):row[3], convFactor:row[4]};
}

function ssConfig(product){
  return SMARTSAVE.productConfig[product];
}

function ssRateTable(product, mode, segment){
  const key = segment+ (mode==='Single'?'Single':'Yearly');
  return ssConfig(product).rateTables[key];
}

function ssGetRate(product, age, term, mode, sumAssured){
  const segment = sumAssured>=SMARTSAVE.segmentThreshold ? 'middle' : 'mass';
  const table = ssRateTable(product, mode, segment);
  const row = table.rows.find(r=>r[0]===age);
  if(!row) return null;
  const idx = table.terms.indexOf(term);
  if(idx===-1) return null;
  const v = row[idx+1];
  return (v===0||v===''||v===null||v===undefined) ? null : v;
}

function ssGetSurrenderFactor(product, age, term, policyYear, sumAssured){
  const segment = sumAssured>=SMARTSAVE.segmentThreshold ? 'middle' : 'mass';
  const rows = ssConfig(product).surrender[segment];
  const row = rows.find(r=>r[0]===age && r[1]===term);
  if(!row) return 0;
  const v = row[2+(policyYear-1)];
  return v||0;
}

function ssComputePremium(product, age, term, freq, sumAssured){
  const rate = ssGetRate(product, age, term, freq==='Single'?'Single':'Yearly', sumAssured);
  if(rate===null) return null;
  const fi = ssFreqInfo(freq);
  const premium = Math.round(rate*fi.convFactor*sumAssured/1000);
  if(premium < fi.minPremium) return {error:true, minPremium: fi.minPremium};
  return {premium};
}

function ssComputeSA(product, age, term, freq, periodicPremium){
  // Reverse-solve SA from a known periodic premium — mirrors Premium_Quote,
  // which resolves the SA-band circularity by testing both segments and
  // taking whichever is internally consistent with its own threshold.
  for(const segment of ['middle','mass']){
    const table = ssRateTable(product, freq==='Single'?'Single':'Yearly', segment);
    const row = table.rows.find(r=>r[0]===age);
    if(!row) continue;
    const idx = table.terms.indexOf(term);
    if(idx===-1) continue;
    const rate = row[idx+1];
    if(!rate) continue;
    const fi = ssFreqInfo(freq);
    const sa = (periodicPremium*1000)/(rate*fi.convFactor);
    const impliedSegment = sa>=SMARTSAVE.segmentThreshold ? 'middle' : 'mass';
    if(impliedSegment===segment){
      const rounded = Math.round(sa);
      // Premium_Quote!J22 rejects ("Increase the premium to meet the
      // minimum Sum Assured requirements") any premium whose implied SA
      // comes out below this floor, for both Smart Save and Smart Scholar.
      if(SMARTSAVE.minSumAssured && rounded < SMARTSAVE.minSumAssured){
        return {error:true, minSumAssured: SMARTSAVE.minSumAssured};
      }
      return rounded;
    }
  }
  return null;
}

function ssRiderPremium(riderKey, riderSA, term, freq, periodicPremium){
  const rate = SMARTSAVE.riderRates[riderKey];
  const conv = SMARTSAVE.riderConv[freq];
  if(riderKey==='WOP'){
    // Nothing to waive on a Single-premium policy — the source workbook
    // blanks the WOP row out entirely whenever Freq="Single".
    if(freq==='Single') return 0;
    // Otherwise: 3% of the periodic premium.
    return Math.ceil(rate*periodicPremium);
  }
  const termMult = freq==='Single' ? term : 1;
  return Math.ceil(Math.ceil(rate/1000*riderSA*conv*10)/10 * termMult);
}

function ssRiderSA(riderKey, sumAssured, ctx){
  if(riderKey==='ADB' || riderKey==='TPD') return sumAssured;
  if(riderKey==='AAHR' || riderKey==='CAHR') return Math.min(0.40*sumAssured, 250000);
  if(riderKey==='LE_LA') return 100000;
  if(riderKey==='LE_BC') return 50000;
  if(riderKey==='WOP'){
    // The disclosed "Sum Assured" for Waiver of Premium is the total
    // premiums payable over the remaining term (Periodic_Premium *
    // payments/year * Term) — not the life cover Sum Assured — and is zero
    // for Single premium (nothing left to waive).
    if(!ctx || ctx.freq==='Single') return 0;
    const fi = ssFreqInfo(ctx.freq);
    return (ctx.periodicPremium||0) * fi.perYear * (ctx.term||0);
  }
  return sumAssured;
}

function ssSimulate({product, age, term, freq, sumAssured, bonusRate}){
  const years = [];
  for(let y=1; y<=term; y++){
    const withdrawal = y<3 ? 0 : Math.ceil(ssGetSurrenderFactor(product,age,term,y,sumAssured)*sumAssured/1000*(y/term) + bonusRate*sumAssured*y);
    const maturity = (y===term) ? Math.round(sumAssured + bonusRate*sumAssured*term*2) : 0;
    years.push({year:y, withdrawal, maturity});
  }
  return years;
}

function ssAvailableRiders(product){
  const keys = ssConfig(product).riders;
  return keys.map(k=>({key:k, name:SMARTSAVE.riderNames[k]}));
}


  return { ssAgeANB, ssFreqInfo, ssConfig, ssRateTable, ssGetRate, ssGetSurrenderFactor, ssComputePremium, ssComputeSA, ssRiderPremium, ssRiderSA, ssSimulate, ssAvailableRiders };
});
