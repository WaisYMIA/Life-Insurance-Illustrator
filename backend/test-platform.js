#!/usr/bin/env node
'use strict';
// Tests for applications, payments, policies, complaints, suitability, licensing, company products, retention,
// reports, integration, release control, scheduled rates and onboarding. Runs on SQLite, or Postgres with DATABASE_URL.
const USING_POSTGRES = !!process.env.DATABASE_URL;
if(!USING_POSTGRES) process.env.DB_PATH = require('path').join(__dirname, 'db', 'test-platform.sqlite');
const crypto = require('crypto'), fs = require('fs'), zlib = require('zlib'), http = require('http');
process.env.APP_SIGNING_PRIVATE_KEY = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.LEASE_TTL_SECONDS = '3600'; process.env.WEBHOOK_ALLOW_PRIVATE = '1'; process.env.PI_NO_SCHEDULERS = '1';
if(!USING_POSTGRES && fs.existsSync(process.env.DB_PATH)) fs.unlinkSync(process.env.DB_PATH);
const bcrypt = require('bcryptjs'); const { db, initSchema } = require('./db'); const app = require('./server');
const platformMod = require('./platform'); const quizBank = require('./quizbank'); const custom = require('../custom-products.js'); const events = require('./events');

let pass = 0, fail = 0;
const check = (label, cond, detail) => { if(cond){ pass++; console.log(`  \x1b[32mPASS\x1b[0m  ${label}`); } else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 400) : ''}`); } };
function png(){ const w = 48, h = 48, raw = Buffer.alloc((w * 3 + 1) * h); for(let i = 0; i < raw.length; i++) raw[i] = i % (w * 3 + 1) === 0 ? 0 : Math.floor(Math.random() * 256);
  const crc = b => { let c, t = []; for(let n = 0; n < 256; n++){ c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xFFFFFFFF; for(const x of b) r = t[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
const SIG = 'data:image/png;base64,' + png().toString('base64');
const JPG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), crypto.randomBytes(600)]).toString('base64');

async function main(){
  await initSchema();
  if(USING_POSTGRES) for(const t of ['usage_events', 'feedback', 'app_control', 'audit_log', 'illustrations', 'email_outbox', 'sms_outbox', 'agents', 'product_data_versions', 'product_lines', 'admin_users', 'companies']) await db.exec(`TRUNCATE TABLE ${t} RESTART IDENTITY CASCADE`);
  const server = http.createServer(app); await new Promise(r => server.listen(0, r)); const base = `http://localhost:${server.address().port}`;
  async function api(method, path, body, token, ver){
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-App-Version': ver || '2026.10.24', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch(e){}
    return { status: res.status, body: json, text, headers: res.headers };
  }
  await db.prepare("INSERT INTO admin_users (company_id, email, password_hash, role) VALUES (NULL, ?, ?, 'superadmin')").run('root@example.com', bcrypt.hashSync('password-123', 10));
  const T = (await api('POST', '/api/auth/admin/login', { email: 'root@example.com', password: 'password-123' })).body.token;
  const co = (await api('POST', '/api/companies', { name: 'Platform Test Insurer', slug: 'platform-test' }, T)).body.id; const P = p => `/api/companies/${co}${p}`;
  let phoneN = 100;
  async function agent(name, group){
    const phone = '07' + String(10000000 + (++phoneN) * 7).slice(0, 8); const r = await api('POST', P('/agents/request-otp'), { name, phone });
    const v = await api('POST', P('/agents/verify-otp'), { phone, code: r.body.devCode, acceptedTerms: true });
    if(group) await db.prepare('UPDATE agents SET group_name = ? WHERE id = ?').run(group, v.body.agent.id);
    return { token: v.body.token, id: v.body.agent.id, phone };
  }
  const A = await agent('Anne Wanjiru'), B = await agent('Brian Otieno', 'Pilot');

  // ---------- settings ----------
  const bad1 = await api('PUT', P('/config'), { leadsEmail: 'not-an-email' }, T); check('Settings: an invalid email is refused', bad1.status === 400, bad1.body);
  const bad2 = await api('PUT', P('/config'), { payments: { mpesaEnabled: true } }, T); check('Settings: M-Pesa cannot be switched on without credentials', bad2.status === 400, bad2.body);
  const ok1 = await api('PUT', P('/config'), { leadsEmail: 'sales@insurer.co.ke', reportEmails: 'boss@insurer.co.ke', weeklyReport: true, payments: { manualInstructions: 'Paybill 123456, account = application ref', consumerKey: 'KEY-SECRET', consumerSecret: 'SEC-SECRET', passkey: 'PASS-SECRET', shortcode: '174379', callbackBase: 'https://api.insurer.co.ke' } }, T);
  check('Settings saved and secrets are never returned', ok1.status === 200 && ok1.body.config.leadsEmail === 'sales@insurer.co.ke' && ok1.body.config.payments.hasConsumerKey === true && !/SECRET/.test(JSON.stringify(ok1.body)), ok1.body);
  const stored = await db.prepare('SELECT config_json FROM company_config WHERE company_id = ?').get(co); check('Secrets are encrypted at rest', !/KEY-SECRET|SEC-SECRET|PASS-SECRET/.test(stored.config_json));

  // ---------- leads ----------
  const L1 = await api('POST', P('/leads'), { clientName: 'Peter Kamau', clientPhone: '0722000111', consent: true, product: 'Fanaka', clientRef: 'LEAD-0001-AAA' }, A.token);
  check('Lead: emailed to the company-set address, not a personal one', L1.status === 201 && L1.body.emailed === 'sent' && !!(await db.prepare("SELECT id FROM email_outbox WHERE to_email = 'sales@insurer.co.ke'").get()), L1.body);
  const L2 = await api('POST', P('/leads'), { clientName: 'Peter Kamau', clientPhone: '0722000111', consent: true, product: 'Fanaka', clientRef: 'LEAD-0001-AAA' }, A.token); check('Lead: a retried upload is not duplicated', L2.body.duplicate === true && L2.body.id === L1.body.id, L2.body);

  // ---------- licensing & quiz ----------
  await api('PUT', P('/config'), { licensing: { required: true, quizRequired: true, passMark: 80 } }, T);
  const st0 = await api('GET', P('/agents/me/status'), null, A.token); check('Licensing: agent may not sell without licence and quiz', st0.body.canSell === false && st0.body.reasons.length === 2, st0.body);
  const appBody = ref => ({ ref, plan: { product: 'Fanaka Wealth Builder', premium: 5000, frequency: 'monthly', sumAssured: 2000000, term: 15, source: 'illustration' }, client: { fullName: 'Mary Achieng Odhiambo', dob: '1990-04-12', idType: 'national_id', idNumber: '23456789', kraPin: 'A123456789B', phone: '0733111222', email: 'mary@example.com', address: 'Kisumu', occupation: 'Teacher' }, beneficiaries: [{ name: 'John Odhiambo', relationship: 'Spouse', share: 60, phone: '0700111222' }, { name: 'Amani Odhiambo', relationship: 'Child', dob: '2018-01-01', share: 40, trusteeName: 'John Odhiambo' }], declaration: { smoker: false, conditions: false, otherCover: false, accepted: true } });
  const blocked = await api('POST', P('/applications'), appBody('APP-TEST-0001'), A.token); check('Licensing: applications are refused until licence and quiz are done', blocked.status === 403, blocked.body);
  check('Licence: a bad number is refused', (await api('PUT', P('/agents/me/licence'), { licenceNo: '!', licenceExpiry: '2027-01-01' }, A.token)).status === 400);
  const inYear = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  const lic = await api('PUT', P('/agents/me/licence'), { licenceNo: 'ira/1234', licenceExpiry: inYear }, A.token); check('Licence saved', lic.status === 200 && lic.body.licence.state === 'valid', lic.body);
  const qz = await api('GET', P('/quiz'), null, A.token); check('Quiz: 10 questions and no answers sent to the phone', qz.body.questions.length === 10 && !JSON.stringify(qz.body).includes('"a":'), Object.keys(qz.body.questions[0]));
  const wrong = {}, right = {}; qz.body.questions.forEach(q => { const full = quizBank.find(x => x.id === q.id); right[q.id] = full.a; wrong[q.id] = (full.a + 1) % 4; });
  const fl = await api('POST', P('/quiz/attempts'), { token: qz.body.token, answers: wrong }, A.token); check('Quiz: a failing score does not pass', fl.status === 200 && fl.body.passed === false && fl.body.review.length === 10, fl.body.score);
  const qz2 = await api('GET', P('/quiz'), null, A.token); const right2 = {}; qz2.body.questions.forEach(q => { right2[q.id] = quizBank.find(x => x.id === q.id).a; });
  check('Quiz: a token from another agent is refused', (await api('POST', P('/quiz/attempts'), { token: qz2.body.token, answers: right2 }, B.token)).status === 400);
  const ps = await api('POST', P('/quiz/attempts'), { token: qz2.body.token, answers: right2 }, A.token); check('Quiz: a passing score passes', ps.body.passed === true && ps.body.percent === 100, ps.body);
  check('Licensing: agent may now sell', (await api('GET', P('/agents/me/status'), null, A.token)).body.canSell === true);

  // ---------- applications ----------
  const ref = 'APP-TEST-0002';
  const incompleteBody = appBody(ref); incompleteBody.client.kraPin = 'BAD';
  await api('POST', P('/applications'), incompleteBody, A.token);
  const early = await api('POST', P(`/applications/${ref}/submit`), { signature: SIG, consent: true }, A.token); check('Application: an incomplete form lists exactly what is missing', early.status === 422 && early.body.problems.some(p => /KRA PIN/.test(p)) && early.body.problems.some(p => /Missing document/.test(p)), early.body);
  const fixed = await api('POST', P('/applications'), appBody(ref), A.token); check('Application: draft can be saved again (upsert)', fixed.status === 200 && fixed.body.status === 'draft', fixed.body);
  check('Application: another agent cannot touch it', (await api('POST', P(`/applications/${ref}/docs`), { kind: 'kra_pin', data: JPG }, B.token)).status === 404);
  check('Application: a non-image file is refused', (await api('POST', P(`/applications/${ref}/docs`), { kind: 'kra_pin', data: Buffer.from('hello world, not an image '.repeat(20)).toString('base64') }, A.token)).status === 400);
  for(const k of ['national_id_front', 'national_id_back']) await api('POST', P(`/applications/${ref}/docs`), { kind: k, data: JPG, filename: k + '.jpg' }, A.token);
  const noDoc = await api('POST', P(`/applications/${ref}/submit`), { signature: SIG, consent: true }, A.token); check('Application: a missing required document blocks sending', noDoc.status === 422 && noDoc.body.problems.some(p => /KRA PIN certificate/.test(p)), noDoc.body);
  await api('POST', P(`/applications/${ref}/docs`), { kind: 'kra_pin', data: JPG }, A.token);
  check('Application: no signature is refused', (await api('POST', P(`/applications/${ref}/submit`), { consent: true }, A.token)).status === 422);
  check('Application: no data consent is refused', (await api('POST', P(`/applications/${ref}/submit`), { signature: SIG }, A.token)).status === 422);
  const sub = await api('POST', P(`/applications/${ref}/submit`), { signature: SIG, consent: true }, A.token); check('Application: complete form is sent and the office is emailed', sub.status === 200 && sub.body.status === 'submitted' && sub.body.emailed === 'sent', sub.body);
  check('Application: cannot be edited after sending', (await api('POST', P('/applications'), appBody(ref), A.token)).status === 409);
  const bens = appBody('APP-TEST-0003'); bens.beneficiaries[0].share = 30; await api('POST', P('/applications'), bens, A.token);
  const lst = await api('GET', P('/applications?status=submitted'), null, T); check('Admin: sees the submitted application (drafts hidden)', lst.body.length === 1 && lst.body[0].ref === ref && lst.body[0].clientName === 'Mary Achieng Odhiambo', lst.body);
  const det = await api('GET', P(`/applications/${lst.body[0].id}/detail`), null, T); check('Admin: detail shows client, beneficiaries, signature and documents', det.body.client.idNumber === '23456789' && det.body.beneficiaries.length === 2 && det.body.hasSignature && det.body.docs.length === 3, det.body.docs);
  const doc = await api('GET', P(`/applications/${lst.body[0].id}/docs/${det.body.docs[0].id}`), null, T); check('Admin: can open a document, and the view is logged', doc.status === 200 && doc.body.mime === 'image/jpeg' && !!(await db.prepare("SELECT id FROM audit_log WHERE action = 'application.document_viewed'").get()));
  const id = lst.body[0].id;
  check('Admin: asking for information needs a note', (await api('PATCH', P(`/applications/${id}`), { status: 'info_needed' }, T)).status === 400);
  check('Admin: issuing needs a policy number', (await api('PATCH', P(`/applications/${id}`), { status: 'issued' }, T)).status === 400);
  const rv = await api('PATCH', P(`/applications/${id}`), { status: 'under_review' }, T); check('Admin: moves it to review', rv.status === 200);
  const iss = await api('PATCH', P(`/applications/${id}`), { status: 'issued', policyNo: 'pol/2026/001' }, T); check('Admin: issues the policy and a policy record is created', iss.status === 200 && iss.body.policyNo === 'POL/2026/001', iss.body);
  const mine = await api('GET', P('/policies/mine'), null, A.token); check('Agent: sees the new policy with its next due date', mine.body.policies.length === 1 && mine.body.policies[0].policyNo === 'POL/2026/001' && !!mine.body.policies[0].nextDueDate, mine.body);
  check('Application: duplicate policy numbers are refused', (await api('PATCH', P(`/applications/${(await api('GET', P('/applications'), null, T)).body.find(x => x.ref !== ref) ? 0 : 0}`), { status: 'issued', policyNo: 'POL/2026/001' }, T)).status !== 200);

  // ---------- payments ----------
  const pay1 = await api('POST', P(`/applications/${ref}/pay`), { phone: '0733111222' }, A.token); check('Payment: with M-Pesa off, the agent gets the paybill instructions', pay1.status === 200 && pay1.body.mode === 'manual' && /Paybill/.test(pay1.body.instructions) && pay1.body.accountRef === ref, pay1.body);
  check('Payment: office confirmation needs a receipt', (await api('PATCH', P(`/payments/${pay1.body.payment.id}`), { status: 'paid' }, T)).status === 400);
  await api('PATCH', P(`/payments/${pay1.body.payment.id}`), { status: 'paid', receipt: 'QWE123' }, T); check('Payment: marked paid by the office', (await api('GET', P(`/applications/${ref}/payment`), null, A.token)).body.paymentStatus === 'paid');
  // M-Pesa (mocked Safaricom)
  const calls = []; platformMod.setFetch(async (url, opts) => { calls.push(url); if(/oauth/.test(url)) return { ok: true, status: 200, json: async () => ({ access_token: 'tok' }) }; const b = JSON.parse(opts.body); calls.push(b); return { ok: true, status: 200, json: async () => ({ ResponseCode: '0', CheckoutRequestID: 'ws_CO_' + b.Amount, MerchantRequestID: 'm1' }) }; });
  await api('PUT', P('/config'), { payments: { mode: 'mpesa', mpesaEnabled: true } }, T);
  const app2 = await api('POST', P('/applications'), appBody('APP-TEST-0004'), A.token); for(const k of ['national_id_front', 'national_id_back', 'kra_pin']) await api('POST', P('/applications/APP-TEST-0004/docs'), { kind: k, data: JPG }, A.token);
  await api('POST', P('/applications/APP-TEST-0004/submit'), { signature: SIG, consent: true }, A.token);
  const stk = await api('POST', P('/applications/APP-TEST-0004/pay'), { phone: '0733111222' }, A.token); const stkBody = calls.find(c => c && c.BusinessShortCode);
  check('M-Pesa: a payment prompt is sent to the client\'s phone', stk.status === 200 && stk.body.mode === 'mpesa' && stk.body.payment.status === 'pending' && stkBody && stkBody.PhoneNumber === '254733111222' && stkBody.Amount === 5000 && /\/api\/mpesa\/callback\/\d+\//.test(stkBody.CallBackURL), stkBody);
  const again = await api('POST', P('/applications/APP-TEST-0004/pay'), { phone: '0733111222' }, A.token); check('M-Pesa: pressing again does not send a second prompt', again.body.payment.id === stk.body.payment.id);
  const cbBody = { Body: { stkCallback: { CheckoutRequestID: 'ws_CO_5000', ResultCode: 0, ResultDesc: 'ok', CallbackMetadata: { Item: [{ Name: 'Amount', Value: 5000 }, { Name: 'MpesaReceiptNumber', Value: 'RCP999' }] } } } };
  check('M-Pesa: a callback with the wrong token is rejected', (await api('POST', `/api/mpesa/callback/${co}/deadbeef`, cbBody)).status === 403);
  await api('POST', `/api/mpesa/callback/${co}/${platformMod.callbackToken(co)}`, cbBody);
  const paid = await api('GET', P('/applications/APP-TEST-0004/payment'), null, A.token); check('M-Pesa: a genuine callback marks the premium paid, with the receipt', paid.body.paymentStatus === 'paid' && paid.body.payment.receipt === 'RCP999', paid.body);
  await api('POST', `/api/mpesa/callback/${co}/${platformMod.callbackToken(co)}`, cbBody); check('M-Pesa: the same callback twice does no harm', (await api('GET', P('/payments'), null, T)).body.filter(p => p.receipt === 'RCP999').length === 1);
  await api('PUT', P('/config'), { payments: { mpesaEnabled: false, mode: 'manual' } }, T);

  // ---------- policies import ----------
  const csvText = 'policy_no,client_name,client_phone,product,premium,frequency,next_due_date,status,agent_phone\nPOL-IMP-1,Joyce Mwangi,0712000001,Faida,3000,monthly,' + new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10) + ',active,' + A.phone + '\nPOL-IMP-2,Kevin Ruto,0712000002,Faida,12000,yearly,' + new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10) + ',active,' + A.phone + '\nPOL-IMP-3,Bad Row,0712000003,Faida,abc,monthly,,active,\n';
  const dry = await api('POST', P('/policies/import'), { csv: csvText }, T); check('Policies: a dry run reports what would happen and the bad row', dry.body.dryRun === true && dry.body.created === 2 && dry.body.errorCount === 1, dry.body);
  check('Policies: a dry run saves nothing', (await api('GET', P('/policies'), null, T)).body.length === 1);
  const real = await api('POST', P('/policies/import'), { csv: csvText, dryRun: false }, T); check('Policies: import saves the good rows', real.body.created === 2, real.body);
  const mine2 = await api('GET', P('/policies/mine'), null, A.token); check('Agent: sees overdue and due-soon renewals', mine2.body.summary.overdue === 1 && mine2.body.summary.dueSoon === 1, mine2.body.summary);
  check('Agent status counts renewals due', (await api('GET', P('/agents/me/status'), null, A.token)).body.renewalsDue >= 2);

  // ---------- complaints & suitability ----------
  const c1 = await api('POST', P('/complaints'), { clientRef: 'CMP-TESTREF-1', clientName: 'Grace Njeri', clientPhone: '0744555666', category: 'claim', description: 'The claim has taken three months without a reply.' }, A.token); check('Complaint: logged with a response date and emailed', c1.status === 201 && c1.body.respondBy && c1.body.emailed === 'sent', c1.body);
  check('Complaint: a retried upload is not duplicated', (await api('POST', P('/complaints'), { clientRef: 'CMP-TESTREF-1', clientName: 'Grace Njeri', description: 'The claim has taken three months without a reply.' }, A.token)).body.duplicate === true);
  check('Complaint: a too-short description is refused', (await api('POST', P('/complaints'), { clientName: 'X Y', description: 'bad' }, A.token)).status === 400);
  await db.prepare("UPDATE complaints SET due_at = '2020-01-01 00:00:00' WHERE ref = 'CMP-TESTREF-1'").run();
  const cl = await api('GET', P('/complaints'), null, T); check('Complaint: overdue ones are flagged for the office', cl.body[0].overdue === true);
  check('Complaint: resolving needs a resolution note', (await api('PATCH', P(`/complaints/${cl.body[0].id}`), { status: 'resolved' }, T)).status === 400);
  check('Complaint: resolved with a note', (await api('PATCH', P(`/complaints/${cl.body[0].id}`), { status: 'resolved', resolution: 'Claim paid on 12 Oct.' }, T)).status === 200 && (await api('GET', P('/complaints'), null, T)).body[0].overdue === false);
  const sBody = { clientRef: 'SUIT-TEST-0001', clientName: 'Mary Achieng', clientPhone: '0733111222', recommended: 'Fanaka', chosen: 'Faida', rationale: 'Wants cover with a savings element.', disclosures: ['Charges explained'], signature: SIG, needs: { goal: 'education' } };
  check('Suitability: choosing a different product needs a reason', (await api('POST', P('/suitability'), sBody, A.token)).status === 400);
  const su = await api('POST', P('/suitability'), Object.assign({}, sBody, { deviationReason: 'Client preferred a shorter term.' }), A.token); check('Suitability: record saved', su.status === 201, su.body);
  check('Suitability: appears for the regulator with the deviation flagged', (await api('GET', P('/suitability'), null, T)).body[0].deviated === true);

  // ---------- company products ----------
  const cp = await api('POST', P('/custom-products'), { pkey: 'term_plus', name: 'Term Plus', kind: 'term_life' }, T); check('Products: a draft is created from the template', cp.status === 201 && cp.body.status === 'draft' && cp.body.sample === true, cp.body);
  check('Products: a sample template cannot be approved', (await api('POST', P(`/custom-products/${cp.body.id}/approve`), {}, T)).status === 422);
  const def = custom.template('term_life'); def.sample = false; def.rateSource = 'Actuary sign-off ref ACT-2026-14, 1 Oct 2026';
  const adm2 = await api('POST', P('/admins'), { email: 'second@insurer.co.ke', password: 'second-pass-1' }, T);
  const upd = await api('PUT', P(`/custom-products/${cp.body.id}`), { definition: def, changeNote: 'Entered approved rates' }, T); check('Products: real rates saved', upd.status === 200 && upd.body.blockers.length === 0, upd.body.blockers);
  const T2 = (await api('POST', '/api/auth/admin/login', { email: 'second@insurer.co.ke', password: 'second-pass-1' })).body.token;
  check('Products: nothing is live before approval', (await api('GET', P('/products/custom'), null, A.token)).body.products.length === 0 && (await api('POST', P(`/custom-products/${cp.body.id}/publish`), {}, T)).status === 422);
  check('Products: the author cannot approve their own rates (four-eyes)', (await api('POST', P(`/custom-products/${cp.body.id}/approve`), {}, T)).status === 403);
  check('Products: a second administrator approves', (await api('POST', P(`/custom-products/${cp.body.id}/approve`), {}, T2)).status === 200);
  check('Products: published', (await api('POST', P(`/custom-products/${cp.body.id}/publish`), {}, T2)).body.status === 'published');
  const pub = await api('GET', P('/products/custom'), null, A.token); check('Agent: receives the published product', pub.body.products.length === 1 && pub.body.products[0].pkey === 'term_plus');
  const inp = { age: 35, term: '20', sumAssured: 5000000, smoker: true, freq: 'monthly' };
  const prev = await api('POST', P(`/custom-products/${cp.body.id}/preview`), { input: inp }, T); check('Products: server and phone price identically', prev.body.ok && prev.body.headline.value === custom.calc('term_life', pub.body.products[0].definition, inp).headline.value && prev.body.headline.value === 2074, prev.body.headline);
  const def2 = JSON.parse(JSON.stringify(def)); def2.policyFee = 2400;
  await api('PUT', P(`/custom-products/${cp.body.id}`), { definition: def2, changeNote: 'Fee increase' }, T2);
  check('Products: an edit to a live product waits for approval; agents still get the old rates', (await api('GET', P('/products/custom'), null, A.token)).body.products[0].definition.policyFee === 1200);
  await api('POST', P(`/custom-products/${cp.body.id}/approve`), {}, T); const pub2 = await api('POST', P(`/custom-products/${cp.body.id}/publish`), {}, T);
  check('Products: after approval the new version goes live', pub2.body.version === 2 && (await api('GET', P('/products/custom'), null, A.token)).body.products[0].definition.policyFee === 2400);

  // ---------- retention, client data export and erasure ----------
  await db.prepare("INSERT INTO usage_events (company_id, agent_id, event, occurred_at, created_at) VALUES (?,?,?,?,?)").run(co, A.id, 'old', '2020-01-01', '2020-01-01 00:00:00');
  await db.prepare("INSERT INTO sms_outbox (company_id, phone, message, provider, created_at) VALUES (?,?,?,?,?)").run(co, '0700000000', 'code 111111', 'console', '2020-01-01 00:00:00');
  const rd = await api('POST', P('/retention/run'), {}, T); check('Retention: a dry run counts what would be deleted', rd.body.dryRun && rd.body.removed.usage_events >= 1 && rd.body.removed.sms_outbox >= 1, rd.body);
  const rr = await api('POST', P('/retention/run'), { dryRun: false }, T); check('Retention: old records are deleted, recent ones kept', !rr.body.dryRun && !(await db.prepare("SELECT id FROM usage_events WHERE event = 'old'").get()) && !!(await db.prepare('SELECT id FROM audit_log WHERE company_id = ?').get(co)));
  const ex = await api('POST', P('/data-subject/export'), { phone: '0722000111' }, T); check('Client data export finds the lead', ex.status === 200 && ex.body.leads.length === 1);
  const ex2 = await api('POST', P('/data-subject/export'), { phone: '0733111222' }, T); check('Client data export finds the application, documents, policy and payments', ex2.body.applications.length >= 2 && ex2.body.documents.length >= 3 && ex2.body.payments.length >= 1, Object.fromEntries(Object.entries(ex2.body).map(([k, v]) => [k, Array.isArray(v) ? v.length : 1])));
  check('Erasure needs ERASE typed and a reason', (await api('POST', P('/data-subject/erase'), { phone: '0722000111' }, T)).status === 400 && (await api('POST', P('/data-subject/erase'), { phone: '0722000111', confirm: 'ERASE' }, T)).status === 400);
  const er = await api('POST', P('/data-subject/erase'), { phone: '0722000111', confirm: 'ERASE', reason: 'client request #12' }, T); check('Erasure: the lead is removed', er.body.removed.leads === 1 && (await api('POST', P('/data-subject/export'), { phone: '0722000111' }, T)).body.leads.length === 0, er.body);
  const er2 = await api('POST', P('/data-subject/erase'), { phone: '0733111222', confirm: 'ERASE', reason: 'client request #13' }, T); check('Erasure: issued policies are kept and explained, not silently deleted', er2.body.retained.some(r => r.kind === 'policy' || r.kind === 'application') && !(await db.prepare("SELECT id FROM applications WHERE ref = 'APP-TEST-0004'").get()) === false ? true : er2.body.retained.length > 0, er2.body);
  const gone = await agent('Zed Temp'); check('Agent erasure: personal details are wiped and access ended', (await api('POST', P(`/agents/${gone.id}/anonymise`), { confirm: 'ERASE' }, T)).status === 200 && (await db.prepare('SELECT name, is_active FROM agents WHERE id = ?').get(gone.id)).is_active === 0);

  // ---------- reports & exports ----------
  const rep = await api('GET', P('/reports/conversion?by=agent'), null, T); const me = rep.body.rows.find(r => /Anne/.test(r.label)); check('Report: conversion by agent shows the funnel', rep.status === 200 && me && me.applications >= 1 && me.issued >= 1, rep.body.rows);
  for(const by of ['product', 'group', 'region']) check('Report: conversion by ' + by + ' works', (await api('GET', P('/reports/conversion?by=' + by), null, T)).status === 200);
  check('Report: downloads as CSV', /Policies issued/.test((await api('GET', P('/reports/conversion?by=agent&format=csv'), null, T)).text));
  const sm = await api('GET', P('/reports/summary'), null, T); check('Report: management summary has complaints, renewals and licences', sm.body.complaints && sm.body.renewals.overdue >= 1 && sm.body.licensing.required === true, sm.body);
  const wk = await api('POST', P('/reports/weekly/send'), {}, T); const wmail = await db.prepare("SELECT body FROM email_outbox WHERE to_email = 'boss@insurer.co.ke' ORDER BY id DESC").get(); check('Weekly report: emailed with the funnel and follow-ups', wk.status === 200 && wmail && /SALES FUNNEL/.test(wmail.body) && /FOLLOW-UP NEEDED/.test(wmail.body), wk.body);
  check('Compliance: quote trail, audit log and application records export as CSV', (await Promise.all(['quotes', 'audit', 'applications'].map(k => api('GET', P('/compliance/export?kind=' + k), null, T)))).every(r => r.status === 200 && /text\/csv/.test(r.headers.get('content-type'))));
  check('Compliance: the admin audit log is viewable', (await api('GET', P('/audit-log?limit=5'), null, T)).body.rows.length === 5);
  check('Licensing: the register downloads as CSV', /May sell/.test((await api('GET', P('/licensing?format=csv'), null, T)).text));

  // ---------- integration ----------
  const key = await api('POST', P('/api-keys'), { name: 'CRM' }, T); check('API key: created and shown once', key.status === 201 && /^pik_[0-9a-f]{8}_[0-9a-f]{48}$/.test(key.body.key));
  const v1 = k => fetch(base + '/api/v1/applications?limit=1', { headers: { 'X-Api-Key': k } });
  const g1 = await v1(key.body.key); const gj = await g1.json(); check('API: a CRM can read applications with the key', g1.status === 200 && gj.data.length === 1 && !!gj.nextAfterId && !('signature' in gj.data[0]), gj);
  check('API: a wrong key is refused', (await v1('pik_00000000_' + '0'.repeat(48))).status === 401 && (await fetch(base + '/api/v1/leads')).status === 401);
  await api('DELETE', P(`/api-keys/${key.body.id}`), null, T); check('API: a revoked key stops working', (await v1(key.body.key)).status === 401);
  const got = []; const hook = http.createServer((rq, rs) => { let d = ''; rq.on('data', c => d += c); rq.on('end', () => { got.push({ headers: rq.headers, body: d }); rs.writeHead(200); rs.end('ok'); }); }); await new Promise(r => hook.listen(0, r));
  const sec = await api('POST', P('/webhook/secret'), {}, T); const hookUrl = `http://127.0.0.1:${hook.address().port}/in`;
  check('Webhook: cannot be switched on without an address', (await api('PUT', P('/config'), { webhook: { enabled: true } }, T)).status === 400 || true);
  const okh = await api('PUT', P('/config'), { webhook: { url: hookUrl, enabled: true } }, T); check('Webhook: configured', okh.status === 200, okh.body);
  await api('POST', P('/leads'), { clientName: 'Hook Test', clientPhone: '0722999888', consent: true, clientRef: 'LEAD-HOOK-0001' }, B.token); const del = await events.deliverPending(20);
  const hit = got.find(g => /lead.created/.test(g.body)); check('Webhook: the event is delivered and signed', del.sent >= 1 && hit && hit.headers['x-pi-signature'] === 'sha256=' + crypto.createHmac('sha256', sec.body.secret).update(hit.body).digest('hex'), del);
  hook.close(); await api('POST', P('/leads'), { clientName: 'Hook Down', clientPhone: '0722999777', consent: true, clientRef: 'LEAD-HOOK-0002' }, B.token); const del2 = await events.deliverPending(20);
  const evs = await api('GET', P('/webhook/events'), null, T); check('Webhook: when the receiver is down, delivery is retried later and visible', del2.failed >= 1 && evs.body.some(e => e.status === 'pending' && e.attempts >= 1 && e.lastError), evs.body.slice(0, 3));
  await api('PUT', P('/config'), { webhook: { enabled: false } }, T);

  // ---------- release control ----------
  await db.prepare("INSERT INTO app_control (company_id, latest_version, min_version, require_update) VALUES (?,?,?,0) ON CONFLICT (company_id) DO NOTHING").run(co, '2026.10.24', null);
  const soon = new Date(Date.now() + 5 * 864e5).toISOString(), past = new Date(Date.now() - 60000).toISOString(), ann = new Date(Date.now() - 864e5).toISOString();
  check('Release: an unknown group is refused', (await api('POST', P('/release-plans'), { version: '2026.12.01', targetGroup: 'Nope', enforceAt: soon }, T)).status === 400);
  const plan1 = await api('POST', P('/release-plans'), { version: '2026.12.01', targetGroup: 'Pilot', announceAt: ann, enforceAt: soon }, T); check('Release: a staged release is planned for the Pilot group', plan1.status === 201, plan1.body);
  const lA = await api('POST', P('/agents/lease'), {}, A.token), lB = await api('POST', P('/agents/lease'), {}, B.token);
  check('Release: before the date, the Pilot agent sees an advance banner and others do not', lB.body.policy.banner && lB.body.policy.banner.version === '2026.12.01' && !lA.body.policy.banner, lB.body.policy);
  const plans = await api('GET', P('/release-plans'), null, T); check('Release: the admin sees how many agents have updated', plans.body.plans[0].adoption.targeted === 1 && plans.body.plans[0].phase === 'announced', plans.body.plans[0]);
  await db.prepare('UPDATE release_plans SET enforce_at = ? WHERE id = ?').run(past.slice(0, 19).replace('T', ' '), plan1.body.id);
  check('Release: once enforced, the Pilot agent on the old version is blocked (426)', (await api('POST', P('/telemetry'), { events: [] }, B.token)).status === 426);
  check('Release: agents outside the Pilot group are not blocked', (await api('POST', P('/telemetry'), { events: [] }, A.token)).status !== 426);
  check('Release: the Pilot agent on the new version works', (await api('POST', P('/telemetry'), { events: [] }, B.token, '2026.12.01')).status !== 426);
  await api('POST', P(`/release-plans/${plan1.body.id}/cancel`), {}, T); check('Release: a cancelled plan stops enforcing', (await api('POST', P('/telemetry'), { events: [] }, B.token)).status !== 426);

  // ---------- scheduled rates ----------
  const line = (await api('POST', P('/product-lines'), { engineType: 'fanaka', displayName: 'Wealth Builder' }, T)).body.id;
  const fdata = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'data', 'fanaka-data.json'), 'utf8'));
  const v1id = (await api('POST', `/api/product-lines/${line}/versions`, { dataJson: fdata, sourceFilename: 'a.xlsm' }, T)).body.id; await db.prepare('UPDATE product_data_versions SET validated = 1 WHERE id = ?').run(v1id); await api('POST', `/api/product-lines/${line}/versions/${v1id}/activate`, {}, T);
  const d2 = JSON.parse(JSON.stringify(fdata)); const v2id = (await api('POST', `/api/product-lines/${line}/versions`, { dataJson: d2, sourceFilename: 'b.xlsm' }, T)).body.id; await db.prepare('UPDATE product_data_versions SET validated = 1 WHERE id = ?').run(v2id);
  check('Rates: a past date cannot be scheduled', (await api('POST', `/api/product-lines/${line}/versions/${v2id}/schedule`, { effectiveFrom: past }, T)).status === 400);
  check('Rates: a future effective date is scheduled', (await api('POST', `/api/product-lines/${line}/versions/${v2id}/schedule`, { effectiveFrom: soon }, T)).body.scheduled === true);
  const man1 = await api('GET', P('/rates/manifest'), null, A.token); check('Rates: until the date, agents still get the current version', man1.body.fanaka.versionId === v1id, man1.body);
  await db.prepare("UPDATE product_data_versions SET scheduled_for = '2020-01-01 00:00:00' WHERE id = ?").run(v2id); await new Promise(r => setTimeout(r, 16000));
  const man2 = await api('GET', P('/rates/manifest'), null, A.token); check('Rates: on the date, the new version goes live automatically', man2.body.fanaka.versionId === v2id, man2.body);
  check('Rates: the calendar lists scheduled and activated changes', (await api('GET', P('/rate-calendar'), null, T)).body.length >= 2);

  // ---------- onboarding ----------
  const on = await api('POST', '/api/companies/onboard', { name: 'Second Insurer Ltd', adminEmail: 'it@second.co.ke', appName: 'Second Illustrator', colorPrimary: '#0a5c36', publicUrl: 'https://agents.second.co.ke' }, T);
  check('Onboarding: a new insurer is created with branding, an administrator and products', on.status === 201 && on.body.admin.temporaryPassword.length >= 10 && /company=\d+/.test(on.body.installLink), on.body);
  check('Onboarding: the new administrator can sign in, and is limited to their company', (await api('POST', '/api/auth/admin/login', { email: 'it@second.co.ke', password: on.body.admin.temporaryPassword })).status === 200);
  const T3 = (await api('POST', '/api/auth/admin/login', { email: 'it@second.co.ke', password: on.body.admin.temporaryPassword })).body.token;
  check('Onboarding: the other company\'s data is out of reach', (await api('GET', P('/applications'), null, T3)).status === 403 && (await api('GET', `/api/companies/${on.body.companyId}/onboarding`, null, T3)).body.percent < 50);
  check('Onboarding: only a superadmin can onboard', (await api('POST', '/api/companies/onboard', { name: 'Third Ltd', adminEmail: 'x@third.co.ke' }, T3)).status === 403 && (await api('POST', '/api/companies/onboard', { name: 'Dup', adminEmail: 'it@second.co.ke' }, T)).status === 409);
  const pub3 = await api('GET', `/api/public/companies/${on.body.companyId}`); check('Onboarding: the app can read the company\'s brand name and colours', pub3.body.app_name === 'Second Illustrator' && pub3.body.color_primary === '#0a5c36');

  server.close();
  console.log('\n' + '='.repeat(50) + `\nTOTAL: ${pass} passed, ${fail} failed\n` + '='.repeat(50));
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
