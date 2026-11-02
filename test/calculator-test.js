// Calculator arithmetic: precedence, percentages, rounding, errors, formatting.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { window: {}, document: { readyState: 'complete', addEventListener() {}, getElementById() { return null; } }, setInterval() {}, localStorage: { getItem() { return null; }, setItem() {} } }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'calculator.js'), 'utf8').replace('build();', ''), ctx);
const C = ctx.window.AppCalc; let bad = 0; const eq = (e, v) => { const r = C.evaluate(e); const got = r && (r.value !== undefined ? r.value : r.error); if (got !== v) { console.log(`FAIL ${e} => ${got} (expected ${v})`); bad++; } };
eq('2+3×4', 14); eq('10−2−3', 5); eq('100÷4÷5', 5); eq('0.1+0.2', 0.3); eq('1.1×3', 3.3); eq('200000+10%', 220000); eq('200000−10%', 180000); eq('50×10%', 5); eq('200÷50%', 400); eq('12%', 0.12);
eq('−5+8', 3); eq('5×−3', -15); eq('1000000×12', 12000000); eq('7÷0', 'Cannot divide by zero'); eq('1+', null); eq('+3', null); eq('100000+5%+5%', 110250);
eq('15000×12×1.05', 189000); eq('3÷7×7', 3);
const f = (v, c) => C.fmtNumber(v, c); const chk = (a, b) => { if (a !== b) { console.log(`FAIL format ${a} vs ${b}`); bad++; } };
chk(f(1234567.891, true), '1,234,567.891'); chk(f(1234567, false), '1234567'); chk(f(-9876.5, true), '-9,876.5'); chk(f(0.3, true), '0.3'); chk(f(1e16, true), '1e+16');
chk(C.fmtExpr('1234567+89.50', true), '1,234,567+89.50'); chk(C.fmtExpr('1000.', true), '1,000.');
console.log(bad ? 'calculator: ' + bad + ' problem(s)' : 'calculator: OK'); process.exit(bad ? 1 : 0);
