#!/usr/bin/env node
/**
 * Tests for the client-needs scoring (computeNeedScores / scoreProducts).
 * These functions live inline in plan-illustrator.html, so we extract their
 * source text and run it in a sandbox — the shipped code is what gets tested.
 * Run: node test/needs-scoring-test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '../plan-illustrator.html'), 'utf8');
const start = html.indexOf('function computeNeedScores(');
const end = html.indexOf('\nfunction ', html.indexOf('function scoreProducts(') + 20);
if (start < 0 || end < 0) { console.error('Could not locate scoring functions'); process.exit(1); }
const ctx = {};
vm.createContext(ctx);
vm.runInContext(html.slice(start, end) + '\nthis.computeNeedScores=computeNeedScores;this.scoreProducts=scoreProducts;', ctx);

let pass = 0, fail = 0;
function ok(label, cond){ if(cond){pass++;console.log('  PASS  '+label);} else {fail++;console.log('  FAIL  '+label);} }
const base = () => ({age:35, goals:[{goal:'education',horizon:'11–15 years',targetAmount:3000000}], dependants:null, childrenCount:null,
  hasCover:null, coverAmount:null, liabilities:[], debtAmount:null, savingsConsistency:null, liquidityNeed:null,
  protectionPriority:null, protectionConcerns:[], maritalStatus:null, existingInvestments:null, maishaWholeLifeCover:{enabled:false,sumAssured:null}});

console.log('Need scores');
let n = ctx.computeNeedScores(base());
ok('all scores within 0–100', ['goalFunding','education','protection','wealth','liquidity','discipline'].every(k=>n[k]>=0&&n[k]<=100));
ok('horizon "11–15 years" maps to 13', n.horizonYears===13);
ok('education goal lifts education score', n.education>=60);

let d = base(); d.maritalStatus='married';
ok('married raises protection by 10', ctx.computeNeedScores(d).protection === n.protection+10);
d = base(); d.maritalStatus='single';
ok('single leaves protection unchanged', ctx.computeNeedScores(d).protection === n.protection);

d = base(); d.goals=[{goal:'wealth',horizon:'16–20 years'}];
const w0 = ctx.computeNeedScores(d).wealth;
d.existingInvestments='significant'; const wSig = ctx.computeNeedScores(d).wealth;
d.existingInvestments='none'; const wNone = ctx.computeNeedScores(d).wealth;
ok('significant existing investments lower wealth need', wSig === w0-15);
ok('no existing investments raise wealth need', wNone === Math.min(100,w0+10) || wNone===100);

d = base(); d.dependants='5+'; d.hasCover='no'; d.protectionPriority='high'; d.liabilities=['Mortgage']; d.maritalStatus='married';
ok('protection capped at 100', ctx.computeNeedScores(d).protection===100);
d = base(); d.liquidityNeed='discipline'; d.savingsConsistency='none';
const nd = ctx.computeNeedScores(d);
ok('discipline need high for no-saver wanting lock-in', nd.discipline>=90);
ok('liquidity low for strict-discipline client', nd.liquidity<=10);

console.log('Product ranking');
function top(d){ const needs=ctx.computeNeedScores(d); const r=ctx.scoreProducts(d,needs); return r; }
d = base(); d.dependants='4'; d.hasCover='no'; d.protectionPriority='high'; d.maritalStatus='married'; d.goals=[{goal:'legacy',horizon:'More than 20 years'}];
let r = top(d);
ok('scoreProducts returns a result', r && typeof r === 'object');
const list = Array.isArray(r) ? r : (r.ranked || r.products || Object.values(r));
const names = JSON.stringify(list);
ok('every product appears in ranking', ['Fanaka','Smart Save','Smart Scholar','Faida Elimu','Faida Maisha','Faida Elite'].every(p=>names.includes(p)));

const mk = o => Object.assign(base(), o);
const rank = d => ctx.scoreProducts(d, ctx.computeNeedScores(d));
let rk = rank(mk({goals:[{goal:'education',horizon:'11–15 years',targetAmount:2e6}],childrenCount:2,dependants:'3',savingsConsistency:'usually'}));
ok('education client: Smart Scholar ranks first', rk[0].name==='Smart Scholar' && rk[0].tier==='Strong Match');
ok('education client: Faida Elimu ranks second', rk[1].name==='Faida Elimu');
rk = rank(mk({dependants:'5+',hasCover:'no',protectionPriority:'high',maritalStatus:'married',goals:[{goal:'legacy',horizon:'More than 20 years'}],liabilities:['Mortgage']}));
ok('protection-heavy client: Faida Maisha ranks first', rk[0].name==='Faida Maisha' && rk[0].tier==='Strong Match');
rk = rank(mk({goals:[{goal:'home',horizon:'6–10 years',targetAmount:1e6}],savingsConsistency:'none',liquidityNeed:'discipline'}));
ok('non-saver wanting lock-in: Fanaka ranks first', rk[0].name==='Fanaka');
ok('results sorted by score descending', rk.every((x,i)=>i===0||rk[i-1].score>=x.score));

console.log('\nTOTAL: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
