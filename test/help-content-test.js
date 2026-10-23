// Lints help-content.js: unique terms, valid categories, resolvable "see also" links, no empty text.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'help-content.js'), 'utf8'), ctx);
const C = ctx.window.HELP_CONTENT; let bad = 0; const fail = m => { console.log('FAIL ' + m); bad++; };
const terms = new Map(); const cats = new Set(C.categories);
for (const g of C.GLOSSARY) {
  const k = g.t.toLowerCase();
  if (terms.has(k)) fail('duplicate term: ' + g.t); terms.set(k, g);
  if (!cats.has(g.c)) fail(`"${g.t}" has unknown category "${g.c}"`);
  if (!g.d || g.d.length < 30) fail(`"${g.t}" has a missing/too-short definition`);
}
for (const g of C.GLOSSARY) for (const r of g.r || []) if (!terms.has(r.toLowerCase())) fail(`"${g.t}" links to missing term "${r}"`);
for (const a of C.HANDBOOK) { if (!a.t || !a.h || a.h.length < 40) fail('handbook article incomplete: ' + a.t); }
const must = ['indemnity', 'insurable interest', 'utmost good faith', 'subrogation', 'proximate cause', 'surrender value', 'rider', 'premium', 'sum assured', 'lapse', 'underwriting'];
for (const m of must) if (!terms.has(m)) fail('missing essential term: ' + m);
console.log(`${C.GLOSSARY.length} glossary terms, ${C.HANDBOOK.length} handbook articles, ${C.categories.length} categories`);
console.log(bad ? `help content: ${bad} problem(s)` : 'help content: OK'); process.exit(bad ? 1 : 0);
