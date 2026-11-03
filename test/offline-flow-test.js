// Offline behaviour: the app must open with no internet from every address, stay signed in, never be locked by a pending update, and not hang on a bad connection. Needs Playwright + Chromium.
const { chromium } = require('playwright'); const http=require('http'),fs=require('fs'),path=require('path'); const ROOT=require('path').join(__dirname,'..');
let hang=false, vj=null, miss=null; const hits={};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]); hits[p]=(hits[p]||0)+1; if(miss&&p.endsWith(miss)){ r.writeHead(404); return r.end(); } if(hang&&p.endsWith('app-config.js')) return; if(vj&&p.endsWith('version.json')){ r.writeHead(200,{'Content-Type':'application/json'}); return r.end(JSON.stringify(vj)); } if(p==='/'){p='/index.html';} const f=path.join(ROOT,p); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();} const x=path.extname(f); r.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png'}[x]||'application/octet-stream','Cache-Control':'no-cache'}); fs.createReadStream(f).pipe(r);});
let bad=0; const t=(ok,n,e)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok||!e?'':'  -> '+e)); if(!ok)bad++;};
const seed=(extra)=>({ extra });
(async()=>{await new Promise(r=>srv.listen(8130,r)); const b=await chromium.launch(); const U='http://localhost:8130';
 const ctx=await b.newContext({viewport:{width:390,height:800}}); const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message));
 await page.addInitScript(()=>{ if(localStorage.getItem('__s'))return; localStorage.setItem('__s','1'); const ts=Date.now(); localStorage.setItem('illustrator_agent_v1',JSON.stringify({name:'Walter J',phone:'0700000000',agentId:'tA',agencyCode:'AG1',email:'a@b.co',acceptedAt:new Date().toISOString(),verified:false,termsVersion:'3'})); localStorage.setItem('illustrator_dq_v1',JSON.stringify({last:ts,date:new Date().toISOString().slice(0,10),done:[0,1,2],count:9,streak:1}));});
 await page.goto(U+'/plan-illustrator.html'); await page.waitForTimeout(2500);
 const ctrl=await page.evaluate(async()=>{ const r=await navigator.serviceWorker.getRegistration(); return {reg:!!r, active:!!(r&&r.active), ctl:!!navigator.serviceWorker.controller}; });
 if(!ctrl.ctl){ await page.reload(); await page.waitForTimeout(1500); }
 t((await page.evaluate(()=>!!navigator.serviceWorker.controller)),'service worker is controlling the page');
 const n=await page.evaluate(async()=>(await caches.keys()).length?(await (await caches.open((await caches.keys())[0])).keys()).length:0); console.log('   cached files:',n);
 await ctx.setOffline(true);
 const openOK=async(url,label)=>{ const p=await ctx.newPage(); let ok=false,txt=''; try{ const r=await p.goto(url,{timeout:8000}); await p.waitForTimeout(1200); txt=await p.evaluate(()=>document.body.innerText.slice(0,160)); ok=/Get Started|Choose a plan|Plan Illustrator|How would you like/i.test(txt) && !/Offline and not cached|This site can|No internet|ERR_/i.test(txt); }catch(e){ txt='NAV ERROR '+e.message.slice(0,60); } t(ok,'offline: '+label,ok?'':txt.replace(/\n/g,' | ')); await p.close(); };
 await openOK(U+'/plan-illustrator.html','plan-illustrator.html opens');
 await openOK(U+'/plan-illustrator.html?source=pwa','with a query string');
 await openOK(U+'/','site root');
 await openOK(U+'/index.html','index.html');
 { const p=await ctx.newPage(); await p.addInitScript(()=>{ localStorage.setItem('illustrator_agent_v1',JSON.stringify({name:'Walter J',phone:'0700000000',agentId:'tA',agencyCode:'AG1',email:'a@b.co',acceptedAt:new Date(Date.now()-9*864e5).toISOString(),verified:false,termsVersion:'3'})); }); await p.goto(U+'/plan-illustrator.html'); await p.waitForTimeout(1200); t(await p.locator('#acctBtn').isVisible(),'offline: agent signed in 9 days ago is still signed in'); await p.close(); }
 // block cases
 const blk=async(patch,label,expectOpen)=>{ const p=await ctx.newPage(); await p.addInitScript(patch=>{ const k='illustrator_update_v1'; const o=JSON.parse(localStorage.getItem(k)||'{}'); localStorage.setItem(k,JSON.stringify(patch)); },patch); await p.goto(U+'/plan-illustrator.html'); await p.waitForTimeout(1500); const txt=await p.evaluate(()=>document.body.innerText); const blocked=/Update required|Please connect to the internet|Connect to continue/.test(txt); t(blocked===!expectOpen,'offline: '+label+(expectOpen?' stays usable':' is blocked'),blocked?txt.slice(0,120).replace(/\n/g,' | '):''); await p.close(); };
 await blk({latest:'2099.1.1',requireUpdate:true,lastOk:Date.now()-864e5},'a newer required version is known',true);
 await blk({min:'2099.1.1',lastOk:Date.now()-864e5},'a minimum version is set',true);
 await blk({lastOk:Date.now()-5*864e5},'5 days since last online check',true);
 await blk({lastOk:Date.now()-45*864e5,maxOfflineDays:30},'45 days offline (admin limit 30)',false);
 await ctx.setOffline(false); { const p=await ctx.newPage(); vj={version:'2099.1.1',requireUpdate:true}; await p.addInitScript(()=>{ localStorage.setItem('illustrator_update_v1',JSON.stringify({lastOk:Date.now()-864e5,latest:'2099.1.1',requireUpdate:true})); }); await p.goto(U+'/plan-illustrator.html'); await p.waitForTimeout(1500); t(/Update required/.test(await p.evaluate(()=>document.body.innerText)),'control: ONLINE with a required update is still blocked'); await p.close(); vj=null; } await ctx.setOffline(true);
 // retry frequency
 const p2=await ctx.newPage(); await p2.addInitScript(()=>{ window.__f=0; const of=window.fetch; window.fetch=function(){ window.__f++; return of.apply(this,arguments); }; }); await p2.goto(U+'/plan-illustrator.html'); await p2.waitForTimeout(6000);
 for(let i=0;i<4;i++){ await p2.evaluate(()=>{ document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); }); await p2.waitForTimeout(200); }
 const fcount=await p2.evaluate(()=>window.__f); t(fcount<=4,'offline: network attempts in first 6s stay low',String(fcount)); await p2.close();
 await ctx.setOffline(false);
 // lie-fi: server accepts but never answers app-config.js
 hang=true; await ctx.setOffline(false); const p3=await ctx.newPage(); const t0=Date.now(); let opened=false; try{ await p3.goto(U+'/plan-illustrator.html',{timeout:20000}); await p3.waitForSelector('#app .mode-grid, #app .step-title, #app',{timeout:20000}); opened=true; }catch(e){} const dt=Date.now()-t0; t(opened&&dt<7000,'poor connection (server not answering): app opens within 7s',dt+'ms'); await p3.close(); hang=false;
 { miss='agent-growth.js'; const c2=await b.newContext(); const q=await c2.newPage(); await q.goto(U+'/plan-illustrator.html'); await q.waitForTimeout(2500); await q.reload(); await q.waitForTimeout(800); await c2.setOffline(true); const q2=await c2.newPage(); await q2.goto(U+'/plan-illustrator.html?x=1'); await q2.waitForTimeout(1200); t(await q2.evaluate(()=>!!document.getElementById('app') && document.querySelector('header.top')!==null && !/Offline and not cached/.test(document.body.innerText)),'a missing non-essential file on the server does not stop offline install'); await c2.close(); miss=null; }
 t(errs.length===0,'no page errors',errs.slice(0,2).join('|'));
 await b.close(); srv.close(); console.log(bad?bad+' FAILED':'ALL PASSED'); process.exit(bad?1:0);})();
