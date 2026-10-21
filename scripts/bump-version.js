#!/usr/bin/env node
/**
 * Release helper: node scripts/bump-version.js 2026.11.02 [--min 2026.11.02]
 * Keeps the four places that must agree in step:
 *   plan-illustrator.html  APP_VERSION      (what the running app reports)
 *   version.json           version          (what installed apps compare against)
 *   sw.js                  CACHE_VERSION    (a changed service worker is what makes phones fetch the new files)
 *   (optional) --min       version.json minVersion — phones older than this are blocked until they update
 * Then deploy all files. Run `npm test` — it fails if these ever drift apart.
 */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const version = args[0];
if(!version || !/^\d+(\.\d+){0,3}$/.test(version)){ console.error('Usage: node scripts/bump-version.js <version like 2026.11.02> [--min <version>]'); process.exit(1); }
const minIdx = args.indexOf('--min');
const min = minIdx >= 0 ? args[minIdx + 1] : undefined;
if(min !== undefined && !/^\d+(\.\d+){0,3}$/.test(min)){ console.error('--min must be a version like 2026.11.02'); process.exit(1); }

function edit(file, fn){ const p = path.join(root, file); const s = fs.readFileSync(p, 'utf8'); const out = fn(s); if(out === s) console.log(`(no change) ${file}`); else { fs.writeFileSync(p, out); console.log(`updated ${file}`); } }
edit('plan-illustrator.html', s => { if(!/const APP_VERSION = '[^']*';/.test(s)) throw new Error('APP_VERSION not found'); return s.replace(/const APP_VERSION = '[^']*';/, `const APP_VERSION = '${version}';`); });
edit('sw.js', s => { if(!/const CACHE_VERSION = '[^']*';/.test(s)) throw new Error('CACHE_VERSION not found'); return s.replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = 'plan-illustrator-${version}';`); });
edit('version.json', s => { const j = JSON.parse(s); j.version = version; if(min !== undefined) j.minVersion = min; return JSON.stringify(j, null, 2) + '\n'; });
