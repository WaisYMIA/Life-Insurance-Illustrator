'use strict';
// Unit tests for the What-if limit rules (pure helpers). Browser behaviour is covered by the e2e run.
const W = require('../whatif-limits.js'); const fs = require('fs');
let bad = 0; const t = (ok, n) => { console.log((ok ? 'ok   ' : 'FAIL ') + n); if(!ok) bad++; };
t(W.PREMIUM_CAP === 500000, 'premium cap is 500,000');
t(W.WLC_MIN === 1000000 && W.WLC_MAX === 200000000, 'whole life cover limits 1M–200M');
for(const kind of ['premium', 'sa', 'target', 'wlc']){
  for(const [min, max] of [[2000, 500000], [5000, 500000], [15700, 500000], [60000, 500000], [200000, 50000000], [1000000, 200000000], [499000, 500000]]){
    const b = W.bandsFor(kind, min, max);
    t(b[0].lo === min && b[b.length - 1].hi === max, `${kind} ${min}-${max}: bands cover exactly the allowed range`);
    t(b.every((x, i) => x.hi > x.lo && (i === 0 || x.lo === b[i - 1].hi)), `${kind} ${min}-${max}: bands are contiguous`);
    t(b.every(x => (x.hi - x.lo) / x.step >= 1), `${kind} ${min}-${max}: every band has at least one step`);
    for(const v of [min, max, (min + max) / 2, min - 1000, max + 1000]){ const x = W.snap(v, b[W.bandIndexFor(b, v)]); t(x >= min && x <= max, `${kind} ${min}-${max}: snap(${v}) stays inside`); }
  }
}
const r = W.termRange([5, 10, 15, 20]); t(r.min === 5 && r.max === 20 && r.step === 5 && !r.fixed, 'term range from options with step 5');
t(W.termRange([8]).fixed === true, 'single allowed term is shown fixed, not as a slider');
t(W.termRange(W.range(5, 15)).step === 1, 'consecutive years step 1');
t(W.termRange([1, 2]).min >= 1, 'helper never invents terms');
// source checks: Walter's rules must stay in the spec code
const src = fs.readFileSync(__dirname + '/../agent-tools.js', 'utf8');
t(/f\.product === 'Faida Maisha'/.test(src) && (src.match(/'wlc'/g) || []).length === 2, 'whole life cover slider exists only inside the Faida Maisha branch');
t(!/Math\.round\([^)]*\* 2\.5\)/.test(src), 'old relative 2.5x slider ceilings are gone');
t(/PREMIUM_CAP/.test(src), 'premium sliders use the 500,000 cap');
process.exit(bad ? 1 : 0);
