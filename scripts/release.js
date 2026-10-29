#!/usr/bin/env node
/**
 * Release gate: node scripts/release.js 2026.11.02 [--min 2026.11.02]
 * Runs every automated check first — signed-illustration regression, calculator-vs-engine parity,
 * scoring, version sync, help content, backend integration, install/update flow — and only if ALL pass
 * bumps the version (HTML + service worker + version.json). A failing calculation therefore cannot be released.
 */
'use strict';
const { spawnSync } = require('child_process'), path = require('path');
const root = path.join(__dirname, '..'), args = process.argv.slice(2);
if(!args[0]){ console.error('Usage: node scripts/release.js <version> [--min <version>]'); process.exit(1); }
const steps = [
  ['Signed-illustration regression', 'test/regression-suite.js'], ['Calculator parity (page vs engines)', 'test/engine-parity-test.js'],
  ['Needs scoring', 'test/needs-scoring-test.js'], ['Help content', 'test/help-content-test.js'], ['Backend integration', 'backend/test-integration.js'], ['Install / update flow', 'test/update-flow-test.js']
];
for(const [name, file] of steps){
  process.stdout.write(`• ${name} … `);
  const r = spawnSync(process.execPath, [file], { cwd: root, encoding: 'utf8' });
  if(r.status !== 0){ console.log('FAILED\n'); console.log((r.stdout || '').split('\n').slice(-25).join('\n')); console.log(r.stderr || ''); console.error('\nRelease stopped: nothing was changed.'); process.exit(1); }
  console.log('ok');
}
const b = spawnSync(process.execPath, ['scripts/bump-version.js'].concat(args), { cwd: root, stdio: 'inherit' });
if(b.status !== 0) process.exit(b.status);
const v = spawnSync(process.execPath, ['test/version-sync-test.js'], { cwd: root, encoding: 'utf8' }); console.log(v.stdout.trim());
console.log('\nAll checks passed and version bumped. Deploy every file, then set the "Latest released version" in the admin panel.');
