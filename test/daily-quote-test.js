// Daily quote library and rotation: size, uniqueness, no repeats within a full cycle, per-agent order.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'daily-quotes.js'), 'utf8'), ctx);
const Q = ctx.window.DAILY_QUOTES; let bad = 0; const fail = m => { console.log('FAIL ' + m); bad++; };
if(Q.length < 1000) fail('library has ' + Q.length + ' quotes, need at least 1000');
const seen = new Set(); Q.forEach(([t, a, s], i) => { if(!t || t.length < 8 || t.length > 330) fail('quote ' + i + ' has odd length'); if(!a) fail('quote ' + i + ' has no author'); const k = t.toLowerCase().replace(/[^a-z]/g, ''); if(seen.has(k)) fail('duplicate: ' + t); seen.add(k); if(/anonymous/i.test(a)) fail('anonymous author: ' + t); });
// rotation logic copied from the module (kept in sync by loading it)
const src = fs.readFileSync(path.join(__dirname, '..', 'daily-quote.js'), 'utf8');
const m = s => { const r = src.match(s); if(!r) throw new Error('pattern missing'); return r[0]; };
const code = [m(/function mulberry[\s\S]*?\n/), m(/function hash[\s\S]*?\n/), m(/function dayNumber[\s\S]*?\n/), m(/const permCache[\s\S]*?\n/), m(/function permutation[\s\S]*?\n/), m(/function pickIndex[\s\S]*?\n/)].join('\n') + '\nthis.pickIndex=pickIndex;';
const c2 = {}; vm.createContext(c2); vm.runInContext(code, c2);
const start = new Date(2027, 0, 1), N = Q.length; const used = new Set();
for(let d = 0; d < N; d++){ const dt = new Date(2027, 0, 1 + d); used.add(c2.pickIndex(N, 'agent-1', dt)); }
if(used.size !== N) fail('an agent saw a repeat within one full cycle: ' + used.size + ' distinct of ' + N);
let same = 0; for(let d = 0; d < 365; d++){ const dt = new Date(2027, 0, 1 + d); if(c2.pickIndex(N, 'agent-1', dt) === c2.pickIndex(N, 'agent-2', dt)) same++; }
if(same > 5) fail('two agents see the same quote too often: ' + same + ' days of 365');
const yr = new Set(); for(let d = 0; d < 365; d++) yr.add(c2.pickIndex(N, 'agent-1', new Date(2027, 0, 1 + d))); if(yr.size !== 365) fail('repeat inside a year');
console.log(`${N} quotes, ${new Set(Q.map(x => x[1])).size} authors; no repeats over ${N} days; two agents share ${same} of 365 days`);
console.log(bad ? 'daily quote: ' + bad + ' problem(s)' : 'daily quote: OK'); process.exit(bad ? 1 : 0);
