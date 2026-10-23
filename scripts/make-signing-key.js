#!/usr/bin/env node
/**
 * Creates the signing key pair used for access leases.
 *   node scripts/make-signing-key.js            -> prints both parts
 *   node scripts/make-signing-key.js --write    -> also puts the PUBLIC key into app-config.js
 *
 * PRIVATE key  -> set on the backend host as the environment variable APP_SIGNING_PRIVATE_KEY. Keep it secret;
 *                 anyone holding it can issue access leases. Never commit it to GitHub.
 * PUBLIC key   -> lives in app-config.js (safe to publish). Apps use it to check the server's signature.
 * Run this ONCE per deployment. Changing the key later forces every phone to reconnect and fetch a new lease.
 */
'use strict';
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const jwk = publicKey.export({ format: 'jwk' });
const pub = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
console.log('\n1) On the backend host set (one line, keep secret):\n');
console.log('APP_SIGNING_PRIVATE_KEY="' + pem.trim().replace(/\n/g, '\\n') + '"');
console.log('\n2) Public key for app-config.js (safe to publish):\n');
console.log('publicKey: ' + JSON.stringify(pub));
if (process.argv.includes('--write')) {
  const f = path.join(__dirname, '..', 'app-config.js');
  let s = fs.readFileSync(f, 'utf8');
  if (/publicKey\s*:/.test(s)) s = s.replace(/publicKey\s*:\s*(null|\{[^}]*\})/, 'publicKey: ' + JSON.stringify(pub));
  else s = s.replace(/window\.APP_CONFIG\s*=\s*\{/, 'window.APP_CONFIG = {publicKey:' + JSON.stringify(pub) + ',');
  fs.writeFileSync(f, s);
  console.log('\nWrote the public key into app-config.js. Redeploy the app files.');
}
console.log('');
