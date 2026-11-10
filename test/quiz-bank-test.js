/* Sales Academy question bank: node test/quiz-bank-test.js */
const assert = require('assert'), vm = require('vm'), fs = require('fs'), path = require('path');
const Q = require('../quiz-bank.js'); let n = 0; const t = (c, m) => { n++; try{ assert(c, m); }catch(e){ console.error('FAIL: ' + m); process.exitCode = 1; } };
const w = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'market-data.js'), 'utf8'), { window: w });
const all = JSON.stringify([Q.STATIC, Q.PATHS]);
t(Q.STATIC.length >= 120, 'at least 120 hand-written questions'); t(!/https?:\/\/|@|\+254|\b0[17]\d{8}\b/.test(all), 'no links or contacts');
for(const s of Q.STATIC){
  t(Q.LINES.some(l => l[0] === s.line) && Q.TOPICS.some(x => x[0] === s.topic) && s.d >= 1 && s.d <= 4, 'valid line/topic/level: ' + s.q.slice(0, 40));
  t(s.q && s.a && s.x && s.w.length === 3 && new Set(s.w.concat(s.a)).size === 4, 'four distinct options and an explanation: ' + s.q.slice(0, 40));
}
for(const l of [1, 2, 3, 4]) t(Q.STATIC.filter(s => s.d === l).length >= 10, 'level ' + l + ' has at least 10 questions');
for(const tp of ['jubilee', 'principles', 'objection', 'skills', 'kenya', 'ethics', 'market']) t(Q.STATIC.filter(s => s.topic === tp).length >= 8, 'topic has depth: ' + tp);
t(['life', 'medical', 'general', 'sector'].every(l => Q.STATIC.filter(s => s.line === l).length >= 10), 'every line has at least 10 questions');
// brochure facts
const find = s => Q.STATIC.find(x => x.q.includes(s));
t(find('minimum monthly premium for Smart Save').a === 'KES 2,000', 'Smart Save minimum'); t(find('Fanaka\'s minimum sum assured').a === 'KES 350,000', 'Fanaka minimum SA');
// generators: recompute the answers independently
const seeded = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; })();
const num = s => +String(s).replace(/[^0-9]/g, '');
for(let i = 0; i < 400; i++){
  for(const g of Q.GEN){
    const q = g(seeded); const m = Q.materialise(q, seeded, 'x'); if(!m || m.opts.length !== 4) continue;
    t(m.opts.length === 4 && new Set(m.opts).size === 4 && m.opts[m.answer] === q.a, 'generated question is well-formed');
    const kes = [...q.q.matchAll(/KES ([\d,]+)/g)].map(x => num(x[1]));
    if(/^Smart Scholar: the parent insures/.test(q.q)) t(num(q.a) === kes[0] / 2, 'Smart Scholar 50%');
    if(/^Fanaka, sum assured .* BEFORE bonus/.test(q.q)) t(num(q.a) === Math.round(kes[0] * 1.2), 'Fanaka 120%');
    if(/^Fanaka.*5 to 10|term [5-9] years\. The client dies|term 10 years\. The client dies/.test(q.q)) t(num(q.a) === Math.round(kes[0] * 0.75 + kes[1]), 'Fanaka 75% + bonus');
    if(/^Faida Maisha/.test(q.q)) t(num(q.a) === 100000 + kes[0] + kes[1], 'Faida Maisha death benefit');
    if(/^A client pays KES .* a month/.test(q.q)) t(num(q.a) === kes[0] * 12, 'annual from monthly');
    if(/10 times annual income/.test(q.q)) t(num(q.a) === kes[0] * 10, 'ten times income');
    if(/^Cover needed/.test(q.q)){ const y = +q.q.match(/for (\d+) years/)[1]; t(num(q.a) === kes[0] * y + kes[1] - kes[2], 'needs gap'); }
    if(/Smart Save: a client is/.test(q.q)){ const age = +q.q.match(/is (\d+)\./)[1]; t(+q.a.split(' ')[0] === Math.min(20, 70 - age), 'longest term'); }
    if(/Faida Elimu \(regular/.test(q.q)){ const y = +q.q.match(/year (\d)/)[1]; t(num(q.a) === Math.round(kes[0] * [0.85, 0.9, 0.95][y - 1]), 'Faida Elimu early withdrawal'); }
    if(/Smart Scholar, sum assured/.test(q.q)){ const t2 = +q.q.match(/term (\d+) years/)[1]; t(num(q.a) === Math.round(kes[0] * (1 + 0.08 * t2)), 'Smart Scholar maturity with max bonus'); }
  }
}
// selection logic
const base = { level: 2, n: 200, market: w.MARKET_DATA };
const only = Q.buildSalesQuiz(Object.assign({ lines: ['medical'], topics: [], mode: 'only' }, base)); t(only.length >= 10 && only.every(q => q.line === 'medical'), 'only medical');
const ex = Q.buildSalesQuiz(Object.assign({ lines: ['medical', 'general'], topics: [], mode: 'except' }, base)); t(ex.length >= 50 && ex.every(q => q.line !== 'medical' && q.line !== 'general'), 'everything except medical and general');
const ex2 = Q.buildSalesQuiz(Object.assign({ lines: [], topics: ['calc'], mode: 'except' }, base)); t(ex2.length >= 50 && ex2.every(q => q.topic !== 'calc'), 'everything except calculations');
const both = Q.buildSalesQuiz(Object.assign({ lines: ['life'], topics: ['calc', 'jubilee'], mode: 'only' }, base)); t(both.length >= 20 && both.every(q => q.line === 'life' && ['calc', 'jubilee'].includes(q.topic)), 'life only and two topics');
const all0 = Q.buildSalesQuiz(Object.assign({ lines: [], topics: [], mode: 'only' }, base)); t(new Set(all0.map(q => q.topic)).size >= 7, 'no ticks means everything');
const ids = Q.buildSalesQuiz({ level: 2, n: 15, market: w.MARKET_DATA }); t(ids.length === 15 && new Set(ids.map(q => q.def)).size === 15, 'no repeated question text');
const avg = lv => { let s = 0, c = 0; for(let i = 0; i < 40; i++) Q.buildSalesQuiz({ level: lv, n: 10, market: w.MARKET_DATA }).forEach(q => { s += q.d; c++; }); return s / c; };
t(avg(1) < avg(2) && avg(2) < avg(3) && avg(3) < avg(4), 'level raises difficulty (' + [1, 2, 3, 4].map(avg).map(x => x.toFixed(2)).join(' < ') + ')');
t(avg(1) < 1.8 && avg(4) > 3.2, 'beginner is easy and expert is hard');
const mk = Q.marketQuestions(w.MARKET_DATA, Math.random); t(mk.length >= 10 && mk.every(q => q.w.length === 3), 'competitor questions generated from Market data');
t(Q.cleanExtra({ questions: [{ line: 'life', topic: 'jubilee', d: 2, q: 'Q?', a: 'A', w: ['B', 'C'], x: 'e' }, { line: 'bad', topic: 'x', d: 9, q: '', a: '', w: [] }, null] }).length === 1, 'extra questions are validated');
t(Q.PATHS.every(p => p.topics.every(x => Q.TOPICS.some(tt => tt[0] === x)) && p.level >= 1 && p.level <= 4), 'learning paths valid');
console.log(process.exitCode ? 'quiz bank: FAILED' : 'quiz bank OK (' + n + ' checks)');
