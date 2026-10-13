(function(){
  'use strict';

  const FANAKA_DATA = JSON.parse(document.getElementById('fanaka-data-json').textContent);
  const FAIDA_DATA = JSON.parse(document.getElementById('faida-data-json').textContent);
  const SMARTSAVE_DATA = JSON.parse(document.getElementById('smartsave-data-json').textContent);

  FANAKA_DATA.plans = FANAKA_DATA.plans.filter(p => FANAKA_DATA.prates.some(r => r.plan === p.name));

  const fanaka = window.FanakaEngine(FANAKA_DATA);
  const faida = window.FaidaEngine(FAIDA_DATA);
  const smartsave = window.SmartSaveEngine(SMARTSAVE_DATA);
  const utils = window.UtilsEngine;

  function renderDataStatus(){
    const box = document.getElementById('dataStatus');
    const stats = [
      ['Fanaka plans', FANAKA_DATA.plans.length],
      ['Fanaka rate rows', FANAKA_DATA.prates.length],
      ['Faida products', FAIDA_DATA.products.length],
      ['Smart Save/Scholar products', SMARTSAVE_DATA.products.length],
    ];
    box.innerHTML = stats.map(([l,n]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');
    document.getElementById('dataStatusCount').textContent = 'loaded OK';
  }

  function runAllChecks(){
    const groups = [];
    let currentGroup = null;
    let pass = 0, fail = 0;

    function section(title){
      currentGroup = {title, checks: []};
      groups.push(currentGroup);
    }
    function check(label, actual, expected, tolerance){
      tolerance = tolerance || 0;
      const a = Math.round(actual);
      const e = Math.round(expected);
      const ok = Math.abs(a - e) <= tolerance;
      if(ok) pass++; else fail++;
      currentGroup.checks.push({label, actual: a, expected: e, ok});
    }

    section('Fanaka Plan Layer 1');
    {
      const plan = FANAKA_DATA.plans.find(p => p.name === 'Fanaka Plan Layer 1');
      let SA = fanaka.solveSAFromPremium({plan, age:35, term:5, freq:'Monthly', premium:20000, riders:{}, isSingle:false});
      check('SA at age 35 (premium 20,000/mo)', SA, 991746);
      let mat = fanaka.estimateMaturityBreakdown({plan, age:35, term:5, SA, bonusRate:0.045});
      check('Maturity value at age 35', mat.total, 1338857);
      let prem = fanaka.premiumFromSA({plan, age:35, term:5, riders:{}, isSingle:false, SA});
      check('Premium round-trip (should return to 20,000)', prem.Monthly.total, 20000);
      SA = fanaka.solveSAFromPremium({plan, age:28, term:5, freq:'Monthly', premium:190000, riders:{}, isSingle:false});
      check('SA at age 28 (premium 190,000/mo)', SA, 9467015);
      SA = fanaka.solveSAFromTarget({plan, age:28, term:5, targetAmt:650000, bonusRate:0.045});
      check('SA from target amount (650,000 target)', SA, 472727);
      let mb = fanaka.estimateMaturityBreakdown({plan, age:35, term:8, SA:1000000, bonusRate:0.045});
      check('Guaranteed bonus, 8yr term (expect 10% = 100,000)', mb.guaranteedBonus, 100000);
      mb = fanaka.estimateMaturityBreakdown({plan, age:35, term:15, SA:1000000, bonusRate:0.045});
      check('Guaranteed bonus, 15yr term (expect 20% = 200,000)', mb.guaranteedBonus, 200000);
    }

    section('Faida Elite');
    {
      const res = faida.simulateFaida({product:'Faida Elite', gender:'Male', ageANB:28, term:5, freq:'Single', periodicPremium:650000, sumAssured:100000});
      check('Year 1 fund value, Optimistic', res.yearEnd.Optimistic[1].fund, 727577);
      check('Year 1 fund value, Realistic', res.yearEnd.Realistic[1].fund, 714582);
      check('Year 1 fund value, Pessimistic', res.yearEnd.Pessimistic[1].fund, 701586);
      check('Year 5 fund value, Realistic', res.yearEnd.Realistic[5].fund, 1044366);
      check('Year 5 fund value, Pessimistic', res.yearEnd.Pessimistic[5].fund, 952719);
      check('Total contributions (net of insurance charges)', res.totalContributions, 648091);
    }

    section('Smart Save');
    {
      const age = 42; // pinned — age stated in the reference PDF, not derived from a live-clock DOB calc
      const p = smartsave.ssComputePremium('Smart Save', age, 10, 'Monthly', 1000000);
      check('Monthly premium', p.premium, 10628);
      const sim = smartsave.ssSimulate({product:'Smart Save', age, term:10, freq:'Monthly', sumAssured:1000000, bonusRate:0.04});
      check('Withdrawal value, year 3', sim[2].withdrawal, 183000);
      check('Withdrawal value, year 10', sim[9].withdrawal, 1400000);
      check('Maturity value, year 10', sim[9].maturity, 1800000);
    }

    section('Smart Scholar');
    {
      const age = 40; // pinned — age stated in the reference PDF (DOB-based calc drifts with real time)
      const p = smartsave.ssComputePremium('Smart Scholar', age, 8, 'Monthly', 265700);
      check('Monthly premium', p.premium, 3500);
      const sim = smartsave.ssSimulate({product:'Smart Scholar', age, term:8, freq:'Monthly', sumAssured:265700, bonusRate:0.04});
      check('Withdrawal value, year 3', sim[2].withdrawal, 60480);
      check('Withdrawal value, year 8', sim[7].withdrawal, 350724);
      check('Maturity value, year 8', sim[7].maturity, 435748);
    }

    section('Kenyan phone validation');
    {
      const validCases = ['0712345678', '0112345678', '+254712345678', '254712345678', '0712 345 678'];
      const invalidCases = ['12345', '071234567', '07123456789', '0812345678', 'abcdefghij', ''];
      validCases.forEach(v => check(`"${v}" should be valid`, utils.normalizeKenyanPhone(v) ? 1 : 0, 1));
      invalidCases.forEach(v => check(`"${v}" should be invalid`, utils.normalizeKenyanPhone(v) ? 1 : 0, 0));
    }

    return {groups, pass, fail};
  }

  function render(results){
    const {groups, pass, fail} = results;
    const summaryBar = document.getElementById('summaryBar');
    summaryBar.innerHTML = `
      <div class="summary-card pass"><div class="num">${pass}</div><div class="lbl">Passed</div></div>
      <div class="summary-card ${fail>0?'fail':''}"><div class="num">${fail}</div><div class="lbl">Failed</div></div>
      <div class="summary-card"><div class="num">${pass+fail}</div><div class="lbl">Total checks</div></div>
    `;

    const container = document.getElementById('resultsContainer');
    container.innerHTML = groups.map(g => {
      const groupFails = g.checks.filter(c => !c.ok).length;
      const rows = g.checks.map(c => `
        <div class="check-row ${c.ok?'pass':'fail'}">
          <span class="dot"></span>
          <span class="label">${c.label}</span>
          <span class="value">${c.ok ? c.actual : `got ${c.actual}, expected ${c.expected}`}</span>
        </div>
      `).join('');
      return `
        <section class="group">
          <h2>${g.title} <span class="count">${g.checks.length - groupFails}/${g.checks.length} passing</span></h2>
          ${rows}
        </section>
      `;
    }).join('');

    document.getElementById('runTimestamp').textContent = 'Last run: ' + new Date().toLocaleString();
  }

  function runAndRender(){
    const results = runAllChecks();
    render(results);
  }

  document.getElementById('runBtn').addEventListener('click', runAndRender);
  renderDataStatus();
  runAndRender();
})();
