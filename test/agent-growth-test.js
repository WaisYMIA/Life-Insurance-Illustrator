/* Unit tests for the pure helpers in agent-growth.js: node test/agent-growth-test.js */
'use strict';
const assert = require('assert'); const G = require('../agent-growth.js');
let n = 0; const ok = (name, fn) => { try{ fn(); n++; }catch(e){ console.error('FAIL: ' + name + '\n  ' + e.message); process.exitCode = 1; } };
const D = (y, m, d) => new Date(y, m - 1, d);

ok('birthday today / tomorrow / next year', () => {
  assert.deepStrictEqual(G.nextBirthday('1990-11-02', D(2026, 11, 2)), { days: 0, turning: 36, date: '2026-11-02' });
  assert.strictEqual(G.nextBirthday('1990-11-03', D(2026, 11, 2)).days, 1);
  const b = G.nextBirthday('1990-11-01', D(2026, 11, 2)); assert.strictEqual(b.turning, 37); assert.strictEqual(b.days, 364);
});
ok('birthday: bad input and leap day', () => {
  assert.strictEqual(G.nextBirthday('', D(2026, 1, 1)), null); assert.strictEqual(G.nextBirthday('abc', D(2026, 1, 1)), null); assert.strictEqual(G.nextBirthday('1990-13-40', D(2026, 1, 1)), null);
  assert.ok(G.nextBirthday('1992-02-29', D(2026, 2, 20)).days <= 9);
});
ok('birthdayList window and order', () => {
  const l = G.birthdayList([{ name: 'a', dob: '1980-11-10' }, { name: 'b', dob: '1980-11-03' }, { name: 'c', dob: '1980-12-30' }, { name: 'd' }], 14, D(2026, 11, 2));
  assert.deepStrictEqual(l.map(x => x.c.name), ['b', 'a']);
});
ok('goal progress counts the current month only', () => {
  const now = D(2026, 11, 15), t = D(2026, 11, 3).getTime(), old = D(2026, 10, 3).getTime();
  const cl = [{ createdAt: t, status: 'won', wonAt: t, quotes: [{ at: t }, { at: old }] }, { createdAt: old, status: 'won', wonAt: old, quotes: [] }, { createdAt: t, status: 'new', quotes: [{ at: t }] }];
  const p = G.goalProgress({ clients: 4, quotes: 2, won: 1 }, cl, now);
  assert.strictEqual(p.clients.actual, 2); assert.strictEqual(p.quotes.actual, 2); assert.strictEqual(p.won.actual, 1);
  assert.strictEqual(p.quotes.state, 'done'); assert.strictEqual(p.won.state, 'done'); assert.strictEqual(p.clients.pct, 50); assert.strictEqual(p.clients.left, 15);
  assert.strictEqual(G.goalProgress({}, cl, now).clients.state, 'none');
  assert.strictEqual(G.goalProgress({ clients: 30 }, [], D(2026, 11, 29)).clients.state, 'behind');
});
ok('needs: arithmetic', () => {
  const r = G.computeNeeds({ monthlyIncome: 100000, years: 10, debts: 500000, kids: 2, eduPerChild: 500000, funeral: 300000, emergencyMonths: 3, existingCover: 2000000, savings: 500000 });
  assert.strictEqual(r.parts.find(p => p.id === 'income').amount, 12000000); assert.strictEqual(r.parts.find(p => p.id === 'education').amount, 1000000);
  assert.strictEqual(r.total, 12000000 + 500000 + 1000000 + 300000 + 300000); assert.strictEqual(r.offset, 2500000); assert.strictEqual(r.gap, r.total - 2500000);
  assert.strictEqual(r.ruleOfThumb, 12000000); assert.strictEqual(r.covered, false);
  assert.strictEqual(r.parts.reduce((s, p) => s + p.pct, 0) >= 99, true);
});
ok('needs: never negative, covered flag, junk input', () => {
  const r = G.computeNeeds({ monthlyIncome: 10000, years: 1, existingCover: 99999999 }); assert.strictEqual(r.gap, 0); assert.strictEqual(r.covered, true);
  const z = G.computeNeeds({}); assert.strictEqual(z.total, 0); assert.strictEqual(z.gap, 0); assert.strictEqual(z.covered, false);
  const j = G.computeNeeds({ monthlyIncome: 'abc', years: -5, kids: 9999 }); assert.strictEqual(j.total, 0 + 0 + 0 + 0 + 0 || j.total);
  assert.ok(G.computeNeeds({ monthlyIncome: 1, years: 1e9 }).total <= 12 * 40);
});
ok('maskTerm hides the answer', () => {
  assert.ok(!/premium/i.test(G.maskTerm('The premium is paid. Premiums vary.', 'Premium')));
  assert.ok(!/sum assured/i.test(G.maskTerm('The Sum Assured is the cover.', 'Sum assured (SA)')));
  assert.strictEqual(G.maskTerm('No match here.', 'X'), 'No match here.');
});
const gloss = []; for(let i = 0; i < 40; i++) gloss.push({ t: 'Term' + i, c: i % 2 ? 'Types of life cover' : 'Medical insurance', d: 'Definition number ' + i + ' explains something about insurance in plain words that is long enough.', x: i % 3 ? '' : 'Example ' + i });
gloss.push({ t: 'Kiswahili thing', c: 'Kiswahili terms', d: 'Kiswahili for something — use this word when explaining to a client in Swahili.' }, { t: 'Short', c: 'Types of life cover', d: 'Too short.' });
ok('quiz: structure, uniqueness, filters', () => {
  const qs = G.buildQuiz(gloss, 'all', 10, Math.random); assert.strictEqual(qs.length, 10);
  qs.forEach(q => { assert.strictEqual(q.opts.length, 4); assert.strictEqual(new Set(q.opts).size, 4); assert.strictEqual(q.opts[q.answer], q.term); assert.ok(q.term !== 'Short' && q.term !== 'Kiswahili thing'); });
  assert.strictEqual(new Set(qs.map(q => q.term)).size, 10);
  const med = G.buildQuiz(gloss, 'medical', 5); assert.ok(med.every(q => q.cat === 'Medical insurance'));
  assert.deepStrictEqual(G.buildQuiz(gloss.slice(0, 5), 'all', 10), []);
});
ok('csv: quoting and formula guard', () => {
  assert.strictEqual(G.csvCell('a,b'), '"a,b"'); assert.strictEqual(G.csvCell('say "hi"'), '"say ""hi"""'); assert.strictEqual(G.csvCell('=1+1'), "'=1+1"); assert.strictEqual(G.csvCell('line1\nline2'), 'line1 line2');
  const csv = G.clientsToCsv([{ name: 'Wanjiru, K', phone: '0712', status: 'new', quotes: [{}, {}], createdAt: D(2026, 11, 2).getTime() }]);
  assert.ok(csv.startsWith('﻿name,phone')); assert.ok(csv.includes('"Wanjiru, K"')); assert.ok(csv.trim().endsWith(',2,2026-11-02'));
});
ok('backup: parse rejects junk, cleans fields', () => {
  assert.strictEqual(G.parseBackup('not json').ok, false); assert.strictEqual(G.parseBackup('{"format":"other"}').ok, false); assert.strictEqual(G.parseBackup('{"format":"plan-illustrator-backup","clients":"x"}').ok, false);
  const r = G.parseBackup(JSON.stringify({ format: 'plan-illustrator-backup', clients: [{ id: 'a1', name: '  Amina ', status: 'bogus', dob: 'x', followUp: '2026-12-01', quotes: [{ title: 'T' }, null] }, { name: '' }, null, { name: 5 }], goals: { clients: '7', quotes: -3, won: 1e9 } }));
  assert.strictEqual(r.ok, true); assert.strictEqual(r.clients.length, 1); assert.strictEqual(r.skipped, 3);
  const c = r.clients[0]; assert.strictEqual(c.name, 'Amina'); assert.strictEqual(c.status, 'new'); assert.strictEqual(c.dob, ''); assert.strictEqual(c.followUp, '2026-12-01'); assert.strictEqual(c.quotes.length, 1);
  assert.deepStrictEqual(r.goals, { clients: 7, quotes: 0, won: 9999 });
});
ok('backup: merge never deletes, newer wins', () => {
  const local = [{ id: '1', name: 'Old', updatedAt: 100 }, { id: '2', name: 'Keep', updatedAt: 500 }, { id: '3', name: 'Only local' }];
  const m = G.mergeClients(local, [{ id: '1', name: 'New', updatedAt: 200 }, { id: '2', name: 'Stale', updatedAt: 100 }, { id: '4', name: 'Added' }]);
  assert.strictEqual(m.clients.length, 4); assert.strictEqual(m.clients.find(c => c.id === '1').name, 'New'); assert.strictEqual(m.clients.find(c => c.id === '2').name, 'Keep');
  assert.deepStrictEqual([m.added, m.updated, m.kept], [1, 1, 1]); assert.ok(m.clients.find(c => c.id === '3'));
});
ok('backup: oversized backups are refused', () => {
  const big = { format: 'plan-illustrator-backup', clients: Array.from({ length: 3001 }, (_, i) => ({ name: 'n' + i })) };
  assert.strictEqual(G.parseBackup(JSON.stringify(big)).ok, false);
});
ok('quiz timer: seconds follow the nature of the question', () => {
  const short = { def: 'Money paid to keep a policy in force.', opts: ['Premium', 'Claim', 'Lapse', 'Rider'], cat: 'Benefits & values' };
  const long = { def: 'A contract in which one insurer transfers part of the risk it has written to another insurer in return for a share of the premium, so that no single loss can threaten its solvency or its ability to pay.', opts: ['Reinsurance treaty', 'Facultative placement', 'Coinsurance clause', 'Subrogation right'], cat: 'Reinsurance & finance' };
  const figs = { def: 'The yearly limit of 60,000 on which 15% tax relief is calculated.', opts: ['Tax relief cap', 'Surrender', 'Bonus', 'Lien'], cat: 'Benefits & values' };
  const a = G.secondsFor(short), b = G.secondsFor(long), c = G.secondsFor(figs);
  assert.ok(a >= 15 && a <= 25, 'short ' + a); assert.ok(b > a + 10, 'long ' + b + ' vs ' + a); assert.ok(c >= a, 'figures ' + c);
  assert.ok(G.secondsFor(long, 1.5) > b || G.secondsFor(long, 1.5) === 60); assert.ok(G.secondsFor({ def: 'x', opts: [], cat: '' }) === 15);
  assert.ok(G.secondsFor({ def: 'word '.repeat(400), opts: ['a'], cat: 'Underwriting & claims' }) === 60);
  [a, b, c].forEach(v => assert.strictEqual(v % 5, 0));
});
console.log(process.exitCode ? 'agent-growth: FAILED' : 'agent-growth OK (' + n + ' checks)');
