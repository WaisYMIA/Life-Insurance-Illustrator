/* Market data + helpers: node test/market-test.js */
const assert = require('assert'), vm = require('vm'), fs = require('fs'), path = require('path');
const M = require('../market-compare.js'); let n = 0; const t = (c, m) => { n++; try{ assert(c, m); }catch(e){ console.error('FAIL: ' + m); process.exitCode = 1; } };
const w = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'market-data.js'), 'utf8'), { window: w });
const D = w.MARKET_DATA, all = M.flat(D), ids = new Set();
t(D.insurers.length >= 10, 'at least 10 insurers listed'); t(all.length >= 80, 'at least 80 products');
t(D.insurers.some(i => i.id === 'jubilee' && i.products.length >= 8), 'Jubilee products are present');
for(const p of all){
  t(p.name && p.summary, 'name+summary: ' + p.id); t(M.CATS.some(c => c[0] === p.cat), 'valid category: ' + p.id);
  t(p.src && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(p.src), 'plain source domain: ' + p.id); t(!ids.has(p.id), 'unique id: ' + p.id); ids.add(p.id);
  t(p.cons.length >= 1, 'every product lists a watch-out: ' + p.id);
  t(!/https?:\/\/|@|\+254|\b0[17]\d{8}\b/.test(JSON.stringify(p)), 'no links or contacts in text: ' + p.id);
}
for(const c of M.CATS) t(M.GUIDE[c[0]] && M.GUIDE[c[0]].what, 'guide for ' + c[0]);
t(D.insurers.filter(i => !i.products.length).every(i => i.note.length > 20), 'empty insurers explain why');
t(M.filter(all, { cat: 'education' }).every(p => p.cat === 'education'), 'category filter');
t(M.filter(all, { q: 'smart scholar' }).some(p => p._insId === 'jubilee'), 'search finds Jubilee Smart Scholar');
t(M.jubileeMatches(all, all.find(p => p._insId === 'britam' && p.cat === 'education')).length >= 1, 'Jubilee counterpart offered for education');
console.log(process.exitCode ? 'market: FAILED' : 'market OK (' + n + ' checks, ' + all.length + ' products)');
