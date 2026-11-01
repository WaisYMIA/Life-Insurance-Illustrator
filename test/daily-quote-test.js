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

// ---- categories library (Bible, Stoic, history, proverbs, money) ----
const lctx = { window: {} }; vm.createContext(lctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'daily-library.js'), 'utf8'), lctx);
const LIB = lctx.window.DAILY_LIBRARY; const mins = { bible: 250, stoic: 140, history: 100, proverbs: 80, money: 90 };
let libTotal = 0; for (const k of Object.keys(mins)) { const a = LIB[k] || []; libTotal += a.length; if (a.length < mins[k]) fail(k + ' has only ' + a.length + ' entries'); const sn = new Set(); a.forEach(([t, au]) => { if (!t || t.length < 8 || t.length > 420) fail(k + ' odd length: ' + t.slice(0, 40)); if (!au) fail(k + ' entry without author/label'); const kk = t.toLowerCase().replace(/[^a-z0-9]/g, ''); if (sn.has(kk)) fail(k + ' duplicate: ' + t.slice(0, 40)); sn.add(kk); }); }
(LIB.bible || []).forEach(([t, ref, src]) => { if (!/^[1-3]? ?[A-Z][a-z]+( of [A-Z][a-z]+)? \d+:\d+(-\d+)?$/.test(ref)) fail('bad Bible reference: ' + ref); if (src !== 'King James Version') fail('Bible source: ' + ref); });
// ---- slots: first open, midday, evening ----
const code2 = [m(/const SLOTS[^\n]*\n/), m(/function dueSlot[^\n]*\n/)].join('\n') + '\nthis.dueSlot=dueSlot;'; const c3 = {}; vm.createContext(c3); vm.runInContext(code2, c3);
const eq = (a, b, l) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(l + ': ' + JSON.stringify(a)); };
eq(c3.dueSlot(8, [], 1).slot, 'first', 'once a day, morning');
eq(c3.dueSlot(15, ['first'], 1), null, 'once a day: nothing more after the first');
eq(c3.dueSlot(9, ['first'], 3), null, 'three a day: nothing due at 9am after the first');
eq(c3.dueSlot(12, ['first'], 2).slot, 'mid', 'twice a day: midday card at 12:00');
eq(c3.dueSlot(12, ['first'], 1), null, 'once a day never shows a midday card');
eq(c3.dueSlot(17, ['first', 'mid'], 3).slot, 'eve', 'three a day: evening card at 17:00');
eq(c3.dueSlot(17, ['first', 'mid'], 2), null, 'twice a day has no evening card');
const late = c3.dueSlot(19, [], 3); eq(late.slot, 'eve', 'opening first at 19:00 shows one card'); eq(late.mark, ['first', 'mid', 'eve'], 'and skips the earlier slots instead of stacking three cards');
const aft = c3.dueSlot(14, [], 3); eq(aft.slot, 'mid', 'first open at 14:00 shows one card'); eq(aft.mark, ['first', 'mid'], 'evening still pending afterwards');
console.log(`${libTotal} category entries (${Object.keys(mins).map(k => k + ' ' + LIB[k].length).join(', ')})`);
console.log(bad ? 'daily quote: ' + bad + ' problem(s)' : 'daily quote: OK'); process.exit(bad ? 1 : 0);
