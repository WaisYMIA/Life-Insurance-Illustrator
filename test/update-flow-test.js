// Needs Playwright + Chromium (npm i -D playwright). Simulates an installed phone app meeting a newly published release.
const fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process');
const { chromium } = require('playwright');
const os = require('os'); const SRC = path.join(__dirname, '..'), DIR = path.join(os.tmpdir(), 'updsite-' + process.pid);
cp.execSync(`rm -rf ${DIR} && mkdir -p ${DIR} && cp -r ${SRC}/icons ${SRC}/scripts ${SRC}/*.html ${SRC}/*.json ${SRC}/*.js ${DIR}/`);
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => { let f = path.join(DIR, decodeURIComponent(req.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=3600' }); res.end(d); }); });
let bad = 0; const ck = (l, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + l + (c ? '' : ' ' + JSON.stringify(d))); if (!c) bad++; };
(async () => {
  await new Promise(r => server.listen(3057, r)); const base = 'http://localhost:3057';
  const cur = JSON.parse(fs.readFileSync(DIR + '/version.json')).version;
  const b = await chromium.launchPersistentContext(DIR + '-prof', { executablePath: '/opt/pw-browsers/chromium', viewport: { width: 412, height: 860 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(base + '/plan-illustrator.html'); await p.waitForTimeout(1500);
  await p.evaluate((v) => { localStorage.setItem('illustrator_agent_v1', JSON.stringify({ name: 'T U', phone: '0712000000', email: 't@x.com', agencyCode: 'AG1', acceptedAt: new Date().toISOString(), termsVersion: '3' })); }, cur);
  await p.reload(); await p.waitForTimeout(2000);
  ck('Installed worker controls the page', await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));
  ck('Current version opens normally (no overlay)', !(await p.$('#updBlock')));
  // publish a new release
  const nv = '2099.01.01';
  cp.execSync(`cd ${DIR} && node scripts/bump-version.js ${nv}`);
  // launch again: an installed app must notice on launch even though the interval (7d) has not passed
  await p.reload(); await p.waitForTimeout(2500);
  ck('New release found on launch -> blocking "Update required" screen', !!(await p.$('#updBlock')) && /Update required/.test(await p.textContent('#updBlock')) && new RegExp(nv.replace(/\./g, '\\.')).test(await p.textContent('#updBlock')), await p.textContent('body').then(t => t.slice(0, 120)));
  ck('There is no way to dismiss it (no banner/Later button, only Install)', !(await p.$('#updLater')) && (await p.textContent('#updBlockBtn')) === 'Install update');
  ck('Overlay covers the app', await p.evaluate(() => { const o = document.getElementById('updBlock'); const r = o.getBoundingClientRect(); return r.width >= innerWidth && r.height >= innerHeight && getComputedStyle(o).position === 'fixed'; }));
  await p.click('#updBlockBtn'); await p.waitForTimeout(4000);
  const now = await p.evaluate(() => APP_VERSION);
  ck('After "Install update" the app reopens on the new version', now === nv, now);
  ck('Overlay is gone after updating', !(await p.$('#updBlock')));
  await p.waitForTimeout(3000);
  // The phone already knows (from an earlier check) that a newer release exists but could not fetch it; reopened with no signal it must still refuse to open.
  await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('illustrator_update_v1') || '{}'); st.latest = '2999.01.01'; st.requireUpdate = true; localStorage.setItem('illustrator_update_v1', JSON.stringify(st)); });
  server.closeAllConnections(); await new Promise(r => server.close(r)); await p.reload().catch(() => {}); await p.waitForTimeout(2500);   // server really gone = phone with no signal
  ck('Offline relaunch is still blocked while a known update is not installed', !!(await p.$('#updBlock')), 'offline relaunch not blocked');
  await new Promise(r => server.listen(3057, r));
  // optional mode: version.json requireUpdate=false -> only a banner
  const nv2 = '2099.04.01'; cp.execSync(`cd ${DIR} && node scripts/bump-version.js ${nv2}`);
  const vj = JSON.parse(fs.readFileSync(DIR + '/version.json')); vj.requireUpdate = false; fs.writeFileSync(DIR + '/version.json', JSON.stringify(vj));
  await p.reload(); await p.waitForTimeout(2500);
  ck('With "require" switched off, only a dismissible banner appears', !(await p.$('#updBlock')) && !!(await p.$('#updBanner')));
  ck('No page errors', errs.length === 0, errs);
  console.log(bad ? 'FAILED ' + bad : 'ALL UPDATE CHECKS PASSED'); await b.close(); server.close(); cp.execSync(`rm -rf ${DIR} ${DIR}-prof`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
