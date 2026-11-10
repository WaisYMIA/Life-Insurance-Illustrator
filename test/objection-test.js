/* Objection playbook content lint: node test/objection-test.js */
const assert = require('assert'); const O = require('../objection-library.js'); let n = 0; const t = (c, m) => { n++; try{ assert(c, m); }catch(e){ console.error('FAIL: ' + m); process.exitCode = 1; } };
t(O.OBJ.length >= 40, 'at least 40 objections'); t(['life', 'medical', 'general', 'all'].every(l => O.OBJ.some(x => x.line === l)), 'life, medical, general and all-line objections present');
const ids = new Set();
for(const x of O.OBJ){
  t(x.q && x.say && x.real && x.ask && x.avoid && x.method, 'complete fields: ' + x.id); t(!ids.has(x.id), 'unique id ' + x.id); ids.add(x.id);
  t(x.say.split(/\s+/).length >= 25 && x.say.split(/\s+/).length <= 110, 'response length sensible: ' + x.id);
  t(!/guaranteed returns|risk[- ]free|100% sure|never fail|can never/i.test(x.say.replace(/not guaranteed|no guaranteed/gi, '')), 'no over-promising in: ' + x.id);
}
const all = JSON.stringify([O.OBJ, O.VS, O.EDGE, O.FACTS, O.METHODS]);
t(!/https?:\/\/|@|\+254|\b0[17]\d{8}\b/.test(all), 'no links or contacts');
for(const v of O.VS) t(v.concede && v.gap && v.edge && v.bridge && v.caution, 'complete alternative: ' + v.id);
t(O.VS.length >= 10, 'at least 10 alternatives'); t(O.METHODS.length >= 4 && O.METHODS.every(m => m.src && m.steps.length >= 4), 'methods carry sources');
t(O.METHODS.some(m => /Tracy/.test(m.who)) && O.METHODS.some(m => /Hopkins/.test(m.who)) && O.METHODS.some(m => /Gitomer/.test(m.who)), 'Tracy, Hopkins and Gitomer present');
t(O.FACTS.every(f => f.src), 'every Kenya fact names its source');
t(O.EDGE.some(e => e.plan === 'Smart Scholar' && /50%/.test(e.pts.join(' '))), 'Smart Scholar 50% death benefit stated');
t(O.filterObj(O.OBJ, { line: 'medical' }).every(x => x.line === 'medical' || x.line === 'all'), 'line filter'); t(O.filterObj(O.OBJ, { q: 'sacco' }).length >= 1, 'search');
console.log(process.exitCode ? 'objections: FAILED' : 'objections OK (' + n + ' checks)');
