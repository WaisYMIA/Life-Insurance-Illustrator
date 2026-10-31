// One-off/maintenance: merges help-src/b*.js term batches into help-content.js (idempotent: skips existing terms).
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..'); const hp=path.join(root,'help-content.js');
let src=fs.readFileSync(hp,'utf8');
const ctx={window:{}};vm.createContext(ctx);vm.runInContext(src,ctx);
const have=new Set(ctx.window.HELP_CONTENT.GLOSSARY.map(g=>g.t.toLowerCase()));
const drop=new Set(['deductible for general','premium waiver for medical','cooling-off for medical','lapse of general policy','policyholders protection','cover for third-party beneficiaries','cover','fraud in medical claims','premium loading for medical','underwriting for medical']);
const q=s=>"'"+String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"'";
const files=fs.readdirSync(path.join(root,'help-src')).filter(f=>/^b\d.*\.js$/.test(f)).sort();
let out='',n=0,newCats=new Set(ctx.window.HELP_CONTENT.categories);
for(const f of files){ const rows=require(path.join(root,'help-src',f)); out+=`\n    /* ---------- ${f.replace(/^b\d-|\.js$/g,'')} ---------- */\n`;
 for(const [t,c,d,x,k] of rows){ const key=t.toLowerCase(); if(have.has(key)||drop.has(key)) continue; have.add(key); newCats.add(c); n++;
  out+=`    { t: ${q(t)}, c: ${q(c)}, d: ${q(d)}${x?`, x: ${q(x)}`:''}${k?`, k: ${q(k)}`:''} },\n`; } }
const marker='\n  ],\n\n  HANDBOOK: [';
if(!src.includes(marker)) throw new Error('marker');
src=src.replace(marker,'\n'+out.replace(/\n$/,'')+marker.slice(0));
// categories list
const order=['Core principles','People & parties','Premiums & payments','Benefits & values','Policy life-cycle','Riders & extra covers','Underwriting & claims','Types of life cover','Savings & investment','Medical insurance','Health financing (Kenya)','General insurance','Motor insurance','Property & liability','Marine, engineering & specialist','Reinsurance & finance','Regulation & compliance','Selling & conduct','Kiswahili terms'];
for(const c of newCats) if(!order.includes(c)) order.push(c);
src=src.replace(/categories: \[[^\]]*\]/,'categories: ['+order.map(q).join(', ')+']');
fs.writeFileSync(hp,src); console.log('added',n);
