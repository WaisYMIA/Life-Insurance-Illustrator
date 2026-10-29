#!/usr/bin/env node
'use strict';
/**
 * Database backup. Run it from cron / a scheduled task (see DEPLOYMENT.md §10).
 *   node scripts/backup.js [--dir backups] [--keep 14]
 * SQLite: a consistent snapshot (VACUUM INTO), safe while the server is running.
 * Postgres (DATABASE_URL set): pg_dump in custom format (needs the pg_dump tool on the server).
 * Old backups beyond --keep are deleted. Store a copy OFF the server (another machine or cloud storage).
 */
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
require('dotenv').config({ quiet: true, path: path.join(__dirname, '..', 'backend', '.env') });
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const dir = path.resolve(arg('dir', path.join(__dirname, '..', 'backups'))), keep = Math.max(1, parseInt(arg('keep', '14'), 10) || 14);
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
let out;
if(process.env.DATABASE_URL){
  out = path.join(dir, `pi-${stamp}.dump`);
  const r = spawnSync('pg_dump', ['--format=custom', '--file', out, process.env.DATABASE_URL], { encoding: 'utf8' });
  if(r.error || r.status !== 0){ console.error('pg_dump failed:', r.error ? r.error.message : r.stderr); process.exit(1); }
} else {
  const { DatabaseSync } = require('node:sqlite');
  const src = process.env.DB_PATH || path.join(__dirname, '..', 'backend', 'db', 'illustrator.sqlite');
  if(!fs.existsSync(src)){ console.error('No database found at ' + src); process.exit(1); }
  out = path.join(dir, `pi-${stamp}.sqlite`);
  const db = new DatabaseSync(src); db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`); db.close();
}
fs.chmodSync(out, 0o600);
const all = fs.readdirSync(dir).filter(f => /^pi-.*\.(sqlite|dump)$/.test(f)).sort();
all.slice(0, Math.max(0, all.length - keep)).forEach(f => fs.unlinkSync(path.join(dir, f)));
console.log('Backup written: ' + out + ' (' + Math.round(fs.statSync(out).size / 1024) + ' KB). Keeping the newest ' + keep + '.');
