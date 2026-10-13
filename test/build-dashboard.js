#!/usr/bin/env node
/**
 * Bundles the modular engine files, data JSON, and the browser test runner
 * into one standalone, double-click-and-run HTML dashboard.
 *
 * The /engines and /data files remain the canonical source of truth (used
 * by regression-suite.js and any future backend). This script just packages
 * a copy for offline browser use — re-run it whenever those files change.
 *
 * Run: node test/build-dashboard.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('test/test-dashboard-template.html');

html = html.replace('__FANAKA_DATA__', read('data/fanaka-data.json'));
html = html.replace('__FAIDA_DATA__', read('data/faida-data.json'));
html = html.replace('__SMARTSAVE_DATA__', read('data/smartsave-data.json'));

html = html.replace('__ENGINE_UTILS__', read('engines/utils-engine.js'));
html = html.replace('__ENGINE_FANAKA__', read('engines/fanaka-engine.js'));
html = html.replace('__ENGINE_FAIDA__', read('engines/faida-engine.js'));
html = html.replace('__ENGINE_SMARTSAVE__', read('engines/smartsave-engine.js'));

html = html.replace('__TEST_RUNNER__', read('test/dashboard-runner.js'));

const outPath = path.join(root, 'test/test-dashboard.html');
fs.writeFileSync(outPath, html);
console.log('Built:', outPath, `(${(html.length/1024).toFixed(0)} KB)`);
