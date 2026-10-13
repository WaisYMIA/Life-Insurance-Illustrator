'use strict';
const bcrypt = require('bcryptjs');
const { db, initSchema } = require('./db');

async function main(){
  await initSchema();
  const EMAIL = process.env.SEED_ADMIN_EMAIL || 'superadmin@example.com';
  const PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'change-me-immediately';
  const existing = await db.prepare('SELECT id FROM admin_users WHERE email = ?').get(EMAIL);
  if(existing){
    console.log(`Superadmin ${EMAIL} already exists (id ${existing.id}) — nothing to do.`);
  } else {
    const hash = bcrypt.hashSync(PASSWORD, 10);
    const info = await db.prepare("INSERT INTO admin_users (company_id, email, password_hash, role) VALUES (NULL, ?, ?, 'superadmin')").run(EMAIL, hash);
    console.log(`Created superadmin id=${info.lastInsertRowid}, email=${EMAIL}`);
    console.log(`Password: ${PASSWORD}  <-- change this immediately in any real deployment (SEED_ADMIN_PASSWORD env var)`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
