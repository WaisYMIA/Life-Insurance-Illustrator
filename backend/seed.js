'use strict';
const bcrypt = require('bcryptjs');
const { db, initSchema } = require('./db');

async function main(){
  await initSchema();
  const EMAIL = process.env.SEED_ADMIN_EMAIL || 'superadmin@example.com';
  let PASSWORD = process.env.SEED_ADMIN_PASSWORD;
  const generated = !PASSWORD;
  if(generated) PASSWORD = require('crypto').randomBytes(12).toString('base64url');
  if(process.env.NODE_ENV === 'production' && (PASSWORD === 'change-me-immediately' || PASSWORD.length < 12)){
    console.error('Refusing to seed: in production SEED_ADMIN_PASSWORD must be at least 12 characters and not the example value.'); process.exit(1);
  }
  const existing = await db.prepare('SELECT id FROM admin_users WHERE email = ?').get(EMAIL);
  if(existing){
    console.log(`Superadmin ${EMAIL} already exists (id ${existing.id}) — nothing to do.`);
  } else {
    const hash = bcrypt.hashSync(PASSWORD, 10);
    const info = await db.prepare("INSERT INTO admin_users (company_id, email, password_hash, role) VALUES (NULL, ?, ?, 'superadmin')").run(EMAIL, hash);
    console.log(`Created superadmin id=${info.lastInsertRowid}, email=${EMAIL}`);
    console.log(generated ? `Generated password (shown once, note it now): ${PASSWORD}` : 'Password taken from SEED_ADMIN_PASSWORD.');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
