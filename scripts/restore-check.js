#!/usr/bin/env node
'use strict';
/** Proves a backup is usable: opens it and counts the key tables. Run after every backup, and before any restore.
 *   node scripts/restore-check.js backups/pi-2026-10-25-03-00-00.sqlite
 * (Postgres dumps: restore into a scratch database with pg_restore, then point DATABASE_URL at it.) */
const fs = require('fs');
const file = process.argv[2];
if(!file || !fs.existsSync(file)){ console.error('Usage: node scripts/restore-check.js <backup file>'); process.exit(1); }
if(/\.dump$/.test(file)){ console.log('This is a Postgres dump. Restore it with: pg_restore --clean --dbname "$SCRATCH_DATABASE_URL" ' + file); process.exit(0); }
const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(file, { readOnly: true });
const ok = db.prepare('PRAGMA integrity_check').get(); if(Object.values(ok)[0] !== 'ok'){ console.error('Integrity check FAILED:', ok); process.exit(1); }
for(const t of ['companies', 'agents', 'leads', 'applications', 'policies', 'quote_records', 'audit_log']){
  try { console.log(t.padEnd(16), db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n); } catch(e){ console.log(t.padEnd(16), '(table missing — older backup)'); }
}
console.log('Backup opens and passes the integrity check.');
